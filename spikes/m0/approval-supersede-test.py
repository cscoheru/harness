"""Spike: approval-supersede-test.py

File: spikes/m0/approval-supersede-test.py
Version: v0.7

Verifies v0.6 P0-M2 fix: a new approval can only supersede an old one when:
  1. old.status == 'unknown'  (MUST be unknown, nothing else)
  2. new.attempt_id != old.attempt_id  (new retry)
  3. new.policy_decision_id != old.policy_decision_id  (re-evaluate policy)
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import tempfile
import uuid

from _helpers import make_db, seed_task, claim


def create_approval(
    conn: sqlite3.Connection,
    approval_id: str,
    task_id: str,
    attempt_id: str,
    policy_decision_id: str,
    status: str = "pending",
    supersedes: str | None = None,
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
    """Returns (ok, error_message)."""
    row = conn.execute(
        "SELECT task_id, attempt_id, policy_decision_id, status FROM approvals WHERE approval_id=?",
        (old_approval_id,),
    ).fetchone()
    if row is None:
        return False, "old approval not found"
    if row["status"] != "unknown":
        return False, f"old.status must be 'unknown'; got '{row['status']}'"
    if row["attempt_id"] == new_attempt_id:
        return False, "new attempt_id must differ from old"
    if row["policy_decision_id"] == new_policy_decision_id:
        return False, "new policy_decision_id must differ from old"
    create_approval(
        conn,
        new_approval_id,
        row["task_id"],
        new_attempt_id,
        new_policy_decision_id,
        status="pending",
        supersedes=old_approval_id,
    )
    return True, ""


def main() -> int:
    conn = make_db()
    task_id = seed_task(conn)
    attempt1, _ = claim(conn, task_id, "w1")
    # Release attempt1 so a second claim can succeed (one active attempt per task).
    conn.execute(
        "UPDATE task_attempts SET status='expired' WHERE attempt_id=?",
        (attempt1,),
    )
    conn.commit()
    attempt2, _ = claim(conn, task_id, "w2")  # second claim, distinct attempt_id
    pd1 = f"pd-{uuid.uuid4().hex[:8]}"
    pd2 = f"pd-{uuid.uuid4().hex[:8]}"
    ap_old = f"ap-old-{uuid.uuid4().hex[:8]}"
    ap_new = f"ap-new-{uuid.uuid4().hex[:8]}"

    # === Case A: old.status='unknown' → supersede allowed (use attempt2 for FK) ===
    create_approval(conn, ap_old, task_id, attempt1, pd1, status="unknown")
    ok, err = attempt_supersede(conn, ap_old, ap_new, attempt2, pd2)
    assert ok, f"unknown -> supersede should succeed; got err={err}"

    # === Case B: old.status='approved' → supersede rejected ===
    ap_old2 = f"ap-old2-{uuid.uuid4().hex[:8]}"
    create_approval(conn, ap_old2, task_id, attempt1, pd1, status="approved")
    ok, err = attempt_supersede(conn, ap_old2, "ap-new-2", "x-attempt", "x-pd")
    assert (not ok) and "must be 'unknown'" in err, (
        f"approved -> supersede must be rejected; got ok={ok}, err={err}"
    )

    # === Case C: old.status='pending' → supersede rejected ===
    ap_old3 = f"ap-old3-{uuid.uuid4().hex[:8]}"
    create_approval(conn, ap_old3, task_id, attempt1, pd1, status="pending")
    ok, err = attempt_supersede(conn, ap_old3, "ap-new-3", "y-attempt", "y-pd")
    assert (not ok) and "must be 'unknown'" in err, "pending -> supersede must be rejected"

    # === Case D: new attempt_id == old attempt_id → rejected ===
    ap_old4 = f"ap-old4-{uuid.uuid4().hex[:8]}"
    create_approval(conn, ap_old4, task_id, attempt1, pd1, status="unknown")
    ok, err = attempt_supersede(conn, ap_old4, "ap-new-4", attempt1, "different-pd")
    assert (not ok) and "attempt_id must differ" in err, (
        f"same attempt_id must be rejected; got err={err}"
    )

    # === Case E: new policy_decision_id == old → rejected ===
    ap_old5 = f"ap-old5-{uuid.uuid4().hex[:8]}"
    create_approval(conn, ap_old5, task_id, attempt1, pd1, status="unknown")
    ok, err = attempt_supersede(conn, ap_old5, "ap-new-5", "totally-new-attempt", pd1)
    assert (not ok) and "policy_decision_id must differ" in err, (
        f"same policy_decision_id must be rejected; got err={err}"
    )

    print("OK: supersede enforces unknown-only, new attempt, new policy decision")
    return 0


if __name__ == "__main__":
    sys.exit(main())