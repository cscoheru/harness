"""harness.testing.mutation_suite — v1.0 reverse-DROP mutation causal-chain evidence.

Lift of ``spikes/m0/mutation-test.py`` v0.9.4 → production CLI. v0.9.4 has
17/17 reverse-DROP mutations (M12 superseded by M17 trigger rename); each
proves that the schema constraint / trigger is the **actual** enforcement
layer (Codex v0.9 P0-M2 finding: helper-intercepted tests passed without
proving the constraint fired).

CLI:
    python -m harness.testing.mutation_suite
    # exit 0 iff every mutation's baseline PASS + DROP FAIL (causal) + optional restore PASS

Public API (per GA plan §2 T-QA-1 / §3 Mutation 契约):
    run_mutations() -> dict[str, bool]   # programmatic entry
    MUTATIONS: dict[str, Callable]        # mutation_id → drop_test function

Mutations covered (v0.9.4):
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
  M13  DROP trg_worker_heartbeat_event_emit → no task_events row on heartbeat (P1-2)
  M14  DROP trg_worker_drained_event_emit → no task_events row on drain (P1-2)
  M15  monkey-patch harness.runtime.workers.dispatch_worker → heartbeat-first → 6 dispatches funnel to 1 worker (P1-3)
  M16  DROP trg_attempt_owner_consistent_update → UPDATE task_attempts.worker_id succeeds (P0-M2-2 v0.9.4)
  M17  DROP trg_worker_registered_event_emit → no task_events row on register (P1-2 v0.9.4 rename, supersedes M12)
  M18  DROP trg_attempt_dispatched_event_emit_insert → no task_events row of type 'worker.dispatched' on attempt claim (P1-2 v0.9.4)

Note: M12 (DROP trg_worker_dispatched_event_emit / check event_type='worker.dispatched')
was removed in v0.9.4 because the trigger was renamed to trg_worker_registered_event_emit
and now emits 'worker.registered'. M17 covers the renamed trigger with the correct event_type.

Path preference (per DISPATCH-T-QA-1 §A.3):
  - DB primitives (connect_with_fk, seed_task, claim)        ← harness.runtime._db
  - Worker primitives (register/heartbeat/drain/dispatch)   ← harness.runtime.workers
  - Context primitives (insert_snapshot, TRUSTED_USER_INPUT) ← harness.runtime.context
  - seed_blob                                               ← inlined (not yet lifted; trivial 1-stmt INSERT)
  - M15 monkey-patch                                        ← targets harness.runtime.workers.dispatch_worker
                                                            (production path; not spike _helpers)
  - spikes/m0/_helpers.py                                    ← unchanged on disk; not imported by this module
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import threading
import uuid

from harness.runtime._db import connect_with_fk, seed_task, claim, ClaimRejected
from harness.runtime.workers import (
    register_worker,
    heartbeat_worker,
    drain_worker,
    dispatch_worker,
)
from harness.runtime.context import insert_snapshot, TRUSTED_USER_INPUT

__all__ = ["run_mutations", "MUTATIONS"]


# ----------------------------------------------------------------------------
# DB lifecycle helpers
# ----------------------------------------------------------------------------

def _fresh_db_with_schema() -> tuple[str, sqlite3.Connection]:
    """Return (path, conn) of a fresh file-DB with schema applied. Caller closes."""
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
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


def _seed_blob(
    conn: sqlite3.Connection,
    trust_label: str = TRUSTED_USER_INPUT,
    byte_size: int = 42,
) -> str:
    """Insert a blobs row. Returns blob_id.

    Inlined from spikes/m0/_helpers.py seed_blob — that helper has not yet
    been lifted into harness.runtime (T-BE-1 only lifted DB/worker/context
    primitives). The blob is test scaffolding only; production callers go
    through harness.gateway.artifact_store.put() instead.
    """
    sha256 = uuid.uuid4().hex + uuid.uuid4().hex  # 64 hex chars
    blob_id = f"blob-{uuid.uuid4().hex[:12]}"
    conn.execute(
        "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
        "  content_type, trust_label) VALUES (?, ?, ?, ?, ?, ?)",
        (blob_id, byte_size, sha256,
         f"file:///tmp/{blob_id}",
         "application/octet-stream",
         trust_label),
    )
    conn.commit()
    return blob_id


# ----------------------------------------------------------------------------
# M1: idx_attempts_one_active
# ----------------------------------------------------------------------------

def m1_drop_test_two_workers_succeed() -> None:
    """M1: DROP idx_attempts_one_active → both INSERTs succeed (or claim bypasses)."""
    path, _ = _fresh_db_with_schema()
    m1_baseline_two_workers_one_task(path)

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
    assert len(successes) == 1, (
        f"M2 baseline: expected 1 success; got {len(successes)}: {results}"
    )

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


# ----------------------------------------------------------------------------
# M5: trg_worker_no_draining_insert
# ----------------------------------------------------------------------------

def m5_drop_test_insert_draining_succeeds() -> None:
    """M5: DROP I17 INSERT bypass trigger → INSERT status='draining' succeeds."""
    path, conn = _fresh_db_with_schema()
    conn.close()

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
    os.unlink(path)


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
    os.unlink(path)


# ----------------------------------------------------------------------------
# M9: trg_lineage_l2_needs_parent (P1-1)
# ----------------------------------------------------------------------------

def m9_drop_test_l2_with_l2_parent_succeeds() -> None:
    """M9: DROP trg_lineage_l2_needs_parent → L2 snapshot with L2 parent is accepted."""
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id, _ = claim(conn, task_id, "w-m9")
    blob = _seed_blob(conn)
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
    os.unlink(path)


# ----------------------------------------------------------------------------
# M10: trg_lineage_l3_needs_parent (P1-1)
# ----------------------------------------------------------------------------

def m10_drop_test_l3_with_l1_parent_succeeds() -> None:
    """M10: DROP trg_lineage_l3_needs_parent → L3 snapshot with L1 parent is accepted."""
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn, context_budget_tokens=1000)
    attempt_id, _ = claim(conn, task_id, "w-m10")
    blob = _seed_blob(conn)
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
    os.unlink(path)


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
    os.unlink(path)


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
    os.unlink(path_a)

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
    os.unlink(path_b)


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
    os.unlink(path_a)

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
    os.unlink(path_b)


# ----------------------------------------------------------------------------
# M15: round-robin dispatch_worker monkey-patch (P1-3)
# ----------------------------------------------------------------------------

def m15_drop_test_round_robin_reverts_to_heartbeat_first() -> None:
    """M15: monkey-patch harness.runtime.workers.dispatch_worker to ORDER BY
    heartbeat DESC LIMIT 1 → all 6 dispatches funnel to the worker with the
    latest heartbeat.

    Codex v0.9 P1-3: round-robin requires least-dispatched via harness_meta.
    Heartbeat-first would funnel all tasks to one worker, breaking fairness.

    Lift note (vs spike): the spike monkey-patches
    ``spikes/m0/_helpers.dispatch_worker``. Here we monkey-patch the
    **production** ``harness.runtime.workers.dispatch_worker`` so the test
    verifies the production dispatch path is the one that fails when reverted
    to heartbeat-first. The dispatch path used by ``run_mutations`` /
    production code now is the SAME function under test.
    """
    import harness.runtime.workers as _hr_workers

    original_dispatch = _hr_workers.dispatch_worker

    def heartbeat_first_dispatch(conn, task_id, required_capability=None):
        rows = conn.execute(
            "SELECT worker_id FROM workers WHERE status='active' "
            "ORDER BY last_heartbeat_at DESC, worker_id ASC LIMIT 1"
        ).fetchall()
        return rows[0][0]

    try:
        _hr_workers.dispatch_worker = heartbeat_first_dispatch

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
            # Call via the module attribute (not the local-from-import binding),
            # so the heartbeat_first monkey-patch takes effect.
            winner = _hr_workers.dispatch_worker(c, tid, required_capability=None)
            winners.append(winner)
            c.close()

        assert all(w == "w-m15-a" for w in winners), (
            f"M15 heartbeat-first should funnel all 6 to w-m15-a; got: {winners}"
        )
        os.unlink(path)
    finally:
        _hr_workers.dispatch_worker = original_dispatch


# ----------------------------------------------------------------------------
# M16 (v0.9.4): trg_attempt_owner_consistent_update — attempt-side ownership
# ----------------------------------------------------------------------------

def m16_drop_test_attempt_side_owner_update_succeeds() -> None:
    """M16: DROP trg_attempt_owner_consistent_update → UPDATE
    task_attempts.worker_id leaves a dangling pointer in workers.current_attempt_id
    of the OTHER worker (the new v0.9.4 attempt-side ownership constraint,
    bidirectional with M7/M8's worker-side).

    Setup note: claim() helper does not update workers.current_attempt_id (that
    is dispatch_worker()'s job). Manually set the pointer so the trigger sees
    the exact post-dispatch state it was designed to protect.
    """
    path, conn = _fresh_db_with_schema()
    task_id = seed_task(conn)
    w_owner = register_worker(conn, host="h1", worker_id="w-m16-owner")
    w_other = register_worker(conn, host="h1", worker_id="w-m16-other")
    attempt_id, _ = claim(conn, task_id, w_owner)
    conn.execute(
        "UPDATE workers SET current_attempt_id=? WHERE worker_id=?",
        (attempt_id, "w-m16-owner"),
    )
    conn.commit()
    conn.close()

    conn = connect_with_fk(path=path, apply_schema=False)
    try:
        conn.execute(
            "UPDATE task_attempts SET worker_id=? WHERE attempt_id=?",
            ("w-m16-other", attempt_id),
        )
        raise AssertionError(
            "M16 baseline: expected attempt-side ownership reject; UPDATE succeeded"
        )
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "ownership" in msg or "i15" in msg or "foreign key" in msg, (
            f"M16 baseline should mention ownership/I15/FK; got: {e}"
        )
    conn.close()

    _drop_object(path, "DROP TRIGGER trg_attempt_owner_consistent_update")
    conn = connect_with_fk(path=path, apply_schema=False)
    conn.execute(
        "UPDATE task_attempts SET worker_id=? WHERE attempt_id=?",
        ("w-m16-other", attempt_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT worker_id FROM task_attempts WHERE attempt_id=?", (attempt_id,)
    ).fetchone()
    assert row["worker_id"] == "w-m16-other", (
        f"M16 mutation: worker_id should be w-m16-other; got {row['worker_id']}"
    )
    conn.close()
    os.unlink(path)


# ----------------------------------------------------------------------------
# M17 (v0.9.4): trg_worker_registered_event_emit — renamed from dispatched
# ----------------------------------------------------------------------------

def m17_drop_test_worker_registered_event_missing() -> None:
    """M17: DROP trg_worker_registered_event_emit → register emits no event.
    v0.9.4 rename: trg_worker_dispatched_event_emit → trg_worker_registered_event_emit
    with event_type 'worker.registered' (was 'worker.dispatched' in v0.9.3,
    conflated). Verifies the renamed trigger is the actual emission source.
    """
    path_a, conn = _fresh_db_with_schema()
    register_worker(conn, host="h1", worker_id="w-m17-baseline")
    conn.commit()
    n_baseline = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.registered'"
    ).fetchone()["n"]
    assert n_baseline == 1, f"M17 baseline: expected 1 registered event; got {n_baseline}"
    conn.close()
    os.unlink(path_a)

    path_b, conn = _fresh_db_with_schema()
    _drop_object(path_b, "DROP TRIGGER trg_worker_registered_event_emit")
    register_worker(conn, host="h1", worker_id="w-m17-mutated")
    conn.commit()
    n_mutated = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.registered'"
    ).fetchone()["n"]
    assert n_mutated == 0, f"M17 mutation: expected 0 registered events; got {n_mutated}"
    conn.close()
    os.unlink(path_b)


# ----------------------------------------------------------------------------
# M18 (v0.9.4): trg_attempt_dispatched_event_emit_insert — real dispatch event
# ----------------------------------------------------------------------------

def m18_drop_test_attempt_dispatched_event_missing() -> None:
    """M18: DROP trg_attempt_dispatched_event_emit_insert → no worker.dispatched
    event on task_attempts INSERT. v0.9.4 split: registration emits worker.registered
    (M17), but the actual task→worker assignment emits worker.dispatched with
    task_id + worker_id + attempt_id + strategy (P1-2 close)."""
    path_a, conn = _fresh_db_with_schema()
    task_id = seed_task(conn)
    register_worker(conn, host="h1", worker_id="w-m18")
    claim(conn, task_id, "w-m18")
    conn.commit()
    n_baseline = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.dispatched'"
    ).fetchone()["n"]
    assert n_baseline == 1, f"M18 baseline: expected 1 dispatched event; got {n_baseline}"
    conn.close()
    os.unlink(path_a)

    path_b, conn = _fresh_db_with_schema()
    _drop_object(path_b, "DROP TRIGGER trg_attempt_dispatched_event_emit_insert")
    task_id_b = seed_task(conn)
    register_worker(conn, host="h1", worker_id="w-m18b")
    claim(conn, task_id_b, "w-m18b")
    conn.commit()
    n_mutated = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE event_type='worker.dispatched'"
    ).fetchone()["n"]
    assert n_mutated == 0, f"M18 mutation: expected 0 dispatched events; got {n_mutated}"
    conn.close()
    os.unlink(path_b)


# ----------------------------------------------------------------------------
# Mutation registry + runner
# ----------------------------------------------------------------------------

# v0.9.4: M12 removed (trigger rename); supersede by M17 (worker.registered).
# Order is the canonical execution order (matches spikes/m0/mutation-test.py main()).
MUTATIONS: dict[str, "callable"] = {
    "M1":  m1_drop_test_two_workers_succeed,
    "M2":  m2_drop_test_same_worker_two_active,
    "M3":  m3_drop_test_active_null_worker_succeeds,
    "M4":  m4_drop_test_equal_heartbeat_succeeds,
    "M5":  m5_drop_test_insert_draining_succeeds,
    "M6":  m6_drop_test_fence_violation_succeeds,
    "M7":  m7_drop_test_wrong_owner_insert_succeeds,
    "M8":  m8_drop_test_wrong_owner_update_succeeds,
    "M9":  m9_drop_test_l2_with_l2_parent_succeeds,
    "M10": m10_drop_test_l3_with_l1_parent_succeeds,
    "M11": m11_drop_test_snapshot_update_succeeds,
    # M12 skipped (superseded by M17)
    "M13": m13_drop_test_worker_heartbeat_event_missing,
    "M14": m14_drop_test_worker_drained_event_missing,
    "M15": m15_drop_test_round_robin_reverts_to_heartbeat_first,
    "M16": m16_drop_test_attempt_side_owner_update_succeeds,
    "M17": m17_drop_test_worker_registered_event_missing,
    "M18": m18_drop_test_attempt_dispatched_event_missing,
}


def run_mutations() -> dict[str, bool]:
    """Run all MUTATIONS in independent file-DBs. Return {mutation_id: pass_bool}.

    Per-mutation contract (DISPATCH-T-QA-1 §A.1):
      - baseline ON  → positive test PASSES (constraint fires)
      - DROP         → positive test FAILS (causal chain proven)
      - optional restore: not asserted per-mutation; the fresh file-DB
        isolation in each helper means state is discarded between mutations.

    A mutation passes iff both phases are observed (no exception → both phases
    fired as expected). A mutation fails iff the baseline assertionError was
    not raised (constraint not enforced) or the DROP assertionError was not
    raised (causal chain broken).
    """
    results: dict[str, bool] = {}
    for mid, fn in MUTATIONS.items():
        try:
            fn()
            results[mid] = True
            print(f"OK: {mid} PASS")
        except AssertionError as e:
            results[mid] = False
            print(f"FAIL: {mid}: {e}")
        except Exception as e:
            results[mid] = False
            print(f"FAIL: {mid}: unexpected {type(e).__name__}: {e}")
    return results


def main() -> int:
    """CLI entry: run all mutations, print summary, exit 0 iff all PASS."""
    results = run_mutations()
    n_pass = sum(1 for v in results.values() if v)
    n_total = len(results)
    n_fail = n_total - n_pass
    print(
        f"\nmutation_suite v0.9.4 — {n_pass}/{n_total} PASS, {n_fail} FAIL "
        f"(M12 removed in v0.9.4; M17 supersedes)"
    )
    if n_fail > 0:
        print("FAILED mutations:")
        for mid, ok in results.items():
            if not ok:
                print(f"  - {mid}")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())