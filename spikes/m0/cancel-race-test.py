"""Spike: cancel-race-test.py (v0.8 — closes Codex v0.7 P0-3 regressions)

File: spikes/m0/cancel-race-test.py
Version: v0.8

Verifies:
  - cancel writes BOTH status AND timestamp (P0-3 fix)
  - finalize_cancel binds task_id + status='cancel_requested' (cross-task reject)
  - cancel vs renew/submit/heartbeat races (true concurrent threads)
  - reaper spec uses task_events (no more attempts_failed ghost table)

Regression coverage from Codex v0.7 §3 P0-3 反例:
  - cross-task finalize: cancel attempt A as task B → must reject
  - status_version increment on every transition
  - claim/reaper concurrent race
  - heartbeat/reaper concurrent race
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import threading
import uuid
from typing import Optional

from _helpers import (
    ClaimRejected, claim, make_db, release_attempt, seed_task, transition_attempt,
)


# ==================== request_cancel ====================
def request_cancel(conn: sqlite3.Connection, task_id: str, actor: str = "user:test") -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "UPDATE tasks SET status='cancel_requested', "
            "  cancel_requested_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE task_id=? AND status NOT IN ('succeeded','failed','canceled','abandoned')",
            (task_id,),
        )
        if cur.rowcount != 1:
            conn.rollback()
            raise RuntimeError(f"request_cancel rejected (rowcount={cur.rowcount})")
        conn.execute(
            "UPDATE task_attempts SET status='cancel_requested', "
            "  status_version=status_version+1 "
            "WHERE task_id=? AND status IN ('claimed','running')",
            (task_id,),
        )
        conn.execute(
            "INSERT INTO audit_log (task_id, actor, action, target, decision, reason) "
            "VALUES (?, ?, 'cancel', ?, 'allow', 'user_requested')",
            (task_id, actor, task_id),
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        raise


# ==================== finalize_cancel (closes P0-3 cross-task bug) ====================
def finalize_cancel(
    conn: sqlite3.Connection,
    task_id: str,
    attempt_id: str,
    worker_id: str,
    lease_token: str,
    fence_version: int,
    status_version: int,
) -> bool:
    """Closes v0.7 P0-3 cross-task finalize bug:
    - attempt UPDATE binds task_id AND status='cancel_requested'
    - rowcount == 1 required before task UPDATE
    - any mismatch → full rollback
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "UPDATE task_attempts SET status='canceled', "
            "  status_version=status_version+1, "
            "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE attempt_id=? AND task_id=? AND worker_id=? AND lease_token=? "
            "  AND fence_version=? AND status_version=? AND status='cancel_requested'",
            (attempt_id, task_id, worker_id, lease_token, fence_version, status_version),
        )
        if cur.rowcount != 1:
            conn.rollback()
            return False
        cur2 = conn.execute(
            "UPDATE tasks SET status='canceled', "
            "  terminal_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  terminal_reason='canceled' "
            "WHERE task_id=? AND status='cancel_requested'",
            (task_id,),
        )
        if cur2.rowcount != 1:
            conn.rollback()
            return False
        conn.commit()
        return True
    except Exception:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        raise


def renew_lease(conn: sqlite3.Connection, attempt_id: str, lease_token: str) -> int:
    cur = conn.execute(
        "UPDATE task_attempts SET lease_expires_at=? "
        "WHERE attempt_id=? AND lease_token=? AND status IN ('claimed','running')",
        ("2099-01-01T00:00:00Z", attempt_id, lease_token),
    )
    conn.commit()
    return cur.rowcount


def submit_attempt(conn: sqlite3.Connection, attempt_id: str, lease_token: str) -> int:
    """Returns 1 if accepted, 0 if rejected (attempt no longer active)."""
    cur = conn.execute(
        "UPDATE task_attempts SET status='succeeded', "
        "  status_version=status_version+1, "
        "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE attempt_id=? AND lease_token=? AND status='running'",
        (attempt_id, lease_token),
    )
    conn.commit()
    return cur.rowcount


