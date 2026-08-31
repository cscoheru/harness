"""ToolInvocationGatewayImpl integration tests.

ADR 0005 six-step chain — exercised end-to-end against a real SQLite DB
with the kernel schema, fake PDP + Provider collaborators, and a tiny
in-memory ArtifactStore (no real disk writes). This mirrors the
spike conformance test but uses the production gate way rather than
the helper-injected variant.
"""
from __future__ import annotations

import asyncio
import sqlite3
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional

import pytest

from harness.gateway.gateway import ToolInvocationGatewayImpl
from harness.runtime._db import seed_task
from spec.interfaces.artifact_store import (
    ArtifactStore,
    BlobRef,
    PutRequest,
    PutResult,
)
from spec.interfaces.policy_decision import (
    PolicyBundle,
    PolicyDecisionPoint,
    PolicyRule,
)
from spec.interfaces.tool_provider import (
    CapabilityClass,
    CapabilitySpec,
    PolicyDecision,
    ToolProvider,
    ToolRequest,
    ToolResponse,
)


# ====================== Fakes ======================

class FakePDP(PolicyDecisionPoint):
    """Returns a fixed decision for every request; bundle is a single allow rule."""

    def __init__(self, decision: str = "allow", reason: str = "ok") -> None:
        self._decision = decision
        self._reason = reason
        self.bundle_id = "bundle-test"
        self._rule = PolicyRule(
            rule_id="r1",
            capability_pattern="*",
            decision=decision,
            trust_label_required=None,
        )
        self._bundle = PolicyBundle(
            bundle_id=self.bundle_id, version="v1", rules=(self._rule,),
        )

    def bundle(self) -> PolicyBundle:
        return self._bundle

    def evaluate(self, request: ToolRequest, bundle: PolicyBundle,
                 approval_id: Optional[str] = None) -> PolicyDecision:
        return PolicyDecision(
            policy_decision_id=f"pd-{uuid.uuid4().hex[:8]}",
            decision=self._decision,
            reason=self._reason,
            rule_path="r1",
        )


@dataclass
class FakeProvider(ToolProvider):
    """Returns a ToolResponse with a deterministic artifact_id."""
    artifact_id: str = "art-fake"
    denial_reason: Optional[str] = None
    invocations: int = field(default=0)

    def capability(self) -> CapabilitySpec:
        return CapabilitySpec(
            capability_id="web.fetch",
            kind="read_remote",
            description="fake",
            data_class_in=CapabilityClass.TRUSTED_USER_INPUT,
            data_class_out=CapabilityClass.MODEL_GENERATED,
            default_policy="allow",
            requires_evidence=False,
        )

    async def invoke(self, request: ToolRequest) -> ToolResponse:
        self.invocations += 1
        if self.denial_reason is not None:
            return ToolResponse(
                capability_id=request.capability_id, result=None,
                artifact_id=None, denial_reason=self.denial_reason,
                policy_decision_id=None, approval_id=None,
            )
        return ToolResponse(
            capability_id=request.capability_id, result={"x": 1},
            artifact_id=self.artifact_id,
            denial_reason=None,
            policy_decision_id=None,
            approval_id=None,
        )


class InMemoryArtifactStore(ArtifactStore):
    """Tiny dict-backed store; sufficient for gateway chain assertions.

    Also writes a matching ``blobs`` row so the FK from ``artifacts`` to
    ``blobs`` is satisfied (mirrors RealArtifactStore's contract).
    """

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._store: dict[str, tuple[bytes, str, int]] = {}

    async def put(self, request: PutRequest) -> PutResult:
        chunks = []
        async for chunk in request.byte_stream:
            chunks.append(chunk)
        data = b"".join(chunks)
        import hashlib
        sha = hashlib.sha256(data).hexdigest()
        if request.blob_id in self._store:
            existing = self._store[request.blob_id]
            if existing[1] != sha:
                raise RuntimeError(f"BlobConflictError: {request.blob_id} mismatch")
        self._store[request.blob_id] = (data, sha, len(data))
        # Mirror RealArtifactStore: insert a blobs row so artifacts FK is satisfied.
        try:
            self._conn.execute(
                "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
                "  content_type, trust_label) "
                "VALUES (?, ?, ?, 'memory://test', ?, 'model_generated')",
                (request.blob_id, len(data), sha, request.content_type or "application/octet-stream"),
            )
            self._conn.commit()
        except sqlite3.IntegrityError:
            pass  # idempotent re-put
        return PutResult(blob_id=request.blob_id, sha256=sha, byte_size=len(data))

    async def get(self, blob_id: str) -> AsyncIterator[bytes]:
        if blob_id not in self._store:
            raise KeyError(blob_id)
        data, _sha, _size = self._store[blob_id]

        async def _iter():
            yield data

        return _iter()

    async def stat(self, blob_id: str) -> BlobRef:
        data, sha, size = self._store[blob_id]
        return BlobRef(
            blob_id=blob_id, sha256=sha, byte_size=size,
            storage_uri=f"memory://{blob_id}", content_type="application/octet-stream",
        )

    async def delete(self, blob_id: str) -> None:
        self._store.pop(blob_id, None)


