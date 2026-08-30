"""WorkerPool — v0.9-B load balancing.

File: spec/interfaces/worker_pool.py
Version: v0.9-B

Layer model (see spec/worker-pool.md):
  L0 task_dispatch    dispatch(task_id) -> worker_id
  L1 worker_lifecycle register / heartbeat / drain
  L2 cross_server     shared SQLite WAL + partial unique index enforces I15
  L3 graceful_drain   drain pauses dispatch; active attempts complete naturally

I15 (per-worker one active attempt), I16 (heartbeat advances), and I17 (drain
stale-pointer rejection) are enforced by SQLite triggers; the Protocol here is
the public surface that drivers and WorkerPool implementations satisfy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable


class WorkerPoolError(Exception):
    """Base for worker-pool errors."""


class NoWorkerAvailable(WorkerPoolError):
    """Raised when dispatch() cannot find an eligible worker.

    Either there are no 'active' workers, or none match the task's required
    capabilities.
    """


class DrainRejected(WorkerPoolError):
    """Raised when drain() is invoked on a worker whose current_attempt_id
    points at an already-terminal attempt (I17 trigger backstop).

    Mirrors the SQLite trigger trg_worker_drain_pause rejection.
    """


class HeartbeatRejected(WorkerPoolError):
    """Raised when heartbeat() does not advance last_heartbeat_at (I16)."""


@dataclass(frozen=True)
class WorkerInfo:
    worker_id: str
    host: str
    capabilities_json: str
    status: str
    last_heartbeat_at: str
    current_attempt_id: Optional[str]
    registered_at: str
    drained_at: Optional[str]


@dataclass(frozen=True)
class DispatchResult:
    worker_id: str
    strategy: str            # 'capability_match' | 'round_robin'
    task_id: str
    dispatched_at: str


@runtime_checkable
class WorkerPool(Protocol):
    """Dispatch tasks to workers; track worker lifecycle; enforce I15-I18.

    Invariants enforced:
      - dispatch() picks an 'active' worker that has the task's required
        capabilities (or round-robin fallback).
      - heartbeat() advances last_heartbeat_at (I16).
      - drain() pauses dispatch for the worker; active attempts complete naturally.
      - claim_via_pool() is the canonical entry point: dispatch() + claim().
    """

    def register(self, host: str, capabilities_json: str) -> str:
        """Register a new worker. Returns worker_id (e.g. '<host>:<pid>:<uuid>').
        Initial status is 'active'; last_heartbeat_at is set to now.
        """
        ...

    def dispatch(self, task_id: str) -> DispatchResult:
        """Pick a worker for the task. Strategy: capability-match first
        (workers.capabilities_json contains task.required_capabilities),
        then round-robin among 'active' workers. Raises NoWorkerAvailable
        if no eligible worker exists.
        """
        ...

    def heartbeat(self, worker_id: str) -> str:
        """Advance worker.last_heartbeat_at; emits worker.heartbeat event.
        Returns the new last_heartbeat_at ISO timestamp.
        Raises HeartbeatRejected if the worker is not 'active'.
        """
        ...

    def drain(self, worker_id: str) -> str:
        """Move worker to 'draining'; kernel stops dispatching to it. Active
        attempts continue to completion (I17: no kill). Raises DrainRejected
        if current_attempt_id points at an already-terminal attempt.
        Returns the worker's new status.
        """
        ...

    def reap_stale(self, now_iso: str, threshold_seconds: int = 30) -> int:
        """Mark workers with last_heartbeat_at older than threshold as 'stale'.
        Returns count of reaped workers. Stale workers are excluded from
        dispatch but kept in the table for audit.
        """
        ...

    def claim_via_pool(self, task_id: str) -> tuple[str, str]:
        """Composite: dispatch(task_id) → claim(task_id, worker_id).
        Returns (attempt_id, worker_id). The canonical entry point for
        v0.9-B+ drivers. Composes with the v0.7-v0.8 claim() invariant set.
        """
        ...


def assert_satisfies_pool(obj: object) -> None:
    """Runtime assertion helper for the Protocol.

    Mirrors assert_satisfies_distiller / assert_satisfies_pdp / etc.
    """
    if not isinstance(obj, WorkerPool):
        raise AssertionError(
            f"object {obj!r} does not satisfy WorkerPool Protocol"
        )