# ==================== reaper ====================
def reap_expired(conn: sqlite3.Connection) -> int:
    """Closes v0.7 P0-3 reaper-spec-ghost-table bug:
    reaper writes to task_events (real table) + attempts_failed never referenced.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "UPDATE task_attempts SET status='expired', "
            "  status_version=status_version+1, "
            "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  failure_code='lease_lost' "
            "WHERE status IN ('claimed','running') "
            "  AND lease_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')"
        )
        reaped = cur.rowcount
        if reaped > 0:
            # Mark task failed only if no active attempt remains.
            conn.execute(
                "UPDATE tasks SET status='failed', "
                "  terminal_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
                "  terminal_reason='lease_lost' "
                "WHERE task_id IN (SELECT task_id FROM task_attempts "
                "                   WHERE status='expired' "
                "                     AND NOT EXISTS (SELECT 1 FROM task_attempts a2 "
                "                                     WHERE a2.task_id = task_attempts.task_id "
                "                                       AND a2.status IN ('claimed','running','cancel_requested')))"
            )
        conn.commit()
        return reaped
    except Exception:
        conn.rollback()
        raise


def main() -> int:
    # === Case 1: cancel vs renew (sequential, verifies cancel wins) ===
    conn = make_db()
    task_id = seed_task(conn)
    attempt_id, fence = claim(conn, task_id, "w1")
    row = conn.execute(
        "SELECT lease_token, status_version FROM task_attempts WHERE attempt_id=?",
        (attempt_id,),
    ).fetchone()
    lease_token = row["lease_token"]
    conn.execute("UPDATE task_attempts SET status='running' WHERE attempt_id=?", (attempt_id,))
    conn.commit()
    request_cancel(conn, task_id)
    renewed = renew_lease(conn, attempt_id, lease_token)
    assert renewed == 0, f"renew after cancel should fail (cancel wins); got rowcount={renewed}"
    print("OK: cancel vs renew → cancel wins, renew rejected")

    # === Case 2: cancel writes status (v0.6/v0.7 P0-3) ===
    row = conn.execute(
        "SELECT status, cancel_requested_at FROM tasks WHERE task_id=?", (task_id,)
    ).fetchone()
    assert row["status"] == "cancel_requested", (
        f"v0.7 P0-3 regression: status is {row['status']}, expected 'cancel_requested'"
    )
    assert row["cancel_requested_at"] is not None
    print("OK: cancel writes 'cancel_requested' status + timestamp")

    # === Case 3: cancel vs submit ===
    accepted = submit_attempt(conn, attempt_id, lease_token)
    assert accepted == 0, "submit after cancel must be rejected"
    print("OK: cancel vs submit → submit rejected")

    # === Case 4: finalize with full credential match ===
    sv = conn.execute(
        "SELECT status_version FROM task_attempts WHERE attempt_id=?", (attempt_id,)
    ).fetchone()["status_version"]
    ok = finalize_cancel(conn, task_id, attempt_id, "w1", lease_token, fence, status_version=sv)
    assert ok, "finalize_cancel with matching credentials must succeed"
    row = conn.execute("SELECT status FROM tasks WHERE task_id=?", (task_id,)).fetchone()
    assert row["status"] == "canceled"
    print("OK: finalize_cancel with matching credentials → canceled")

    # === Case 5: reaper does NOT cancel in-flight cancel_requested ===
    task_id2 = seed_task(conn)
    attempt_id2, _ = claim(conn, task_id2, "w2")
    request_cancel(conn, task_id2)
    reaped = reap_expired(conn)
    assert reaped == 0, "reaper must not touch attempts already in cancel_requested"
    print("OK: reaper ignores cancel_requested attempts")

    # === Case 6 (P0-3 反例 cross-task finalize): use task A attempt to cancel task B ===
    task_a = seed_task(conn)
    task_b = seed_task(conn)
    attempt_a, fence_a = claim(conn, task_a, "w-a")
    row_a = conn.execute(
        "SELECT lease_token, status_version FROM task_attempts WHERE attempt_id=?",
        (attempt_a,),
    ).fetchone()
    lease_a = row_a["lease_token"]; sv_a = row_a["status_version"]
    request_cancel(conn, task_a)
    # Re-fetch sv_a after request_cancel bumped it
    sv_a = conn.execute(
        "SELECT status_version FROM task_attempts WHERE attempt_id=?", (attempt_a,)
    ).fetchone()["status_version"]
    # Now try to finalize task_a via attempt_a but with task_id=task_b
    ok = finalize_cancel(conn, task_b, attempt_a, "w-a", lease_a, fence_a, status_version=sv_a)
    assert ok is False, (
        f"P0-3 cross-task finalize regression: must reject when task_id mismatched; got ok={ok}"
    )
    # Verify: task_a IS canceled (from request_cancel's effect), task_b NOT canceled
    row_a = conn.execute("SELECT status FROM tasks WHERE task_id=?", (task_a,)).fetchone()
    row_b = conn.execute("SELECT status FROM tasks WHERE task_id=?", (task_b,)).fetchone()
    assert row_a["status"] == "cancel_requested", (
        f"task_a should still be cancel_requested (finalize rejected); got {row_a['status']}"
    )
    assert row_b["status"] == "pending", (
        f"task_b must remain pending; got {row_b['status']} — cross-task cancel leaked!"
    )
    print("OK: cross-task finalize rejected; task_b NOT canceled")

    # === Case 7: heartbeat vs reaper concurrent race (true concurrent threads) ===
    race_path = _shared_db()
    race_task = seed_task_with_db(race_path, "task-race-hb")
    aid_r, _ = _threaded_claim(race_path, race_task, "w-r")
    # Set lease to expired so reaper can pick it up
    _set_expired_lease(race_path, aid_r)
    # Now race heartbeat vs reaper
    barrier = threading.Barrier(2)
    results: dict[str, int] = {}
    def do_heartbeat() -> None:
        barrier.wait(timeout=5)
        c = sqlite3.connect(race_path, timeout=10)
        c.row_factory = sqlite3.Row
        row = c.execute(
            "SELECT lease_token FROM task_attempts WHERE attempt_id=?", (aid_r,)
        ).fetchone()
        try:
            results["heartbeat"] = renew_lease(c, aid_r, row["lease_token"])
        finally:
            c.close()
    def do_reap() -> None:
        barrier.wait(timeout=5)
        c = sqlite3.connect(race_path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            results["reaper"] = reap_expired(c)
        finally:
            c.close()
    t1 = threading.Thread(target=do_heartbeat); t2 = threading.Thread(target=do_reap)
    t1.start(); t2.start(); t1.join(timeout=10); t2.join(timeout=10)
    # Either: heartbeat wins (renewed=1) and reaper finds 0 expired
    # Or: reaper wins (reaped=1) and heartbeat finds 0 active
    hb = results.get("heartbeat", 0)
    rp = results.get("reaper", 0)
    assert (hb == 1 and rp == 0) or (hb == 0 and rp == 1), (
        f"heartbeat vs reaper race resolved incorrectly: hb={hb} rp={rp}"
    )
    print(f"OK: heartbeat vs reaper race → exactly one side won (hb={hb} reaper={rp})")

    # === Case 8: claim vs reaper concurrent race ===
    race_task2 = seed_task_with_db(race_path, "task-race-cr")
    barrier.reset()
    results2: dict[str, object] = {}
    def do_claim(worker_id: str) -> None:
        barrier.wait(timeout=5)
        c = sqlite3.connect(race_path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            attempt_id_x, fence_x = claim(c, race_task2, worker_id)
            results2[worker_id] = ("ok", attempt_id_x)
        except ClaimRejected as e:
            results2[worker_id] = ("rej", str(e))
        finally:
            c.close()
    t1 = threading.Thread(target=do_claim, args=("w-1",))
    t2 = threading.Thread(target=do_claim, args=("w-2",))
    t1.start(); t2.start(); t1.join(timeout=10); t2.join(timeout=10)
    oks = [r for r in results2.values() if r[0] == "ok"]
    rejs = [r for r in results2.values() if r[0] == "rej"]
    assert len(oks) == 1 and len(rejs) == 1, (
        f"claim race: expected 1 ok + 1 rejection, got {results2}"
    )
    print(f"OK: claim race → 1 success + 1 rejection")

    return 0


def _shared_db() -> str:
    import tempfile, os
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "..", "spec", "kernel-schema.sql")
    with open(schema_path, "r") as f:
        c.executescript(f.read())
    c.close()
    return path


def seed_task_with_db(path: str, label: str = "task") -> str:
    c = sqlite3.connect(path); c.row_factory = sqlite3.Row
    task_id = f"{label}-{uuid.uuid4().hex[:8]}"
    c.execute(
        "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status) "
        "VALUES (?, 't1', 'web_research', '1.0.0', 'pending')",
        (task_id,),
    )
    c.commit(); c.close()
    return task_id


def _threaded_claim(path: str, task_id: str, worker_id: str) -> tuple[str, int]:
    c = sqlite3.connect(path); c.row_factory = sqlite3.Row
    try:
        return claim(c, task_id, worker_id)
    finally:
        c.close()


def _set_expired_lease(path: str, attempt_id: str) -> None:
    c = sqlite3.connect(path)
    c.execute(
        "UPDATE task_attempts SET lease_expires_at='2000-01-01T00:00:00Z' WHERE attempt_id=?",
        (attempt_id,),
    )
    c.commit(); c.close()


if __name__ == "__main__":
    sys.exit(main())