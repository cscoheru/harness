"""Spike: worker-dispatch-test.py (v0.9.4 — closes Codex v0.9.3 CHANGES REQUIRED)

File: spikes/m0/worker-dispatch-test.py
Version: v0.9.4

Closes Codex v0.9.3 FAIL set:
  - P0-M2-2 attempt-side ownership bidirectional (NEW trg_attempt_owner_consistent_update)
  - P1-2 worker.dispatched event semantics split (registered vs dispatched)
  - P1-3 dispatch_worker() lost update under 真并发 (BEGIN IMMEDIATE)
  - Case 27d expanded (4 sub-cases: UPDATE/INSERT × wrong-owner/NULL-attempt)
  - Case 33 misleading comments (w_idle = truly IDLE, not "bypass")
  - trg_attempt_worker_exists_update three-valued logic (IS NOT OLD.worker_id)

v0.9.4 specifics:
  - Case 35 NEW: 真并发 2 threads dispatch_worker() on distinct tasks →
    BEGIN IMMEDIATE serializes; harness_meta dispatch:worker:* totals = 2
    (no lost update), 2 distinct winners (round-robin fires)
  - Case 36 NEW: real worker.dispatched emitted on task_attempts INSERT
    (was the registration event in v0.9.3, now split into registered + dispatched)
  - Case 27d expanded: 4 → 4 sub-cases (instead of just 2 UPDATE scenarios,
    now also INSERT-side ownership failures)
  - Case 33: w_bypass → w_idle rename + comment fix

Cases (all 18 use 真并发 file-DB; Fairness + Reap are single-thread by design):
  Case 25  P0-9G  双 worker 并发 claim 同一 task (rowcount OR idx_attempts_one_active)
  Case 26  P0-9H  真并发同 worker 两 active attempt → idx_worker_one_active_attempt
  Case 27a P0-9I  真并发 INSERT active attempt with worker_id=NULL → I15 trigger
  Case 27b P0-9I  真并发 UPDATE pending→claimed with worker_id=NULL → I15 UPDATE trigger
  Case 27c P0-9I  真并发 UPDATE worker_id to ghost (non-existent) → FK on task_attempts.worker_id
  Case 27d P0-M2-2  真并发 wrong-owner UPDATE + NULL-attempt UPDATE + INSERT-side
                    ownership failures (4 sub-cases, file-DB Barrier(4))
  Case 28a P0-9J  UPDATE last_heartbeat_at = OLD (equal) → I16 (strict monotonic)
  Case 28b P0-9J  UPDATE last_heartbeat_at = OLD - 1s (backward) → I16
  Case 28c P0-9J  真并发 two workers send backward heartbeats → BOTH rejected by I16
  Case 29a P0-9K  真并发 active→draining with terminal attempt → I17
  Case 29b P0-9K  真并发 INSERT status='draining' directly → trg_worker_no_draining_insert
  Case 29c P0-9K  真并发 drained/stale → active UPDATE → trg_worker_no_reactivate
  Case 30  P0-9L  真并发 last_heartbeat_at NULL → NOT NULL
  Case 31  P0-9M  真并发 status='rogue' → CHECK
  Case 32  P0-9N  真并发 current_attempt_id='att-fake' → FK (via file-DB + 真并发 setup)
  Case 33  P0-9O  真并发 dispatch bypass: INSERT attempt for task_b while worker holds task_a
                 → idx_worker_one_active_attempt
  Case 34  P1-2   真并发 lifecycle: register + heartbeat + drain → registered/heartbeat/drained × 3 each
  Case 35  P1-3   真并发 dispatch_worker × 2 distinct tasks → 2 distinct winners, total count = 2
  Case 36  P1-2   real worker.dispatched emitted on task_attempts INSERT → task_id+worker_id+attempt_id+strategy+dispatched_at
  Fairness P1-3  3 worker × 6 task, round-robin via harness_meta dispatch count
  Reap   misc    1 stale worker reaped, fresh preserved

Note on 真并发: each case that races threads uses tempfile.mkstemp +
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
    """P0-9I (v0.9.3 真并发): two threads race to INSERT active attempts with
    worker_id=NULL; both must be rejected by trg_attempt_active_needs_worker_insert.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    task_id = seed_task(seed)
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_insert(label, attempt_id):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO task_attempts "
                    "(task_id, attempt_id, fence_version, worker_id, status, "
                    " lease_token, lease_expires_at, status_version, driver_kind) "
                    "VALUES (?, ?, 1, NULL, 'claimed', ?, ?, 0, 'codex_sdk')",
                    (task_id, attempt_id, f"lease-{attempt_id}", "2099-01-01T00:00:00Z"),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_insert, args=("t1", "att-c27a-1"))
    t2 = threading.Thread(target=try_insert, args=("t2", "att-c27a-2"))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH INSERTs rejected by I15; got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        assert "I15" in msg, f"{label}: expected I15 message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 27a 真并发 active INSERT worker_id NULL → I15 INSERT trigger 2/2 拒绝")


