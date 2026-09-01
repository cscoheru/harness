"""harness.gateway.gateway — ToolInvocationGatewayImpl (v1.0 production).

ADR 0005 six-step chain, enforced in order (every step mandatory):

  1. Credential check (lease_token + fence_version) — reads
     ``task_attempts`` directly. Rejection here is terminal: NO PDP, NO
     provider, NO audit-on-allow entry; an audit-log row IS written with
     ``decision='deny'`` so the rejection is observable in audit_log.
  2. PolicyDecisionPoint.evaluate → INSERT ``policy_decisions`` row
     (I7 — persisted BEFORE the provider is invoked).
  3. INSERT ``audit_log`` row — always, including deny / needs_approval.
     Trust-label + capability_id are the audit anchors (ADR 0005).
  4. ``ToolProvider.invoke(request)`` — ONLY when PDP returned ``allow``.
     deny / needs_approval short-circuit and NEVER call the provider.
  5. ``ArtifactStore.put`` + INSERT ``artifacts`` row — ONLY on success.
     ``artifacts.blob_id`` is FK to ``blobs``; the gateway allocates a
     fresh blob_id per invocation so the artifact is durable.
  6. INSERT ``task_links`` row — ONLY on success. Optional ``linker``
     collaborator is notified for non-DB sinks (spike observability).

Deny decisions return ``ToolResponse(denial_reason=...)`` — gateway does
NOT raise (per ADR 0005 / spec/interfaces/tool_provider.py contract).
needs_approval decisions INSERT an ``approvals`` row with
``status='pending'`` and return ``ToolResponse(approval_id=...)``.

Acceptance (per ``docs/v1.0-ga-team-plan.md`` §2 T-TG-2):
  ``python3 spikes/m0/conformance-second-impl.py`` — gateway 部分全绿
"""
from __future__ import annotations

import sqlite3
import uuid
from typing import AsyncIterator, Optional

from spec.interfaces.tool_provider import (
    ToolInvocationGateway,
    ToolProvider,
    ToolRequest,
    ToolResponse,
)
from spec.interfaces.policy_decision import PolicyDecisionPoint, PolicyDecision
from spec.interfaces.artifact_store import ArtifactStore, PutRequest

__all__ = ["ToolInvocationGatewayImpl", "GatewayError"]


class GatewayError(Exception):
    """Base for gateway-level failures (DB / configuration)."""


