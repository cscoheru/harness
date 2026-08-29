"""ToolProvider + ToolInvocationGateway — the ONLY path to external effects.

File: spec/interfaces/tool_provider.py
Version: v0.7

Fix for v0.6 P0-5: the kernel MUST have a single gateway that mediates
every tool call. WorkflowPack and ExecutionDriver call gateway.invoke();
no other code path may perform a side effect.

Capability classification (Q116) is enforced here, NOT in the pack.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Protocol, runtime_checkable


class CapabilityClass(str, Enum):
    """Trust labels for data (Q116). Drives policy decisions."""

    TRUSTED_USER_INPUT = "trusted_user_input"
    UNTRUSTED_EXTERNAL = "untrusted_external"
    MODEL_GENERATED = "model_generated"
    INTERNAL_SECRET = "internal_secret"


class CapabilityKind(str, Enum):
    """What the tool DOES. Drives the policy decision."""

    READ_LOCAL = "read_local"  # file://
    READ_REMOTE = "read_remote"  # http(s)://
    WRITE_LOCAL = "write_local"
    WRITE_REMOTE = "write_remote"  # external systems (M2+)
    EXECUTE = "execute"
    TRANSCRIBE = "transcribe"


@dataclass(frozen=True)
class CapabilitySpec:
    """Static description of a capability. The gateway uses this + CapabilityPolicy
    to authorize invocations."""

    capability_id: str  # e.g. 'web.search'
    kind: CapabilityKind
    description: str
    data_class_in: CapabilityClass  # expected trust label of inputs
    data_class_out: CapabilityClass  # trust label of outputs
    default_policy: str  # 'allow' | 'deny' | 'needs_approval'
    requires_evidence: bool  # M0 spike may set this True


@dataclass(frozen=True)
class ToolRequest:
    """What the pack/driver wants to do."""

    attempt_id: str
    task_id: str
    capability_id: str
    arguments: dict
    lease_token: str
    fence_version: int
    trust_label_in: CapabilityClass


@dataclass(frozen=True)
class ToolResponse:
    """What the gateway returned. May carry a policy denial.

    denial_reason is non-null ONLY when the gateway denied the request.
    artifact_id is non-null on success.
    """

    capability_id: str
    result: Optional[dict]
    artifact_id: Optional[str]
    denial_reason: Optional[str]
    policy_decision_id: Optional[str]
    approval_id: Optional[str]


@runtime_checkable
class ToolProvider(Protocol):
    """Concrete capability implementations (search API, fetch API, etc.).

    Providers are NOT trusted to enforce policy. They expose a function
    the gateway calls AFTER policy decision is recorded.
    """

    def capability(self) -> CapabilitySpec: ...

    async def invoke(self, request: ToolRequest) -> ToolResponse: ...


@dataclass(frozen=True)
class PolicyDecision:
    """Returned by PolicyDecisionPoint.evaluate (see policy_decision.py).

    Carried into ToolResponse for audit trail (I7).
    """

    policy_decision_id: str
    decision: str  # 'allow' | 'deny' | 'needs_approval'
    reason: str
    rule_path: str


@runtime_checkable
class ToolInvocationGateway(Protocol):
    """The single point of truth for tool execution.

    Properties:
      - The gateway MUST consult PolicyDecisionPoint BEFORE invoking the provider.
      - The gateway MUST write to audit_log BEFORE the provider is called.
      - The gateway MUST verify lease_token + fence_version match the active attempt.
      - Deny decisions are terminal: the gateway MUST NOT call the provider and
        MUST NOT raise — it returns a ToolResponse with denial_reason set.
      - needs_approval returns a ToolResponse with policy_decision_id and an
        approval_id (pending); the caller decides whether to await approval.
    """

    async def invoke(self, request: ToolRequest) -> ToolResponse: ...


def assert_satisfies_gateway(obj: object) -> None:
    if not isinstance(obj, ToolInvocationGateway):
        raise TypeError(
            f"{type(obj).__name__} does not satisfy ToolInvocationGateway protocol"
        )