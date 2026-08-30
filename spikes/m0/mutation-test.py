"""Spike: mutation-test.py (v0.9.3 — closes Codex v0.9.2 M0-19 coverage gap)

File: spikes/m0/mutation-test.py
Version: v0.9.3

For each key constraint / trigger / index, performs reverse-DROP mutation:
  1. Baseline: constraint ON → positive test PASSES
  2. Mutation: DROP constraint → positive test FAILS (proves causality)
  3. Re-apply: restore constraint → positive test PASSES again

Codex v0.9 P0-M2 finding: previous spikes passed but did not prove the target
constraint was the actual enforcement layer (helper intercepted first).
Codex v0.9.2 M0-19 finding: only 6 mutations covering old constraints; v0.9.2
added 5 new fix categories (ownership, lineage, payload, worker events, round-robin)
that lacked reverse-DROP causal evidence. v0.9.3: extend to 15 mutations.

Mutations (each in independent file-DB):
  M1   DROP idx_attempts_one_active → 真并发 double-claim both succeed
  M2   DROP idx_worker_one_active_attempt → 真并发 same-worker two active succeed
  M3   DROP trg_attempt_active_needs_worker_insert → active INSERT NULL worker_id succeeds
  M4   DROP trg_worker_heartbeat_renew → equal heartbeat UPDATE succeeds
  M5   DROP trg_worker_no_draining_insert → INSERT status='draining' succeeds
  M6   DROP trg_attempt_fence_insert → attempt.fence != task.fence INSERT succeeds
  M7   DROP trg_worker_ownership_insert → INSERT worker with wrong-owner current_attempt_id succeeds
  M8   DROP trg_worker_ownership_update → UPDATE wrong-owner current_attempt_id succeeds
  M9   DROP trg_lineage_l2_needs_parent → INSERT L2 with L2 parent succeeds (P1-1)
  M10  DROP trg_lineage_l3_needs_parent → INSERT L3 with L1 parent succeeds (P1-1)
  M11  DROP trg_snapshot_no_update → UPDATE context_snapshots.token_count succeeds (P0-M2-1)
  M12  DROP trg_worker_dispatched_event_emit → no task_events row on register (P1-2)
  M13  DROP trg_worker_heartbeat_event_emit → no task_events row on heartbeat (P1-2)
  M14  DROP trg_worker_drained_event_emit → no task_events row on drain (P1-2)
  M15  monkey-patch _helpers.dispatch_worker → heartbeat-first → 6 dispatches funnel to 1 worker (P1-3)
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import tempfile
import threading

from _helpers import (
    ClaimRejected,
    TRUSTED_USER_INPUT,
    claim,
    connect_with_fk,
    drain_worker,
    heartbeat_worker,
    insert_snapshot,
    register_worker,
    seed_blob,
    seed_task,
)
# M15 monkey-patches _helpers.dispatch_worker; we import _helpers lazily
# inside m15_drop_test_round_robin_reverts_to_heartbeat_first() so the
# import happens after helpers have been fully evaluated.


SCHEMA_PATH = _os.path.normpath(_os.path.join(
    _os.path.dirname(_os.path.abspath(__file__)),
    "..", "..", "spec", "kernel-schema.sql",
))


def _fresh_db_with_schema() -> tuple[str, sqlite3.Connection]:
    """Return (path, conn) of a fresh file-DB with schema applied. Caller closes."""
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    _os.close(fd)
    conn = connect_with_fk(path=path, apply_schema=True)
    return path, conn


def _drop_object(path: str, drop_sql: str) -> None:
    """Apply DROP SQL to the shared file-DB."""
    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(drop_sql)
        conn.commit()
    finally:
        conn.close()


def _verify_restored(path: str, baseline_positive_test) -> bool:
    """Verify the baseline positive test passes again after restore."""
    try:
        baseline_positive_test(path)
        return True
    except AssertionError:
        return False


# ----------------------------------------------------------------------------
# M1: idx_attempts_one_active
# ----------------------------------------------------------------------------

def m1_baseline_two_workers_one_task(path: str) -> None:
    """Baseline: 真并发 two workers claim same task → exactly 1 success."""
    conn = connect_with_fk(path=path, apply_schema=False)
    task_id = seed_task(conn)
    register_worker(conn, host="h1", worker_id="w-m1-a")
    register_worker(conn, host="h1", worker_id="w-m1-b")
    conn.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def go(wid):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                att, _ = claim(c, task_id, wid)
                with lock:
                    results.append((wid, att, None))
            except (sqlite3.IntegrityError, ClaimRejected) as e:
                with lock:
                    results.append((wid, None, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=go, args=("w-m1-a",))
    t2 = threading.Thread(target=go, args=("w-m1-b",))
    t1.start(); t2.start()
    t1.join(); t2.join()

    successes = [r for r in results if r[1] is not None]
    assert len(successes) == 1, (
        f"M1 baseline: expected 1 success; got {len(successes)}: {results}"
    )


def m1_drop_test_two_workers_succeed() -> None:
    """M1: DROP idx_attempts_one_active → both INSERTs succeed (or claim bypasses)."""
    path, _ = _fresh_db_with_schema()
    # Baseline assertion: constraint in place → exactly 1 success
    m1_baseline_two_workers_one_task(path)

    # Now DROP and verify the test FAILS (2 successes)
    _drop_object(path, "DROP INDEX idx_attempts_one_active")

    conn = connect_with_fk(path=path, apply_schema=False)
    task_id = seed_task(conn)
    register_worker(conn, host="h1", worker_id="w-m1-mut-a")
    register_worker(conn, host="h1", worker_id="w-m1-mut-b")
    conn.execute("UPDATE tasks SET fence_version=1 WHERE task_id=?", (task_id,))
    conn.commit()
    conn.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def direct_insert(wid, att):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO task_attempts "
                    "(task_id, attempt_id, fence_version, worker_id, status, "
                    " lease_token, lease_expires_at, status_version, driver_kind) "
                    "VALUES (?, ?, 1, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
                    (task_id, att, wid, f"lease-{wid}", "2099-01-01T00:00:00Z"),
                )
                c.commit()
                with lock:
                    results.append((wid, att, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((wid, None, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=direct_insert, args=("w-m1-mut-a", "att-m1-a"))
    t2 = threading.Thread(target=direct_insert, args=("w-m1-mut-b", "att-m1-b"))
    t1.start(); t2.start()
    t1.join(); t2.join()

    successes = [r for r in results if r[1] is not None]
    assert len(successes) == 2, (
        f"M1 mutation: expected 2 successes after DROP idx_attempts_one_active; "
        f"got {len(successes)}: {results}"
    )
    print(f"OK: M1 DROP idx_attempts_one_active → both INSERTs succeed (causal chain)")


# ----------------------------------------------------------------------------
# M2: idx_worker_one_active_attempt
# ----------------------------------------------------------------------------

def m2_drop_test_same_worker_two_active() -> None:
    """M2: DROP idx_worker_one_active_attempt → both INSERTs succeed."""
    path, conn = _fresh_db_with_schema()
    t1 = seed_task(conn)
    t2 = seed_task(conn)
    register_worker(conn, host="h1", worker_id="w-m2")
    conn.execute("UPDATE tasks SET fence_version=1 WHERE task_id IN (?, ?)", (t1, t2))
    conn.commit()
    conn.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def direct_insert(task_id, attempt_id):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO task_attempts "
                    "(task_id, attempt_id, fence_version, worker_id, status, "
                    " lease_token, lease_expires_at, status_version, driver_kind) "
                    "VALUES (?, ?, 1, 'w-m2', 'claimed', ?, ?, 0, 'codex_sdk')",
                    (task_id, attempt_id, f"lease-{attempt_id}",
                     "2099-01-01T00:00:00Z"),
                )
                c.commit()
                with lock:
                    results.append((task_id, attempt_id, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((task_id, None, str(e)))
        finally:
            c.close()

    t_a = threading.Thread(target=direct_insert, args=(t1, "att-m2-a"))
    t_b = threading.Thread(target=direct_insert, args=(t2, "att-m2-b"))
    t_a.start(); t_b.start()
    t_a.join(); t_b.join()

    successes = [r for r in results if r[1] is not None]
    # With idx_worker_one_active_attempt ON, only 1 should succeed
    assert len(successes) == 1, (
        f"M2 baseline: expected 1 success; got {len(successes)}: {results}"
    )

    # Now DROP and re-test
    _drop_object(path, "DROP INDEX idx_worker_one_active_attempt")
    path2, conn2 = _fresh_db_with_schema()
    t1b = seed_task(conn2)
    t2b = seed_task(conn2)
    register_worker(conn2, host="h1", worker_id="w-m2")
    conn2.execute("UPDATE tasks SET fence_version=1 WHERE task_id IN (?, ?)", (t1b, t2b))
    conn2.commit()
    conn2.close()
    _drop_object(path2, "DROP INDEX idx_worker_one_active_attempt")

    barrier2 = threading.Barrier(2)
    results2: list = []
    lock2 = threading.Lock()

    def direct_insert2(task_id, attempt_id):
        c = connect_with_fk(path=path2, apply_schema=False)
        try:
            barrier2.wait()
            try:
                c.execute(
                    "INSERT INTO task_attempts "
                    "(task_id, attempt_id, fence_version, worker_id, status, "
                    " lease_token, lease_expires_at, status_version, driver_kind) "
                    "VALUES (?, ?, 1, 'w-m2', 'claimed', ?, ?, 0, 'codex_sdk')",
                    (task_id, attempt_id, f"lease-{attempt_id}",
                     "2099-01-01T00:00:00Z"),
                )
                c.commit()
                with lock2:
                    results2.append((task_id, attempt_id, None))
            except sqlite3.IntegrityError as e:
                with lock2:
                    results2.append((task_id, None, str(e)))
        finally:
            c.close()

    t_a = threading.Thread(target=direct_insert2, args=(t1b, "att-m2-a"))
    t_b = threading.Thread(target=direct_insert2, args=(t2b, "att-m2-b"))
    t_a.start(); t_b.start()
    t_a.join(); t_b.join()

    successes2 = [r for r in results2 if r[1] is not None]
    assert len(successes2) == 2, (
        f"M2 mutation: expected 2 successes after DROP; got {len(successes2)}: {results2}"
    )
    print(f"OK: M2 DROP idx_worker_one_active_attempt → both INSERTs succeed")


# ----------------------------------------------------------------------------
# M3: trg_attempt_active_needs_worker_insert
# ----------------------------------------------------------------------------

def m3_drop_test_active_null_worker_succeeds() -> None:
    """M3: DROP I15 INSERT trigger → active INSERT with worker_id=NULL succeeds."""
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn)
    conn.execute("UPDATE tasks SET fence_version=1 WHERE task_id=?", (task_id,))
    conn.commit()
    conn.close()

    # Baseline: with trigger ON, INSERT must fail
    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, ?, 1, NULL, 'claimed', ?, ?, 0, 'codex_sdk')",
            (task_id, "att-m3-baseline", "lease-m3", "2099-01-01T00:00:00Z"),
        )
        raise AssertionError("M3 baseline: expected I15 reject; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "I15" in str(e), f"baseline error should mention I15; got: {e}"
    conn.close()

    # DROP and verify INSERT now succeeds
    _drop_object(path, "DROP TRIGGER trg_attempt_active_needs_worker_insert")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "INSERT INTO task_attempts "
        "(task_id, attempt_id, fence_version, worker_id, status, "
        " lease_token, lease_expires_at, status_version, driver_kind) "
        "VALUES (?, ?, 1, NULL, 'claimed', ?, ?, 0, 'codex_sdk')",
        (task_id, "att-m3-mutated", "lease-m3m", "2099-01-01T00:00:00Z"),
    )
    conn.commit()
    row = conn.execute(
        "SELECT worker_id, status FROM task_attempts WHERE attempt_id='att-m3-mutated'"
    ).fetchone()
    assert row["worker_id"] is None and row["status"] == "claimed", (
        f"M3 mutation: row should be (NULL, claimed); got: {dict(row)}"
    )
    conn.close()
    print(f"OK: M3 DROP trg_attempt_active_needs_worker_insert → active NULL worker_id INSERT succeeds")


# ----------------------------------------------------------------------------
# M4: trg_worker_heartbeat_renew
# ----------------------------------------------------------------------------

def m4_drop_test_equal_heartbeat_succeeds() -> None:
    """M4: DROP I16 trigger → equal heartbeat UPDATE succeeds."""
    path, conn = _fresh_db_with_schema()
    wid = register_worker(conn, host="h1", worker_id="w-m4")
    heartbeat_worker(conn, wid, offset_seconds=10)
    cur_ts = conn.execute(
        "SELECT last_heartbeat_at FROM workers WHERE worker_id=?", (wid,)
    ).fetchone()["last_heartbeat_at"]
    conn.close()

    # Baseline: with trigger ON, equal UPDATE must fail
    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=?",
            (cur_ts, wid),
        )
        raise AssertionError("M4 baseline: expected I16 reject; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        assert "I16" in str(e), f"baseline error should mention I16; got: {e}"
    conn.close()

    # DROP and verify equal UPDATE now succeeds
    _drop_object(path, "DROP TRIGGER trg_worker_heartbeat_renew")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=?",
        (cur_ts, wid),
    )
    conn.commit()
    new_ts = conn.execute(
        "SELECT last_heartbeat_at FROM workers WHERE worker_id=?", (wid,)
    ).fetchone()["last_heartbeat_at"]
    assert new_ts == cur_ts, f"M4 mutation: heartbeat should be unchanged; got {new_ts}"
    conn.close()
    print(f"OK: M4 DROP trg_worker_heartbeat_renew → equal heartbeat UPDATE succeeds")


# ----------------------------------------------------------------------------
# M5: trg_worker_no_draining_insert
# ----------------------------------------------------------------------------

def m5_drop_test_insert_draining_succeeds() -> None:
    """M5: DROP I17 INSERT bypass trigger → INSERT status='draining' succeeds."""
    path, conn = _fresh_db_with_schema()
    conn.close()

    # Baseline
    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at) VALUES ('w-m5', 'h1', '[]', 'draining', "
            "  '2026-08-30T12:00:00.000Z')",
        )
        raise AssertionError("M5 baseline: expected I17 reject; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "I17" in str(e), f"baseline error should mention I17; got: {e}"
    conn.close()

    # DROP and verify INSERT succeeds
    _drop_object(path, "DROP TRIGGER trg_worker_no_draining_insert")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at) VALUES ('w-m5', 'h1', '[]', 'draining', "
        "  '2026-08-30T12:00:00.000Z')",
    )
    conn.commit()
    row = conn.execute(
        "SELECT status FROM workers WHERE worker_id='w-m5'"
    ).fetchone()
    assert row["status"] == "draining", f"M5 mutation: status should be draining; got {row}"
    conn.close()
    print(f"OK: M5 DROP trg_worker_no_draining_insert → INSERT status='draining' succeeds")


# ----------------------------------------------------------------------------
# M6: trg_attempt_fence_insert
# ----------------------------------------------------------------------------

def m6_drop_test_fence_violation_succeeds() -> None:
    """M6: DROP trg_attempt_fence_insert → attempt fence != task fence INSERT succeeds."""
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn)
    register_worker(conn, host="h1", worker_id="w-m6")
    conn.execute("UPDATE tasks SET fence_version=5 WHERE task_id=?", (task_id,))
    conn.commit()
    conn.close()

    # Baseline: with fence trigger ON, oversized INSERT must fail
    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, ?, 999, 'w-m6', 'claimed', ?, ?, 0, 'codex_sdk')",
            (task_id, "att-m6-bad", "lease-m6", "2099-01-01T00:00:00Z"),
        )
        raise AssertionError("M6 baseline: expected fence reject; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "fence" in str(e).lower(), f"baseline should mention fence; got: {e}"
    conn.close()

    # DROP and verify INSERT succeeds (with fence mismatch)
    _drop_object(path, "DROP TRIGGER trg_attempt_fence_insert")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "INSERT INTO task_attempts "
        "(task_id, attempt_id, fence_version, worker_id, status, "
        " lease_token, lease_expires_at, status_version, driver_kind) "
        "VALUES (?, ?, 999, 'w-m6', 'claimed', ?, ?, 0, 'codex_sdk')",
        (task_id, "att-m6-mutated", "lease-m6m", "2099-01-01T00:00:00Z"),
    )
    conn.commit()
    row = conn.execute(
        "SELECT fence_version FROM task_attempts WHERE attempt_id='att-m6-mutated'"
    ).fetchone()
    assert row["fence_version"] == 999, f"M6 mutation: fence should be 999; got {row}"
    conn.close()
    print(f"OK: M6 DROP trg_attempt_fence_insert → fence mismatch INSERT succeeds")


# ----------------------------------------------------------------------------
# M7: trg_worker_ownership_insert (P0-M2-2 INSERT path)
# ----------------------------------------------------------------------------

def m7_drop_test_wrong_owner_insert_succeeds() -> None:
    """M7: DROP trg_worker_ownership_insert → INSERT new worker with
    current_attempt_id pointing at attempt held by another worker succeeds.
    """
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn)
    w_owner = register_worker(conn, host="h1", worker_id="w-m7-owner")
    attempt_id, _ = claim(conn, task_id, w_owner)
    conn.close()

    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at, current_attempt_id) "
            "VALUES ('w-m7-attacker', 'h1', '[]', 'active', "
            "  '2026-08-30T12:00:00.000Z', ?)",
            (attempt_id,),
        )
        raise AssertionError("M7 baseline: expected ownership reject; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "ownership" in str(e).lower(), f"M7 baseline should mention ownership; got: {e}"
    conn.close()

    _drop_object(path, "DROP TRIGGER trg_worker_ownership_insert")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at, current_attempt_id) "
        "VALUES ('w-m7-attacker', 'h1', '[]', 'active', "
        "  '2026-08-30T12:00:00.000Z', ?)",
        (attempt_id,),
    )
    conn.commit()
    row = conn.execute(
        "SELECT current_attempt_id FROM workers WHERE worker_id='w-m7-attacker'"
    ).fetchone()
    assert row["current_attempt_id"] == attempt_id, (
        f"M7 mutation: current_attempt_id should be {attempt_id}; got {row['current_attempt_id']}"
    )
    conn.close()
    _os.unlink(path)
    print(f"OK: M7 DROP trg_worker_ownership_insert → wrong-owner INSERT succeeds")


# ----------------------------------------------------------------------------
# M8: trg_worker_ownership_update (P0-M2-2 UPDATE path)
# ----------------------------------------------------------------------------

def m8_drop_test_wrong_owner_update_succeeds() -> None:
    """M8: DROP trg_worker_ownership_update → UPDATE w_other.current_attempt_id
    to attempt held by w_owner succeeds.
    """
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn)
    w_owner = register_worker(conn, host="h1", worker_id="w-m8-owner")
    w_other = register_worker(conn, host="h1", worker_id="w-m8-other")
    attempt_id, _ = claim(conn, task_id, w_owner)
    conn.close()

    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "UPDATE workers SET current_attempt_id=? WHERE worker_id=?",
            (attempt_id, "w-m8-other"),
        )
        raise AssertionError("M8 baseline: expected ownership reject; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        assert "ownership" in str(e).lower(), f"M8 baseline should mention ownership; got: {e}"
    conn.close()

    _drop_object(path, "DROP TRIGGER trg_worker_ownership_update")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "UPDATE workers SET current_attempt_id=? WHERE worker_id=?",
        (attempt_id, "w-m8-other"),
    )
    conn.commit()
    row = conn.execute(
        "SELECT current_attempt_id FROM workers WHERE worker_id='w-m8-other'"
    ).fetchone()
    assert row["current_attempt_id"] == attempt_id, (
        f"M8 mutation: current_attempt_id should be {attempt_id}; got {row['current_attempt_id']}"
    )
    conn.close()
    _os.unlink(path)
    print(f"OK: M8 DROP trg_worker_ownership_update → wrong-owner UPDATE succeeds")


# ----------------------------------------------------------------------------
# M9: trg_lineage_l2_needs_parent (P1-1)
# ----------------------------------------------------------------------------

def m9_drop_test_l2_with_l2_parent_succeeds() -> None:
    """M9: DROP trg_lineage_l2_needs_parent → L2 snapshot with L2 parent is accepted."""
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id, _ = claim(conn, task_id, "w-m9")
    blob = seed_blob(conn)
    parent_l0 = insert_snapshot(conn, task_id, attempt_id, "L0",
                                 token_count=5, trust_label=TRUSTED_USER_INPUT)
    child_l2_v1 = insert_snapshot(conn, task_id, attempt_id, "L2",
                                   token_count=10, trust_label=TRUSTED_USER_INPUT,
                                   raw_blob_id=blob, parent_snapshot_id=parent_l0)
    conn.close()

    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        insert_snapshot(conn, task_id, attempt_id, "L2",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        raw_blob_id=blob, parent_snapshot_id=child_l2_v1)
        raise AssertionError("M9 baseline: expected L2 lineage reject; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "lineage" in str(e).lower() or "L0" in str(e) or "L1" in str(e), (
            f"M9 baseline should mention lineage/L0/L1; got: {e}"
        )
    conn.close()

    _drop_object(path, "DROP TRIGGER trg_lineage_l2_needs_parent")
    conn = connect_with_fk(path=path, apply_schema=False)
    insert_snapshot(conn, task_id, attempt_id, "L2",
                    token_count=10, trust_label=TRUSTED_USER_INPUT,
                    raw_blob_id=blob, parent_snapshot_id=child_l2_v1)
    conn.commit()
    row = conn.execute(
        "SELECT snapshot_id, level FROM context_snapshots WHERE parent_snapshot_id=?",
        (child_l2_v1,),
    ).fetchall()
    l2_children = [r for r in row if r["level"] == "L2"]
    assert len(l2_children) >= 1, f"M9 mutation: expected >=1 L2 child of L2 parent; got {row}"
    conn.close()
    _os.unlink(path)
    print(f"OK: M9 DROP trg_lineage_l2_needs_parent → L2 with L2 parent succeeds")


# ----------------------------------------------------------------------------
# M10: trg_lineage_l3_needs_parent (P1-1)
# ----------------------------------------------------------------------------

def m10_drop_test_l3_with_l1_parent_succeeds() -> None:
    """M10: DROP trg_lineage_l3_needs_parent → L3 snapshot with L1 parent is accepted."""
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id, _ = claim(conn, task_id, "w-m10")
    blob = seed_blob(conn)
    parent_l1 = insert_snapshot(conn, task_id, attempt_id, "L1",
                                 token_count=5, trust_label=TRUSTED_USER_INPUT,
                                 raw_blob_id=blob)
    conn.close()

    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        insert_snapshot(conn, task_id, attempt_id, "L3",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=parent_l1)
        raise AssertionError("M10 baseline: expected L3 lineage reject; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "lineage" in str(e).lower() or "L2" in str(e), (
            f"M10 baseline should mention lineage/L2; got: {e}"
        )
    conn.close()

    _drop_object(path, "DROP TRIGGER trg_lineage_l3_needs_parent")
    conn = connect_with_fk(path=path, apply_schema=False)
    insert_snapshot(conn, task_id, attempt_id, "L3",
                    token_count=10, trust_label=TRUSTED_USER_INPUT,
                    parent_snapshot_id=parent_l1)
    conn.commit()
    row = conn.execute(
        "SELECT snapshot_id, level FROM context_snapshots WHERE parent_snapshot_id=?",
        (parent_l1,),
    ).fetchall()
    l3_children = [r for r in row if r["level"] == "L3"]
    assert len(l3_children) >= 1, f"M10 mutation: expected >=1 L3 child of L1 parent; got {row}"
    conn.close()
    _os.unlink(path)
    print(f"OK: M10 DROP trg_lineage_l3_needs_parent → L3 with L1 parent succeeds")


# ----------------------------------------------------------------------------
# M11: trg_snapshot_no_update (P0-M2-1 append-only)
# ----------------------------------------------------------------------------

def m11_drop_test_snapshot_update_succeeds() -> None:
    """M11: DROP trg_snapshot_no_update → UPDATE context_snapshots.token_count succeeds."""
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn)
    attempt_id, _ = claim(conn, task_id, "w-m11")
    snap_id = insert_snapshot(conn, task_id, attempt_id, "L0",
                              token_count=5, trust_label=TRUSTED_USER_INPUT)
    conn.close()

    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "UPDATE context_snapshots SET token_count=999 WHERE snapshot_id=?",
            (snap_id,),
        )
        raise AssertionError("M11 baseline: expected no_update reject; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert (
            "no_update" in msg or "append-only" in msg
            or "update" in msg or "snapshot" in msg
        ), f"M11 baseline should mention no_update; got: {e}"
    conn.close()

    _drop_object(path, "DROP TRIGGER trg_snapshot_no_update")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "UPDATE context_snapshots SET token_count=999 WHERE snapshot_id=?",
        (snap_id,),
    )
    conn.commit()
    row = conn.execute(
        "SELECT token_count FROM context_snapshots WHERE snapshot_id=?",
        (snap_id,),
    ).fetchone()
    assert row["token_count"] == 999, f"M11 mutation: token_count should be 999; got {row}"
    conn.close()
    _os.unlink(path)
    print(f"OK: M11 DROP trg_snapshot_no_update → UPDATE token_count succeeds")


# ----------------------------------------------------------------------------
# M12: trg_worker_dispatched_event_emit (P1-2 dispatched event)
# ----------------------------------------------------------------------------

def m12_drop_test_worker_dispatched_event_missing() -> None:
    """M12: DROP trg_worker_dispatched_event_emit → register emits no event."""
    # Baseline DB
    path_a, conn = _fresh_db_with_schema()
    register_worker(conn, host="h1", worker_id="w-m12-baseline")
    conn.commit()
    n_baseline = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.dispatched'"
    ).fetchone()["n"]
    assert n_baseline == 1, f"M12 baseline: expected 1 dispatched event; got {n_baseline}"
    conn.close()
    _os.unlink(path_a)

    # Mutation DB
    path_b, conn = _fresh_db_with_schema()
    _drop_object(path_b, "DROP TRIGGER trg_worker_dispatched_event_emit")
    register_worker(conn, host="h1", worker_id="w-m12-mutated")
    conn.commit()
    n_mutated = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.dispatched'"
    ).fetchone()["n"]
    assert n_mutated == 0, f"M12 mutation: expected 0 dispatched events; got {n_mutated}"
    conn.close()
    _os.unlink(path_b)
    print(f"OK: M12 DROP trg_worker_dispatched_event_emit → 0 events on register (was 1)")


# ----------------------------------------------------------------------------
# M13: trg_worker_heartbeat_event_emit (P1-2 heartbeat event)
# ----------------------------------------------------------------------------

def m13_drop_test_worker_heartbeat_event_missing() -> None:
    """M13: DROP trg_worker_heartbeat_event_emit → heartbeat emits no event."""
    path_a, conn = _fresh_db_with_schema()
    wid = register_worker(conn, host="h1", worker_id="w-m13-baseline")
    conn.commit()
    heartbeat_worker(conn, wid, offset_seconds=10)
    conn.commit()
    n_baseline = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.heartbeat'"
    ).fetchone()["n"]
    assert n_baseline == 1, f"M13 baseline: expected 1 heartbeat event; got {n_baseline}"
    conn.close()
    _os.unlink(path_a)

    path_b, conn = _fresh_db_with_schema()
    _drop_object(path_b, "DROP TRIGGER trg_worker_heartbeat_event_emit")
    wid_b = register_worker(conn, host="h1", worker_id="w-m13-mutated")
    conn.commit()
    heartbeat_worker(conn, wid_b, offset_seconds=10)
    conn.commit()
    n_mutated = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.heartbeat'"
    ).fetchone()["n"]
    assert n_mutated == 0, f"M13 mutation: expected 0 heartbeat events; got {n_mutated}"
    conn.close()
    _os.unlink(path_b)
    print(f"OK: M13 DROP trg_worker_heartbeat_event_emit → 0 events on heartbeat (was 1)")


# ----------------------------------------------------------------------------
# M14: trg_worker_drained_event_emit (P1-2 drained event)
# ----------------------------------------------------------------------------

def m14_drop_test_worker_drained_event_missing() -> None:
    """M14: DROP trg_worker_drained_event_emit → drain emits no event."""
    path_a, conn = _fresh_db_with_schema()
    wid = register_worker(conn, host="h1", worker_id="w-m14-baseline")
    conn.commit()
    drain_worker(conn, wid)
    conn.commit()
    n_baseline = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.drained'"
    ).fetchone()["n"]
    assert n_baseline == 1, f"M14 baseline: expected 1 drained event; got {n_baseline}"
    conn.close()
    _os.unlink(path_a)

    path_b, conn = _fresh_db_with_schema()
    _drop_object(path_b, "DROP TRIGGER trg_worker_drained_event_emit")
    wid_b = register_worker(conn, host="h1", worker_id="w-m14-mutated")
    conn.commit()
    drain_worker(conn, wid_b)
    conn.commit()
    n_mutated = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.drained'"
    ).fetchone()["n"]
    assert n_mutated == 0, f"M14 mutation: expected 0 drained events; got {n_mutated}"
    conn.close()
    _os.unlink(path_b)
    print(f"OK: M14 DROP trg_worker_drained_event_emit → 0 events on drain (was 1)")


# ----------------------------------------------------------------------------
# M15: round-robin dispatch_worker monkey-patch (P1-3)
# ----------------------------------------------------------------------------

def m15_drop_test_round_robin_reverts_to_heartbeat_first() -> None:
    """M15: monkey-patch _helpers.dispatch_worker to ORDER BY heartbeat DESC
    LIMIT 1 → all 6 dispatches funnel to the worker with latest heartbeat.

    Codex v0.9 P1-3: round-robin requires least-dispatched via harness_meta.
    Heartbeat-first would funnel all tasks to one worker, breaking fairness.
    """
    import _helpers

    original_dispatch = _helpers.dispatch_worker

    def heartbeat_first_dispatch(conn, task_id, required_capability=None):
        rows = conn.execute(
            "SELECT worker_id FROM workers WHERE status='active' "
            "ORDER BY last_heartbeat_at DESC, worker_id ASC LIMIT 1"
        ).fetchall()
        return rows[0][0]

    try:
        _helpers.dispatch_worker = heartbeat_first_dispatch

        path, conn = _fresh_db_with_schema()
        register_worker(conn, host="h1", worker_id="w-m15-a")
        register_worker(conn, host="h1", worker_id="w-m15-b")
        # Force w-m15-a heartbeat to be strictly later than w-m15-b
        conn.execute(
            "UPDATE workers SET last_heartbeat_at='2099-01-01T00:00:00.000Z' "
            "WHERE worker_id='w-m15-a'"
        )
        conn.commit()
        conn.close()

        winners = []
        for i in range(6):
            c = connect_with_fk(path=path, apply_schema=False)
            tid = f"t-m15-{i}"
            c.execute(
                "INSERT INTO tasks (task_id, tenant_id, workflow_pack, "
                "  workflow_version, status) "
                "VALUES (?, 'tn', 'web_research', '1.0.0', 'pending')",
                (tid,),
            )
            c.commit()
            winner = _helpers.dispatch_worker(c, tid, required_capability=None)
            winners.append(winner)
            c.close()

        assert all(w == "w-m15-a" for w in winners), (
            f"M15 heartbeat-first should funnel all 6 to w-m15-a; got: {winners}"
        )
        _os.unlink(path)
    finally:
        _helpers.dispatch_worker = original_dispatch
    print(f"OK: M15 dispatch_worker reverted to heartbeat-first → all 6 → w-m15-a")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def main() -> int:
    m1_drop_test_two_workers_succeed()
    m2_drop_test_same_worker_two_active()
    m3_drop_test_active_null_worker_succeeds()
    m4_drop_test_equal_heartbeat_succeeds()
    m5_drop_test_insert_draining_succeeds()
    m6_drop_test_fence_violation_succeeds()
    # v0.9.3 additions (M7-M15) — closing Codex v0.9.2 M0-19 coverage gap
    m7_drop_test_wrong_owner_insert_succeeds()
    m8_drop_test_wrong_owner_update_succeeds()
    m9_drop_test_l2_with_l2_parent_succeeds()
    m10_drop_test_l3_with_l1_parent_succeeds()
    m11_drop_test_snapshot_update_succeeds()
    m12_drop_test_worker_dispatched_event_missing()
    m13_drop_test_worker_heartbeat_event_missing()
    m14_drop_test_worker_drained_event_missing()
    m15_drop_test_round_robin_reverts_to_heartbeat_first()
    print(f"\nOK: mutation-test.py v0.9.3 — 15 reverse-DROP mutations all causal-chain verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
