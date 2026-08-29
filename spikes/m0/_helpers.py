"""Shared test helpers for spikes/m0/.

File: spikes/m0/_helpers.py
Version: v0.7

Centralizes:
  - make_db(): create a fresh SQLite, apply spec/kernel-schema.sql
  - seed_task(): insert a pending task
  - claim(): INSERT attempt under correct fence protocol

Spike modules import from here so the schema path is consistent.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA = os.path.normpath(
    os.path.join(HERE, "..", "..", "spec", "kernel-schema.sql")
)


def make_db() -> sqlite3.Connection:
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    with open(SCHEMA, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    return conn


def seed_task(conn: sqlite3.Connection, status: str = "pending") -> str:
    task_id = f"task-{uuid.uuid4().hex[:12]}"
    conn.execute(
        "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status) "
        "VALUES (?, 't1', 'web_research', '1.0.0', ?)",
        (task_id, status),
    )
    conn.commit()
    return task_id


def claim(conn: sqlite3.Connection, task_id: str, worker_id: str) -> tuple[str, int]:
    """Atomic claim.

    Closes v0.7 P0-2 regression:
      1. UPDATE tasks SET fence_version += 1 + status='claimed'; ASSERT rowcount == 1.
         (A terminal task produces rowcount=0; this is rejected.)
      2. Read the new task fence.
      3. INSERT attempt with that exact fence. Trigger trg_attempt_fence_insert
         enforces strict equality (rejects attempt.fence_version != task.fence_version).
      4. Belt-and-suspenders: trg_attempt_terminal_task_insert also blocks attempt
         INSERT if task is in a terminal state.

    Returns (attempt_id, fence_version) on success.
    Raises ClaimRejected on rowcount mismatch, trigger rejection, or uniqueness conflict.
    """
    attempt_id = f"att-{uuid.uuid4().hex[:12]}"
    lease_token = uuid.uuid4().hex
    conn.execute("BEGIN IMMEDIATE")
    try:
        # Step 1: bump task fence. Must affect exactly one row.
        cur = conn.execute(
            "UPDATE tasks SET fence_version = fence_version + 1, "
            "  status='claimed', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE task_id=? AND status IN ('pending','failed')",
            (task_id,),
        )
        if cur.rowcount != 1:
            conn.rollback()
            raise ClaimRejected(
                f"claim rejected: task {task_id} not in pending/failed "
                f"(rowcount={cur.rowcount}, status likely terminal)"
            )
        # Step 2: read the new task fence (within the same transaction)
        row = conn.execute(
            "SELECT fence_version FROM tasks WHERE task_id=?", (task_id,)
        ).fetchone()
        assert row is not None
        new_task_fence = row["fence_version"]
        # Step 3: INSERT attempt at exactly that fence.
        # Trigger trg_attempt_fence_insert enforces attempt.fence_version == task.fence_version.
        # Trigger trg_attempt_terminal_task_insert blocks attempt INSERT against terminal task
        # (defense in depth in case claim flow ever skips task UPDATE).
        try:
            conn.execute(
                "INSERT INTO task_attempts "
                "(task_id, attempt_id, fence_version, worker_id, status, "
                " lease_token, lease_expires_at, status_version, driver_kind) "
                "VALUES (?, ?, ?, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
                (task_id, attempt_id, new_task_fence, worker_id,
                 lease_token, "2099-01-01T00:00:00Z"),
            )
        except sqlite3.IntegrityError as e:
            conn.rollback()
            raise ClaimRejected(f"attempt INSERT rejected by trigger/constraint: {e}")
        conn.commit()
    except sqlite3.Error as e:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        if isinstance(e, ClaimRejected):
            raise
        raise
    return attempt_id, new_task_fence


class ClaimRejected(Exception):
    """Raised when a claim is rejected (terminal task, trigger rejection, etc.)."""


def release_attempt(conn: sqlite3.Connection, attempt_id: str, final_status: str = "expired") -> None:
    """Mark an attempt terminal AND reset its task to 'failed' so a new claim
    can be issued. Bumps status_version. Closes the v0.7 P0-2 path where
    sequential claims failed because task stayed in 'claimed'.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE task_attempts SET status=?, status_version=status_version+1, "
            "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE attempt_id=?",
            (final_status, attempt_id),
        )
        conn.execute(
            "UPDATE tasks SET status='failed', "
            "  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  terminal_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  terminal_reason=? "
            "WHERE task_id=(SELECT task_id FROM task_attempts WHERE attempt_id=?) "
            "  AND status IN ('claimed','running')",
            (final_status, attempt_id),
        )
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        raise


def transition_attempt(
    conn: sqlite3.Connection,
    attempt_id: str,
    from_status: str,
    to_status: str,
    extra_where: str = "",
    extra_params: tuple = (),
) -> int:
    """Atomic attempt status transition. Bumps status_version.

    Returns rowcount. Caller MUST verify rowcount == 1.
    The caller is responsible for binding attempt_id + lease_token + fence_version
    in extra_where (defense in depth).
    """
    cur = conn.execute(
        f"UPDATE task_attempts "
        f"SET status=?, status_version=status_version+1, "
        f"  finished_at=CASE WHEN ? IN ('succeeded','failed','canceled','expired') "
        f"    THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE finished_at END "
        f"WHERE attempt_id=? AND status=? {extra_where}",
        (to_status, to_status, attempt_id, from_status, *extra_params),
    )
    conn.commit()
    return cur.rowcount