"""Spike: approval-supersede-test.py (v0.8 — closes Codex v0.7 P0-M2 regression)

File: spikes/m0/approval-supersede-test.py
Version: v0.8

Regression coverage from Codex v0.7 §3 P0-M2 反例:
  - 连续两次 supersede 同一 old approval → 第二次必须失败
  - 并发两次 supersede → 一个成功一个失败
  - UNIQUE constraint idx_approvals_one_child prevents two children

The fix lives in BOTH schema (unique constraint) AND application (atomic
single-consumer UPDATE of old status).
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import threading
import uuid

from _helpers import claim, make_db, release_attempt, seed_task


def create_approval(
    conn: sqlite3.Connection,
    approval_id: str,
    task_id: str,
    attempt_id: str,
    policy_decision_id: str,
    status: str = "pending",
    supersedes: Optional[str] = None,
) -> None:
    conn.execute(
        "INSERT INTO approvals "
        "(approval_id, task_id, attempt_id, policy_decision_id, status, supersedes_approval_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (approval_id, task_id, attempt_id, policy_decision_id, status, supersedes),
    )
    conn.commit()


def attempt_supersede(
    conn: sqlite3.Connection,
    old_approval_id: str,
    new_approval_id: str,
    new_attempt_id: str,
    new_policy_decision_id: str,
) -> tuple[bool, str]:
    """Single-consumer atomic supersede (closes Codex v0.7 P0-M2 regression).

    Closes P0-M2 by:
      1. Same BEGIN IMMEDIATE transaction:
         a. UPDATE old approval SET status='consumed' WHERE approval_id=? AND status='unknown'
            — atomic single-consumer claim.
         b. INSERT new approval with supersedes_approval_id=old.
         c. UNIQUE constraint idx_approvals_one_child backs up the application logic
            if two transactions race.
      2. New attempt_id != old.attempt_id, new policy_decision_id != old.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            "SELECT task_id, attempt_id, policy_decision_id, status FROM approvals WHERE approval_id=?",
            (old_approval_id,),
        ).fetchone()
        if row is None:
            conn.rollback()
            return False, "old approval not found"
        if row["status"] != "unknown":
            conn.rollback()
            return False, f"old.status must be 'unknown'; got '{row['status']}'"
        if row["attempt_id"] == new_attempt_id:
            conn.rollback()
            return False, "new attempt_id must differ from old"
        if row["policy_decision_id"] == new_policy_decision_id:
            conn.rollback()
            return False, "new policy_decision_id must differ from old"
        # Step a: atomically consume old
        cur = conn.execute(
            "UPDATE approvals SET status='consumed', decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE approval_id=? AND status='unknown'",
            (old_approval_id,),
        )
        if cur.rowcount != 1:
            conn.rollback()
            return False, "old approval not consumed (race lost)"
        # Step b: insert new
        try:
            conn.execute(
                "INSERT INTO approvals "
                "(approval_id, task_id, attempt_id, policy_decision_id, status, supersedes_approval_id) "
                "VALUES (?, ?, ?, ?, 'pending', ?)",
                (new_approval_id, row["task_id"], new_attempt_id,
                 new_policy_decision_id, old_approval_id),
            )
        except sqlite3.IntegrityError as e:
            conn.rollback()
            return False, f"unique constraint blocked second child: {e}"
        conn.commit()
        return True, ""
    except Exception:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        raise


