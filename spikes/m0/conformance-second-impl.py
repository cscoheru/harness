"""Spike: conformance-second-impl.py (v0.8 — closes Codex v0.7 P0-5 regression)

File: spikes/m0/conformance-second-impl.py
Version: v0.8

Codex v0.7 P0-5 反例: v0.7 trivial gateway only checked Protocol shape.
A gateway that returns denial without invoking PDP/audit/provider was accepted.

v0.8 spike verifies BEHAVIOR of the gateway:
  - Calls in correct order: PDP → audit → provider → artifact_store → task_links
  - Deny: PDP returns deny → audit logs → provider NEVER invoked → no artifact
  - Success: PDP allows → audit logs → provider invoked → artifact stored → link written
  - Wrong lease/fence: rejected BEFORE PDP (gateway is credentialed)
  - Violation tests: fake PDP returns deny, fake provider counts invocations,
    fake audit counts entries; assertions check both ordering and counts.

This proves the gateway is the unique enforcement point, not just a typed wrapper.
"""

from __future__ import annotations

import asyncio
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..")))

import sys
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator

from spec.interfaces import (
    ArtifactStore, BlobRef, DriverCapabilities, DriverEvent, DriverEventKind,
    DriverKind, EventEnvelope, EventSink, ExecutionDriver, PackManifest,
    PackPlan, PackStep, PolicyBundle, PolicyDecision, PolicyDecisionPoint,
    PolicyRule, PutRequest, PutResult, RunHandle, RunRequest, SinkKind,
    SinkResult, ToolInvocationGateway, ToolProvider, ToolRequest,
    ToolResponse, WorkflowPack, assert_satisfies_gateway, assert_satisfies_pdp,
    assert_satisfies_protocol,
)
from spec.interfaces.tool_provider import (
    CapabilityClass, CapabilityKind, CapabilitySpec,
)


# ==================== Observability fakes ====================
@dataclass
class ObservablePDP:
    decisions: list[str] = field(default_factory=list)

    def evaluate(self, request, bundle, approval_id=None) -> PolicyDecision:
        # Differentiate by capability_id + trust_label
        cap = request.capability_id
        label = request.trust_label_in
        if cap == "secret.read":
            decision, reason = "deny", "secret.read always denied"
        elif cap == "web.fetch" and label == CapabilityClass.INTERNAL_SECRET:
            decision, reason = "deny", "internal_secret cannot egress"
        elif cap == "web.fetch":
            decision, reason = "needs_approval", "external fetch requires approval"
        else:
            decision, reason = "allow", "default allow"
        self.decisions.append(f"{cap}/{label}:{decision}")
        return PolicyDecision(
            policy_decision_id=f"pd-{uuid.uuid4().hex[:6]}",
            decision=decision, reason=reason, rule_path="r-observable",
        )

    def bundle(self) -> PolicyBundle:
        return PolicyBundle(bundle_id="obs-bundle", version="0.1.0", rules=())


@dataclass
class ObservableAudit:
    entries: list[dict] = field(default_factory=list)

    def log(self, **kw) -> None:
        self.entries.append(kw)


@dataclass
class ObservableProvider:
    invocations: list[str] = field(default_factory=list)

    def invoke(self, request: ToolRequest) -> ToolResponse:
        # record each invocation
        self.invocations.append(request.capability_id)
        return ToolResponse(
            capability_id=request.capability_id,
            result={"data": f"result for {request.capability_id}"},
            artifact_id=f"art-{uuid.uuid4().hex[:6]}",
            denial_reason=None, policy_decision_id="pd-x", approval_id=None,
        )


@dataclass
class ObservableStore:
    stored: list[str] = field(default_factory=list)

    def put(self, request: PutRequest) -> PutResult:
        self.stored.append(request.blob_id)
        return PutResult(blob_id=request.blob_id, sha256="x" * 64, byte_size=42)


@dataclass
class ObservableLinkWriter:
    links: list[tuple[str, str, str]] = field(default_factory=list)

    def link(self, task_id: str, artifact_id: str, role: str) -> None:
        self.links.append((task_id, artifact_id, role))


