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
    """Atomic claim: task fence += 1, then INSERT attempt at the new task fence.

    Returns (attempt_id, fence_version). The attempt holds the task fence at
    insert time; the task is one epoch ahead of any prior attempt.
    Trigger trg_attempt_fence_insert enforces attempt.fence_version >= task.fence_version.
    """
    attempt_id = f"att-{uuid.uuid4().hex[:12]}"
    lease_token = uuid.uuid4().hex
    conn.execute("BEGIN IMMEDIATE")
    try:
        # Step 1: bump task fence
        conn.execute(
            "UPDATE tasks SET fence_version = fence_version + 1, "
            "  status='claimed', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE task_id=? AND status IN ('pending','failed')",
            (task_id,),
        )
        # Step 2: read the new task fence
        row = conn.execute(
            "SELECT fence_version FROM tasks WHERE task_id=?", (task_id,)
        ).fetchone()
        assert row is not None
        new_task_fence = row["fence_version"]
        # Step 3: INSERT attempt at that fence (snapshot)
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, lease_token, lease_expires_at, driver_kind) "
            "VALUES (?, ?, ?, ?, 'claimed', ?, ?, 'codex_sdk')",
            (task_id, attempt_id, new_task_fence, worker_id, lease_token, "2099-01-01T00:00:00Z"),
        )
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        raise
    return attempt_id, new_task_fence


def release_attempt(conn: sqlite3.Connection, attempt_id: str, final_status: str = "expired") -> None:
    """Mark an attempt terminal so a new claim can be issued on the same task."""
    conn.execute(
        "UPDATE task_attempts SET status=?, finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE attempt_id=?",
        (final_status, attempt_id),
    )
    conn.commit()