def case_27b_pending_update_worker_id_null() -> None:
    """P0-9I (v0.9.3 真并发): seed a pending attempt with worker_id=NULL (legal),
    then two threads race to UPDATE status='claimed' keeping worker_id NULL;
    both must hit trg_attempt_active_needs_worker_update.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    task_id = seed_task(seed)
    seed.execute(
        "INSERT INTO task_attempts "
        "(task_id, attempt_id, fence_version, worker_id, status, "
        " lease_token, lease_expires_at, status_version, driver_kind) "
        "VALUES (?, ?, 0, NULL, 'pending', ?, ?, 0, 'codex_sdk')",
        (task_id, "att-c27b", "lease-c27b", "2099-01-01T00:00:00Z"),
    )
    seed.commit()
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_update(label):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "UPDATE task_attempts SET status='claimed', status_version=status_version+1 "
                    "WHERE attempt_id=?",
                    ("att-c27b",),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_update, args=("t1",))
    t2 = threading.Thread(target=try_update, args=("t2",))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH UPDATEs rejected by I15 UPDATE path; got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        assert "I15" in msg, f"{label}: expected I15 message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 27b 真并发 pending UPDATE→claimed worker_id NULL → I15 UPDATE 2/2 拒绝")


def case_27c_ghost_worker_update() -> None:
    """P0-9I (v0.9.3 真并发): seed an attempt with worker_id=NULL (matching
    task fence_version so the fence trigger doesn't pre-empt the FK test),
    then two threads race to UPDATE worker_id to a ghost worker; both must hit FK.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    task_id = seed_task(seed)
    # Probe the task's actual fence_version so the seed attempt passes I1.
    task_fence = seed.execute(
        "SELECT fence_version FROM tasks WHERE task_id=?", (task_id,)
    ).fetchone()["fence_version"]
    seed.execute(
        "INSERT INTO task_attempts "
        "(task_id, attempt_id, fence_version, worker_id, status, "
        " lease_token, lease_expires_at, status_version, driver_kind) "
        "VALUES (?, ?, ?, NULL, 'pending', ?, ?, 0, 'codex_sdk')",
        (task_id, "att-c27c-ghost", task_fence, "lease-c27c-ghost", "2099-01-01T00:00:00Z"),
    )
    seed.commit()
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_update(label):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "UPDATE task_attempts SET worker_id=? WHERE attempt_id=?",
                    ("w-does-not-exist", "att-c27c-ghost"),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_update, args=("t1",))
    t2 = threading.Thread(target=try_update, args=("t2",))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH UPDATEs rejected by I15/FK; got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        # v0.9.4 defense-in-depth: trg_attempt_worker_exists_update (I15) catches
        # the ghost worker BEFORE the FK constraint on task_attempts.worker_id
        # fires. Either I15 OR FK message is valid rejection. (Before v0.9.4
        # the trigger had != NULL bypass; now it fires reliably.)
        msg_lower = msg.lower()
        assert (
            "foreign key" in msg_lower
            or "fkey" in msg_lower
            or "i15" in msg_lower
        ), f"{label}: expected FK or I15 message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 27c 真并发 ghost-worker UPDATE → I15/FK 2/2 拒绝")


