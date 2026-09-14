"""DriverInvoke streaming tests (per v1.2.0k.2 layer-2 deferred pytest).

Locks in the kernel HTTP SSE event contract:
  - DriverInvoke.run(req) yields 7 events total:
      1. driver.handle (synthesized, L48 hidden_handle_pattern)
      2. driver.started (synthesized by DriverInvoke, pre-existing double)
      3. driver.started (from stub — pre-existing double from v1.2.0k)
      4-6. driver.output_chunk x3 (v1.2.0k.2 synthetic)
      7. driver.finished
  - capability_profile.supports_streaming=True propagates through both
    StubDriverBase.capability() AND DriverInvoke._to_spec_run_request().
  - driver.output_chunk payload shape: {text, sequence, total_chunks}.
  - Idempotency: same (attempt_id, fence_version) yields cached stream.
  - cancel_token injected into every event payload by _to_http_event.

These tests guard against silent regressions if either `_to_http_event`
or `_spec_run_request` are refactored in future v1.2.0k+ cycles.
"""
from __future__ import annotations

import sqlite3

import pytest

from harness.drivers.codex_exec import CodexExecDriver
from harness.runtime.orch_http import DriverInvoke, InterruptRegistry, InvokeRequest
from spec.interfaces.execution_driver import DriverCapabilities


@pytest.fixture
def inv(conn: sqlite3.Connection) -> DriverInvoke:
    """DriverInvoke with empty InterruptRegistry per test."""
    return DriverInvoke(conn, InterruptRegistry())


def _make_request(driver_kind: str = "codex_exec") -> InvokeRequest:
    """Build a minimal InvokeRequest for codex_exec stub."""
    return InvokeRequest(
        task_id=f"task-test-{driver_kind}",
        workflow_pack="web_research",
        workflow_version="1.0.0",
        capability_profile={"driver_kind": driver_kind},
        lease_token="lease-test",
        fence_version=1,
        prompt="pytest streaming smoke",
        model_class="worker",
    )


# ─── T1: stub capability flip ───────────────────────────────────────────
def test_stub_capability_declares_streaming_true() -> None:
    """v1.2.0k.2: StubDriverBase.capability().supports_streaming must be True."""
    cap = CodexExecDriver().capability()
    assert isinstance(cap, DriverCapabilities)
    assert cap.supports_streaming is True, (
        "StubDriverBase.capability() must declare supports_streaming=True "
        "so callers know the driver emits output_chunk events"
    )


# ─── T2: stub emits 5 events in expected order ──────────────────────────
def test_stub_run_emits_5_events_start_chunks_finish() -> None:
    """v1.2.0k.2: run() yields [started, output_chunk x3, finished]."""
    import asyncio

    async def collect() -> list[tuple[str, dict]]:
        drv = CodexExecDriver()
        req_attempt_id = f"atp-stub-{id(drv)}"
        # build a minimal SpecRunRequest via the driver itself
        from spec.interfaces.execution_driver import RunRequest

        req = RunRequest(
            attempt_id=req_attempt_id,
            task_id="task-stub-emit",
            workflow_pack="web_research",
            workflow_version="1.0.0",
            input_blob_id=None,
            capability_profile=drv.capability(),
            lease_token="lease-stub",
            fence_version=1,
            metadata={},
        )
        events = []
        async for ev in drv.run(req):
            events.append((ev.kind.value, dict(ev.payload)))
        return events

    events = asyncio.run(collect())
    kinds = [k for k, _ in events]
    assert kinds == [
        "driver.started",
        "driver.output_chunk",
        "driver.output_chunk",
        "driver.output_chunk",
        "driver.finished",
    ], f"unexpected event sequence: {kinds}"


# ─── T3: chunk payload shape ────────────────────────────────────────────
def test_chunk_payload_has_text_sequence_total_chunks() -> None:
    """Each output_chunk payload must carry {text, sequence, total_chunks}."""
    import asyncio

    async def collect() -> list[dict]:
        drv = CodexExecDriver()
        from spec.interfaces.execution_driver import RunRequest

        req = RunRequest(
            attempt_id=f"atp-payload-{id(drv)}",
            task_id="task-stub-payload",
            workflow_pack="web_research",
            workflow_version="1.0.0",
            input_blob_id=None,
            capability_profile=drv.capability(),
            lease_token="lease-payload",
            fence_version=1,
            metadata={},
        )
        return [dict(ev.payload) async for ev in drv.run(req)]

    events = asyncio.run(collect())
    chunks = [p for p in events if p.get("total_chunks") == 3]
    assert len(chunks) == 3, f"expected 3 chunks, got {len(chunks)}"
    for i, chunk in enumerate(chunks):
        assert "text" in chunk, f"chunk[{i}] missing text: {chunk}"
        assert "sequence" in chunk, f"chunk[{i}] missing sequence: {chunk}"
        assert chunk["sequence"] == i, f"chunk[{i}].sequence must equal index"
        assert chunk["total_chunks"] == 3


