"""harness.runtime._db — SQLite factory + task-claim primitives.

Lift of ``spikes/m0/_helpers.py`` v0.9-B (lines 1-189). Behavior is preserved
byte-for-byte except for the schema path resolution, which now searches
relative to the installed package layout and honors ``HARNESS_SCHEMA_PATH``
when set.

Public API (matches NOW.md §2 T-BE-1 list):
    make_db() — fresh tempfile DB with schema + FK=ON
    connect_with_fk() — connect to existing DB; force FK=ON
    seed_task() — INSERT a tasks row
    claim() — atomic claim (UPDATE fence + INSERT attempt)
    ClaimRejected — raised by ``claim()`` on terminal task / trigger reject

Defense in depth: ``make_db()`` and ``connect_with_fk()`` both close the
v0.9-A P0-9C regression by asserting ``PRAGMA foreign_keys=1`` immediately
after enabling.
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
import uuid
from pathlib import Path

__all__ = [
    "make_db",
    "connect_with_fk",
    "seed_task",
    "claim",
    "ClaimRejected",
]


def _resolve_schema_path() -> str:
    """Locate ``spec/kernel-schema.sql`` for the installed package.

    Search order:
      1. ``$HARNESS_SCHEMA_PATH`` env var (explicit override)
      2. ``<pkg_parent>/../../spec/kernel-schema.sql`` (editable install layout:
         ``harness/runtime/_db.py`` → ``<project>/spec/kernel-schema.sql``)
      3. ``<pkg_parent>/../spec/kernel-schema.sql`` (flat install layout)
    """
    env = os.environ.get("HARNESS_SCHEMA_PATH")
    if env and os.path.isfile(env):
        return env
    here = Path(__file__).resolve().parent
    for rel in (
        here.parent.parent / "spec" / "kernel-schema.sql",
        here.parent / "spec" / "kernel-schema.sql",
    ):
        if rel.is_file():
            return str(rel)
    raise FileNotFoundError(
        f"kernel-schema.sql not found near {here}. "
        f"Set HARNESS_SCHEMA_PATH or place schema at "
        f"<project>/spec/kernel-schema.sql."
    )


def _now_iso() -> str:
    """ISO-8601 UTC timestamp (millisecond precision).

    Anchor at 2026-08-30T12:00:00Z (matches _helpers.py behavioral contract).
    """
    import datetime as _dt
    base = _dt.datetime(2026, 8, 30, 12, 0, 0, tzinfo=_dt.timezone.utc)
    return base.strftime("%Y-%m-%dT%H:%M:%S.") + f"{base.microsecond // 1000:03d}Z"


def make_db() -> sqlite3.Connection:
    """Create a fresh tempfile DB, apply schema, force FK=ON."""
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    with open(_resolve_schema_path(), "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.execute("PRAGMA foreign_keys = ON")
    fk_state = conn.execute("PRAGMA foreign_keys").fetchone()
    assert fk_state[0] == 1, f"FK not enabled after make_db(); got {fk_state}"
    return conn


def connect_with_fk(
    path: str | None = None,
    row_factory: bool = True,
    apply_schema: bool = False,
) -> sqlite3.Connection:
    """Connect to a SQLite DB and FORCE PRAGMA foreign_keys=ON.

    Args:
        path: existing DB file. If None, creates a fresh tempfile and applies
            schema (equivalent to ``make_db()``).
        apply_schema: if True, run kernel-schema.sql on connect (only safe
            for fresh DBs). Default False — caller is responsible for schema
            already being present.
    """
    if path is None:
        fd, path = tempfile.mkstemp(suffix=".sqlite")
        os.close(fd)
        apply_schema = True
    conn = sqlite3.connect(path)
    if row_factory:
        conn.row_factory = sqlite3.Row
    if apply_schema:
        with open(_resolve_schema_path(), "r", encoding="utf-8") as f:
            conn.executescript(f.read())
    conn.execute("PRAGMA foreign_keys = ON")
    fk_state = conn.execute("PRAGMA foreign_keys").fetchone()
    assert fk_state[0] == 1, f"FK not enabled in connect_with_fk(); got {fk_state}"
    return conn


def seed_task(
    conn: sqlite3.Connection,
    status: str = "pending",
    context_budget_tokens: int | None = None,
) -> str:
    """Seed a task. v0.9-A adds context_budget_tokens argument."""
    task_id = f"task-{uuid.uuid4().hex[:12]}"
    if context_budget_tokens is None:
        conn.execute(
            "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status) "
            "VALUES (?, 't1', 'web_research', '1.0.0', ?)",
            (task_id, status),
        )
    else:
        conn.execute(
            "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status, "
            "  context_budget_tokens) VALUES (?, 't1', 'web_research', '1.0.0', ?, ?)",
            (task_id, status, context_budget_tokens),
        )
    conn.commit()
    return task_id


class ClaimRejected(Exception):
    """Raised when a claim is rejected (terminal task, trigger rejection, etc.)."""


def claim(
    conn: sqlite3.Connection, task_id: str, worker_id: str
) -> tuple[str, int]:
    """Atomic claim.

    Closes v0.7 P0-2 regression:
      1. UPDATE tasks SET fence_version += 1 + status='claimed'; ASSERT rowcount == 1.
      2. Read the new task fence.
      3. INSERT attempt with that exact fence. Trigger trg_attempt_fence_insert
         enforces strict equality.
      4. Belt-and-suspenders: trg_attempt_terminal_task_insert also blocks attempt
         INSERT if task is in a terminal state.

    v0.9-B I15: an active attempt requires worker_id IS NOT NULL AND
    worker_id must reference an existing workers row. This helper
    auto-registers the worker if absent (preserves v0.7-v0.9-A test backward
    compatibility).

    Returns (attempt_id, fence_version) on success.
    Raises ClaimRejected on rowcount mismatch, trigger rejection, or uniqueness conflict.
    """
    attempt_id = f"att-{uuid.uuid4().hex[:12]}"
    lease_token = uuid.uuid4().hex
    conn.execute(
        "INSERT OR IGNORE INTO workers (worker_id, host, capabilities_json, "
        "  status, last_heartbeat_at) "
        "VALUES (?, 'helper-default', '[]', 'active', ?)",
        (worker_id, _now_iso()),
    )
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "UPDATE tasks SET fence_version = fence_version + 1, "
            "  status='claimed', updated_at=strftime('%Y-%m-%dT%H:%M:%S.%fZ','now') "
            "WHERE task_id=? AND status IN ('pending','failed')",
            (task_id,),
        )
        if cur.rowcount != 1:
            conn.rollback()
            raise ClaimRejected(
                f"claim rejected: task {task_id} not in pending/failed "
                f"(rowcount={cur.rowcount}, status likely terminal)"
            )
        row = conn.execute(
            "SELECT fence_version FROM tasks WHERE task_id=?", (task_id,)
        ).fetchone()
        assert row is not None
        new_task_fence = row["fence_version"]
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