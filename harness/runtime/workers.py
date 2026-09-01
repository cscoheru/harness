"""harness.runtime.workers — worker-pool primitives (v0.9-B lift).

Lift of ``spikes/m0/_helpers.py`` lines 328-531. Behavior preserved: I15
auto-register, BEGIN IMMEDIATE dispatch serialization, dispatch-count
harness_meta UPSERT, trg_worker_heartbeat_renew compliance.

Public API (NOW.md §2 T-BE-1):
    register_worker, heartbeat_worker, drain_worker, reap_stale_workers,
    dispatch_worker, claim_via_pool
"""
from __future__ import annotations

import datetime as _dt
import json as _json
import os
import sqlite3
import uuid

__all__ = [
    "register_worker",
    "heartbeat_worker",
    "drain_worker",
    "reap_stale_workers",
    "dispatch_worker",
    "claim_via_pool",
]


def _now_iso(offset_seconds: float = 0.0) -> str:
    """ISO-8601 UTC timestamp with millisecond precision.

    Format: YYYY-MM-DDTHH:MM:SS.mmmZ (matches spec/kernel-schema.sql default).
    Offset allows tests to control "now" for heartbeat / reap_stale assertions.
    """
    base = _dt.datetime(2026, 8, 30, 12, 0, 0, tzinfo=_dt.timezone.utc)
    delta = _dt.timedelta(seconds=offset_seconds)
    full = base + delta
    return full.strftime("%Y-%m-%dT%H:%M:%S.") + f"{full.microsecond // 1000:03d}Z"


def register_worker(
    conn: sqlite3.Connection,
    host: str = "host-test",
    capabilities_json: str = '["web.fetch"]',
    worker_id: str | None = None,
) -> str:
    """Register a worker. Returns worker_id.

    Default worker_id form: '<host>:<pid>:<uuid>' (mirrors §13.2 Q209 decision).
    """
    if worker_id is None:
        pid = os.getpid()
        worker_id = f"{host}:{pid}:{uuid.uuid4().hex[:8]}"
    conn.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at) VALUES (?, ?, ?, 'active', ?)",
        (worker_id, host, capabilities_json, _now_iso()),
    )
    conn.commit()
    return worker_id


def heartbeat_worker(
    conn: sqlite3.Connection, worker_id: str, offset_seconds: float = 5.0
) -> str:
    """Advance worker.last_heartbeat_at. Returns the new timestamp.

    Closes P0-9J: must provide an offset > 0 vs the current value, or the
    trg_worker_heartbeat_renew trigger will ABORT.
    """
    new_ts = _now_iso(offset_seconds=offset_seconds)
    conn.execute(
        "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=? AND status='active'",
        (new_ts, worker_id),
    )
    conn.commit()
    return new_ts


def drain_worker(conn: sqlite3.Connection, worker_id: str) -> str:
    """Transition worker to 'draining'. Returns new status.

    Closes P0-9K: if worker.current_attempt_id points at an already-terminal
    task_attempts row, trg_worker_drain_pause ABORTs. Caller MUST ensure the
    attempt is still active (or NULL) before calling.
    """
    conn.execute(
        "UPDATE workers SET status='draining' WHERE worker_id=? AND status='active'",
        (worker_id,),
    )
    conn.commit()
    return "draining"


def reap_stale_workers(
    conn: sqlite3.Connection,
    now_offset_seconds: float,
    threshold_seconds: int = 30,
) -> int:
    """Mark workers with last_heartbeat_at older than threshold as 'stale'.

    Returns the number of reaped workers.
    """
    cutoff = _now_iso(offset_seconds=now_offset_seconds - threshold_seconds)
    cur = conn.execute(
        "UPDATE workers SET status='stale' "
        "WHERE status='active' AND last_heartbeat_at < ?",
        (cutoff,),
    )
    conn.commit()
    return cur.rowcount


def dispatch_worker(
    conn: sqlite3.Connection,
    task_id: str,
    required_capability: str | None = None,
) -> str:
    """Pick an 'active' worker for the task. Atomic across concurrent writers.

    Strategy (v0.9.2 Q210 + v0.9.4 P1-3 fix): capability-match first, then
    round-robin among eligible workers via per-worker dispatch counts stored
    in harness_meta. BEGIN IMMEDIATE serializes the SELECT+UPSERT to close
    the v0.9.2 lost-update under concurrent callers.

    Returns the worker_id of the eligible worker with the lowest dispatch
    count (ties broken by last_heartbeat_at DESC, then worker_id ASC).
    Raises LookupError if no eligible worker exists.
    Raises RuntimeError if called inside an existing transaction.
    """
    if conn.in_transaction:
        raise RuntimeError(
            "dispatch_worker() must not be called inside an existing transaction; "
            "BEGIN IMMEDIATE inside a transaction would fail or silently no-op"
        )

    rows = conn.execute(
        "SELECT worker_id, capabilities_json FROM workers WHERE status='active'"
    ).fetchall()
    eligible: list[str] = []
    if required_capability:
        for r in rows:
            try:
                caps = _json.loads(r["capabilities_json"])
            except _json.JSONDecodeError:
                continue
            if required_capability in caps:
                eligible.append(r["worker_id"])
    else:
        eligible = [r["worker_id"] for r in rows]
    if not eligible:
        raise LookupError(f"NoWorkerAvailable: no active worker for task {task_id}")

    conn.execute("BEGIN IMMEDIATE")
    try:
        placeholders = ",".join("?" * len(eligible))
        winner_row = conn.execute(
            f"SELECT w.worker_id FROM workers w "
            f"LEFT JOIN harness_meta m "
            f"  ON m.k = 'dispatch:worker:' || w.worker_id "
            f"WHERE w.worker_id IN ({placeholders}) AND w.status = 'active' "
            f"ORDER BY COALESCE(CAST(m.v AS INTEGER), 0) ASC, "
            f"         w.last_heartbeat_at DESC, w.worker_id ASC "
            f"LIMIT 1",
            eligible,
        ).fetchone()
        if winner_row is None:
            conn.rollback()
            raise LookupError(f"NoWorkerAvailable: no eligible worker for task {task_id}")
        winner = winner_row["worker_id"]

        conn.execute(
            "INSERT INTO harness_meta (k, v) VALUES (?, '1') "
            "ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1",
            (f"dispatch:worker:{winner}",),
        )
        conn.commit()
    except sqlite3.Error:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        raise
    return winner


def claim_via_pool(
    conn: sqlite3.Connection,
    task_id: str,
    required_capability: str | None = None,
) -> tuple[str, str]:
    """Composite: dispatch_worker() → claim(task_id, worker_id).

    Returns (attempt_id, worker_id). Canonical v0.9-B entry point for drivers.
    Closes P0-9O: dispatch MUST go through claim(), not bypass it.
    """
    from ._db import claim  # intra-package; avoids sys.path hacks

    worker_id = dispatch_worker(conn, task_id, required_capability=required_capability)
    attempt_id, _fence = claim(conn, task_id, worker_id)
    conn.execute(
        "UPDATE workers SET current_attempt_id=?, last_heartbeat_at=? "
        "WHERE worker_id=?",
        (attempt_id, _now_iso(offset_seconds=15.0), worker_id),
    )
    conn.commit()
    return attempt_id, worker_id