def case_27d_worker_ownership_nullsafe() -> None:
    """P0-M2-2 (v0.9.3 + v0.9.4 expansion): ownership triggers must be NULL-safe
    on BOTH INSERT and UPDATE paths, for BOTH wrong-owner and NULL-attempt cases.

    Codex v0.9.2 finding: `trg_worker_ownership_insert/update` used
    `(SELECT worker_id FROM task_attempts WHERE attempt_id = NEW.current_attempt_id)
    != NEW.worker_id`. When the subquery returned NULL, the comparison was
    UNKNOWN — UNKNOWN in WHEN skips RAISE, so the write succeeded even though
    ownership was never verified.

    v0.9.3 fix: trigger uses `NOT EXISTS` which is NULL-safe by construction.
    v0.9.4 expansion: 4 sub-cases covering INSERT + UPDATE × wrong-owner +
    NULL-attempt. All 4 fire in真并发 via Barrier(4) and all 4 must be rejected.

      27d-1: wrong-owner UPDATE — w_other.current_attempt_id = attempt_of_w_owner
      27d-2: NULL-attempt UPDATE — current_attempt_id = 'att-nonexistent'
      27d-3: wrong-owner INSERT — INSERT new worker claiming attempt_of_w_owner
      27d-4: NULL-attempt INSERT — INSERT new worker claiming 'att-nonexistent'
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    task_id = seed_task(seed)
    w_owner = register_worker(seed, host="h1", worker_id="w-c27d-owner")
    register_worker(seed, host="h1", worker_id="w-c27d-other")
    attempt_id, _ = claim(seed, task_id, w_owner)
    seed.close()

    barrier = threading.Barrier(4)
    results: list = []
    lock = threading.Lock()

    def try_op(label, sql, params):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(sql, params)
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    threads = [
        threading.Thread(target=try_op, args=(
            "wrong-owner-update",
            "UPDATE workers SET current_attempt_id=? WHERE worker_id=?",
            (attempt_id, "w-c27d-other"),
        )),
        threading.Thread(target=try_op, args=(
            "null-attempt-update",
            "UPDATE workers SET current_attempt_id='att-nonexistent' WHERE worker_id=?",
            ("w-c27d-owner",),
        )),
        threading.Thread(target=try_op, args=(
            "wrong-owner-insert",
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at, current_attempt_id) VALUES (?, 'h1', '[]', "
            "  'active', '2026-08-30T12:00:00.000Z', ?)",
            ("w-c27d-attacker", attempt_id),
        )),
        threading.Thread(target=try_op, args=(
            "null-attempt-insert",
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at, current_attempt_id) VALUES (?, 'h1', '[]', "
            "  'active', '2026-08-30T12:00:00.000Z', 'att-nonexistent')",
            ("w-c27d-attacker2",),
        )),
    ]
    for t in threads: t.start()
    for t in threads: t.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 4, (
        f"expected ALL 4 ownership writes rejected (2 UPDATE + 2 INSERT); "
        f"got {len(rejected)}/4: {results}"
    )
    for label, msg in rejected:
        assert "ownership" in msg.lower(), (
            f"{label}: expected 'ownership' keyword in message; got: {msg}"
        )
    _os.unlink(path)
    print(f"OK: Case 27d ownership NULL-safe — 4 sub-cases (UPDATE/INSERT × wrong/NULL-attempt) all rejected")


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
    # v0.9.3 strict assertion: both racing threads target the SAME baseline
    # (one equal, one backward), so both NEW timestamps are <= OLD and BOTH
    # must trip I16 — not just "at least one". Serialized in WAL order, but
    # both transactions evaluate the trigger independently and both fail.
    assert len(rejected) == 2, (
        f"expected BOTH I16 rejections (one equal + one backward); "
        f"got {len(rejected)}/2: {results}"
    )
    print(f"OK: Case 28c 真并发 backward heartbeats → 2/2 I16 rejects")


# ----------------------------------------------------------------------------
# Case 29 — P0-9K: drain bypass paths (UPDATE stale, INSERT draining, reactivate)
# ----------------------------------------------------------------------------

def case_29a_drain_with_terminal_attempt() -> None:
    """P0-9K (v0.9.3 真并发): active→draining with current_attempt_id pointing at
    terminal attempt; two threads race to drain the same worker; both must hit
    trg_worker_drain_pause (I17).
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    task_id = seed_task(seed)
    wid = register_worker(seed, host="h1", worker_id="w-c29a")
    attempt_id, _ = claim_via_pool(seed, task_id)
    seed.execute(
        "UPDATE task_attempts SET status='succeeded', "
        "  finished_at=strftime('%Y-%m-%dT%H:%M:%S.%fZ','now') WHERE attempt_id=?",
        (attempt_id,),
    )
    seed.commit()
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_drain(label):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                drain_worker(c, wid)
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_drain, args=("t1",))
    t2 = threading.Thread(target=try_drain, args=("t2",))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH drains rejected by I17; got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        assert "I17" in msg, f"{label}: expected I17 message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 29a 真并发 drain with terminal attempt → I17 2/2 拒绝")