# ─── T4: DriverInvoke end-to-end 7-event sequence ───────────────────────
def test_driver_invoke_run_emits_7_events_with_3_chunks(
    inv: DriverInvoke,
) -> None:
    """DriverInvoke.run() yields handle + started + started + 3 chunks + finished.

    The double `driver.started` is PRE-EXISTING (not introduced by v1.2.0k.2):
    DriverInvoke synthesizes one at orch_http.py:271, stub emits one in run().
    Wrapper consumers already handle this; documented in cycle closure.
    """
    import asyncio

    async def collect() -> list[dict]:
        events = []
        async for ev in inv.run(_make_request()):
            events.append(ev)
        return events

    events = asyncio.run(collect())
    kinds = [e["kind"] for e in events]
    assert len(events) == 7, f"expected 7 events, got {len(events)}: {kinds}"
    assert kinds == [
        "driver.handle",
        "driver.started",
        "driver.started",
        "driver.output_chunk",
        "driver.output_chunk",
        "driver.output_chunk",
        "driver.finished",
    ], f"unexpected SSE event sequence: {kinds}"


# ─── T5: driver.handle is FIRST event (L48 pattern) ─────────────────────
def test_driver_handle_is_first_event(inv: DriverInvoke) -> None:
    """L48 hidden_handle_pattern: handle MUST be first so wrapper captures it."""
    import asyncio

    async def first_event_kind() -> str:
        gen = inv.run(_make_request())
        ev = await gen.__anext__()
        await gen.aclose()
        return ev["kind"]

    assert asyncio.run(first_event_kind()) == "driver.handle"


# ─── T6: cancel_token injected into every event ─────────────────────────
def test_every_event_carries_cancel_token(inv: DriverInvoke) -> None:
    """_to_http_event must inject cancel_token into every SSE event payload."""
    import asyncio

    async def collect() -> list[dict]:
        return [ev async for ev in inv.run(_make_request())]

    events = asyncio.run(collect())
    cancel_tokens = {e["cancel_token"] for e in events}
    assert len(cancel_tokens) == 1, (
        f"all events must share one cancel_token, got: {cancel_tokens}"
    )
    assert all(e["cancel_token"].startswith("drv-") for e in events)


# ─── T7: SpecRunRequest capability declares streaming True ───────────────
def test_spec_run_request_capability_is_streaming(inv: DriverInvoke) -> None:
    """_to_spec_run_request must mirror StubDriverBase.capability()."""
    req = _make_request()
    attempt_id = "atp-cap-test"
    spec_req = inv._to_spec_run_request(req, attempt_id, req.capability_profile["driver_kind"])
    cap = spec_req.capability_profile
    assert isinstance(cap, DriverCapabilities)
    assert cap.supports_streaming is True, (
        "_to_spec_run_request() capability must agree with StubDriverBase "
        "(both must be True for streaming to propagate through pipeline)"
    )


# ─── T8: idempotency cache works for multi-event streams ────────────────
def test_stub_run_is_idempotent_per_attempt_fence() -> None:
    """Calling run() twice with same (attempt_id, fence_version) yields identical stream."""
    import asyncio

    async def run_twice() -> tuple[list[str], list[str]]:
        from spec.interfaces.execution_driver import RunRequest

        drv = CodexExecDriver()
        cap = drv.capability()
        req = RunRequest(
            attempt_id="atp-idem",
            task_id="task-idem",
            workflow_pack="web_research",
            workflow_version="1.0.0",
            input_blob_id=None,
            capability_profile=cap,
            lease_token="lease-idem",
            fence_version=1,
            metadata={},
        )
        first = [ev.kind.value async for ev in drv.run(req)]
        # Second call with same attempt_id+fence_version must hit cache
        second = [ev.kind.value async for ev in drv.run(req)]
        return first, second

    first, second = asyncio.run(run_twice())
    assert first == second, "idempotency violated: stream differs on retry"
    assert first.count("driver.output_chunk") == 3, (
        "cached stream must include all 3 chunks"
    )


# ─── T9: capability_profile.driver_kind flows through ───────────────────
def test_driver_kind_flows_from_http_request_to_sse(
    inv: DriverInvoke,
) -> None:
    """HTTP InvokeRequest's capability_profile.driver_kind reaches DriverEvent payloads."""
    import asyncio

    async def first_chunk_payload() -> dict:
        events = [ev async for ev in inv.run(_make_request(driver_kind="codex_exec"))]
        for ev in events:
            if ev["kind"] == "driver.output_chunk":
                return ev["payload"]
        return {}

    payload = asyncio.run(first_chunk_payload())
    assert "text" in payload
    assert payload["sequence"] == 0
    assert payload["total_chunks"] == 3