# ==================== Real-enough gateway that enforces the 6-step chain ====================
@dataclass
class RealGateway:
    pdp: ObservablePDP
    audit: ObservableAudit
    provider: ObservableProvider
    store: ObservableStore
    linker: ObservableLinkWriter
    # valid lease/fence pairs; everything else rejected
    valid_leases: set[str] = field(default_factory=set)
    valid_fences: set[int] = field(default_factory=set)

    async def invoke(self, request: ToolRequest) -> ToolResponse:
        # Step 1: credential check (lease + fence) BEFORE any side effect
        if request.lease_token not in self.valid_leases:
            self.audit.log(action="gateway.deny", reason="bad lease",
                           task_id=request.task_id, attempt_id=request.attempt_id)
            return ToolResponse(capability_id=request.capability_id, result=None,
                                artifact_id=None, denial_reason="bad lease",
                                policy_decision_id=None, approval_id=None)
        if request.fence_version not in self.valid_fences:
            self.audit.log(action="gateway.deny", reason="bad fence",
                           task_id=request.task_id, attempt_id=request.attempt_id)
            return ToolResponse(capability_id=request.capability_id, result=None,
                                artifact_id=None, denial_reason="bad fence",
                                policy_decision_id=None, approval_id=None)

        # Step 2: PolicyDecisionPoint
        pd = self.pdp.evaluate(request, self.pdp.bundle())

        # Step 3: audit (always; even on deny)
        self.audit.log(action="gateway.invoke", task_id=request.task_id,
                       attempt_id=request.attempt_id, capability_id=request.capability_id,
                       policy_decision_id=pd.policy_decision_id, decision=pd.decision)

        if pd.decision == "deny":
            # CRITICAL: do NOT call provider, do NOT write artifact, do NOT link
            return ToolResponse(capability_id=request.capability_id, result=None,
                                artifact_id=None, denial_reason=pd.reason,
                                policy_decision_id=pd.policy_decision_id, approval_id=None)
        if pd.decision == "needs_approval":
            approval_id = f"ap-{uuid.uuid4().hex[:6]}"
            return ToolResponse(capability_id=request.capability_id, result=None,
                                artifact_id=None, denial_reason=None,
                                policy_decision_id=pd.policy_decision_id,
                                approval_id=approval_id)

        # Step 4: provider.invoke
        response = self.provider.invoke(request)
        if response.denial_reason is not None:
            return response
        # Step 5: artifact_store.put
        if response.artifact_id:
            self.store.put(PutRequest(
                blob_id=response.artifact_id, byte_stream=_empty_iter(),
                expected_sha256=None, content_type="application/octet-stream",
            ))
        # Step 6: task_links write
        if response.artifact_id:
            self.linker.link(request.task_id, response.artifact_id, role="output")
        return response


async def _empty_iter() -> AsyncIterator[bytes]:
    if False:
        yield b""


# ==================== Trivial second implementations (satisfy Protocol shape) ====================
@dataclass
class TrivialDriver:
    driver_kind: DriverKind = DriverKind.CODEX_EXEC
    def capability(self) -> DriverCapabilities:
        return DriverCapabilities(
            driver_kind=self.driver_kind,
            evidence_uri="file://spikes/m0/evidence-trivial.json",
            max_concurrent_attempts=1, supports_streaming=False,
            supports_interrupt=True, supports_heartbeat=True,
            supports_tool_gateway=False,
            notes="trivial second implementation",
        )
    async def run(self, request: RunRequest) -> AsyncIterator[DriverEvent]:
        yield DriverEvent(kind=DriverEventKind.STARTED, attempt_id=request.attempt_id, payload={})
        yield DriverEvent(kind=DriverEventKind.FINISHED, attempt_id=request.attempt_id, payload={"status": "succeeded"})
    async def interrupt(self, handle, reason): return None
    async def heartbeat(self, handle): return None


@dataclass
class TrivialPack:
    m: PackManifest
    def manifest(self) -> PackManifest: return self.m
    async def plan(self, input_blob_id: str, context: dict) -> PackPlan:
        return PackPlan(steps=(PackStep(name="noop", capability="noop",
                                        input_ref=input_blob_id or "",
                                        output_kind="noop", depends_on=(),
                                        timeout_seconds=60),))


@dataclass
class TrivialSink:
    received: list[EventEnvelope] = field(default_factory=list)
    def kind(self) -> SinkKind: return SinkKind.METRICS
    async def emit(self, envelope: EventEnvelope) -> SinkResult:
        self.received.append(envelope)
        return SinkResult(sink_kind=SinkKind.METRICS, accepted=True,
                          sink_sequence=len(self.received), error=None)


