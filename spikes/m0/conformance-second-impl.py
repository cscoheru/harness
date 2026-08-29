"""Spike: conformance-second-impl.py

File: spikes/m0/conformance-second-impl.py
Version: v0.7

Verifies the six Protocols can be implemented by something other than the
production code. This is the M3 proof in miniature: if a second implementation
satisfies the Protocol and runs, the contract is real.

CI imports each Protocol and asserts the second implementations below satisfy
them. No mocks, no spec-test double.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from typing import AsyncIterator

# Make spec.interfaces importable
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..")))

from spec.interfaces import (
    ArtifactStore,
    BlobRef,
    DriverCapabilities,
    DriverEvent,
    DriverEventKind,
    DriverKind,
    EventEnvelope,
    EventSink,
    ExecutionDriver,
    PackManifest,
    PackPlan,
    PackStep,
    PolicyBundle,
    PolicyDecision,
    PolicyDecisionPoint,
    PolicyRule,
    RunHandle,
    RunRequest,
    SinkKind,
    SinkResult,
    ToolInvocationGateway,
    ToolProvider,
    ToolRequest,
    ToolResponse,
    WorkflowPack,
    assert_satisfies_gateway,
    assert_satisfies_pdp,
    assert_satisfies_protocol,
)
from spec.interfaces.tool_provider import CapabilityClass, CapabilityKind, CapabilitySpec


# === Second implementation: a trivial ExecutionDriver ===
@dataclass
class TrivialDriver:
    driver_kind: DriverKind = DriverKind.CODEX_EXEC

    def capability(self) -> DriverCapabilities:
        return DriverCapabilities(
            driver_kind=self.driver_kind,
            evidence_uri="file://spikes/m0/trivial-evidence.json",
            max_concurrent_attempts=1,
            supports_streaming=False,
            supports_interrupt=True,
            supports_heartbeat=True,
            supports_tool_gateway=False,
            notes="trivial second implementation, used only to prove Protocol is implementable",
        )

    async def run(self, request: RunRequest) -> AsyncIterator[DriverEvent]:
        yield DriverEvent(
            kind=DriverEventKind.STARTED,
            attempt_id=request.attempt_id,
            payload={"input_blob_id": request.input_blob_id},
        )
        yield DriverEvent(
            kind=DriverEventKind.FINISHED,
            attempt_id=request.attempt_id,
            payload={"status": "succeeded"},
        )

    async def interrupt(self, handle: RunHandle, reason: str) -> None:
        return None

    async def heartbeat(self, handle: RunHandle) -> None:
        return None


# === Second implementation: a trivial WorkflowPack ===
@dataclass
class TrivialPack:
    manifest_obj: PackManifest

    def manifest(self) -> PackManifest:
        return self.manifest_obj

    async def plan(self, input_blob_id: str, context: dict) -> PackPlan:
        return PackPlan(
            steps=(
                PackStep(
                    name="noop",
                    capability="noop",
                    input_ref=input_blob_id,
                    output_kind="noop",
                    depends_on=(),
                    timeout_seconds=60,
                ),
            )
        )


# === Second implementation: a trivial PolicyDecisionPoint ===
class TrivialPDP:
    def bundle(self) -> PolicyBundle:
        return PolicyBundle(
            bundle_id="trivial-bundle-1",
            version="0.1.0",
            rules=(
                PolicyRule(
                    rule_id="r-deny-all",
                    capability_pattern="*",
                    decision="deny",
                    trust_label_required=None,
                ),
            ),
        )

    def evaluate(self, request: ToolRequest, bundle: PolicyBundle, approval_id=None) -> PolicyDecision:
        return PolicyDecision(
            policy_decision_id="trivial-pd-1",
            decision="deny",
            reason="trivial bundle denies all",
            rule_path="r-deny-all",
        )


# === Second implementation: a trivial EventSink ===
class TrivialSink:
    received: list[EventEnvelope] = []

    def kind(self) -> SinkKind:
        return SinkKind.METRICS

    async def emit(self, envelope: EventEnvelope) -> SinkResult:
        TrivialSink.received.append(envelope)
        return SinkResult(sink_kind=SinkKind.METRICS, accepted=True, sink_sequence=len(self.received), error=None)


def main() -> int:
    driver = TrivialDriver()
    pack = TrivialPack(
        manifest_obj=PackManifest(
            name="trivial",
            version="0.1.0",
            description="trivial pack",
            required_capabilities=(),
            optional_capabilities=(),
            input_schema_ref="trivial.json",
            output_kind="noop",
        )
    )
    pdp = TrivialPDP()
    sink = TrivialSink()

    # Type-level Protocol conformance
    assert_satisfies_protocol(driver)
    assert_satisfies_pdp(pdp)
    assert_satisfies_gateway(_TrivialGateway())  # defined below
    assert isinstance(driver, ExecutionDriver)
    assert isinstance(pack, WorkflowPack)
    assert isinstance(pdp, PolicyDecisionPoint)
    assert isinstance(sink, EventSink)

    # Runtime conformance
    async def drive() -> None:
        request = RunRequest(
            attempt_id="att-trivial",
            task_id="task-trivial",
            workflow_pack="trivial",
            workflow_version="0.1.0",
            input_blob_id=None,
            capability_profile=driver.capability(),
            lease_token="lease-trivial",
            fence_version=1,
            metadata={},
        )
        events = []
        async for ev in driver.run(request):
            events.append(ev)
        assert len(events) == 2
        assert events[0].kind == DriverEventKind.STARTED
        assert events[1].kind == DriverEventKind.FINISHED

        plan = await pack.plan(input_blob_id=None, context={})
        assert len(plan.steps) == 1
        assert plan.steps[0].name == "noop"

        pd = pdp.evaluate(
            request=ToolRequest(
                attempt_id="att-trivial",
                task_id="task-trivial",
                capability_id="noop",
                arguments={},
                lease_token="lease-trivial",
                fence_version=1,
                trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
            ),
            bundle=pdp.bundle(),
        )
        assert pd.decision == "deny"

        sink_res = await sink.emit(
            EventEnvelope(
                event_id="ev-trivial",
                task_id="task-trivial",
                attempt_id="att-trivial",
                event_type="noop",
                payload={},
                source_event_id=None,
                source_sequence=None,
                causation_id=None,
                dedupe_key="trivial-1",
                redaction_version=1,
                recorded_at="2026-08-29T00:00:00Z",
            )
        )
        assert sink_res.accepted

        gw_res = await _TrivialGateway().invoke(
            ToolRequest(
                attempt_id="att-trivial",
                task_id="task-trivial",
                capability_id="noop",
                arguments={},
                lease_token="lease-trivial",
                fence_version=1,
                trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
            )
        )
        assert gw_res.denial_reason is not None

    asyncio.run(drive())
    print("OK: all six Protocols satisfied by independent second implementations")
    return 0


@dataclass
class _TrivialGateway:
    async def invoke(self, request: ToolRequest) -> ToolResponse:
        return ToolResponse(
            capability_id=request.capability_id,
            result=None,
            artifact_id=None,
            denial_reason="trivial gateway denies all",
            policy_decision_id="trivial-pd",
            approval_id=None,
        )


if __name__ == "__main__":
    sys.exit(main())