def _seed_attempt(conn: sqlite3.Connection, task_id: str, worker_id: str = "w-test") -> tuple[str, str, int]:
    """Create a task_attempts row via claim() so fence matches task fence.

    Returns ``(attempt_id, lease_token, fence_version)``.
    """
    from harness.runtime._db import claim
    attempt_id, fence = claim(conn, task_id, worker_id=worker_id)
    lease_row = conn.execute(
        "SELECT lease_token FROM task_attempts WHERE attempt_id=?",
        (attempt_id,),
    ).fetchone()
    return attempt_id, lease_row["lease_token"], fence


def _count_audit(conn: sqlite3.Connection, action: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) AS n FROM audit_log WHERE action=?",
        (action,),
    ).fetchone()["n"]


# ====================== Tests ======================

def test_allow_writes_all_six_layers(conn: sqlite3.Connection) -> None:
    pdp = FakePDP(decision="allow", reason="ok")
    provider = FakeProvider(artifact_id="art-001")
    store = InMemoryArtifactStore(conn)
    gw = ToolInvocationGatewayImpl(conn, pdp, provider, store)

    task_id = seed_task(conn)
    attempt_id, lease, fence = _seed_attempt(conn, task_id)

    req = ToolRequest(
        attempt_id=attempt_id, task_id=task_id, capability_id="web.fetch",
        arguments={"url": "https://x.example/p"},
        lease_token=lease, fence_version=fence,
        trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
    )
    resp = asyncio.run(gw.invoke(req))

    # Provider was called exactly once.
    assert provider.invocations == 1
    # ToolResponse carries the artifact.
    assert resp.artifact_id == "art-001"
    assert resp.denial_reason is None
    # Side effects in DB: 1 policy_decisions, 1 audit (allow), 1 artifact, 1 task_link.
    assert conn.execute("SELECT COUNT(*) AS n FROM policy_decisions").fetchone()["n"] == 1
    assert _count_audit(conn, "gateway.invoke") == 1
    assert conn.execute("SELECT COUNT(*) AS n FROM artifacts").fetchone()["n"] == 1
    assert conn.execute("SELECT COUNT(*) AS n FROM task_links").fetchone()["n"] == 1
    # Provider did NOT receive a denial_reason path.
    assert resp.denial_reason is None


def test_deny_short_circuits_before_provider(conn: sqlite3.Connection) -> None:
    pdp = FakePDP(decision="deny", reason="blocked by policy")
    provider = FakeProvider()
    store = InMemoryArtifactStore(conn)
    gw = ToolInvocationGatewayImpl(conn, pdp, provider, store)

    task_id = seed_task(conn)
    attempt_id, lease, fence = _seed_attempt(conn, task_id)

    req = ToolRequest(
        attempt_id=attempt_id, task_id=task_id, capability_id="web.fetch",
        arguments={}, lease_token=lease, fence_version=fence,
        trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
    )
    resp = asyncio.run(gw.invoke(req))

    assert resp.denial_reason == "blocked by policy"
    assert resp.artifact_id is None
    assert resp.approval_id is None
    assert provider.invocations == 0, "deny MUST NOT call provider"
    # Audit still written (deny is observable).
    assert _count_audit(conn, "gateway.invoke") == 1
    # policy_decisions still written (I7).
    assert conn.execute("SELECT COUNT(*) AS n FROM policy_decisions").fetchone()["n"] == 1
    # No artifact, no link.
    assert conn.execute("SELECT COUNT(*) AS n FROM artifacts").fetchone()["n"] == 0
    assert conn.execute("SELECT COUNT(*) AS n FROM task_links").fetchone()["n"] == 0


