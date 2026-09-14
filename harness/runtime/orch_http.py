"""harness.runtime.orch_http — driver-level HTTP wrapper (per ADR 0012).

Wraps the v1.0-stable ``harness.runtime.worker_pool.SqliteWorkerPool``
(read-only — Decision d NOT lift worker_pool.py) and
``harness.drivers.codex_exec.CodexExecDriver`` into an async
DriverInvoke surface suitable for SSE streaming to wrapper clients.

Multi-step orchestration logic is NOT here — it lives in
``wrapper/orchestrator/commander.ts`` (per v1.2.0c D4/D5/D6 cross-host
dispatch + MacBook + host-id fencing). Kernel HTTP daemon only exposes
the **driver-level** primitives; multi-step coordination stays
wrapper-side where the planner/aggregateResults logic is.

Type alignment: This module imports the canonical ``spec.RunRequest`` /
``spec.RunHandle`` / ``spec.DriverEvent`` from
``spec.interfaces.execution_driver``. Pydantic ``InvokeRequest`` is the
HTTP-layer model; conversion happens in ``DriverInvoke.run()``.

Contract:
  - DriverInvoke.run(req) yields DriverEvent stream:
      driver.handle → driver.started → driver.output_chunk* →
      driver.finished | driver.failed | driver.interrupted
  - First event is ALWAYS driver.handle (per wrapper orchestrator.ts
    L346-364 contract — see v1.2.0j+.12+ L48 hidden_handle_pattern)
  - InterruptRegistry maps task_id → cancel_token → handle for cancel
    cascade via InterruptRegistry.interrupt(task_id, reason)

Lives at /app/harness/runtime/orch_http.py inside Docker image.
"""
from __future__ import annotations

import asyncio
import sqlite3
import uuid
from dataclasses import asdict
from typing import AsyncIterator, Optional

from pydantic import BaseModel, Field

from spec.interfaces.execution_driver import (
    DriverCapabilities,
    DriverEvent as SpecDriverEvent,
    DriverEventKind,
    DriverKind,
    RunHandle as SpecRunHandle,
    RunRequest as SpecRunRequest,
)

from ..drivers.codex_exec import CodexExecDriver

__all__ = [
    "DriverInvoke",
    "InterruptRegistry",
    "InvokeRequest",
    "TaskStatus",
]


# ──────────────────────────────────────────────────────────────────────
# HTTP-layer models (Pydantic — for FastAPI request/response)
# ──────────────────────────────────────────────────────────────────────


class InvokeRequest(BaseModel):
    """Pydantic model for POST /api/orch/invoke request body.

    Mirror of wrapper RunRequest (orchestrator.ts:47-65). Field names
    match wrapper exactly so JSON serialization is symmetric across the
    wrapper → kernel HTTP boundary.
    """

    task_id: str
    workflow_pack: str = "worker"
    workflow_version: str = "1.2.0k"
    input_blob_id: Optional[str] = None
    capability_profile: dict
    lease_token: str
    fence_version: int
    metadata: dict = Field(default_factory=dict)
    prompt: str = ""
    model_class: str = "worker"
    host_id: str = "kernel-http"


class TaskStatus(BaseModel):
    """Status snapshot returned by GET /api/orch/status/{task_id}."""

    task_id: str
    status: str  # pending | dispatched | running | completed | failed | cancelled
    attempt_id: Optional[str] = None
    cancel_token: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    result_text: Optional[str] = None
    error: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────
# InterruptRegistry — in-memory cancel cascade (per L48 pattern)
# ──────────────────────────────────────────────────────────────────────