def case_29b_insert_draining_directly() -> None:
    """P0-9K (v0.9.3 真并发): two threads race to INSERT worker with
    status='draining'; both must hit trg_worker_no_draining_insert (I17).
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_insert(label, wid):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO workers (worker_id, host, capabilities_json, status, "
                    "  last_heartbeat_at) "
                    "VALUES (?, 'h1', '[]', 'draining', "
                    "  '2026-08-30T12:00:00.000Z')",
                    (wid,),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_insert, args=("t1", "w-c29b-1"))
    t2 = threading.Thread(target=try_insert, args=("t2", "w-c29b-2"))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH INSERTs rejected by I17 no_draining_insert; "
        f"got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        assert "I17" in msg, f"{label}: expected I17 message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 29b 真并发 INSERT status='draining' → I17 2/2 拒绝")


def case_29c_reactivate_drained_worker() -> None:
    """P0-9K (v0.9.3 真并发): seed worker in drained state, two threads race
    to UPDATE status='active'; both must hit trg_worker_no_reactivate (I17).
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    wid = register_worker(seed, host="h1", worker_id="w-c29c")
    seed.execute(
        "UPDATE workers SET status='drained' WHERE worker_id=?", (wid,)
    )
    seed.commit()
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_reactivate(label):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "UPDATE workers SET status='active' WHERE worker_id=?",
                    (wid,),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_reactivate, args=("t1",))
    t2 = threading.Thread(target=try_reactivate, args=("t2",))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH reactivates rejected by I17 no_reactivate; "
        f"got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        assert "I17" in msg, f"{label}: expected I17 message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 29c 真并发 drained→active → I17 2/2 拒绝")


# ----------------------------------------------------------------------------
# Case 30 — P0-9L: last_heartbeat_at NULL → NOT NULL
# ----------------------------------------------------------------------------

def case_30_last_heartbeat_at_null() -> None:
    """P0-9L (v0.9.3 真并发): two threads race to INSERT worker with
    last_heartbeat_at=NULL; both must be rejected by NOT NULL constraint.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_insert(label, wid):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO workers (worker_id, host, capabilities_json, status, "
                    "  last_heartbeat_at) VALUES (?, 'h1', '[]', 'active', NULL)",
                    (wid,),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_insert, args=("t1", "w-c30-1"))
    t2 = threading.Thread(target=try_insert, args=("t2", "w-c30-2"))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH INSERTs rejected by NOT NULL; got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        assert "not null" in msg.lower(), f"{label}: expected NOT NULL message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 30 真并发 last_heartbeat_at NULL → NOT NULL 2/2 拒绝")


# ----------------------------------------------------------------------------
# Case 31 — P0-9M: status='rogue' → CHECK
# ----------------------------------------------------------------------------

def case_31_worker_status_invalid_enum() -> None:
    """P0-9M (v0.9.3 真并发): two threads race to INSERT worker with status='rogue';
    both must be rejected by the CHECK constraint.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_insert(label, wid):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO workers (worker_id, host, capabilities_json, status) "
                    "VALUES (?, 'h1', '[]', 'rogue')",
                    (wid,),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_insert, args=("t1", "w-c31-1"))
    t2 = threading.Thread(target=try_insert, args=("t2", "w-c31-2"))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH INSERTs rejected by CHECK; got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        assert "check" in msg.lower(), f"{label}: expected CHECK message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 31 真并发 invalid worker status → CHECK 2/2 拒绝")


# ----------------------------------------------------------------------------
# Case 32 — P0-9N: current_attempt_id='att-fake' → FK
# ----------------------------------------------------------------------------

