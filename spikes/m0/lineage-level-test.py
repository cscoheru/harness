"""Spike: lineage-level-test.py (v0.9.2 — closes Codex v0.9-A P1-1)

File: spikes/m0/lineage-level-test.py
Version: v0.9.2

Validates lineage level rules (Codex v0.9-A P1-1):
  L2 must have parent at level L0 or L1 (not L2/L3)
  L3 must have parent at level L2 (not L0/L1/L3)
  Parent must be in same task (existing I17 rule)

Cases:
  Case A: L2 with NO parent → reject (must have parent)
  Case B: L2 with L0 parent → accept
  Case C: L2 with L1 parent → accept
  Case D: L2 with L2 parent → reject (Codex P1-1 finding: was accepted)
  Case E: L2 with L3 parent → reject
  Case F: L3 with NO parent → reject
  Case G: L3 with L0 parent → reject (Codex P1-1: was accepted)
  Case H: L3 with L1 parent → reject (Codex P1-1: was accepted)
  Case I: L3 with L2 parent → accept
  Case J: L3 with L3 parent → reject
  Case K: L2 with cross-task parent → reject (I17 same-task)
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys

from _helpers import (
    TRUSTED_USER_INPUT,
    claim,
    insert_snapshot,
    make_db,
    seed_blob,
    seed_task,
)


def _attempt_for(conn, task_id, worker_id="w-lineage"):
    """Helper: create a claim so we have an attempt_id for snapshots."""
    attempt_id, _ = claim(conn, task_id, worker_id)
    return attempt_id


def _try_insert(conn, task_id, attempt_id, level, parent_snap, blob,
                trust_label=TRUSTED_USER_INPUT):
    """Try to insert a snapshot. Returns (success: bool, error_msg: str|None)."""
    try:
        insert_snapshot(
            conn, task_id, attempt_id, level,
            token_count=10, trust_label=trust_label,
            raw_blob_id=blob if level in ("L1", "L2") else None,
            parent_snapshot_id=parent_snap,
        )
        return True, None
    except sqlite3.IntegrityError as e:
        return False, str(e)


def main() -> int:
    # === Case A: L2 with NO parent → reject ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    ok, err = _try_insert(conn, task_id, attempt_id, "L2", None, blob)
    assert not ok, f"L2 with no parent should reject; got success"
    assert "lineage" in err.lower() or "L0" in err or "L1" in err, (
        f"L2 no-parent error should mention lineage; got: {err}"
    )
    print(f"OK: L2 with no parent → rejected (lineage L0/L1 required)")

    # === Case B: L2 with L0 parent → accept ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l0 = insert_snapshot(conn, task_id, attempt_id, "L0", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT)
    ok, err = _try_insert(conn, task_id, attempt_id, "L2", parent_l0, blob)
    assert ok, f"L2 with L0 parent should accept; got: {err}"
    print(f"OK: L2 with L0 parent → accepted")

    # === Case C: L2 with L1 parent → accept ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l1 = insert_snapshot(conn, task_id, attempt_id, "L1", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT, raw_blob_id=blob)
    ok, err = _try_insert(conn, task_id, attempt_id, "L2", parent_l1, blob)
    assert ok, f"L2 with L1 parent should accept; got: {err}"
    print(f"OK: L2 with L1 parent → accepted")

    # === Case D: L2 with L2 parent → reject (Codex P1-1) ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l0 = insert_snapshot(conn, task_id, attempt_id, "L0", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT)
    parent_l2 = insert_snapshot(conn, task_id, attempt_id, "L2", token_count=10,
                                 trust_label=TRUSTED_USER_INPUT, parent_snapshot_id=parent_l0,
                                 distilled_blob_id=blob)
    # Try L2 with L2 parent — must reject (P1-1 closing)
    ok, err = _try_insert(conn, task_id, attempt_id, "L2", parent_l2, blob)
    assert not ok, "L2 with L2 parent should reject; got success (P1-1 not closed)"
    print(f"OK: L2 with L2 parent → rejected (P1-1 closed)")

    # === Case E: L2 with L3 parent → reject ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l0 = insert_snapshot(conn, task_id, attempt_id, "L0", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT)
    parent_l2_for_l3 = insert_snapshot(
        conn, task_id, attempt_id, "L2", token_count=10,
        trust_label=TRUSTED_USER_INPUT, parent_snapshot_id=parent_l0,
        distilled_blob_id=blob,
    )
    parent_l3 = insert_snapshot(
        conn, task_id, attempt_id, "L3", token_count=15,
        trust_label="model_generated", parent_snapshot_id=parent_l2_for_l3,
        distilled_blob_id=blob,
    )
    ok, err = _try_insert(conn, task_id, attempt_id, "L2", parent_l3, blob)
    assert not ok, "L2 with L3 parent should reject; got success"
    print(f"OK: L2 with L3 parent → rejected")

    # === Case F: L3 with NO parent → reject ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    ok, err = _try_insert(conn, task_id, attempt_id, "L3", None, blob)
    assert not ok, "L3 with no parent should reject; got success"
    print(f"OK: L3 with no parent → rejected (lineage L2 required)")

    # === Case G: L3 with L0 parent → reject (Codex P1-1) ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l0 = insert_snapshot(conn, task_id, attempt_id, "L0", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT)
    ok, err = _try_insert(conn, task_id, attempt_id, "L3", parent_l0, blob)
    assert not ok, "L3 with L0 parent should reject (P1-1); got success"
    print(f"OK: L3 with L0 parent → rejected (P1-1 closed)")

    # === Case H: L3 with L1 parent → reject (Codex P1-1) ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l1 = insert_snapshot(conn, task_id, attempt_id, "L1", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT, raw_blob_id=blob)
    ok, err = _try_insert(conn, task_id, attempt_id, "L3", parent_l1, blob)
    assert not ok, "L3 with L1 parent should reject (P1-1); got success"
    print(f"OK: L3 with L1 parent → rejected (P1-1 closed)")

    # === Case I: L3 with L2 parent → accept ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l0 = insert_snapshot(conn, task_id, attempt_id, "L0", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT)
    parent_l2 = insert_snapshot(
        conn, task_id, attempt_id, "L2", token_count=10,
        trust_label=TRUSTED_USER_INPUT, parent_snapshot_id=parent_l0,
        distilled_blob_id=blob,
    )
    ok, err = _try_insert(conn, task_id, attempt_id, "L3", parent_l2, blob)
    assert ok, f"L3 with L2 parent should accept; got: {err}"
    print(f"OK: L3 with L2 parent → accepted")

    # === Case J: L3 with L3 parent → reject ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id = _attempt_for(conn, task_id)
    blob = seed_blob(conn)
    parent_l0 = insert_snapshot(conn, task_id, attempt_id, "L0", token_count=5,
                                 trust_label=TRUSTED_USER_INPUT)
    parent_l2_for_l3 = insert_snapshot(
        conn, task_id, attempt_id, "L2", token_count=10,
        trust_label=TRUSTED_USER_INPUT, parent_snapshot_id=parent_l0,
        distilled_blob_id=blob,
    )
    parent_l3 = insert_snapshot(
        conn, task_id, attempt_id, "L3", token_count=15,
        trust_label="model_generated", parent_snapshot_id=parent_l2_for_l3,
        distilled_blob_id=blob,
    )
    ok, err = _try_insert(conn, task_id, attempt_id, "L3", parent_l3, blob)
    assert not ok, "L3 with L3 parent should reject; got success"
    print(f"OK: L3 with L3 parent → rejected")

    # === Case K: L2 with cross-task parent → reject (I17 same-task) ===
    conn = make_db()
    task_id_a = seed_task(conn, context_budget_tokens=1000)
    task_id_b = seed_task(conn, context_budget_tokens=1000)
    attempt_a = _attempt_for(conn, task_id_a, "w-lineage-ka")
    attempt_b = _attempt_for(conn, task_id_b, "w-lineage-kb")
    blob = seed_blob(conn)
    parent_l0_a = insert_snapshot(
        conn, task_id_a, attempt_a, "L0", token_count=5,
        trust_label=TRUSTED_USER_INPUT,
    )
    # Try L2 in task B with parent from task A — must reject
    ok, err = _try_insert(conn, task_id_b, attempt_b, "L2", parent_l0_a, blob)
    assert not ok, "cross-task parent should reject; got success"
    assert "same task" in err.lower() or "task" in err.lower(), (
        f"cross-task error should mention task; got: {err}"
    )
    print(f"OK: L2 with cross-task parent → rejected (I17 same-task)")

    print(f"\nOK: lineage-level-test.py v0.9.2 — 11 cases 全绿 (P1-1 closed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