class InterruptRegistry:
    """In-memory Map<cancel_token, SpecRunHandle> + Map<task_id, cancel_token>.

    Mirror of wrapper _activeHandles (orchestrator.ts:58) + cancel chain
    (orchestrator.ts:556-573). Per L45 idempotent_guard_pattern + L48
    hidden_handle_pattern — safe to call interrupt() multiple times.
    """

    def __init__(self) -> None:
        self._by_token: dict[str, SpecRunHandle] = {}
        self._by_task: dict[str, str] = {}

    def register(self, handle: SpecRunHandle, task_id: str) -> None:
        self._by_token[handle.cancel_token] = handle
        self._by_task[task_id] = handle.cancel_token

    def unregister(self, cancel_token: str) -> None:
        self._by_token.pop(cancel_token, None)
        # task_id → cancel_token reverse-map: lookup via stored task_id
        for tid, tok in list(self._by_task.items()):
            if tok == cancel_token:
                self._by_task.pop(tid)
                break

    def get_token(self, task_id: str) -> Optional[str]:
        return self._by_task.get(task_id)

    def get_handle(self, cancel_token: str) -> Optional[SpecRunHandle]:
        return self._by_token.get(cancel_token)

    def __len__(self) -> int:
        return len(self._by_token)


# ──────────────────────────────────────────────────────────────────────
# DriverInvoke — driver-level single-step orchestrator
# ──────────────────────────────────────────────────────────────────────