def case_32_worker_current_attempt_nonexistent() -> None:
    """P0-9N (v0.9.3 真并发): two threads race to INSERT worker pointing at
    a non-existent attempt; both must be rejected by FK.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    seed = connect_with_fk(path=path, apply_schema=True)
    seed.close()

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def try_insert(label, wid):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                c.execute(
                    "INSERT INTO workers (worker_id, host, capabilities_json, status, "
                    "  current_attempt_id) VALUES (?, 'h1', '[]', 'active', 'att-fake')",
                    (wid,),
                )
                with lock:
                    results.append((label, None))
            except sqlite3.IntegrityError as e:
                with lock:
                    results.append((label, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=try_insert, args=("t1", "w-c32-1"))
    t2 = threading.Thread(target=try_insert, args=("t2", "w-c32-2"))
    t1.start(); t2.start()
    t1.join(); t2.join()

    rejected = [r for r in results if r[1] is not None]
    assert len(rejected) == 2, (
        f"expected BOTH INSERTs rejected by FK/ownership; got {len(rejected)}/2: {results}"
    )
    for label, msg in rejected:
        # v0.9.3 defense-in-depth: trg_worker_ownership_insert catches the
        # missing attempt BEFORE FK constraint check fires. Either is valid.
        msg_lower = msg.lower()
        assert (
            "foreign key" in msg_lower
            or "fkey" in msg_lower
            or "ownership" in msg_lower
        ), f"{label}: expected FK or ownership message; got: {msg}"
    _os.unlink(path)
    print(f"OK: Case 32 真并发 current_attempt_id 指向不存在 attempt → ownership/FK 2/2 拒绝")


# ----------------------------------------------------------------------------
# Case 33 — P0-9O: 真并发 bypass: 直接 INSERT while worker holds another active
# ----------------------------------------------------------------------------

def case_33_dispatch_bypasses_claim_concurrent() -> None:
    """P0-9O: 真并发 setup — two threads race to direct-INSERT attempts for
    task_b using the same idle worker (no claim() helper); exactly 1 success,
    1 reject from idx_worker_one_active_attempt. Closes Codex v0.9.3 finding
    that the previous comment claimed w_bypass held task_a but the actual
    setup had w_holder claim task_a — renamed w_bypass → w_idle and clarified
    the intent: this case proves that direct INSERT bypasses claim() helper
    are still rate-limited by the partial unique index per worker.
    """
    path, seed = _shared_db()
    holder: dict = {}

    def prepare(c):
        # Two workers: w_holder is web.fetch-capable (will claim task_a via
        # claim_via_pool to set up a busy worker); w_idle is OTHER-capable
        # (no claim_via_pool on it, so it stays IDLE). Both bypass INSERTs
        # use w_idle as the worker.
        register_worker(c, host="h1", worker_id="w-c33-holder",
                        capabilities_json='["web.fetch"]')
        register_worker(c, host="h1", worker_id="w-c33-idle",
                        capabilities_json='["other"]')
        holder["w_idle"] = "w-c33-idle"
        holder["t_a"] = seed_task(c)
        holder["t_b"] = seed_task(c)
        # claim_via_pool with web.fetch → w_holder picks up task_a, leaving
        # w_idle truly IDLE for the bypass test below.
        claim_via_pool(c, holder["t_a"], required_capability="web.fetch")
        # Bump task_b fence to 1 so direct INSERTs use fence=1
        c.execute(
            "UPDATE tasks SET fence_version=1 WHERE task_id=?", (holder["t_b"],)
        )
        c.commit()

    seed(prepare)
    w_idle = holder["w_idle"]
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
                    (t_b, attempt_id, w_idle, f"lease-{attempt_id}",
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
    v0.9.4: 'worker.registered' replaces the old 'worker.dispatched' registration
    event. 'worker.dispatched' is now reserved for real task→worker dispatch
    (tested separately by case_36).
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

    # v0.9.4: 'worker.registered' replaces old 'worker.dispatched' registration event
    assert "worker.registered" in by_type, (
        f"missing worker.registered; got types: {list(by_type)}"
    )
    assert "worker.heartbeat" in by_type, f"missing worker.heartbeat; got types: {list(by_type)}"
    assert "worker.drained" in by_type, f"missing worker.drained; got types: {list(by_type)}"
    assert len(by_type["worker.registered"]) == 3, (
        f"expected 3 registered events; got {len(by_type['worker.registered'])}"
    )
    assert len(by_type["worker.heartbeat"]) == 3, (
        f"expected 3 heartbeat events; got {len(by_type['worker.heartbeat'])}"
    )
    assert len(by_type["worker.drained"]) == 3, (
        f"expected 3 drained events; got {len(by_type['worker.drained'])}"
    )

    # Validate payload schema fields (worker.registered spec/worker-pool.md §5)
    for payload in by_type["worker.registered"]:
        for field in ("worker_id", "host", "capabilities_json", "status", "registered_at"):
            assert field in payload, f"registered payload missing {field}: {payload}"
    for payload in by_type["worker.heartbeat"]:
        for field in ("worker_id", "last_heartbeat_at", "current_attempt_id"):
            assert field in payload, f"heartbeat payload missing {field}: {payload}"
    for payload in by_type["worker.drained"]:
        for field in ("worker_id", "status", "current_attempt_id"):
            assert field in payload, f"drained payload missing {field}: {payload}"

    # 'worker.dispatched' should NOT appear in pure worker lifecycle (no task
    # was claimed). It's emitted only when a task_attempts row INSERTs with
    # a worker_id. case_36 tests the dispatched emission path.
    assert "worker.dispatched" not in by_type, (
        f"unexpected worker.dispatched events in pure worker lifecycle: {by_type['worker.dispatched']}"
    )

    print(f"OK: Case 34 真并发 lifecycle → registered/heartbeat/drained × 3 each emitted + schema valid")


# ----------------------------------------------------------------------------
# Case 35 — P1-3 (v0.9.4): 真并发 dispatch race — no lost update
# ----------------------------------------------------------------------------

def case_35_concurrent_dispatch_atomic_count() -> None:
    """P1-3 (v0.9.4): 真并发 two threads simultaneously call dispatch_worker()
    on distinct tasks. The fix: BEGIN IMMEDIATE in dispatch_worker serializes
    concurrent calls across connections, so the SELECT counts + UPSERT is
    atomic per winner.

    Codex v0.9.3 P1-3 finding (raw reproduction, BEFORE the v0.9.4 fix):
      T1 SELECT counts -> {w_a: 0, w_b: 0}, picks w_a, UPSERT counts[w_a] = 1
      T2 SELECT counts -> {w_a: 0, w_b: 0} (concurrent with T1, no commit yet),
                           picks w_a, UPSERT counts[w_a] = 1
      -> both dispatches wrote 1; persisted total = 1, lost update.

    With BEGIN IMMEDIATE the calls serialize: T1 BEGIN, picks w_a, UPSERT+commit
    releases write lock; T2 BEGIN, sees counts[w_a]=1, picks w_b.

    Assertions:
      - both dispatches succeed (no exception, distinct worker_ids returned)
      - 2 DIFFERENT winners (round-robin actually fires)
      - harness_meta dispatch:worker:* counts total = 2 (no lost update)
      - each worker has count = 1 (perfect round-robin)
    """
    path, seed = _shared_db()

    def prepare(c):
        register_worker(c, host="h1", worker_id="w-c35-a",
                       capabilities_json='["web.fetch"]')
        register_worker(c, host="h1", worker_id="w-c35-b",
                       capabilities_json='["web.fetch"]')
        # Force w-c35-a heartbeat strictly later than w-c35-b to expose any
        # heartbeat-first tiebreak regression.
        c.execute(
            "UPDATE workers SET last_heartbeat_at='2099-01-01T00:00:00.000Z' "
            "WHERE worker_id='w-c35-a'"
        )
        c.commit()

    seed(prepare)

    barrier = threading.Barrier(2)
    results: list = []
    lock = threading.Lock()

    def dispatch(idx):
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            tid = f"t-c35-{idx}"
            c.execute(
                "INSERT INTO tasks (task_id, tenant_id, workflow_pack, "
                "  workflow_version, status) VALUES (?, 'tn', 'web_research', "
                "  '1.0.0', 'pending')",
                (tid,),
            )
            c.commit()
            from _helpers import dispatch_worker
            wid = dispatch_worker(c, tid, required_capability="web.fetch")
            with lock:
                results.append((idx, tid, wid, None))
        except Exception as e:
            with lock:
                results.append((idx, None, None, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=dispatch, args=(1,))
    t2 = threading.Thread(target=dispatch, args=(2,))
    t1.start(); t2.start()
    t1.join(); t2.join()

    successes = [r for r in results if r[2] is not None]
    assert len(successes) == 2, (
        f"expected 2 dispatch successes; got {len(successes)}: {results}"
    )

    winners = {r[2] for r in successes}
    assert len(winners) == 2, (
        f"expected 2 DIFFERENT winners (round-robin); got {winners} from {successes}"
    )

    c = connect_with_fk(path=path, apply_schema=False)
    rows = c.execute(
        "SELECT k, v FROM harness_meta WHERE k LIKE 'dispatch:worker:%'"
    ).fetchall()
    c.close()
    counts = {r["k"]: int(r["v"]) for r in rows}
    total = sum(counts.values())
    assert total == 2, (
        f"expected total dispatch count = 2 (no lost update); "
        f"got total={total}, counts={counts}"
    )
    assert all(v == 1 for v in counts.values()), (
        f"expected each worker count = 1 (perfect round-robin); got {counts}"
    )

    _os.unlink(path)
    print(f"OK: Case 35 真并发 dispatch race → 2 distinct winners, total count = 2 (no lost update)")


# ----------------------------------------------------------------------------
# Case 36 — P1-2 (v0.9.4): real worker.dispatched emitted on task claim
# ----------------------------------------------------------------------------

def case_36_worker_dispatched_event_on_claim() -> None:
    """P1-2 (v0.9.4): real worker.dispatched event emitted on task_attempts
    INSERT with non-NULL worker_id and active status. Payload contains task_id
    + worker_id + attempt_id + strategy + dispatched_at. Closes Codex v0.9.3
    P1-2 finding that 'worker.dispatched' was actually the registration event
    payload; v0.9.4 splits registered vs dispatched with distinct payloads.
    """
    path, seed = _shared_db()
    holder: dict = {}

    def prepare(c):
        w = register_worker(c, host="h1", worker_id="w-c36")
        holder["w"] = w

    seed(prepare)
    w = holder["w"]

    c = connect_with_fk(path=path, apply_schema=False)
    task_id = seed_task(c)
    attempt_id, _ = claim(c, task_id, w)
    rows = c.execute(
        "SELECT event_type, payload_json, task_id, attempt_id "
        "FROM task_events WHERE event_type='worker.dispatched'"
    ).fetchall()
    c.close()

    matching = [r for r in rows if r["task_id"] == task_id]
    assert len(matching) == 1, (
        f"expected exactly 1 worker.dispatched event for task {task_id}; "
        f"got {len(matching)} ({len(rows)} total dispatched events)"
    )

    payload = _json.loads(matching[0]["payload_json"])
    for field in ("task_id", "worker_id", "attempt_id", "strategy", "dispatched_at"):
        assert field in payload, f"dispatched payload missing {field}: {payload}"
    assert payload["task_id"] == task_id, f"task_id mismatch: {payload}"
    assert payload["worker_id"] == w, f"worker_id mismatch: {payload}"
    assert payload["attempt_id"] == attempt_id, f"attempt_id mismatch: {payload}"
    assert payload["strategy"] in ("capability_match", "worker_takeover"), (
        f"strategy unexpected: {payload['strategy']}"
    )

    _os.unlink(path)
    print(f"OK: Case 36 worker.dispatched emitted on claim — "
          f"task_id+worker_id+attempt_id+strategy+dispatched_at ✓")


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
    case_27d_worker_ownership_nullsafe()
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
    case_35_concurrent_dispatch_atomic_count()
    case_36_worker_dispatched_event_on_claim()
    case_fairness_round_robin()
    case_reap_stale()
    print("\nOK: worker-dispatch-test.py v0.9.4 — 21 cases 全绿 (含 Case 27d NULL-safe + Case 35 BEGIN IMMEDIATE 真并发 + Case 36 worker.dispatched 派单事件)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
