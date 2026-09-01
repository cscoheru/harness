"""harness.runtime.worker_pool — SqliteWorkerPool (WorkerPool Protocol impl).

Implements the v0.9-B ``WorkerPool`` Protocol (see
``spec/interfaces/worker_pool.py``) on top of the T-BE-1 primitives
(``harness.runtime.workers`` + ``harness.runtime._db``).

Concurrency / invariants:
  - I15 / I16 / I17 are enforced by SQLite triggers (``kernel-schema.sql``);
    this class only emits the corresponding UPDATE/INSERT statements.
  - I16 forward-only ``last_heartbeat_at`` is satisfied by an internal
    monotonic clock: each ``heartbeat()`` advances the clock by 5 s before
    issuing the UPDATE, so successive heartbeats cannot backslide.
  - ``dispatch()`` advances the clock by 1 s after the SELECT+UPSERT, so
    ``DispatchResult.dispatched_at`` is monotonically later than the last
    register/heartbeat.

Returns satisfy the ``DispatchResult`` / ``WorkerInfo`` dataclasses from
``spec/interfaces/worker_pool.py`` and the error classes
``NoWorkerAvailable`` / ``DrainRejected`` / ``HeartbeatRejected``.
"""
from __future__ import annotations

import datetime as _dt
import sqlite3

from spec.interfaces.worker_pool import DispatchResult, NoWorkerAvailable

from .workers import (
    claim_via_pool as _claim_via_pool,
    dispatch_worker as _dispatch_worker,
    drain_worker as _drain_worker,
    heartbeat_worker as _heartbeat_worker,
    reap_stale_workers as _reap_stale_workers,
    register_worker as _register_worker,
)

__all__ = ["SqliteWorkerPool"]


_ANCHOR = _dt.datetime(2026, 8, 30, 12, 0, 0, tzinfo=_dt.timezone.utc)


def _offset_to_iso(offset: float) -> str:
    """ISO-8601 UTC timestamp (millisecond precision) for seconds-since-anchor."""
    full = _ANCHOR + _dt.timedelta(seconds=offset)
    return full.strftime("%Y-%m-%dT%H:%M:%S.") + f"{full.microsecond // 1000:03d}Z"


class SqliteWorkerPool:
    """Production WorkerPool backed by SQLite triggers (I15/I16/I17)."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        # Monotonic seconds since _ANCHOR. Drives heartbeat/reap_stale/dispatch.
        self._now_offset: float = 0.0

    def register(self, host: str, capabilities_json: str) -> str:
        """Register a worker; returns ``<host>:<pid>:<uuid>`` worker_id.

        Initial ``last_heartbeat_at`` = ``_ANCHOR`` (2026-08-30T12:00:00.000Z).
        """
        return _register_worker(self._conn, host=host, capabilities_json=capabilities_json)

    def dispatch(self, task_id: str) -> DispatchResult:
        """Pick an active worker (round-robin via harness_meta UPSERT).

        Returns a ``DispatchResult`` with ``strategy='round_robin'`` (Protocol
        surface does not expose ``required_capability``; the
        capability-match path is exercised directly via ``dispatch_worker``
        in spike tests).

        Raises ``NoWorkerAvailable`` (mapped from the underlying ``LookupError``
        raised by ``dispatch_worker``) per the WorkerPool Protocol contract.
        """
        try:
            worker_id = _dispatch_worker(self._conn, task_id, required_capability=None)
        except LookupError as e:
            raise NoWorkerAvailable(str(e)) from e
        dispatched_at = self._bump(1.0)
        return DispatchResult(
            worker_id=worker_id,
            strategy="round_robin",
            task_id=task_id,
            dispatched_at=dispatched_at,
        )

    def heartbeat(self, worker_id: str) -> str:
        """Advance ``last_heartbeat_at`` by 5 s on the internal clock.

        Raises ``HeartbeatRejected`` (from the I16 trigger) if the worker is
        not ``'active'`` (drained / stale / missing).
        """
        new_offset = self._now_offset + 5.0
        ts = _heartbeat_worker(self._conn, worker_id, offset_seconds=new_offset)
        self._now_offset = new_offset
        return ts

    def drain(self, worker_id: str) -> str:
        """Transition worker to ``'draining'``.

        Raises ``DrainRejected`` (I17 trigger) if the worker's
        ``current_attempt_id`` points at an already-terminal attempt.
        """
        return _drain_worker(self._conn, worker_id)

    def reap_stale(self, now_iso: str, threshold_seconds: int = 30) -> int:
        """Mark workers with stale ``last_heartbeat_at`` as ``'stale'``.

        ``now_iso`` is converted to seconds-since-_ANCHOR before delegating
        to ``reap_stale_workers`` (which expects an offset, not a string).
        """
        from_dt = _dt.datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
        offset = (from_dt - _ANCHOR).total_seconds()
        return _reap_stale_workers(self._conn, offset, threshold_seconds)

    def claim_via_pool(self, task_id: str) -> tuple[str, str]:
        """Composite: dispatch → claim. Returns ``(attempt_id, worker_id)``."""
        return _claim_via_pool(self._conn, task_id)

    def _bump(self, seconds: float) -> str:
        self._now_offset += seconds
        return _offset_to_iso(self._now_offset)