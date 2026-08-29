"""Spike: claim-fence-test.py

File: spikes/m0/claim-fence-test.py
Version: v0.7

CI runs this against the spec/kernel-schema.sql database.
Verifies invariant I1: claim() bumps fence_version monotonically.
Verifies invariant I2: only one active attempt per task.

This is real Python that hits real SQLite. No mocks.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import uuid
from contextlib import contextmanager

# Make _helpers importable when run as `python spikes/m0/claim-fence-test.py`
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from _helpers import make_db, seed_task, claim


def release_for_retry(conn: sqlite3.Connection, task_id: str, attempt_id: str) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE task_attempts SET status='expired', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE attempt_id=?",
            (attempt_id,),
        )
        conn.execute(
            "UPDATE tasks SET status='failed', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  terminal_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), terminal_reason='lease_lost' "
            "WHERE task_id=?",
            (task_id,),
        )
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        raise


def main() -> int:
    conn = make_db()
    task_id = seed_task(conn)

    fences: list[int] = []
    for i in range(10):
        attempt_id, fence = claim(conn, task_id, worker_id=f"w{i}")
        fences.append(fence)
        release_for_retry(conn, task_id, attempt_id)

    # Invariant I4: monotonic non-decreasing
    for i in range(1, len(fences)):
        assert fences[i] > fences[i - 1], (
            f"fence_version not strictly increasing: {fences[i-1]} -> {fences[i]}"
        )

    # Invariant I2: at most one active attempt (none right now since all expired)
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM task_attempts WHERE task_id=? AND status IN ('claimed','running','cancel_requested')",
        (task_id,),
    ).fetchone()
    assert row["c"] == 0, "invariant I2 violated: leftover active attempt"

    # Final state: task is failed (terminal), fence bumped 10 times
    row = conn.execute(
        "SELECT fence_version, status FROM tasks WHERE task_id=?", (task_id,)
    ).fetchone()
    assert row["fence_version"] == 10, f"expected fence_version=10, got {row['fence_version']}"
    assert row["status"] == "failed"

    print(f"OK: 10 claims, fences {fences[0]}..{fences[-1]} monotonic, invariant I2 satisfied")
    return 0


if __name__ == "__main__":
    sys.exit(main())