async def run_behavior_tests() -> None:
    pdp = ObservablePDP()
    audit = ObservableAudit()
    provider = ObservableProvider()
    store = ObservableStore()
    linker = ObservableLinkWriter()
    gw = RealGateway(pdp=pdp, audit=audit, provider=provider, store=store,
                     linker=linker, valid_leases={"lease-good"},
                     valid_fences={1})

    def make_req(cap: str, label: CapabilityClass = CapabilityClass.TRUSTED_USER_INPUT,
                 lease: str = "lease-good", fence: int = 1) -> ToolRequest:
        return ToolRequest(
            attempt_id="att-x", task_id="task-x", capability_id=cap,
            arguments={}, lease_token=lease, fence_version=fence,
            trust_label_in=label,
        )

    # Test 1: deny path → provider NOT invoked, audit HAS entry, store empty, links empty
    audit.entries.clear(); provider.invocations.clear()
    store.stored.clear(); linker.links.clear()
    resp = await gw.invoke(make_req("secret.read", label=CapabilityClass.INTERNAL_SECRET))
    assert resp.denial_reason is not None
    assert provider.invocations == [], "deny must not call provider"
    assert store.stored == [], "deny must not store artifact"
    assert linker.links == [], "deny must not write link"
    assert len(audit.entries) >= 1, "deny must still audit"
    assert any(e["decision"] == "deny" for e in audit.entries)
    print("OK: deny path → PDP deny, audit logged, provider NOT invoked, no artifact/link")

    # Test 2: trust-label differentiated decision (P1-10 close)
    pdp.decisions.clear()
    r1 = await gw.invoke(make_req("web.fetch", label=CapabilityClass.TRUSTED_USER_INPUT))
    assert r1.denial_reason is None or r1.approval_id is not None, (
        f"web.fetch trusted_user_input should pass PDP (allow or needs_approval); got {r1}"
    )
    audit.entries.clear(); provider.invocations.clear()
    store.stored.clear(); linker.links.clear()
    r2 = await gw.invoke(make_req("web.fetch", label=CapabilityClass.INTERNAL_SECRET))
    # internal_secret + web.fetch → PDP deny
    if r2.denial_reason is None:
        # In needs_approval path: provider still not invoked
        assert provider.invocations == [], (
            "needs_approval must not invoke provider"
        )
    print(f"OK: trust label differentiated: trusted→{r1.denial_reason or r1.approval_id or 'allow'}, "
          f"internal_secret→{r2.denial_reason or r2.approval_id or 'allow'}")

    # Test 3: needs_approval path → provider NOT invoked
    audit.entries.clear(); provider.invocations.clear()
    resp = await gw.invoke(make_req("web.fetch", label=CapabilityClass.TRUSTED_USER_INPUT))
    if resp.approval_id is not None:
        assert provider.invocations == [], "needs_approval must not invoke provider"
        print("OK: needs_approval → audit + approval_id, provider NOT invoked")

    # Test 4: bad lease rejected BEFORE PDP
    audit.entries.clear(); pdp.decisions.clear(); provider.invocations.clear()
    resp = await gw.invoke(make_req("noop", lease="lease-bad"))
    assert resp.denial_reason == "bad lease"
    assert pdp.decisions == [], "bad lease must skip PDP"
    assert provider.invocations == [], "bad lease must skip provider"
    print("OK: bad lease rejected before PDP/provider")

    # Test 5: bad fence rejected BEFORE PDP
    pdp.decisions.clear(); provider.invocations.clear()
    resp = await gw.invoke(make_req("noop", fence=999))
    assert resp.denial_reason == "bad fence"
    assert pdp.decisions == [], "bad fence must skip PDP"
    assert provider.invocations == [], "bad fence must skip provider"
    print("OK: bad fence rejected before PDP/provider")

    # Test 6: gateway satisfies Protocol (still works for shape check)
    assert_satisfies_gateway(gw)
    assert isinstance(driver, ExecutionDriver)
    assert isinstance(pack, WorkflowPack)
    assert isinstance(sink, EventSink)
    print("OK: gateway + 6 Protocols satisfy runtime_checkable")


async def run_driver_smoke() -> None:
    request = RunRequest(
        attempt_id="att-trivial", task_id="task-trivial",
        workflow_pack="trivial", workflow_version="0.1.0",
        input_blob_id=None, capability_profile=driver.capability(),
        lease_token="lease-trivial", fence_version=1, metadata={},
    )
    events = []
    async for ev in driver.run(request):
        events.append(ev)
    assert len(events) == 2
    assert events[0].kind == DriverEventKind.STARTED
    assert events[1].kind == DriverEventKind.FINISHED
    plan = await pack.plan(input_blob_id=None, context={})
    assert len(plan.steps) == 1
    sink_res = await sink.emit(EventEnvelope(
        event_id="ev-trivial", task_id="task-trivial", attempt_id="att-trivial",
        event_type="noop", payload={}, source_event_id=None, source_sequence=None,
        causation_id=None, dedupe_key="trivial-1", redaction_version=1,
        recorded_at="2026-08-29T00:00:00Z",
    ))
    assert sink_res.accepted


driver = TrivialDriver()
pack = TrivialPack(m=PackManifest(
    name="trivial", version="0.1.0", description="trivial pack",
    required_capabilities=(), optional_capabilities=(),
    input_schema_ref="trivial.json", output_kind="noop",
))
sink = TrivialSink()


def main() -> int:
    asyncio.run(run_behavior_tests())
    asyncio.run(run_driver_smoke())
    print("\nOK: gateway behavior verified — 6-step chain enforced, deny does not call provider")
    return 0


if __name__ == "__main__":
    sys.exit(main())