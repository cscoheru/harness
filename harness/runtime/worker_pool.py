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

v1.2.0c (per F13 + ADR 0009 line 68): dispatch() now takes a host_id
parameter and writes it to the new ``dispatches.host_id`` column. The
partial unique index ``idx_dispatches_task_host ON
dispatches(task_id, host_id) WHERE status='active'`` enforces host-id
fencing at the kernel layer; on conflict we raise HostIdFencingError.
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

    def dispatch(self, task_id: str, host_id: str) -> DispatchResult:
        """Pick an active worker (round-robin via harness_meta UPSERT).

        v1.2.0c (per F13 + ADR 0009 line 68): takes a host_id parameter
        and records the dispatch in the new ``dispatches`` table. The
        partial unique index ``idx_dispatches_task_host`` enforces that
        the same task_id cannot have an active dispatch on a different
        host concurrently. On UNIQUE constraint failure, raises
        HostIdFencingError.

        Returns a ``DispatchResult`` with ``strategy='round_robin'`` (Protocol
        surface does not expose ``required_capability``; the
        capability-match path is exercised directly via ``dispatch_worker``
        in spike tests).

        Raises ``NoWorkerAvailable`` (mapped from the underlying ``LookupError``
        raised by ``dispatch_worker``) per the WorkerPool Protocol contract.
        """
        # v1.2.0c per F13: record the dispatch attempt with host_id BEFORE
        # claiming a worker. The partial unique index ensures no two hosts
        # can concurrently dispatch the same task.
        try:
            self._conn.execute(
                "INSERT INTO dispatches (task_id, host_id, status) VALUES (?, ?, 'active')",
                (task_id, host_id),
            )
        except sqlite3.IntegrityError as e:
            # UNIQUE constraint failed: another host already has this task active.
            existing = self._conn.execute(
                "SELECT host_id FROM dispatches WHERE task_id = ? AND status = 'active' LIMIT 1",
                (task_id,),
            ).fetchone()
            existing_host_id = existing[0] if existing else None
            raise HostIdFencingError(
                task_id, host_id, existing_host_id,
                f"partial unique index violation: {e}",
            ) from e

        try:
            worker_id = _dispatch_worker(self._conn, task_id, required_capability=None)
        except LookupError as e:
            # Roll back the dispatch row so we don't leave a stranded fence
            self._conn.execute(
                "UPDATE dispatches SET status='failed', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE task_id=? AND host_id=?",
                (task_id, host_id),
            )
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
        """Composite: dispatch → claim. Returns ``(attempt_id, worker_id)``.

        v1.2.0c (per F13): callers must provide host_id via dispatch() first;
        this composite assumes the wrapper-side has already fenced.
        """
        return _claim_via_pool(self._conn, task_id)

    def _bump(self, seconds: float) -> str:
        self._now_offset += seconds
        return _offset_to_iso(self._now_offset)


class HostIdFencingError(Exception):
    """Raised when a host attempts to dispatch a task_id that already has
    an active dispatch on a different host.

    v1.2.0c (per F13 + ADR 0009 line 68): maps directly to the
    partial unique index ``idx_dispatches_task_host`` violation.
    """

    def __init__(self, task_id: str, host_id: str, existing_host_id: str | None, detail: str) -> None:
        super().__init__(
            f"HostIdFencingError: task_id={task_id} host_id={host_id} "
            f"existing_host_id={existing_host_id} {detail}"
        )
        self.task_id = task_id
        self.host_id = host_id
        self.existing_host_id = existing_host_id