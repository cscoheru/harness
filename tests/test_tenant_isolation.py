"""Tenant isolation tests (v1.2.0k.3 P0 SECURITY).

Locks in the tenant-scoping invariant:

  - DriverInvoke.run(req) writes the task under ``req.tenant_id`` in
    the in-memory ``_tasks`` dict AND in the SQLite ``tasks`` row.
  - DriverInvoke.list_tasks(tenant_id) returns ONLY tasks whose
    ``tenant_id`` matches — never another tenant's data.
  - ``InvokeRequest`` (Pydantic) refuses construction without
    ``tenant_id`` so callers cannot silently opt out.

These tests guard the multi-tenant SaaS invariant for v1.2.0k.3+.
The same isolation is enforced server-side via the X-Tenant-ID header
in ``harness/server.py:list_tasks``; this file locks the in-process
behavior so a future refactor cannot regress it without test failure.
"""
from __future__ import annotations

import sqlite3

import pytest
from pydantic import ValidationError

from harness.runtime.orch_http import (
    DriverInvoke,
    InterruptRegistry,
    InvokeRequest,
    TaskStatus,
)


@pytest.fixture
def inv(conn: sqlite3.Connection) -> DriverInvoke:
    """Fresh DriverInvoke backed by an isolated in-memory SQLite."""
    return DriverInvoke(conn, InterruptRegistry())


def _request(
    task_id: str, tenant_id: str, *, workflow_pack: str = "web_research"
) -> InvokeRequest:
    """Build a minimal InvokeRequest for the given task/tenant pair."""
    return InvokeRequest(
        task_id=task_id,
        tenant_id=tenant_id,
        workflow_pack=workflow_pack,
        workflow_version="1.0.0",
        capability_profile={"driver_kind": "codex_exec"},
        lease_token="lease-tenant-iso",
        fence_version=1,
        prompt="tenant isolation test",
        model_class="worker",
    )


# ─── T1: list_tasks("tenant-A") returns only tenant-A tasks ─────────────
def test_list_tasks_returns_only_matching_tenant(inv: DriverInvoke) -> None:
    """Seeds 2 tasks for tenant-A and 1 for tenant-B, asserts isolation."""
    import asyncio

    async def seed() -> None:
        for tid in ("task-A1", "task-A2"):
            async for _ in inv.run(_request(tid, "tenant-A")):
                pass
        async for _ in inv.run(_request("task-B1", "tenant-B")):
            pass

    asyncio.run(seed())

    async def gather() -> tuple[list[TaskStatus], list[TaskStatus]]:
        return (
            await inv.list_tasks("tenant-A"),
            await inv.list_tasks("tenant-B"),
        )

    a, b = asyncio.run(gather())
    a_ids = sorted(t.task_id for t in a)
    b_ids = sorted(t.task_id for t in b)
    assert a_ids == ["task-A1", "task-A2"], f"tenant-A leak: {a_ids}"
    assert b_ids == ["task-B1"], f"tenant-B leak: {b_ids}"


# ─── T2: unknown tenant returns empty list (no leak) ────────────────────
def test_list_tasks_unknown_tenant_returns_empty(inv: DriverInvoke) -> None:
    """A caller asking for a tenant that owns no tasks gets [], not others."""
    import asyncio

    async def seed() -> None:
        async for _ in inv.run(_request("task-X", "tenant-X")):
            pass

    asyncio.run(seed())

    async def gather() -> list[TaskStatus]:
        return await inv.list_tasks("tenant-NEVER-SEEN")

    result = asyncio.run(gather())
    assert result == [], f"unknown tenant must see empty list, got {result}"


# ─── T3: InvokeRequest without tenant_id → ValidationError ──────────────
def test_invoke_request_rejects_missing_tenant_id() -> None:
    """Pydantic MUST refuse construction without tenant_id.

    This is the primary defense: callers cannot bypass tenant scoping
    by omitting the field. Server-side (FastAPI) translates the
    ValidationError to HTTP 422.
    """
    with pytest.raises(ValidationError) as exc_info:
        InvokeRequest(
            task_id="task-no-tenant",
            workflow_pack="web_research",
            workflow_version="1.0.0",
            capability_profile={"driver_kind": "codex_exec"},
            lease_token="lease-x",
            fence_version=1,
            prompt="no tenant",
            model_class="worker",
        )
    assert "tenant_id" in str(exc_info.value)


# ─── T4: run() tags TaskStatus with the right tenant_id ─────────────────
def test_run_writes_task_under_correct_tenant(inv: DriverInvoke) -> None:
    """After run() completes, TaskStatus.tenant_id == req.tenant_id."""
    import asyncio

    async def drain() -> None:
        async for _ in inv.run(_request("task-tenant-tag", "tenant-Z")):
            pass

    asyncio.run(drain())

    async def status() -> TaskStatus | None:
        return await inv.get_status("task-tenant-tag")

    s = asyncio.run(status())
    assert s is not None, "task snapshot missing after run()"
    assert s.tenant_id == "tenant-Z", (
        f"TaskStatus.tenant_id must equal req.tenant_id, got {s.tenant_id}"
    )


# ─── T5: list_tasks across many tenants returns per-tenant partitions ────
def test_list_tasks_partition_across_tenants(inv: DriverInvoke) -> None:
    """Seed 3 tasks per tenant for 3 tenants; each list call returns
    exactly the 3 tasks for that tenant — no overlap."""
    import asyncio

    async def seed() -> None:
        for tenant in ("acme", "globex", "initech"):
            for n in range(3):
                async for _ in inv.run(
                    _request(f"{tenant}-task-{n}", tenant)
                ):
                    pass

    asyncio.run(seed())

    async def gather() -> dict[str, list[str]]:
        return {
            tenant: sorted(t.task_id for t in await inv.list_tasks(tenant))
            for tenant in ("acme", "globex", "initech")
        }

    partitions = asyncio.run(gather())
    assert partitions == {
        "acme": ["acme-task-0", "acme-task-1", "acme-task-2"],
        "globex": ["globex-task-0", "globex-task-1", "globex-task-2"],
        "initech": ["initech-task-0", "initech-task-1", "initech-task-2"],
    }, f"cross-tenant partition failure: {partitions}"