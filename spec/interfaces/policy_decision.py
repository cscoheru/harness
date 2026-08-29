"""PolicyDecisionPoint — the only authority on what's allowed.

File: spec/interfaces/policy_decision.py
Version: v0.7

Fix for v0.6 P0-3 + P1-10:
  - Decision direction is forced: deny > needs_approval > allow.
  - Approval can never expand rights denied by policy (Q109 invariant).
  - Trust labels (Q116) are inputs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from .tool_provider import CapabilityClass, PolicyDecision, ToolRequest


@dataclass(frozen=True)
class PolicyRule:
    """A single rule. Rules are evaluated in declaration order; first match wins.

    When two rules conflict, the more restrictive decision wins
    (deny > needs_approval > allow) regardless of order.
    """

    rule_id: str
    capability_pattern: str  # fnmatch pattern, e.g. 'web.fetch:domain=*.example.com'
    decision: str  # 'allow' | 'deny' | 'needs_approval'
    trust_label_required: Optional[CapabilityClass]
    condition: Optional[str] = None  # human-readable condition


@dataclass(frozen=True)
class PolicyBundle:
    """A versioned set of rules. The kernel pins bundle_id into policy_decisions."""

    bundle_id: str  # sha256 of rule set
    version: str
    rules: tuple[PolicyRule, ...]


@runtime_checkable
class PolicyDecisionPoint(Protocol):
    """Evaluates a ToolRequest against a PolicyBundle.

    Properties:
      - The decision MUST be deterministic for a given (bundle, request) pair.
      - The decision MUST be persisted as a policy_decisions row BEFORE the
        tool provider is invoked (I7).
      - 'deny' decisions are terminal: a downstream approval can NEVER widen
        them (Q109 / spec/state-transitions.md §2 I10).
      - 'needs_approval' creates a pending approval; the approval decision
        is fed back through evaluate() with approval_id to compute the final
        disposition.
    """

    def bundle(self) -> PolicyBundle: ...

    def evaluate(
        self, request: ToolRequest, bundle: PolicyBundle, approval_id: Optional[str] = None
    ) -> PolicyDecision: ...


def assert_satisfies_pdp(obj: object) -> None:
    if not isinstance(obj, PolicyDecisionPoint):
        raise TypeError(
            f"{type(obj).__name__} does not satisfy PolicyDecisionPoint protocol"
        )