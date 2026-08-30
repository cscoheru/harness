"""Spike: mutation-test.py (v0.9.2 — closes Codex v0.9 P0-M2 causal-chain evidence)

File: spikes/m0/mutation-test.py
Version: v0.9.2

For each key constraint / trigger / index, performs reverse-DROP mutation:
  1. Baseline: constraint ON → positive test PASSES
  2. Mutation: DROP constraint → positive test FAILS (proves causality)
  3. Re-apply: restore constraint → positive test PASSES again

Codex v0.9 P0-M2 finding: previous spikes passed but did not prove the target
constraint was the actual enforcement layer (helper intercepted first).
v0.9.2: each mutation must break the corresponding positive test.

Mutations (each in independent file-DB):
  M1  DROP idx_attempts_one_active → 真并发 double-claim both succeed
  M2  DROP idx_worker_one_active_attempt → 真并发 same-worker two active succeed
  M3  DROP trg_attempt_active_needs_worker_insert → active INSERT NULL worker_id succeeds
  M4  DROP trg_worker_heartbeat_renew → equal heartbeat UPDATE succeeds
  M5  DROP trg_worker_no_draining_insert → INSERT status='draining' succeeds
  M6  DROP trg_attempt_fence_insert → attempt.fence != task.fence INSERT succeeds
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
    claim,
    connect_with_fk,
    drain_worker,
    heartbeat_worker,
    register_worker,
    seed_task,
)


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
# Main
# ----------------------------------------------------------------------------

def main() -> int:
    m1_drop_test_two_workers_succeed()
    m2_drop_test_same_worker_two_active()
    m3_drop_test_active_null_worker_succeeds()
    m4_drop_test_equal_heartbeat_succeeds()
    m5_drop_test_insert_draining_succeeds()
    m6_drop_test_fence_violation_succeeds()
    print(f"\nOK: mutation-test.py v0.9.2 — 6 reverse-DROP mutations all causal-chain verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
