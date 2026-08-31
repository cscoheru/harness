"""harness.drivers._stub — shared stub base for v1.0 Codex drivers.

Both ``CodexSdkDriver`` and ``CodexExecDriver`` inherit this so they only
need to fix ``driver_kind`` + ``evidence_uri``. ``run()`` caches the
event stream by ``(attempt_id, fence_version)`` so a duplicate call
returns the same events rather than re-running side effects (per the
Protocol's idempotency contract).

The driver body itself NEVER spawns a subprocess, NEVER opens a
network socket, and NEVER imports the Codex SDK. Real Codex integration
is deferred to v1.1 per the GA plan §2 T-TG-4 contract.
"""
from __future__ import annotations

from typing import AsyncIterator, Optional

from spec.interfaces.execution_driver import (
    DriverCapabilities,
    DriverEvent,
    DriverEventKind,
    DriverKind,
    ExecutionDriver,
    RunHandle,
    RunRequest,
)

__all__ = ["StubDriverBase"]


class StubDriverBase:
    """Shared v1.0 stub driver.

    Subclasses MUST set ``_driver_kind`` and ``_evidence_uri`` as class
    attributes. The two required methods (``capability``, ``run``,
    ``interrupt``, ``heartbeat``) are fully implemented here.

    Idempotency:
    ``_stream_cache`` memoizes the ``AsyncIterator[DriverEvent]`` for
    each ``(attempt_id, fence_version)`` pair. The first ``run`` builds
    a list of events; subsequent ``run`` calls with the same key yield
    the cached list. This satisfies the Protocol's "duplicate call with
    same attempt_id + fence_version MUST return cached stream" rule
    without spawning anything.
    """

    _driver_kind: DriverKind = DriverKind.CODEX_EXEC  # subclass MUST override
    _evidence_uri: str = "file://harness/drivers/evidence-stub.json"
    _notes: str = "v1.0 stub; real Codex SDK deferred to v1.1"

    def __init__(self) -> None:
        # Map (attempt_id, fence_version) -> list[DriverEvent]
        self._stream_cache: dict[tuple[str, int], list[DriverEvent]] = {}

    # ==================== ExecutionDriver Protocol ====================

    def capability(self) -> DriverCapabilities:
        return DriverCapabilities(
            driver_kind=self._driver_kind,
            evidence_uri=self._evidence_uri,
            max_concurrent_attempts=1,
            supports_streaming=False,
            supports_interrupt=True,
            supports_heartbeat=True,
            # Per spec §ExecutionDriver: a driver without real evidence
            # MUST NOT claim tool_gateway support. v1.0 stubs have no
            # evidence; real Codex SDK integration in v1.1 may flip this.
            supports_tool_gateway=False,
            notes=self._notes,
        )

    async def run(self, request: RunRequest) -> AsyncIterator[DriverEvent]:
        cache_key = (request.attempt_id, request.fence_version)
        if cache_key not in self._stream_cache:
            # Build the synthetic event stream once. No subprocess, no
            # network, no SDK imports — purely in-memory stub.
            self._stream_cache[cache_key] = [
                DriverEvent(
                    kind=DriverEventKind.STARTED,
                    attempt_id=request.attempt_id,
                    payload={},
                ),
                DriverEvent(
                    kind=DriverEventKind.FINISHED,
                    attempt_id=request.attempt_id,
                    payload={"status": "succeeded"},
                ),
            ]
        for event in self._stream_cache[cache_key]:
            yield event

    async def interrupt(self, handle: RunHandle, reason: str) -> None:
        """Safe no-op — stub has no running process to interrupt."""
        return None

    async def heartbeat(self, handle: RunHandle) -> None:
        """Safe no-op — stub has no lease to renew."""
        return None


# Runtime Protocol conformance self-check (only runs when invoked
# directly, not on import).
if __name__ == "__main__":  # pragma: no cover
    d = StubDriverBase()
    assert isinstance(d, ExecutionDriver), "StubDriverBase must satisfy ExecutionDriver"
    print("StubDriverBase: ExecutionDriver Protocol OK")