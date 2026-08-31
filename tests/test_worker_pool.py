"""SqliteWorkerPool integration tests.

Covers: register, dispatch (happy + NoWorkerAvailable failure),
heartbeat monotonic clock, drain transitions status, claim_via_pool
composite.
"""
from __future__ import annotations

import sqlite3

import pytest

from harness.runtime._db import seed_task
from harness.runtime.worker_pool import SqliteWorkerPool
from spec.interfaces.worker_pool import (
    NoWorkerAvailable,
    WorkerPoolError,
    assert_satisfies_pool,
)


def test_register_returns_worker_id_and_persists(conn: sqlite3.Connection) -> None:
    pool = SqliteWorkerPool(conn)
    wid = pool.register(host="h1", capabilities_json='["web.fetch"]')
    assert ":" in wid  # <host>:<pid>:<uuid>
    row = conn.execute(
        "SELECT status, host, capabilities_json FROM workers WHERE worker_id=?",
        (wid,),
    ).fetchone()
    assert row["status"] == "active"
    assert row["host"] == "h1"
    assert "web.fetch" in row["capabilities_json"]


def test_dispatch_picks_active_worker_and_emits_event(conn: sqlite3.Connection) -> None:
    pool = SqliteWorkerPool(conn)
    w1 = pool.register(host="h1", capabilities_json='["web.fetch"]')
    w2 = pool.register(host="h2", capabilities_json='["web.fetch"]')
    task_id = seed_task(conn)

    result = pool.dispatch(task_id)
    assert result.task_id == task_id
    assert result.worker_id in (w1, w2)
    assert result.strategy == "round_robin"
    assert result.dispatched_at.endswith("Z")
    # Round-robin should hit each worker eventually across two calls.
    seen = {result.worker_id}
    result2 = pool.dispatch(seed_task(conn))
    seen.add(result2.worker_id)
    assert seen == {w1, w2}, f"expected round-robin across {w1},{w2}, got {seen}"


def test_dispatch_with_no_workers_raises_no_worker_available(conn: sqlite3.Connection) -> None:
    pool = SqliteWorkerPool(conn)
    task_id = seed_task(conn)
    with pytest.raises(NoWorkerAvailable):
        pool.dispatch(task_id)


def test_heartbeat_advances_monotonically(conn: sqlite3.Connection) -> None:
    pool = SqliteWorkerPool(conn)
    wid = pool.register(host="h1", capabilities_json='["web.fetch"]')
    initial = conn.execute(
        "SELECT last_heartbeat_at FROM workers WHERE worker_id=?", (wid,)
    ).fetchone()["last_heartbeat_at"]

    ts1 = pool.heartbeat(wid)
    assert ts1 > initial, f"heartbeat must advance: {initial} -> {ts1}"
    ts2 = pool.heartbeat(wid)
    assert ts2 > ts1, f"second heartbeat must advance further: {ts1} -> {ts2}"


def test_drain_moves_worker_to_draining(conn: sqlite3.Connection) -> None:
    pool = SqliteWorkerPool(conn)
    wid = pool.register(host="h1", capabilities_json='["web.fetch"]')
    new_status = pool.drain(wid)
    assert new_status == "draining"
    row = conn.execute(
        "SELECT status FROM workers WHERE worker_id=?", (wid,)
    ).fetchone()
    assert row["status"] == "draining"


def test_claim_via_pool_returns_attempt_and_worker(conn: sqlite3.Connection) -> None:
    pool = SqliteWorkerPool(conn)
    wid = pool.register(host="h1", capabilities_json='["web.fetch"]')
    task_id = seed_task(conn)
    attempt_id, claimed_worker = pool.claim_via_pool(task_id)
    assert claimed_worker == wid
    assert attempt_id.startswith("att-")
    # task_attempts row must exist with that worker_id.
    row = conn.execute(
        "SELECT worker_id, status FROM task_attempts WHERE attempt_id=?",
        (attempt_id,),
    ).fetchone()
    assert row["worker_id"] == wid
    assert row["status"] == "claimed"


def test_pool_satisfies_protocol(conn: sqlite3.Connection) -> None:
    """Runtime conformance check (mirrors spikes/m0/conformance-second-impl.py)."""
    pool = SqliteWorkerPool(conn)
    assert_satisfies_pool(pool)


def test_dispatch_worker_pool_error_subclass(conn: sqlite3.Connection) -> None:
    """NoWorkerAvailable must be a WorkerPoolError so broad catches still work."""
    assert issubclass(NoWorkerAvailable, WorkerPoolError)