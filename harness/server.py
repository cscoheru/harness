"""harness.server — FastAPI daemon for v1.2+ HTTP facade (per ADR 0012).

Exposes 5 routes (per ADR 0012 Decision b):
  POST /api/orch/invoke           — driver-level invoke + SSE stream
  POST /api/orch/cancel/{task_id} — driver interrupt cascade
  GET  /api/orch/list             — active task inventory
  GET  /api/orch/status/{task_id} — single task status
  GET  /api/orch/healthz          — kernel health probe

Lives at /app/harness/server.py inside Docker image.
ENTRYPOINT: python -m harness server (per ADR 0012 Decision a).

Architecture:
  - Lifespan inits SQLite via harness.runtime._db.make_db() (applies
    spec/kernel-schema.sql + force FK=ON) — reuses v1.0 stable helper.
  - DriverInvoke wraps SqliteWorkerPool (read-only) + CodexExecDriver
    (v1.0 stub) — exposes single-step driver-level surface.
  - SSE stream yields driver.handle FIRST (per L48 hidden_handle_pattern
    from v1.2.0j+.12+) so wrapper orchestrator can capture the handle
    for workerModule.interrupt() roundtrip.
  - Multi-step logic stays in wrapper commander.ts (per v1.2.0c D4/D5/D6).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from harness.runtime._db import make_db
from harness.runtime.orch_http import (
    DriverInvoke,
    InterruptRegistry,
    InvokeRequest,
    TaskStatus,
)

KERNEL_VERSION = "1.2.0k"


# ──────────────────────────────────────────────────────────────────────
# Lifespan — init SQLite + DriverInvoke + InterruptRegistry
# ──────────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Init SQLite (apply schema) + InterruptRegistry + DriverInvoke.

    Reuses make_db() from harness.runtime._db (v1.0 stable helper).
    spec/kernel-schema.sql is loaded read-only — Decision d locks spec/
    but make_db() already encapsulates the load.
    """
    db_conn: sqlite3.Connection = make_db()
    interrupt_registry = InterruptRegistry()
    driver_invoke = DriverInvoke(db_conn, interrupt_registry)

    app.state.db_conn = db_conn
    app.state.interrupt_registry = interrupt_registry
    app.state.driver_invoke = driver_invoke

    try:
        yield
    finally:
        # Cleanup: close SQLite connection (interrupt registry is in-memory)
        try:
            db_conn.close()
        except Exception:
            pass


app = FastAPI(
    title="fish-harness kernel HTTP",
    version=KERNEL_VERSION,
    lifespan=lifespan,
)


# ──────────────────────────────────────────────────────────────────────
# POST /api/orch/invoke — driver-level invoke + SSE stream
# ──────────────────────────────────────────────────────────────────────


@app.post("/api/orch/invoke")
async def invoke(req: InvokeRequest, request: Request) -> StreamingResponse:
    """Driver-level invoke; SSE stream of driver.handle/started/finished events.

    Mirror of wrapper kernelInvoke (orchestrator.ts:92-118).
    First event is ALWAYS driver.handle (per L48 pattern).

    Multi-step orchestration is NOT here — kernel is driver-level only.
    Wrapper commander.planStep (orchestrator.ts:330) drives multi-step
    logic; this endpoint is a single-step primitive.
    """
    driver_invoke: DriverInvoke = app.state.driver_invoke

    # Pre-seed tasks row is done inside DriverInvoke.run() because we
    # need to control the task_id (seed_task() auto-generates a uuid).
    # SqliteWorkerPool.dispatch() requires the task_id to exist in tasks
    # table (FK constraint).

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            async for ev in driver_invoke.run(req):
                line = (
                    f"event: {ev['kind']}\n"
                    f"data: {_json_dumps(ev)}\n\n"
                ).encode("utf-8")
                yield line
                if await request.is_disconnected():
                    # Client disconnected mid-stream — trigger interrupt
                    cancel_token = ev.get("cancel_token")
                    if cancel_token:
                        handle = app.state.interrupt_registry.get_handle(cancel_token)
                        if handle is not None:
                            from harness.drivers.codex_exec import CodexExecDriver
                            await CodexExecDriver().interrupt(handle, "client disconnect")
                    break
        except asyncio.CancelledError:
            raise

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _json_dumps(obj: dict) -> str:
    """JSON encode SSE data line — manual to avoid importing json at module top."""
    import json
    return json.dumps(obj, default=str, ensure_ascii=False)


