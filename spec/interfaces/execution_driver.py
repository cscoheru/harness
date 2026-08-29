"""ExecutionDriver Protocol — the integration boundary for any code-running backend.

File: spec/interfaces/execution_driver.py
Version: v0.7
Status: Stage gate spec. CI imports this module and runs the conformance test
in spikes/m0/conformance-second-impl.py against a second implementation.

This Protocol is a contract, not an implementation. Any backend (Codex SDK,
Codex app-server, codex exec, future Anthropic Agent SDK, future local model)
must satisfy this Protocol to plug into the kernel.

Three concrete drivers exist as separate modules:
  - execution_driver/codex_sdk.py    (Python SDK)
  - execution_driver/codex_app_server.py (raw app-server JSON-RPC)
  - execution_driver/codex_exec.py   (codex exec --json subprocess)

M0 spike decides which becomes primary. The others may exist as fallback
ONLY IF they pass the same conformance test.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Optional, Protocol, runtime_checkable


class DriverKind(str, Enum):
    CODEX_SDK = "codex_sdk"
    CODEX_APP_SERVER = "codex_app_server"
    CODEX_EXEC = "codex_exec"


class DriverEventKind(str, Enum):
    """Event kinds a driver MUST emit. The kernel maps these to task_events rows."""

    STARTED = "driver.started"
    OUTPUT_CHUNK = "driver.output_chunk"
    TOOL_CALL_REQUESTED = "driver.tool_call_requested"
    TOOL_CALL_COMPLETED = "driver.tool_call_completed"
    HEARTBEAT = "driver.heartbeat"
    INTERRUPTED = "driver.interrupted"
    FINISHED = "driver.finished"
    FAILED = "driver.failed"


@dataclass(frozen=True)
class DriverEvent:
    """A single event emitted by a driver. The kernel wraps this in EventEnvelope."""

    kind: DriverEventKind
    attempt_id: str
    payload: dict
    dedupe_key: Optional[str] = None
    causation_id: Optional[str] = None


@dataclass(frozen=True)
class DriverCapabilities:
    """Capability profile bound to runtime evidence (Q112)."""

    driver_kind: DriverKind
    evidence_uri: str  # file://path or https://...; required
    max_concurrent_attempts: int
    supports_streaming: bool
    supports_interrupt: bool
    supports_heartbeat: bool
    supports_tool_gateway: bool
    notes: str = ""


@dataclass(frozen=True)
class RunRequest:
    """Input to ExecutionDriver.run().

    workflow_pack and workflow_version identify the WorkflowPack (see workflow_pack.py).
    capability_profile gates which tools the driver may invoke (see tool_provider.py).
    """

    attempt_id: str
    task_id: str
    workflow_pack: str
    workflow_version: str
    input_blob_id: Optional[str]
    capability_profile: DriverCapabilities
    lease_token: str
    fence_version: int
    metadata: dict


@dataclass(frozen=True)
class RunHandle:
    """Returned by run(); used to interrupt."""

    driver_kind: DriverKind
    attempt_id: str
    cancel_token: str  # opaque; passed back to interrupt()


@runtime_checkable
class ExecutionDriver(Protocol):
    """The contract every code-running backend must satisfy.

    Properties:
      - run() must be idempotent at the attempt_id level: a duplicate call with
        the same attempt_id + fence_version MUST return the cached stream
        rather than starting a new model call.
      - interrupt() must be safe to call after the driver has already emitted
        FINISHED; it MUST be a no-op in that case.
      - capability() must be backed by an evidence artifact (Q112); a driver
        that has never produced an evidence file MUST report
        `supports_tool_gateway = False` rather than asserting true.
    """

    def capability(self) -> DriverCapabilities: ...

    async def run(self, request: RunRequest) -> AsyncIterator[DriverEvent]: ...

    async def interrupt(self, handle: RunHandle, reason: str) -> None: ...

    async def heartbeat(self, handle: RunHandle) -> None: ...


# Conformance test entry point (CI runs this).
def assert_satisfies_protocol(obj: object) -> None:
    """Raises TypeError if obj does not satisfy ExecutionDriver.

    CI calls this against any candidate driver module:
        from execution_driver.codex_sdk import CodexSdkDriver
        from spec.interfaces.execution_driver import assert_satisfies_protocol
        assert_satisfies_protocol(CodexSdkDriver(...))
    """
    if not isinstance(obj, ExecutionDriver):
        raise TypeError(
            f"{type(obj).__name__} does not satisfy ExecutionDriver protocol"
        )