def test_needs_approval_writes_pending_and_skips_provider(conn: sqlite3.Connection) -> None:
    pdp = FakePDP(decision="needs_approval", reason="human required")
    provider = FakeProvider()
    store = InMemoryArtifactStore(conn)
    gw = ToolInvocationGatewayImpl(conn, pdp, provider, store)

    task_id = seed_task(conn)
    attempt_id, lease, fence = _seed_attempt(conn, task_id)

    req = ToolRequest(
        attempt_id=attempt_id, task_id=task_id, capability_id="web.fetch",
        arguments={}, lease_token=lease, fence_version=fence,
        trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
    )
    resp = asyncio.run(gw.invoke(req))

    assert resp.denial_reason is None
    assert resp.approval_id is not None
    assert resp.approval_id.startswith("ap-")
    assert resp.artifact_id is None
    assert provider.invocations == 0, "needs_approval MUST NOT call provider"

    # approvals row exists with status='pending'.
    row = conn.execute(
        "SELECT status FROM approvals WHERE approval_id=?",
        (resp.approval_id,),
    ).fetchone()
    assert row["status"] == "pending"


def test_bad_lease_token_short_circuits_at_step_one(conn: sqlite3.Connection) -> None:
    """Step 1 (lease+fence) MUST come BEFORE PDP, audit-on-allow, provider."""
    pdp = FakePDP(decision="allow")
    provider = FakeProvider()
    store = InMemoryArtifactStore(conn)
    gw = ToolInvocationGatewayImpl(conn, pdp, provider, store)

    task_id = seed_task(conn)
    attempt_id, _lease, _fence = _seed_attempt(conn, task_id)
    # Use a DIFFERENT (bogus) lease token.

    req = ToolRequest(
        attempt_id=attempt_id, task_id=task_id, capability_id="web.fetch",
        arguments={}, lease_token="wrong-token", fence_version=1,
        trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
    )
    resp = asyncio.run(gw.invoke(req))

    assert resp.denial_reason == "bad lease"
    assert resp.artifact_id is None
    assert provider.invocations == 0, "bad lease MUST NOT reach provider"
    # Audit row IS written (denial is observable).
    assert _count_audit(conn, "gateway.deny") == 1
    # policy_decisions NOT written (PDP was not consulted).
    assert conn.execute("SELECT COUNT(*) AS n FROM policy_decisions").fetchone()["n"] == 0


def test_bad_fence_version_short_circuits_at_step_one(conn: sqlite3.Connection) -> None:
    pdp = FakePDP(decision="allow")
    provider = FakeProvider()
    store = InMemoryArtifactStore(conn)
    gw = ToolInvocationGatewayImpl(conn, pdp, provider, store)

    task_id = seed_task(conn)
    attempt_id, lease, fence = _seed_attempt(conn, task_id)

    req = ToolRequest(
        attempt_id=attempt_id, task_id=task_id, capability_id="web.fetch",
        arguments={}, lease_token=lease, fence_version=999,  # wrong
        trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
    )
    resp = asyncio.run(gw.invoke(req))

    assert resp.denial_reason == "bad fence"
    assert provider.invocations == 0
    assert _count_audit(conn, "gateway.deny") == 1


def test_no_such_attempt_short_circuits_at_step_one(conn: sqlite3.Connection) -> None:
    pdp = FakePDP(decision="allow")
    provider = FakeProvider()
    store = InMemoryArtifactStore(conn)
    gw = ToolInvocationGatewayImpl(conn, pdp, provider, store)

    req = ToolRequest(
        attempt_id="att-bogus", task_id="task-bogus", capability_id="web.fetch",
        arguments={}, lease_token="x", fence_version=1,
        trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
    )
    resp = asyncio.run(gw.invoke(req))

    assert resp.denial_reason == "no such task/attempt"
    assert provider.invocations == 0


def test_provider_level_denial_propagates_without_artifact(conn: sqlite3.Connection) -> None:
    """If the PROVIDER denies (after a successful PDP allow), gateway propagates."""
    pdp = FakePDP(decision="allow")
    provider = FakeProvider(denial_reason="upstream said no")
    store = InMemoryArtifactStore(conn)
    gw = ToolInvocationGatewayImpl(conn, pdp, provider, store)

    task_id = seed_task(conn)
    attempt_id, lease, fence = _seed_attempt(conn, task_id)

    req = ToolRequest(
        attempt_id=attempt_id, task_id=task_id, capability_id="web.fetch",
        arguments={}, lease_token=lease, fence_version=fence,
        trust_label_in=CapabilityClass.TRUSTED_USER_INPUT,
    )
    resp = asyncio.run(gw.invoke(req))

    assert resp.denial_reason == "upstream said no"
    assert resp.artifact_id is None
    # No artifact row written.
    assert conn.execute("SELECT COUNT(*) AS n FROM artifacts").fetchone()["n"] == 0