class DriverInvoke:
    """Driver-level invoke orchestrator (per ADR 0012 Decision b).

    Single-step: dispatch via SqliteWorkerPool, invoke CodexExecDriver,
    yield DriverEvent stream. Multi-step coordination is the wrapper
    commander's job (commander.ts planStep + aggregateResults).
    """

    def __init__(
        self,
        db_conn: sqlite3.Connection,
        interrupt_registry: InterruptRegistry,
    ) -> None:
        self._db_conn = db_conn
        self._registry = interrupt_registry
        self._tasks: dict[str, TaskStatus] = {}

    def _to_spec_run_request(
        self,
        req: InvokeRequest,
        attempt_id: str,
        driver_kind: DriverKind,
    ) -> SpecRunRequest:
        """Build spec.RunRequest from HTTP InvokeRequest."""
        capability = DriverCapabilities(
            driver_kind=driver_kind,
            evidence_uri="file://harness/drivers/evidence-exec-stub.json",
            max_concurrent_attempts=1,
            # v1.2.0k.2: flip to True so SpecRunRequest carries the
            # streaming capability through the kernel HTTP pipeline.
            # Mirrors StubDriverBase.capability() in harness/drivers/_stub.py.
            supports_streaming=True,
            supports_interrupt=True,
            supports_heartbeat=True,
            supports_tool_gateway=False,
            notes="v1.0 stub; real codex exec subprocess deferred to v1.1",
        )
        return SpecRunRequest(
            attempt_id=attempt_id,
            task_id=req.task_id,
            workflow_pack=req.workflow_pack,
            workflow_version=req.workflow_version,
            input_blob_id=req.input_blob_id,
            capability_profile=capability,
            lease_token=req.lease_token,
            fence_version=req.fence_version,
            metadata=req.metadata,
        )

    def _to_http_event(self, ev: SpecDriverEvent, cancel_token: str) -> dict:
        """Convert spec DriverEvent to HTTP SSE JSON payload.

        Inject cancel_token into payload so wrapper orchestrator can
        call workerModule.interrupt(handle, reason) — per L48
        hidden_handle_pattern (yield handle in first event; consumer
        captures it for interrupt() roundtrip).
        """
        return {
            "kind": ev.kind.value if isinstance(ev.kind, DriverEventKind) else str(ev.kind),
            "attempt_id": ev.attempt_id,
            "cancel_token": cancel_token,
            "payload": dict(ev.payload) if ev.payload else {},
        }

    async def run(self, req: InvokeRequest) -> AsyncIterator[dict]:
        """Yield SSE-ready dict events for a single driver invocation.

        Stream shape (per L48 pattern):
          1. driver.handle — exposes RunHandle BEFORE driver.started
          2. driver.started — worker is now executing
          3. driver.output_chunk* — incremental output (if streaming)
          4. driver.finished | driver.failed | driver.interrupted — terminal
        """
        # Pre-seed tasks row in SQLite so dispatches table FK is satisfied
        # if downstream code ever records a dispatch. Direct INSERT gives
        # us deterministic task_id (vs seed_task() which auto-generates a uuid).
        try:
            self._db_conn.execute(
                "INSERT INTO tasks (task_id, tenant_id, workflow_pack, "
                "  workflow_version, status) VALUES (?, 't1', ?, ?, 'pending')",
                (req.task_id, req.workflow_pack, req.workflow_version),
            )
            self._db_conn.commit()
        except Exception:
            # task_id already exists or other UNIQUE collision — idempotent
            pass

        attempt_id = f"atp-{req.task_id}-{uuid.uuid4().hex[:8]}"
        cancel_token = f"drv-{uuid.uuid4().hex}"
        driver_kind_str = req.capability_profile.get("driver_kind", "codex_exec")
        try:
            driver_kind = DriverKind(driver_kind_str)
        except ValueError:
            driver_kind = DriverKind.CODEX_EXEC
        spec_handle = SpecRunHandle(
            driver_kind=driver_kind,
            attempt_id=attempt_id,
            cancel_token=cancel_token,
        )

        # 1. Yield driver.handle FIRST (per wrapper orchestrator.ts L346-364 + L48)
        yield {
            "kind": "driver.handle",
            "attempt_id": attempt_id,
            "cancel_token": cancel_token,
            "payload": {
                "handle": {
                    "driver_kind": driver_kind.value,
                    "attempt_id": attempt_id,
                    "cancel_token": cancel_token,
                },
            },
        }
        self._registry.register(spec_handle, req.task_id)

        # Initialize status snapshot
        self._tasks[req.task_id] = TaskStatus(
            task_id=req.task_id,
            status="dispatched",
            attempt_id=attempt_id,
            cancel_token=cancel_token,
        )

        try:
            # Driver-level single-step: invoke CodexExecDriver directly
            # (per ADR 0012 Decision b — kernel is driver-level only).
            # Multi-step / cross-host dispatch is wrapper commander's job
            # (per v1.2.0c D4/D5/D6 + host-id fencing).
            started_at = _now_iso()
            worker_id = f"stub-{req.host_id}"

            # Yield driver.started (mirror wrapper execution_driver.ts L160)
            yield {
                "kind": "driver.started",
                "attempt_id": attempt_id,
                "cancel_token": cancel_token,
                "payload": {
                    "driver_kind": driver_kind.value,
                    "worker_id": worker_id,
                    "started_at": started_at,
                    "model": req.model_class,
                    "host_id": req.host_id,
                },
            }
            self._tasks[req.task_id].status = "running"
            self._tasks[req.task_id].started_at = started_at

            # Drive via CodexExecDriver (v1.0 stub — yields STARTED + FINISHED)
            driver = CodexExecDriver()
            spec_request = self._to_spec_run_request(req, attempt_id, driver_kind)
            try:
                async for ev in driver.run(spec_request):
                    yield self._to_http_event(ev, cancel_token)
                    if ev.kind in (DriverEventKind.FINISHED, DriverEventKind.FAILED):
                        if ev.kind == DriverEventKind.FINISHED:
                            self._tasks[req.task_id].status = "completed"
                            self._tasks[req.task_id].result_text = ev.payload.get("status", "")
                        else:
                            self._tasks[req.task_id].status = "failed"
                            self._tasks[req.task_id].error = str(ev.payload)
                        self._tasks[req.task_id].finished_at = _now_iso()
            except asyncio.CancelledError:
                yield {
                    "kind": "driver.interrupted",
                    "attempt_id": attempt_id,
                    "cancel_token": cancel_token,
                    "payload": {"reason": "client disconnect"},
                }
                self._tasks[req.task_id].status = "cancelled"
                raise
            except Exception as e:
                yield {
                    "kind": "driver.failed",
                    "attempt_id": attempt_id,
                    "cancel_token": cancel_token,
                    "payload": {"error": str(e)},
                }
                self._tasks[req.task_id].status = "failed"
                self._tasks[req.task_id].error = str(e)
        finally:
            self._registry.unregister(cancel_token)

    async def list_tasks(self) -> list[TaskStatus]:
        """GET /api/orch/list — return all known task snapshots."""
        return list(self._tasks.values())

    async def get_status(self, task_id: str) -> Optional[TaskStatus]:
        """GET /api/orch/status/{task_id} — single task snapshot."""
        return self._tasks.get(task_id)


def _now_iso() -> str:
    """ISO-8601 UTC timestamp for finished_at snapshots."""
    import datetime as _dt
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{_dt.datetime.now(_dt.timezone.utc).microsecond // 1000:03d}Z"