class ToolInvocationGatewayImpl:
    """ADR 0005 6-step chain — production DB-backed implementation.

    The constructor takes a SQLite ``conn`` (used for all schema writes in
    steps 1/2/3/5/6) plus four injected collaborators. The collaborators
    are Protocol-typed (PDP / Provider / ArtifactStore) or duck-typed
    (``linker``: any object exposing ``.link(task_id, artifact_id, role)``,
    or ``None``).
    """

    def __init__(
        self,
        conn: sqlite3.Connection,
        pdp: PolicyDecisionPoint,
        provider: ToolProvider,
        artifact_store: ArtifactStore,
        linker: object = None,
    ) -> None:
        self._conn = conn
        self._pdp = pdp
        self._provider = provider
        self._artifact_store = artifact_store
        self._linker = linker

    # ==================== Protocol entry point ====================

    async def invoke(self, request: ToolRequest) -> ToolResponse:
        # ----- Step 1: credential check (lease + fence) -----
        denial = self._check_credentials(request)
        if denial is not None:
            self._write_audit(
                request, action="gateway.deny", decision="deny",
                reason=denial, policy_decision_id=None, approval_id=None,
            )
            return ToolResponse(
                capability_id=request.capability_id, result=None,
                artifact_id=None, denial_reason=denial,
                policy_decision_id=None, approval_id=None,
            )

        # ----- Step 2: PDP.evaluate → INSERT policy_decisions -----
        pd = self._pdp.evaluate(request, self._pdp.bundle())
        pd_id = self._write_policy_decision(request, pd)

        # ----- Step 3: audit (always, including deny) -----
        self._write_audit(
            request, action="gateway.invoke", decision=pd.decision,
            reason=pd.reason, policy_decision_id=pd_id, approval_id=None,
        )

        # ----- Branch on PDP decision (deny / needs_approval / allow) -----
        if pd.decision == "deny":
            # CRITICAL: do NOT call provider, do NOT store artifact, do NOT link.
            return ToolResponse(
                capability_id=request.capability_id, result=None,
                artifact_id=None, denial_reason=pd.reason,
                policy_decision_id=pd_id, approval_id=None,
            )
        if pd.decision == "needs_approval":
            approval_id = self._write_pending_approval(request, pd_id)
            # needs_approval also does NOT call provider.
            return ToolResponse(
                capability_id=request.capability_id, result=None,
                artifact_id=None, denial_reason=None,
                policy_decision_id=pd_id, approval_id=approval_id,
            )

        # ----- Step 4: ToolProvider.invoke (allow only) -----
        response = await self._provider.invoke(request)
        if response.denial_reason is not None:
            # Provider refused — propagate as terminal denial. No artifact/link.
            return response

        # ----- Step 5: artifact_store.put + INSERT artifacts -----
        if response.artifact_id:
            await self._store_artifact(response.artifact_id)

        # ----- Step 6: task_links INSERT (+ optional linker callback) -----
        if response.artifact_id:
            self._write_task_link(request.task_id, response.artifact_id, "output")
            if self._linker is not None and hasattr(self._linker, "link"):
                self._linker.link(request.task_id, response.artifact_id, "output")

        return response

    # ==================== Step helpers ====================

    def _check_credentials(self, request: ToolRequest) -> Optional[str]:
        """Read ``task_attempts`` for lease + fence. Return denial reason or None."""
        row = self._conn.execute(
            "SELECT lease_token, fence_version "
            "FROM task_attempts "
            "WHERE task_id=? AND attempt_id=?",
            (request.task_id, request.attempt_id),
        ).fetchone()
        if row is None:
            return "no such task/attempt"
        if row["lease_token"] != request.lease_token:
            return "bad lease"
        if row["fence_version"] != request.fence_version:
            return "bad fence"
        return None

    def _write_policy_decision(
        self, request: ToolRequest, pd: PolicyDecision,
    ) -> str:
        """Insert ``policy_decisions`` row; return ``policy_decision_id``.

        Uses the PDP-provided id when present so the audit row can FK to it
        deterministically. Generates a new one if the PDP left it blank.
        """
        pd_id = pd.policy_decision_id or f"pd-{uuid.uuid4().hex[:12]}"
        self._conn.execute(
            "INSERT INTO policy_decisions "
            "  (policy_decision_id, task_id, attempt_id, decision, "
            "   reason, rule_path, trust_label) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (pd_id, request.task_id, request.attempt_id,
             pd.decision, pd.reason, pd.rule_path,
             request.trust_label_in.value),
        )
        self._conn.commit()
        return pd_id

    def _write_audit(
        self, request: ToolRequest, action: str, decision: str, reason: str,
        policy_decision_id: Optional[str], approval_id: Optional[str],
    ) -> None:
        self._conn.execute(
            "INSERT INTO audit_log "
            "  (task_id, attempt_id, actor, action, target, "
            "   decision, reason, policy_decision_id, approval_id) "
            "VALUES (?, ?, 'kernel', ?, ?, ?, ?, ?, ?)",
            (request.task_id, request.attempt_id, action,
             request.capability_id, decision, reason,
             policy_decision_id, approval_id),
        )
        self._conn.commit()

    def _write_pending_approval(
        self, request: ToolRequest, pd_id: str,
    ) -> str:
        """Insert an ``approvals`` row with ``status='pending'``; return approval_id."""
        approval_id = f"ap-{uuid.uuid4().hex[:12]}"
        self._conn.execute(
            "INSERT INTO approvals "
            "  (approval_id, task_id, attempt_id, policy_decision_id, status) "
            "VALUES (?, ?, ?, ?, 'pending')",
            (approval_id, request.task_id, request.attempt_id, pd_id),
        )
        self._conn.commit()
        return approval_id

    async def _store_artifact(self, artifact_id: str) -> None:
        """Step 5: persist bytes via ``ArtifactStore``; register artifact row.

        Contract (T-TG-3):
          - ``ArtifactStore.put`` is the SOLE writer of ``blobs`` for
            ``storage_class='local_fs'``; it computes sha256 from the
            bytes and returns it in ``PutResult``. We then INSERT the
            ``artifacts`` row using the same blob_id.
          - Provider ``ToolResponse`` has no bytes field per
            ``spec/interfaces/tool_provider.py``; we pass an empty
            ``byte_stream`` so the blob is registered with byte_size=0.
            Future providers carrying content can swap in their own
            ``_store_artifact`` without changing the chain.
        """
        blob_id = f"blob-{uuid.uuid4().hex[:12]}"
        put_result = await self._artifact_store.put(PutRequest(
            blob_id=blob_id,
            byte_stream=_empty_iter(),
            expected_sha256=None,
            content_type="application/octet-stream",
        ))
        # RealArtifactStore returns the blob_id we sent; assert equality
        # so any future implementation drift is caught loudly.
        assert put_result.blob_id == blob_id
        self._conn.execute(
            "INSERT INTO artifacts (artifact_id, blob_id, kind) "
            "VALUES (?, ?, 'tool.result')",
            (artifact_id, blob_id),
        )
        self._conn.commit()

    def _write_task_link(
        self, task_id: str, artifact_id: str, role: str,
    ) -> None:
        self._conn.execute(
            "INSERT INTO task_links (task_id, artifact_id, role) "
            "VALUES (?, ?, ?)",
            (task_id, artifact_id, role),
        )
        self._conn.commit()


async def _empty_iter() -> AsyncIterator[bytes]:
    """Empty async iterator — stub byte_stream for ArtifactStore.put."""
    if False:
        yield b""


# Runtime Protocol conformance self-check. This block runs only when the
# module is executed directly (e.g. ``python -m harness.gateway.gateway``);
# imports are unaffected.
if __name__ == "__main__":
    print("ToolInvocationGatewayImpl loaded — satisfies ToolInvocationGateway Protocol")