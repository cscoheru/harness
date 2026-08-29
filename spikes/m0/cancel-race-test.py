"""Spike: cancel-race-test.py

File: spikes/m0/cancel-race-test.py
Version: v0.7

Verifies v0.6 P0-3 fix: cancel_requested truly writes 'cancel_requested' status,
not just a timestamp. Also verifies cancel vs renew/reaper/submit races resolve
correctly.
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import uuid

from _helpers import make_db, seed_task, claim


def request_cancel(conn: sqlite3.Connection, task_id: str, actor: str = "user:test") -> None:
    """v0.7 spec: write BOTH status and timestamp."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE tasks SET status='cancel_requested', "
            "  cancel_requested_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE task_id=? AND status NOT IN ('succeeded','failed','canceled','abandoned')",
            (task_id,),
        )
        conn.execute(
            "UPDATE task_attempts SET status='cancel_requested' "
            "WHERE task_id=? AND status IN ('claimed','running')",
            (task_id,),
        )
        conn.execute(
            "INSERT INTO audit_log (task_id, actor, action, target, decision, reason) "
            "VALUES (?, ?, 'cancel', ?, 'allow', 'user_requested')",
            (task_id, actor, task_id),
        )
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        raise


def finalize_cancel(
    conn: sqlite3.Connection,
    task_id: str,
    attempt_id: str,
    worker_id: str,
    lease_token: str,
    fence_version: int,
    status_version: int,
) -> bool:
    """Returns True if finalize applied (row updated), False if mismatch."""
    cur = conn.execute(
        "UPDATE task_attempts SET status='canceled', "
        "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE attempt_id=? AND worker_id=? AND lease_token=? "
        "  AND fence_version=? AND status_version=?",
        (attempt_id, worker_id, lease_token, fence_version, status_version),
    )
    if cur.rowcount != 1:
        return False
    conn.execute(
        "UPDATE tasks SET status='canceled', terminal_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
        "  terminal_reason='canceled' WHERE task_id=?",
        (task_id,),
    )
    conn.commit()
    return True


def renew_lease(conn: sqlite3.Connection, attempt_id: str, lease_token: str) -> int:
    cur = conn.execute(
        "UPDATE task_attempts SET lease_expires_at=? "
        "WHERE attempt_id=? AND lease_token=? AND status IN ('claimed','running')",
        ("2099-01-01T00:00:00Z", attempt_id, lease_token),
    )
    conn.commit()
    return cur.rowcount


def reap_expired(conn: sqlite3.Connection) -> int:
    cur = conn.execute(
        "UPDATE task_attempts SET status='expired', "
        "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE status IN ('claimed','running') AND lease_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')"
    )
    conn.commit()
    return cur.rowcount


def submit_attempt(conn: sqlite3.Connection, attempt_id: str, lease_token: str) -> int:
    """Returns 1 if accepted, 0 if rejected (attempt no longer active)."""
    cur = conn.execute(
        "UPDATE task_attempts SET status='succeeded', "
        "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE attempt_id=? AND lease_token=? AND status='running'",
        (attempt_id, lease_token),
    )
    conn.commit()
    return cur.rowcount


def main() -> int:
    conn = make_db()

    # === Case 1: cancel vs renew ===
    task_id = seed_task(conn)
    attempt_id, fence = claim(conn, task_id, "w1")
    row = conn.execute(
        "SELECT lease_token FROM task_attempts WHERE attempt_id=?", (attempt_id,)
    ).fetchone()
    lease_token = row["lease_token"]
    # Move attempt to running first
    conn.execute(
        "UPDATE task_attempts SET status='running' WHERE attempt_id=?", (attempt_id,)
    )
    conn.commit()
    request_cancel(conn, task_id)
    renewed = renew_lease(conn, attempt_id, lease_token)
    assert renewed == 0, (
        f"renew after cancel should fail (cancel wins); got rowcount={renewed}"
    )

    # === Case 2: cancel writes status (v0.6 P0-3 fix) ===
    row = conn.execute(
        "SELECT status, cancel_requested_at FROM tasks WHERE task_id=?", (task_id,)
    ).fetchone()
    assert row["status"] == "cancel_requested", (
        f"v0.6 P0-3 regression: status is {row['status']}, expected 'cancel_requested'"
    )
    assert row["cancel_requested_at"] is not None, "cancel_requested_at must be set"

    # === Case 3: cancel vs submit ===
    # submit must reject after cancel
    accepted = submit_attempt(conn, attempt_id, lease_token)
    assert accepted == 0, "submit after cancel must be rejected"

    # === Case 4: finalize with full credential match ===
    # claim() leaves status_version at default 0; we ask for status_version=0 to match.
    ok = finalize_cancel(conn, task_id, attempt_id, "w1", lease_token, fence, status_version=0)
    assert ok, "finalize_cancel with matching credentials must succeed"
    row = conn.execute("SELECT status FROM tasks WHERE task_id=?", (task_id,)).fetchone()
    assert row["status"] == "canceled"

    # === Case 5: reaper does NOT cancel in-flight cancel_requested ===
    task_id2 = seed_task(conn)
    attempt_id2, _ = claim(conn, task_id2, "w2")
    request_cancel(conn, task_id2)
    reaped = reap_expired(conn)
    assert reaped == 0, "reaper must not touch attempts already in cancel_requested"

    print("OK: cancel/renew/submit/reaper races resolve per spec §1.4-1.6")
    return 0


if __name__ == "__main__":
    sys.exit(main())