# ──────────────────────────────────────────────────────────────────────
# POST /api/orch/cancel/{task_id} — driver interrupt cascade
# ──────────────────────────────────────────────────────────────────────


@app.post("/api/orch/cancel/{task_id}")
async def cancel(task_id: str) -> JSONResponse:
    """Cancel an active task by task_id; cascade driver.interrupt.

    Mirror of wrapper cancel chain (orchestrator.ts:556-573). Returns
    404 if task not in InterruptRegistry (per L45 idempotent guard).
    """
    interrupt_registry: InterruptRegistry = app.state.interrupt_registry
    cancel_token = interrupt_registry.get_token(task_id)
    if cancel_token is None:
        raise HTTPException(
            status_code=404,
            detail=f"task {task_id} not found in InterruptRegistry",
        )

    handle = interrupt_registry.get_handle(cancel_token)
    if handle is not None:
        from harness.drivers.codex_exec import CodexExecDriver
        await CodexExecDriver().interrupt(handle, "user cancel")

    # Update status snapshot if present
    driver_invoke: DriverInvoke = app.state.driver_invoke
    status = await driver_invoke.get_status(task_id)
    if status is not None:
        status.status = "cancelled"

    return JSONResponse({"task_id": task_id, "status": "cancelled"})


# ──────────────────────────────────────────────────────────────────────
# GET /api/orch/list — active task inventory
# ──────────────────────────────────────────────────────────────────────


@app.get("/api/orch/list")
async def list_tasks() -> JSONResponse:
    """List all known task status snapshots.

    Mirror of wrapper pwa_server /api/orch/list route (j+.9+ commit 31fca58).
    """
    driver_invoke: DriverInvoke = app.state.driver_invoke
    tasks = await driver_invoke.list_tasks()
    return JSONResponse([t.model_dump() for t in tasks])


# ──────────────────────────────────────────────────────────────────────
# GET /api/orch/status/{task_id} — single task status
# ──────────────────────────────────────────────────────────────────────


@app.get("/api/orch/status/{task_id}")
async def status(task_id: str) -> JSONResponse:
    """Single task status snapshot.

    Mirror of wrapper kernelStatus (orchestrator.ts:130-149).
    """
    driver_invoke: DriverInvoke = app.state.driver_invoke
    s = await driver_invoke.get_status(task_id)
    if s is None:
        raise HTTPException(status_code=404, detail=f"task {task_id} not found")
    return JSONResponse(s.model_dump())


# ──────────────────────────────────────────────────────────────────────
# GET /api/orch/healthz — kernel health probe
# ──────────────────────────────────────────────────────────────────────


@app.get("/api/orch/healthz")
async def healthz() -> JSONResponse:
    """Kernel health probe.

    Mirror of wrapper health() stub (orchestrator.ts:189-206).
    Returns kernel version, PID, active task count.
    """
    interrupt_registry: InterruptRegistry = app.state.interrupt_registry
    return JSONResponse({
        "status": "ok",
        "version": KERNEL_VERSION,
        "kernel_pid": os.getpid(),
        "active_tasks": len(interrupt_registry),
    })


# ──────────────────────────────────────────────────────────────────────
# CLI entry point (for `python -m harness server`)
# ──────────────────────────────────────────────────────────────────────


def _parse_server_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m harness server",
        description="Launch fish-harness kernel HTTP daemon (per ADR 0012).",
    )
    parser.add_argument("--host", default="0.0.0.0", help="bind host (default 0.0.0.0)")
    parser.add_argument("--port", type=int, default=4001, help="bind port (default 4001)")
    parser.add_argument("--reload", action="store_true", help="reload on code change (dev only)")
    return parser.parse_args(argv)


def main_server(argv: Optional[list[str]] = None) -> None:
    """Launch uvicorn with the FastAPI app.

    Called by harness.__main__ when invoked as `python -m harness server`.
    """
    import uvicorn
    args = _parse_server_args(argv)
    uvicorn.run(
        "harness.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


# Runtime Protocol conformance self-check (only when invoked directly).
if __name__ == "__main__":  # pragma: no cover
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "server":
        main_server(sys.argv[2:])
    else:
        print(f"fish-harness kernel HTTP {KERNEL_VERSION} — use 'server' subcommand to launch")
