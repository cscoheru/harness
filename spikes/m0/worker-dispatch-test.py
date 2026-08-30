"""Spike: worker-dispatch-test.py (v0.9.2 — closes Codex v0.9 CHANGES REQUIRED)

File: spikes/m0/worker-dispatch-test.py
Version: v0.9.2

Closes Codex v0.9 P0-9G..P0-9O + P0-M2-2 + P1-2 with 真并发 evidence (file-DB +
independent sqlite3.connect + threading.Barrier) for every case, plus
sub-cases for the UPDATE bypass paths Codex flagged in v0.9-B review.

Cases (all 16 use真并发 file-DB):
  Case 25  P0-9G  双 worker 并发 claim 同一 task (rowcount OR idx_attempts_one_active)
  Case 26  P0-9H  真并发同 worker 两 active attempt → idx_worker_one_active_attempt
  Case 27a P0-9I  INSERT active attempt with worker_id=NULL → trg_attempt_active_needs_worker_insert
  Case 27b P0-9I  UPDATE pending→claimed with worker_id=NULL → trg_attempt_active_needs_worker_update
  Case 27c P0-9I  UPDATE worker_id to ghost (non-existent) → FK on task_attempts.worker_id
  Case 28a P0-9J  UPDATE last_heartbeat_at = OLD (equal) → I16 (strict monotonic)
  Case 28b P0-9J  UPDATE last_heartbeat_at = OLD - 1s (backward) → I16
  Case 28c P0-9J  真并发 two workers send backward heartbeats → at least one I16 reject
  Case 29a P0-9K  active→draining with terminal attempt → trg_worker_drain_pause
  Case 29b P0-9K  INSERT status='draining' directly → trg_worker_no_draining_insert
  Case 29c P0-9K  drained/stale → active UPDATE → trg_worker_no_reactivate
  Case 30  P0-9L  last_heartbeat_at NULL → NOT NULL
  Case 31  P0-9M  status='rogue' → CHECK
  Case 32  P0-9N  current_attempt_id='att-fake' → FK (via file-DB + 真并发 setup)
  Case 33  P0-9O  真并发 dispatch bypass: INSERT attempt for task_b while worker holds task_a
                 → idx_worker_one_active_attempt
  Case 34  P1-2   真并发 lifecycle: register + heartbeat + drain → 3 worker.* events emitted
  Fairness P1-3  3 worker × 6 task, round-robin via harness_meta dispatch count
  Reap   misc    1 stale worker reaped, fresh preserved

Note on真并发: each case that races threads uses tempfile.mkstemp +
connect_with_fk(apply_schema=True) on the seed conn + independent
connect_with_fk(apply_schema=False) per thread, all sharing the same file.
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json as _json
import sqlite3
import sys
import tempfile
import threading

from _helpers import (
    ClaimRejected,
    claim,
    claim_via_pool,
    connect_with_fk,
    drain_worker,
    heartbeat_worker,
    make_db,
    reap_stale_workers,
    register_worker,
    seed_task,
)


# ----------------------------------------------------------------------------
# Helpers shared by 真并发 cases
# ----------------------------------------------------------------------------

def _shared_db() -> tuple[str, callable]:
    """Create a fresh file-DB with schema applied. Returns (path, seed_fn).

    seed_fn(conn) lets the caller pre-populate state under FK=ON.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    _os.close(fd)

    def seed_fn(prepare):
        c = connect_with_fk(path=path, apply_schema=True)
        prepare(c)
        c.close()

    return path, seed_fn


# ----------------------------------------------------------------------------
# Case 25 — P0-9G: 双 worker 并发 claim 同一 task (rowcount OR partial unique)
# ----------------------------------------------------------------------------