def main() -> int:
    conn = make_db()
    task_id = seed_task(conn)
    attempt1, _ = claim(conn, task_id, "w1")
    release_attempt(conn, attempt1)
    attempt2, _ = claim(conn, task_id, "w2")
    pd1 = f"pd-{uuid.uuid4().hex[:8]}"
    pd2 = f"pd-{uuid.uuid4().hex[:8]}"
    pd3 = f"pd-{uuid.uuid4().hex[:8]}"
    ap_old = f"ap-old-{uuid.uuid4().hex[:8]}"
    ap_new_a = f"ap-new-a-{uuid.uuid4().hex[:8]}"
    ap_new_b = f"ap-new-b-{uuid.uuid4().hex[:8]}"

    # === Case A: unknown → first supersede succeeds ===
    create_approval(conn, ap_old, task_id, attempt1, pd1, status="unknown")
    ok, err = attempt_supersede(conn, ap_old, ap_new_a, attempt2, pd2)
    assert ok, f"first supersede must succeed; got err={err}"
    print("OK: first supersede unknown → succeeded")

    # === Case B (P0-M2 反例): 连续两次 supersede → 第二次 must FAIL ===
    # The old approval is now status='consumed', not 'unknown' → reject.
    ok, err = attempt_supersede(conn, ap_old, ap_new_b, "different-attempt", pd3)
    assert (not ok), (
        f"P0-M2 regression: 2nd supersede must reject; got ok=True err={err}"
    )
    assert "must be 'unknown'" in err or "not consumed" in err or "blocked" in err, (
        f"unexpected rejection reason: {err}"
    )
    # Also: child count must be exactly 1
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM approvals WHERE supersedes_approval_id=?",
        (ap_old,),
    ).fetchone()
    assert row["c"] == 1, f"expected exactly 1 child, got {row['c']}"
    print(f"OK: 2nd sequential supersede rejected; children={row['c']}")

    # === Case C (P0-M2 反例): 并发两次 supersede → exactly one wins ===
    ap_old2 = f"ap-old2-{uuid.uuid4().hex[:8]}"
    ap_new_c = f"ap-new-c-{uuid.uuid4().hex[:8]}"
    ap_new_d = f"ap-new-d-{uuid.uuid4().hex[:8]}"
    pd4 = f"pd-{uuid.uuid4().hex[:8]}"
    pd5 = f"pd-{uuid.uuid4().hex[:8]}"
    pd6 = f"pd-{uuid.uuid4().hex[:8]}"
    create_approval(conn, ap_old2, task_id, attempt1, pd4, status="unknown")
    # Release attempt2 so we have two fresh attempts for the race
    release_attempt(conn, attempt2)
    attempt3, _ = claim(conn, task_id, "w3")
    # IMPORTANT: release attempt3 before claim4 (one active attempt per task).
    release_attempt(conn, attempt3)
    attempt4, _ = claim(conn, task_id, "w4")
    # Run two concurrent supersede attempts against the SAME shared DB
    shared_path = _shared_db_with_seed(ap_old2, task_id, attempt1, attempt3, attempt4, pd4, pd5, pd6)
    barrier = threading.Barrier(2)
    results: dict[str, tuple[bool, str]] = {}
    lock = threading.Lock()
    def race(target_old: str, new_id: str, attempt_x: str, pd_x: str, key: str) -> None:
        barrier.wait(timeout=5)
        c = sqlite3.connect(shared_path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            ok_x, err_x = attempt_supersede(c, target_old, new_id, attempt_x, pd_x)
            with lock:
                results[key] = (ok_x, err_x)
        finally:
            c.close()
    t1 = threading.Thread(target=race, args=(ap_old2, ap_new_c, attempt3, pd5, "A"))
    t2 = threading.Thread(target=race, args=(ap_old2, ap_new_d, attempt4, pd6, "B"))
    t1.start(); t2.start(); t1.join(timeout=10); t2.join(timeout=10)
    oks = [k for k, v in results.items() if v[0]]
    rejs = [k for k, v in results.items() if not v[0]]
    assert len(oks) == 1 and len(rejs) == 1, (
        f"concurrent supersede: expected 1 ok + 1 reject, got {results}"
    )
    # Verify exactly one child
    c = sqlite3.connect(shared_path); c.row_factory = sqlite3.Row
    row = c.execute(
        "SELECT COUNT(*) AS c FROM approvals WHERE supersedes_approval_id=?",
        (ap_old2,),
    ).fetchone()
    c.close()
    assert row["c"] == 1, f"expected exactly 1 child after race, got {row['c']}"
    print(f"OK: concurrent supersede → 1 ok + 1 reject; children={row['c']}")

    # === Case D: status not unknown (approved/pending/rejected/expired/consumed) all reject ===
    for bad_status in ["approved", "pending", "rejected", "expired", "consumed"]:
        ap_bad = f"ap-bad-{bad_status}-{uuid.uuid4().hex[:6]}"
        create_approval(conn, ap_bad, task_id, attempt1, pd1, status=bad_status)
        ok, err = attempt_supersede(conn, ap_bad, f"new-{bad_status}", "new-att", "new-pd")
        assert (not ok) and "must be 'unknown'" in err, (
            f"status={bad_status} should be rejected; got ok={ok} err={err}"
        )
    print("OK: status in {approved,pending,rejected,expired,consumed} all reject supersede")

    return 0


def _shared_db_with_seed(
    ap_old: str, task_id: str, att1: str, att3: str, att4: str,
    pd4: str, pd5: str, pd6: str,
) -> str:
    import tempfile, os
    fd, path = tempfile.mkstemp(suffix=".sqlite"); os.close(fd)
    c = sqlite3.connect(path); c.row_factory = sqlite3.Row
    schema = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "..", "..", "spec", "kernel-schema.sql")
    with open(schema, "r") as f:
        c.executescript(f.read())
    c.execute("PRAGMA foreign_keys = ON")
    # Seed identical state
    c.execute(
        "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status, fence_version) "
        "VALUES (?, 't1', 'web_research', '1.0.0', 'pending', 2)",
        (task_id,),
    )
    # v0.9-B I15: register workers for each attempt (one per attempt id)
    for aid in (att1, att3, att4):
        c.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at) VALUES (?, 't-sup', '[]', 'active', "
            "  '2026-08-30T12:00:00.000Z')",
            (f"w-{aid}",),
        )
    # Insert two attempts (att1 expired, att3 claimed, att4 running) — only need att3+att4 present
    c.execute(
        "INSERT INTO task_attempts (task_id, attempt_id, fence_version, worker_id, status, driver_kind) "
        "VALUES (?, ?, 2, ?, 'expired', 'codex_sdk')",
        (task_id, att1, f"w-{att1}"),
    )
    c.execute(
        "INSERT INTO task_attempts (task_id, attempt_id, fence_version, worker_id, status, driver_kind) "
        "VALUES (?, ?, 2, ?, 'claimed', 'codex_sdk')",
        (task_id, att3, f"w-{att3}"),
    )
    c.execute(
        "INSERT INTO task_attempts (task_id, attempt_id, fence_version, worker_id, status, driver_kind) "
        "VALUES (?, ?, 2, ?, 'expired', 'codex_sdk')",
        (task_id, att4, f"w-{att4}"),
    )
    c.execute(
        "INSERT INTO approvals (approval_id, task_id, attempt_id, policy_decision_id, status) "
        "VALUES (?, ?, ?, ?, 'unknown')",
        (ap_old, task_id, att1, pd4),
    )
    c.commit(); c.close()
    return path


if __name__ == "__main__":
    sys.exit(main())