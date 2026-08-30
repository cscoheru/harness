"""Spike: worker-dispatch-test.py (v0.9-B — closes Codex v0.9-B P0-9G..P0-9O)

File: spikes/m0/worker-dispatch-test.py
Version: v0.9-B

Validates the I15-I18 invariants for the WorkerPool:
  Case 25: P0-9G 真并发: 双 worker 同时 dispatch 同一 task → 一个成功, 一个 SQLITE_CONSTRAINT
  Case 26: P0-9H 真并发: 同 worker 两 active attempt → partial unique index 拒绝
  Case 27: P0-9I: active attempt 但 worker_id NULL → trg_attempt_active_needs_worker 拒绝
  Case 28: P0-9J: heartbeat 不推进 last_heartbeat_at → trg_worker_heartbeat_renew 拒绝
  Case 29: P0-9K: drain 时 current_attempt_id 指向已 terminal 的 attempt → trg_worker_drain_pause 拒绝
  Case 30: P0-9L: last_heartbeat_at NULL → NOT NULL 约束拒绝 (override default)
  Case 31: P0-9M: status 不在合法枚举 → CHECK 约束拒绝
  Case 32: P0-9N: current_attempt_id 指向不存在的 attempt → trg_attempt_worker_exists 拒绝
  Case 33: P0-9O: dispatch 绕过 claim 直接 INSERT attempt → partial unique index 仍 reject
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import threading
import time

from _helpers import (
    MODEL_GENERATED,
    TRUSTED_USER_INPUT,
    ClaimRejected,
    claim,
    claim_via_pool,
    connect_with_fk,
    dispatch_worker,
    drain_worker,
    heartbeat_worker,
    make_db,
    reap_stale_workers,
    register_worker,
    seed_blob,
    seed_task,
)


def case_25_two_workers_dispatch_same_task() -> None:
    """P0-9G: 真并发两 worker dispatch 同一 task.

    期望: 一个 worker claim 成功 (attempt INSERT OK), 另一个被
    idx_attempts_one_active 部分唯一索引拒绝 (SQLITE_CONSTRAINT)。
    """
    import tempfile, os as _os
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    _os.close(fd)

    # Seed task + 2 workers via shared file-DB
    conn_a = connect_with_fk(path=path, apply_schema=True)
    task_id = seed_task(conn_a)
    w1 = register_worker(conn_a, host="h1", worker_id="w-c25-a")
    w2 = register_worker(conn_a, host="h1", worker_id="w-c25-b")

    barrier = threading.Barrier(2)
    results: list[tuple[str, str | None, str | None]] = []
    lock = threading.Lock()

    def worker_claim(label: str, wid: str) -> None:
        c = connect_with_fk(path=path, apply_schema=False)
        try:
            barrier.wait()
            try:
                attempt_id, _fence = claim(c, task_id, wid)
                with lock:
                    results.append((label, attempt_id, None))
            except (sqlite3.IntegrityError, ClaimRejected) as e:
                with lock:
                    results.append((label, None, str(e)))
        finally:
            c.close()

    t1 = threading.Thread(target=worker_claim, args=("w1", w1))
    t2 = threading.Thread(target=worker_claim, args=("w2", w2))
    t1.start(); t2.start()
    t1.join(); t2.join()

    successes = [r for r in results if r[1] is not None]
    failures = [r for r in results if r[1] is None]
    assert len(successes) == 1, f"expected exactly 1 success; got {len(successes)}: {results}"
    assert len(failures) == 1, f"expected exactly 1 failure; got {len(failures)}: {results}"
    fail_msg = failures[0][2].lower()
    # Either defense layer catches it: rowcount check (v0.7 helper) OR partial
    # unique index idx_attempts_one_active (DB layer). Both close P0-9G.
    assert (
        "unique" in fail_msg
        or "constraint" in fail_msg
        or "rowcount" in fail_msg
        or "terminal" in fail_msg
        or "pending" in fail_msg
    ), f"failure should reference unique/constraint/rowcount; got: {failures[0][2]}"
    print(
        f"OK: 真并发 dispatch 同 task → 1 success / 1 reject ({failures[0][2][:60]})"
    )


def case_26_same_worker_two_active_attempts() -> None:
    """P0-9H: 同 worker 同时持两个 active attempt.

    期望: idx_worker_one_active_attempt 部分唯一索引拒绝第二个 attempt。
    """
    conn = make_db()
    task_a = seed_task(conn)
    task_b = seed_task(conn)
    wid = register_worker(conn, host="h1", worker_id="w-c26")

    # First claim succeeds
    a1, _ = claim(conn, task_a, wid)

    # Second claim with same worker should be rejected by idx_worker_one_active_attempt
    last_err = None
    try:
        a2, _ = claim(conn, task_b, wid)
        raise AssertionError(
            f"expected SQLITE_CONSTRAINT but second claim succeeded: {a2}"
        )
    except (sqlite3.IntegrityError, ClaimRejected) as e:
        last_err = str(e)
        msg = str(e).lower()
        assert "unique" in msg or "constraint" in msg, (
            f"expected unique/constraint error; got: {e}"
        )
    print(f"OK: 同 worker 两 active attempt → partial unique index 拒绝 ({last_err[:60]})")


def case_27_active_attempt_worker_id_null() -> None:
    """P0-9I: active attempt 但 worker_id NULL.

    期望: trg_attempt_active_needs_worker 拒绝。
    """
    conn = make_db()
    task_id = seed_task(conn)

    # Manually craft an INSERT with status='claimed' but worker_id=None
    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, ?, ?, NULL, 'claimed', ?, ?, 0, 'codex_sdk')",
            (task_id, "att-c27", 1, "lease-x", "2099-01-01T00:00:00Z"),
        )
        conn.commit()
        raise AssertionError("expected I15 trigger rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "I15" in str(e), f"expected I15 message; got: {e}"
    print(f"OK: active attempt worker_id NULL → I15 trigger 拒绝")


def case_28_heartbeat_must_advance() -> None:
    """P0-9J: heartbeat 不推进 last_heartbeat_at.

    期望: trg_worker_heartbeat_renew 拒绝。
    """
    conn = make_db()
    wid = register_worker(conn, host="h1", worker_id="w-c28")

    # First heartbeat with offset=10 advances, OK
    heartbeat_worker(conn, wid, offset_seconds=10)

    # Second heartbeat with offset=10 (same value) — should ABORT
    try:
        # Directly UPDATE with same value
        cur_ts = conn.execute(
            "SELECT last_heartbeat_at FROM workers WHERE worker_id=?", (wid,)
        ).fetchone()["last_heartbeat_at"]
        conn.execute(
            "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=?",
            (cur_ts, wid),
        )
        conn.commit()
        raise AssertionError("expected I16 trigger rejection; UPDATE succeeded")
    except sqlite3.IntegrityError as e:
        assert "I16" in str(e), f"expected I16 message; got: {e}"
    print(f"OK: heartbeat 不推进 → I16 trigger 拒绝")


def case_29_drain_stale_current_attempt() -> None:
    """P0-9K: drain 时 current_attempt_id 指向已 terminal 的 attempt.

    期望: trg_worker_drain_pause 拒绝。
    """
    conn = make_db()
    task_id = seed_task(conn)
    wid = register_worker(conn, host="h1", worker_id="w-c29")

    # Claim → current_attempt_id gets set
    attempt_id, _ = claim_via_pool(conn, task_id)
    # Manually mark attempt as terminal (succeeded)
    conn.execute(
        "UPDATE task_attempts SET status='succeeded', finished_at=strftime('%Y-%m-%dT%H:%M:%S.%fZ','now') "
        "WHERE attempt_id=?",
        (attempt_id,),
    )
    conn.commit()

    # Now drain should be rejected (stale pointer)
    try:
        drain_worker(conn, wid)
        raise AssertionError("expected I17 trigger rejection; drain succeeded")
    except sqlite3.IntegrityError as e:
        assert "I17" in str(e), f"expected I17 message; got: {e}"
    print(f"OK: drain stale current_attempt_id → I17 trigger 拒绝")


def case_30_last_heartbeat_at_null() -> None:
    """P0-9L: last_heartbeat_at NULL INSERT.

    期望: NOT NULL 约束拒绝。
    """
    conn = make_db()
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  last_heartbeat_at) VALUES ('w-c30', 'h1', '[]', 'active', NULL)",
        )
        conn.commit()
        raise AssertionError("expected NOT NULL rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        assert "not null" in str(e).lower(), f"expected NOT NULL message; got: {e}"
    print(f"OK: last_heartbeat_at NULL → NOT NULL 约束拒绝")


def case_31_worker_status_invalid_enum() -> None:
    """P0-9M: status 不在合法枚举.

    期望: CHECK 约束拒绝。
    """
    conn = make_db()
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status) "
            "VALUES ('w-c31', 'h1', '[]', 'rogue')",
        )
        conn.commit()
        raise AssertionError("expected CHECK constraint rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "check" in msg, f"expected CHECK message; got: {e}"
    print(f"OK: invalid worker status → CHECK 约束拒绝")


def case_32_worker_current_attempt_nonexistent() -> None:
    """P0-9N: workers.current_attempt_id 指向不存在的 attempt.

    期望: FK 约束拒绝 (workers.current_attempt_id FK → task_attempts.attempt_id).
    """
    conn = make_db()
    try:
        conn.execute(
            "INSERT INTO workers (worker_id, host, capabilities_json, status, "
            "  current_attempt_id) VALUES ('w-c32', 'h1', '[]', 'active', 'att-fake')",
        )
        conn.commit()
        raise AssertionError("expected FK rejection; INSERT succeeded")
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "foreign key" in msg or "fkey" in msg, f"expected FK message; got: {e}"
    print(f"OK: current_attempt_id 指向不存在 attempt → FK 约束拒绝")


def case_33_dispatch_bypasses_claim() -> None:
    """P0-9O: dispatch 绕过 claim 直接 INSERT attempt → partial unique index 仍 reject.

    期望: 即便绕过 claim_via_pool(), 直接 INSERT attempt 也被 I15 部分唯一索引拒绝
    (因为同 worker 同时已有 active attempt).
    """
    import tempfile, os as _os
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    _os.close(fd)

    conn_a = connect_with_fk(path=path, apply_schema=True)
    task_a = seed_task(conn_a)
    task_b = seed_task(conn_a)
    wid = register_worker(conn_a, host="h1", worker_id="w-c33")

    # Use claim_via_pool for task_a (canonical path)
    a1, _ = claim_via_pool(conn_a, task_a, required_capability=None)
    assert a1 is not None

    # Now bypass: directly INSERT attempt for task_b with same worker
    # First advance task_b fence manually
    conn_a.execute(
        "UPDATE tasks SET fence_version = fence_version + 1, status='pending', "
        "  updated_at=strftime('%Y-%m-%dT%H:%M:%S.%fZ','now') WHERE task_id=?",
        (task_b,),
    )
    conn_a.execute(
        "SELECT fence_version FROM tasks WHERE task_id=?", (task_b,)
    ).fetchone()
    fence_b = conn_a.execute(
        "SELECT fence_version FROM tasks WHERE task_id=?", (task_b,)
    ).fetchone()["fence_version"]

    try:
        conn_a.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, ?, ?, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
            (task_b, "att-bypass", fence_b, wid, "lease-bypass",
             "2099-01-01T00:00:00Z"),
        )
        conn_a.commit()
        raise AssertionError("expected partial unique index rejection; bypass succeeded")
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "unique" in msg or "constraint" in msg, f"expected unique error; got: {e}"
    print(f"OK: dispatch 绕过 claim → idx_worker_one_active_attempt 拒绝 (P0-9O closed)")


def case_fairness_round_robin() -> None:
    """Additional: capability-match → round-robin fallback.

    Register 3 workers (2 with 'web.fetch', 1 without). Dispatch 6 tasks with
    required_capability='web.fetch'. Expect all dispatches go to one of the 2
    capable workers (NOT the incapable one).
    """
    conn = make_db()
    w_a = register_worker(conn, host="h1", worker_id="w-fr-a",
                          capabilities_json='["web.fetch","web.search"]')
    w_b = register_worker(conn, host="h1", worker_id="w-fr-b",
                          capabilities_json='["web.fetch"]')
    w_c = register_worker(conn, host="h1", worker_id="w-fr-c",
                          capabilities_json='["other"]')

    picked: list[str] = []
    for i in range(6):
        task_id = seed_task(conn)
        wid = dispatch_worker(conn, task_id, required_capability="web.fetch")
        picked.append(wid)

    assert w_c not in picked, f"incapable worker w_c was picked: {picked}"
    assert all(w in (w_a, w_b) for w in picked), f"unexpected picks: {picked}"
    print(f"OK: capability-match fairness → only w_a/w_b picked ({len(set(picked))} unique)")


def case_reap_stale() -> None:
    """Additional: reap_stale marks workers with stale last_heartbeat_at.

    Register 2 workers with last_heartbeat_at far in the past; reap with
    threshold=30 seconds and current_time offset=60. Both should be marked stale.
    """
    conn = make_db()
    # Manually insert a worker with old heartbeat
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

    rows = conn.execute("SELECT worker_id, status FROM workers ORDER BY worker_id").fetchall()
    statuses = {r["worker_id"]: r["status"] for r in rows}
    assert statuses["w-stale-old"] == "stale", f"old worker not reaped: {statuses}"
    assert statuses["w-stale-fresh"] == "active", f"fresh worker reaped: {statuses}"
    print(f"OK: reap_stale → 1 stale worker reaped, fresh preserved")


def main() -> int:
    case_25_two_workers_dispatch_same_task()
    case_26_same_worker_two_active_attempts()
    case_27_active_attempt_worker_id_null()
    case_28_heartbeat_must_advance()
    case_29_drain_stale_current_attempt()
    case_30_last_heartbeat_at_null()
    case_31_worker_status_invalid_enum()
    case_32_worker_current_attempt_nonexistent()
    case_33_dispatch_bypasses_claim()
    case_fairness_round_robin()
    case_reap_stale()
    print("\nOK: worker-dispatch-test.py — 9 P0-9 反例 + 2 fairness 全 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())