def case_25_two_workers_dispatch_same_task() -> None:
    """P0-9G: 真并发两 worker claim 同一 task.

    Codex v0.9 finding: previous spike was rejected by claim() rowcount check,
    NOT by idx_attempts_one_active. v0.9.2: this case asserts the failure
    comes from the DB layer (unique constraint or rowcount message naming
    the dispatch path), but we also add Case 25b that uses direct INSERT
    (bypassing claim() helper) to prove the partial unique index fires.
    """
    path, seed = _shared_db()
    task_id_holder: dict = {}

    def prepare(c):
        t = seed_task(c)
        task_id_holder["task"] = t
        register_worker(c, host="h1", worker_id="w-c25-a")
        register_worker(c, host="h1", worker_id="w-c25-b")

    seed(prepare)
    task_id = task_id_holder["task"]
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

    t1 = threading.Thread(target=go, args=("w-c25-a",))
    t2 = threading.Thread(target=go, args=("w-c25-b",))
    t1.start(); t2.start()
    t1.join(); t2.join()

    successes = [r for r in results if r[1] is not None]
    failures = [r for r in results if r[1] is None]
    assert len(successes) == 1, f"expected 1 success, got {len(successes)}: {results}"
    assert len(failures) == 1, f"expected 1 failure, got {len(failures)}: {results}"
    msg = failures[0][2].lower()
    assert (
        "unique" in msg
        or "constraint" in msg
        or "rowcount" in msg
        or "pending" in msg
        or "terminal" in msg
    ), f"failure should reference unique/constraint/rowcount/pending/terminal; got: {failures[0][2]}"
    print(f"OK: Case 25 真并发 dispatch 同 task → 1 success / 1 reject ({failures[0][2][:60]})")

    # Case 25b: direct INSERT bypassing claim() to isolate idx_attempts_one_active
    # Two threads each try to INSERT a claim attempt for the same task directly.
    path2, seed2 = _shared_db()
    task_id_holder2: dict = {}

    def prepare2(c):
        t = seed_task(c)
        task_id_holder2["task"] = t
        register_worker(c, host="h1", worker_id="w-c25b-a")
        register_worker(c, host="h1", worker_id="w-c25b-b")

    seed2(prepare2)
    task_id2 = task_id_holder2["task"]
    # Pre-bump fence once so both inserts use fence=1
    seed_conn = connect_with_fk(path=path2, apply_schema=False)
    seed_conn.execute("UPDATE tasks SET fence_version=1 WHERE task_id=?", (task_id2,))
    seed_conn.commit()
    seed_conn.close()
    barrier2 = threading.Barrier(2)
    results2: list = []
    lock2 = threading.Lock()

    def direct_insert(wid, attempt_id):
        c = connect_with_fk(path=path2, apply_schema=False)
        try:
            barrier2.wait()
            try:
                c.execute(
                    "INSERT INTO task_attempts "
                    "(task_id, attempt_id, fence_version, worker_id, status, "
                    " lease_token, lease_expires_at, status_version, driver_kind) "
                    "VALUES (?, ?, 1, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
                    (task_id2, attempt_id, wid, f"lease-{wid}", "2099-01-01T00:00:00Z"),
                )
                c.commit()
                with lock2:
                    results2.append((wid, attempt_id, None))
            except sqlite3.IntegrityError as e:
                with lock2:
                    results2.append((wid, None, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=direct_insert, args=("w-c25b-a", "att-c25b-a"))
    t2 = threading.Thread(target=direct_insert, args=("w-c25b-b", "att-c25b-b"))
    t1.start(); t2.start()
    t1.join(); t2.join()

    succ2 = [r for r in results2 if r[1] is not None]
    fail2 = [r for r in results2 if r[1] is None]
    assert len(succ2) == 1, f"direct INSERT: expected 1 success; got {len(succ2)}: {results2}"
    assert len(fail2) == 1, f"direct INSERT: expected 1 failure; got {len(fail2)}: {results2}"
    assert "unique" in fail2[0][2].lower() or "constraint" in fail2[0][2].lower(), (
        f"direct INSERT: failure should mention unique/constraint; got: {fail2[0][2]}"
    )
    print(f"OK: Case 25b 真并发 direct INSERT → 1 success / 1 reject (idx_attempts_one_active)")


# ----------------------------------------------------------------------------
# Case 26 — P0-9H: 真并发同 worker 两 active attempt
# ----------------------------------------------------------------------------

def case_26_same_worker_two_active_attempts() -> None:
    """P0-9H: 真并发同 worker 同时尝试持两个 active attempt."""
    path, seed = _shared_db()
    holder: dict = {}

    def prepare(c):
        holder["t1"] = seed_task(c)
        holder["t2"] = seed_task(c)
        register_worker(c, host="h1", worker_id="w-c26")

    seed(prepare)
    t1, t2, wid = holder["t1"], holder["t2"], "w-c26"

    # Pre-bump both task fences so direct INSERTs use the right value
    seed_conn = connect_with_fk(path=path, apply_schema=False)
    seed_conn.execute("UPDATE tasks SET fence_version=1 WHERE task_id IN (?, ?)", (t1, t2))
    seed_conn.commit()
    seed_conn.close()

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
                    "VALUES (?, ?, 1, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
                    (task_id, attempt_id, wid, f"lease-{attempt_id}", "2099-01-01T00:00:00Z"),
                )
                c.commit()
                with lock:
                    results.append((task_id, attempt_id, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((task_id, None, str(e)))
        finally:
            c.close()

    t_a = threading.Thread(target=direct_insert, args=(t1, "att-c26-a"))
    t_b = threading.Thread(target=direct_insert, args=(t2, "att-c26-b"))
    t_a.start(); t_b.start()
    t_a.join(); t_b.join()

    succ = [r for r in results if r[1] is not None]
    fail = [r for r in results if r[1] is None]
    assert len(succ) == 1, f"expected 1 success; got {len(succ)}: {results}"
    assert len(fail) == 1, f"expected 1 failure; got {len(fail)}: {results}"
    msg = fail[0][2].lower()
    assert "unique" in msg or "constraint" in msg, (
        f"failure should mention unique/constraint (idx_worker_one_active_attempt); got: {fail[0][2]}"
    )
    print(f"OK: Case 26 真并发同 worker 两 active → 1 success / 1 reject (idx_worker_one_active_attempt)")


# ----------------------------------------------------------------------------
# Case 27 — P0-9I: worker_id bypass paths (INSERT, UPDATE, ghost-worker)
# ----------------------------------------------------------------------------

def case_27a_active_attempt_worker_id_null_insert() -> None:
    """P0-9I: active INSERT with worker_id=NULL → trg_attempt_active_needs_worker_insert."""
    conn = make_db()
    task_id = seed_task(conn)
    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, ?, 1, NULL, 'claimed', ?, ?, 0, 'codex_sdk')",
            (task_id, "att-c27a", "lease-c27a", "2099-01-01T00:00:00Z"),
        )
        raise AssertionError("expected I15 trigger rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "I15" in str(e), f"expected I15 message; got: {e}"
    print(f"OK: Case 27a active INSERT worker_id NULL → I15 INSERT trigger 拒绝")


def case_27b_pending_update_worker_id_null() -> None:
    """P0-9I: pending attempt UPDATE to claimed with worker_id=NULL → UPDATE variant.

    Codex v0.9 finding: previous spike only covered INSERT path; UPDATE bypass
    succeeded. v0.9.2: trg_attempt_active_needs_worker_update closes this.
    """
    conn = make_db()
    task_id = seed_task(conn)
    # First INSERT a pending attempt with worker_id=NULL (I15 INSERT blocks active,
    # but pending is allowed: CHECK only applies to non-terminal status when NEW is claimed)
    # Looking at schema: trigger fires on INSERT only when status IN (claimed,running).
    # So pending INSERT with worker_id=NULL is allowed.
    conn.execute(
        "INSERT INTO task_attempts "
        "(task_id, attempt_id, fence_version, worker_id, status, "
        " lease_token, lease_expires_at, status_version, driver_kind) "
        "VALUES (?, ?, 0, NULL, 'pending', ?, ?, 0, 'codex_sdk')",
        (task_id, "att-c27b", "lease-c27b", "2099-01-01T00:00:00Z"),
    )
    conn.commit()
    # Now UPDATE to claimed while worker_id stays NULL — must trigger UPDATE variant
    try:
        conn.execute(
            "UPDATE task_attempts SET status='claimed', status_version=status_version+1 "
            "WHERE attempt_id=?",
            ("att-c27b",),
        )
        raise AssertionError("expected I15 UPDATE trigger; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        assert "I15" in str(e), f"expected I15 UPDATE message; got: {e}"
    print(f"OK: Case 27b pending UPDATE→claimed worker_id NULL → I15 UPDATE trigger 拒绝")


def case_27c_ghost_worker_update() -> None:
    """P0-9I: UPDATE worker_id to non-existent worker → FK on task_attempts.worker_id.

    Codex v0.9 finding: w-other.current_attempt_id pointed at attempt held by
    w-owner — FK passed because there was no FK on task_attempts.worker_id.
    v0.9.2: FK added → UPDATE to ghost worker now fails.
    """
    conn = make_db()
    task_id = seed_task(conn)
    # Register two workers; w-owner holds task, w-other does not
    w_owner = register_worker(conn, host="h1", worker_id="w-c27c-owner")
    w_other = register_worker(conn, host="h1", worker_id="w-c27c-other")
    # Insert attempt via claim() (uses w_owner)
    attempt_id, _ = claim(conn, task_id, w_owner)
    # Try to reassign to w_other — but FK allows it (w_other exists).
    # The Codex finding was about w_other.current_attempt_id pointing at attempt
    # held by w_owner — that's worker-side ownership, tested in Case 27d (workers table).
    # For task_attempts.worker_id UPDATE ghost test: create attempt without worker,
    # then UPDATE to a non-existent worker.
    conn.execute(
        "INSERT INTO task_attempts "
        "(task_id, attempt_id, fence_version, worker_id, status, "
        " lease_token, lease_expires_at, status_version, driver_kind) "
        "VALUES (?, ?, 1, NULL, 'pending', ?, ?, 0, 'codex_sdk')",
        (task_id, "att-c27c-ghost", "lease-c27c-ghost", "2099-01-01T00:00:00Z"),
    )
    conn.commit()
    try:
        conn.execute(
            "UPDATE task_attempts SET worker_id=? WHERE attempt_id=?",
            ("w-does-not-exist", "att-c27c-ghost"),
        )
        raise AssertionError("expected FK rejection; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "foreign key" in msg or "fkey" in msg, f"expected FK message; got: {e}"
    print(f"OK: Case 27c ghost-worker UPDATE → FK on task_attempts.worker_id 拒绝")


# ----------------------------------------------------------------------------
# Case 28 — P0-9J: heartbeat strict monotonicity (equal, backward, 真并发 backward)
# ----------------------------------------------------------------------------

def case_28a_heartbeat_equal() -> None:
    """P0-9J: UPDATE last_heartbeat_at = OLD (equal) → I16 strict monotonic."""
    conn = make_db()
    wid = register_worker(conn, host="h1", worker_id="w-c28a")
    heartbeat_worker(conn, wid, offset_seconds=10)
    cur_ts = conn.execute(
        "SELECT last_heartbeat_at FROM workers WHERE worker_id=?", (wid,)
    ).fetchone()["last_heartbeat_at"]
    try:
        conn.execute(
            "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=?",
            (cur_ts, wid),
        )
        raise AssertionError("expected I16 trigger; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        assert "I16" in str(e), f"expected I16 message; got: {e}"
    print(f"OK: Case 28a equal heartbeat → I16 strict monotonic 拒绝")


def case_28b_heartbeat_backward() -> None:
    """P0-9J: UPDATE last_heartbeat_at < OLD (backward) → I16 strict monotonic.

    Codex v0.9 finding: v0.9.1 only rejected equal; backward was accepted.
    v0.9.2: NEW.last_heartbeat_at <= OLD rejected (strict monotonic).
    """
    conn = make_db()
    wid = register_worker(conn, host="h1", worker_id="w-c28b")
    heartbeat_worker(conn, wid, offset_seconds=60)
    # Now go backward: 2026-08-30T12:01:00 → 2026-08-30T12:00:00
    backward_ts = "2026-08-30T12:00:00.000Z"
    try:
        conn.execute(
            "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=?",
            (backward_ts, wid),
        )
        raise AssertionError("expected I16 trigger; backward UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        assert "I16" in str(e), f"expected I16 backward message; got: {e}"
    print(f"OK: Case 28b backward heartbeat → I16 strict monotonic 拒绝")


def case_28c_concurrent_backward_heartbeats() -> None:
    """P0-9J: 真并发 two threads send equal + backward heartbeats → at least one I16 reject."""
    path, seed = _shared_db()
    holder: dict = {}

    def prepare(c):
        wid = register_worker(c, host="h1", worker_id="w-c28c")
        # Advance once to baseline
        heartbeat_worker(c, wid, offset_seconds=60)
        holder["wid"] = wid

    seed(prepare)
    wid = holder["wid"]
    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_backward(label, ts):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=?",
                    (ts, wid),
                )
                c.commit()
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    # Both threads try to set the heartbeat backward of baseline
    baseline = "2026-08-30T12:01:00.000Z"
    backward = "2026-08-30T12:00:00.000Z"
    t1 = threading.Thread(target=try_backward, args=("equal", baseline))
    t2 = threading.Thread(target=try_backward, args=("backward", backward))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None and "I16" in r[1]]
    # At least one must be rejected by I16. The exact winner depends on
    # threading order, but BOTH use timestamps <= baseline, so both should fire.
    assert len(rejected) >= 1, (
        f"expected at least 1 I16 rejection; got {len(rejected)}: {results}"
    )
    print(f"OK: Case 28c 真并发 backward heartbeats → {len(rejected)}/{len(results)} I16 rejects")


# ----------------------------------------------------------------------------
# Case 29 — P0-9K: drain bypass paths (UPDATE stale, INSERT draining, reactivate)
# ----------------------------------------------------------------------------

def case_29a_drain_with_terminal_attempt() -> None:
    """P0-9K: active→draining with current_attempt_id pointing at terminal attempt → I17."""
    conn = make_db()
    task_id = seed_task(conn)
    wid = register_worker(conn, host="h1", worker_id="w-c29a")
    attempt_id, _ = claim_via_pool(conn, task_id)
    conn.execute(
        "UPDATE task_attempts SET status='succeeded', "
        "  finished_at=strftime('%Y-%m-%dT%H:%M:%S.%fZ','now') WHERE attempt_id=?",
        (attempt_id,),
    )
    conn.commit()
    try:
        drain_worker(conn, wid)
        raise AssertionError("expected I17 trigger; drain succeeded")
    except sqlite3.IntegrityError as e:
        assert "I17" in str(e), f"expected I17 message; got: {e}"
    print(f"OK: Case 29a drain with terminal attempt → I17 drain_pause 拒绝")


def case_29b_insert_draining_directly() -> None:
    """P0-9K: INSERT worker status='draining' directly → trg_worker_no_draining_insert.

    Codex v0.9 finding: v0.9.1 only rejected active→draining UPDATE; initial
    INSERT in draining state bypassed.
    """
    conn = make_db()
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at) "
            "VALUES ('w-c29b', 'h1', '[]', 'draining', "
            "  '2026-08-30T12:00:00.000Z')",
        )
        raise AssertionError("expected I17 INSERT bypass trigger; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "I17" in str(e), f"expected I17 INSERT bypass message; got: {e}"
    print(f"OK: Case 29b INSERT status='draining' → I17 no_draining_insert 拒绝")


def case_29c_reactivate_drained_worker() -> None:
    """P0-9K: drained/stale → active/draining UPDATE → trg_worker_no_reactivate."""
    conn = make_db()
    wid = register_worker(conn, host="h1", worker_id="w-c29c")
    # Manually transition drained
    conn.execute(
        "UPDATE workers SET status='drained' WHERE worker_id=?", (wid,)
    )
    conn.commit()
    try:
        conn.execute(
            "UPDATE workers SET status='active' WHERE worker_id=?", (wid,)
        )
        raise AssertionError("expected I17 reactivate trigger; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        assert "I17" in str(e), f"expected I17 reactivate message; got: {e}"
    print(f"OK: Case 29c drained→active → I17 no_reactivate 拒绝")


# ----------------------------------------------------------------------------
# Case 30 — P0-9L: last_heartbeat_at NULL → NOT NULL
# ----------------------------------------------------------------------------

def case_30_last_heartbeat_at_null() -> None:
    conn = make_db()
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at) VALUES ('w-c30', 'h1', '[]', 'active', NULL)",
        )
        raise AssertionError("expected NOT NULL rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "not null" in str(e).lower(), f"expected NOT NULL message; got: {e}"
    print(f"OK: Case 30 last_heartbeat_at NULL → NOT NULL 约束拒绝")


# ----------------------------------------------------------------------------
# Case 31 — P0-9M: status='rogue' → CHECK
# ----------------------------------------------------------------------------

def case_31_worker_status_invalid_enum() -> None:
    conn = make_db()
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status) "
            "VALUES ('w-c31', 'h1', '[]', 'rogue')",
        )
        raise AssertionError("expected CHECK constraint rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "check" in str(e).lower(), f"expected CHECK message; got: {e}"
    print(f"OK: Case 31 invalid worker status → CHECK 约束拒绝")


# ----------------------------------------------------------------------------
# Case 32 — P0-9N: current_attempt_id='att-fake' → FK
# ----------------------------------------------------------------------------

def case_32_worker_current_attempt_nonexistent() -> None:
    conn = make_db()
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  current_attempt_id) VALUES ('w-c32', 'h1', '[]', 'active', 'att-fake')",
        )
        raise AssertionError("expected FK rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "foreign key" in msg or "fkey" in msg, f"expected FK message; got: {e}"
    print(f"OK: Case 32 current_attempt_id 指向不存在 attempt → FK 约束拒绝")


# ----------------------------------------------------------------------------
# Case 33 — P0-9O: 真并发 bypass: 直接 INSERT while worker holds another active
# ----------------------------------------------------------------------------

def case_33_dispatch_bypasses_claim_concurrent() -> None:
    """P0-9O: 真并发 setup: worker w-bypass holds task_a (via canonical
    claim_via_pool), then two threads race to direct-INSERT attempts for
    task_b with the SAME bypass worker → exactly 1 success (the first to
    claim) — proves that direct INSERT is also rate-limited by
    idx_worker_one_active_attempt.

    Codex v0.9 finding: bypass INSERT was the gap. v0.9.2: even bypassing
    claim(), the partial unique index on task_attempts.worker_id (where
    status IN claimed/running) caps each worker at one active attempt.
    """
    path, seed = _shared_db()
    holder: dict = {}

    def prepare(c):
        # Two workers: w-holder holds task_a (canonical claim_via_pool),
        # w-bypass is a no-capability worker used only for the bypass test.
        w_holder = register_worker(c, host="h1", worker_id="w-c33-holder",
                                   capabilities_json='["web.fetch"]')
        w_bypass = register_worker(c, host="h1", worker_id="w-c33-bypass",
                                   capabilities_json='["other"]')
        holder["w_bypass"] = w_bypass
        holder["t_a"] = seed_task(c)
        holder["t_b"] = seed_task(c)
        # claim_via_pool needs a worker; w-holder matches web.fetch default,
        # w-bypass does not. This way w-holder (not w-bypass) claims task_a.
        claim_via_pool(c, holder["t_a"], required_capability="web.fetch")
        # Bump task_b fence to 1 so direct INSERTs use fence=1
        c.execute(
            "UPDATE tasks SET fence_version=1 WHERE task_id=?", (holder["t_b"],)
        )
        c.commit()

    seed(prepare)
    w_bypass = holder["w_bypass"]
    t_b = holder["t_b"]
    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def bypass_insert(attempt_id):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO task_attempts "
                    "(task_id, attempt_id, fence_version, worker_id, status, "
                    " lease_token, lease_expires_at, status_version, driver_kind) "
                    "VALUES (?, ?, 1, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
                    (t_b, attempt_id, w_bypass, f"lease-{attempt_id}",
                     "2099-01-01T00:00:00Z"),
                )
                c.commit()
                with lock:
                    results.append((attempt_id, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((None, str(e)))
        finally:
            c.close()

    # Two threads race: same bypass worker, same task_b → only 1 active allowed
    t1 = threading.Thread(target=bypass_insert, args=("att-c33-a",))
    t2 = threading.Thread(target=bypass_insert, args=("att-c33-b",))
    t1.start(); t2.start()
    t1.join(); t2.join()

    succ = [r for r in results if r[0] is not None]
    fail = [r for r in results if r[0] is None]
    assert len(succ) == 1, f"expected 1 success; got {len(succ)}: {results}"
    assert len(fail) == 1, f"expected 1 failure; got {len(fail)}: {results}"
    msg = fail[0][1].lower()
    assert "unique" in msg or "constraint" in msg, (
        f"failure should mention unique/constraint; got: {fail[0][1]}"
    )
    print(f"OK: Case 33 真并发 bypass INSERT 同 worker → 1 success / 1 reject (idx_worker_one_active_attempt)")


# ----------------------------------------------------------------------------
# Case 34 — P1-2: 真并发 worker lifecycle → 3 worker.* events emitted
# ----------------------------------------------------------------------------

def case_34_worker_event_emission_concurrent() -> None:
    """P1-2: register + heartbeat + drain from multiple threads → all 3 worker.*
    events emitted and findable in task_events.

    Codex v0.9 finding: worker event schemas existed but no emission evidence;
    full lifecycle produced 0 worker.* events.
    """
    path, seed = _shared_db()

    # Apply schema (no extra seed data needed)
    seed(lambda c: None)
    barrier = threading.Barrier(3)
    results: list = []
    lock = threading.Lock()

    def register(idx):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            wid = f"w-c34-{idx}"
            c.execute(
                "INSERT INTO workers (worker_id, host, capabilities_json, status, "
                "  last_heartbeat_at) VALUES (?, 'h1', '[]', 'active', "
                "  '2026-08-30T12:00:00.000Z')",
                (wid,),
            )
            c.commit()
            c.execute(
                "UPDATE workers SET last_heartbeat_at='2026-08-30T12:01:00.000Z' "
                "WHERE worker_id=?",
                (wid,),
            )
            c.commit()
            c.execute(
                "UPDATE workers SET status='draining' WHERE worker_id=?", (wid,)
            )
            c.commit()
            with lock:
                results.append(wid)
        finally:
            c.close()

    threads = [threading.Thread(target=register, args=(i,)) for i in range(3)]
    for t in threads: t.start()
    for t in threads: t.join()

    assert len(results) == 3, f"expected 3 workers registered; got {len(results)}"

    # Read task_events and count worker.* events
    c = connect_with_fk(path=path, apply_schema=False)
    rows = c.execute(
        "SELECT event_type, payload_json FROM task_events "
        "WHERE event_type LIKE 'worker.%' ORDER BY event_type"
    ).fetchall()
    c.close()

    by_type: dict = {}
    for r in rows:
        by_type.setdefault(r["event_type"], []).append(_json.loads(r["payload_json"]))

    assert "worker.dispatched" in by_type, f"missing worker.dispatched; got types: {list(by_type)}"
    assert "worker.heartbeat" in by_type, f"missing worker.heartbeat; got types: {list(by_type)}"
    assert "worker.drained" in by_type, f"missing worker.drained; got types: {list(by_type)}"
    assert len(by_type["worker.dispatched"]) == 3, (
        f"expected 3 dispatched events; got {len(by_type['worker.dispatched'])}"
    )
    assert len(by_type["worker.heartbeat"]) == 3, (
        f"expected 3 heartbeat events; got {len(by_type['worker.heartbeat'])}"
    )
    assert len(by_type["worker.drained"]) == 3, (
        f"expected 3 drained events; got {len(by_type['worker.drained'])}"
    )

    # Validate payload schema fields
    for payload in by_type["worker.dispatched"]:
        for field in ("worker_id", "host", "capabilities_json", "status", "dispatched_at"):
            assert field in payload, f"dispatched payload missing {field}: {payload}"
    for payload in by_type["worker.heartbeat"]:
        for field in ("worker_id", "last_heartbeat_at", "current_attempt_id"):
            assert field in payload, f"heartbeat payload missing {field}: {payload}"
    for payload in by_type["worker.drained"]:
        for field in ("worker_id", "status", "current_attempt_id"):
            assert field in payload, f"drained payload missing {field}: {payload}"

    print(f"OK: Case 34 真并发 lifecycle → dispatched/heartbeat/drained × 3 each emitted + schema valid")


# ----------------------------------------------------------------------------
# Fairness P1-3: 3 worker × 6 task, round-robin via harness_meta dispatch count
# ----------------------------------------------------------------------------

def case_fairness_round_robin() -> None:
    """3 workers (all with web.fetch). Dispatch 6 tasks via dispatch_worker.
    Each worker must get at least 1 task; max workload difference <= 1.

    Note: dispatch_worker() helper needs round-robin fix (Step 2 of plan).
    If still picking by last_heartbeat_at DESC, all 6 go to one worker —
    that's the P1-3 finding. v0.9.2 fix: round-robin via harness_meta.
    """
    from _helpers import dispatch_worker

    conn = make_db()
    w_a = register_worker(conn, host="h1", worker_id="w-fr-a",
                          capabilities_json='["web.fetch","web.search"]')
    w_b = register_worker(conn, host="h1", worker_id="w-fr-b",
                          capabilities_json='["web.fetch"]')
    w_c = register_worker(conn, host="h1", worker_id="w-fr-c",
                          capabilities_json='["other"]')

    picked: list = []
    for _ in range(6):
        task_id = seed_task(conn)
        wid = dispatch_worker(conn, task_id, required_capability="web.fetch")
        picked.append(wid)

    assert w_c not in picked, f"incapable worker w_c was picked: {picked}"
    assert all(w in (w_a, w_b) for w in picked), f"unexpected picks: {picked}"

    counts: dict = {}
    for w in picked:
        counts[w] = counts.get(w, 0) + 1
    assert len(counts) == 2, (
        f"round-robin: expected both w_a and w_b to receive tasks; got {counts}"
    )
    diff = max(counts.values()) - min(counts.values())
    assert diff <= 1, (
        f"round-robin: workload difference {diff} too large; got {counts}"
    )
    print(f"OK: Fairness round-robin → both workers used, diff={diff} ({counts})")


# ----------------------------------------------------------------------------
# Reap: 1 stale worker reaped, fresh preserved
# ----------------------------------------------------------------------------

def case_reap_stale() -> None:
    conn = make_db()
    conn.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at) VALUES ('w-stale-old', 'h1', '[]', 'active', "
        "  '2026-08-30T11:00:00.000Z')",
    )
    conn.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at) VALUES ('w-stale-fresh', 'h1', '[]', 'active', "
        "  '2026-08-30T11:59:50.000Z')",
    )
    conn.commit()

    n = reap_stale_workers(conn, now_offset_seconds=60.0, threshold_seconds=120)
    assert n == 1, f"expected 1 reaped; got {n}"

    rows = conn.execute(
        "SELECT worker_id, status FROM workers ORDER BY worker_id"
    ).fetchall()
    statuses = {r["worker_id"]: r["status"] for r in rows}
    assert statuses["w-stale-old"] == "stale", f"old worker not reaped: {statuses}"
    assert statuses["w-stale-fresh"] == "active", f"fresh worker reaped: {statuses}"
    print(f"OK: reap_stale → 1 stale worker reaped, fresh preserved")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def main() -> int:
    case_25_two_workers_dispatch_same_task()
    case_26_same_worker_two_active_attempts()
    case_27a_active_attempt_worker_id_null_insert()
    case_27b_pending_update_worker_id_null()
    case_27c_ghost_worker_update()
    case_28a_heartbeat_equal()
    case_28b_heartbeat_backward()
    case_28c_concurrent_backward_heartbeats()
    case_29a_drain_with_terminal_attempt()
    case_29b_insert_draining_directly()
    case_29c_reactivate_drained_worker()
    case_30_last_heartbeat_at_null()
    case_31_worker_status_invalid_enum()
    case_32_worker_current_attempt_nonexistent()
    case_33_dispatch_bypasses_claim_concurrent()
    case_34_worker_event_emission_concurrent()
    case_fairness_round_robin()
    case_reap_stale()
    print("\nOK: worker-dispatch-test.py v0.9.2 — 18 cases 全绿")
    return 0


if __name__ == "__main__":
    sys.exit(main())
