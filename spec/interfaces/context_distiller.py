"""ContextDistiller + ContextBudget — v0.9-A context layering.

File: spec/interfaces/context_distiller.py
Version: v0.9-A

Layer model (see spec/context-layers.md):
  L0 raw_blob   -> L1 distilled  (distill())
  L1 distilled  -> L2 working_set (charge())
  L2 working_set -> L3 handoff    (snapshot_for_handoff())
  L3 handoff    -> L2 working_set (restore_handoff())

I11 (budget) and I14 (handoff trust) are enforced by SQLite triggers; the
Protocols here are the public surface that drivers and packs implement.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable


class ContextError(Exception):
    """Base for context-layer errors."""


class BudgetExceeded(ContextError):
    """Raised when charge() would push working_set over task.context_budget_tokens.

    Trigger trg_snapshot_budget_check also rejects the underlying INSERT; this
    exception lets the Protocol surface the same condition in a typed way.
    """


class HandoffTrustViolation(ContextError):
    """Raised when an L3 handoff would carry trust_label=untrusted_external.

    Trigger trg_handoff_trust_label also rejects the underlying INSERT.
    """


@dataclass(frozen=True)
class DistilledUnit:
    distilled_blob_id: str
    raw_blob_id: str
    token_count: int
    trust_label: str
    distiller_version: str


@dataclass(frozen=True)
class HandoffBlob:
    handoff_blob_id: str
    task_id: str
    attempt_id: str
    trust_label: str
    compressed_token_count: int
    created_at: str


@runtime_checkable
class ContextDistiller(Protocol):
    """Distill raw blobs into L1/L2/L3 units.

    Invariants enforced:
      - distill() is pure with respect to (raw_blob_id, trust_label): same input
        yields same distilled_blob_id (idempotent via blobs.sha256 in v0.7 schema).
      - charge() decrements the task's working_set budget atomically.
      - snapshot_for_handoff() returns an L3 blob whose trust_label is NOT
        untrusted_external (I14).
      - restore_handoff() rebuilds L2 entries under the new attempt.
    """

    def distill(self, raw_blob_id: str, trust_label: str) -> DistilledUnit: ...

    def charge(
        self, task_id: str, attempt_id: str, distilled_blob_id: str,
    ) -> int:
        """Move a distilled blob into the active working_set. Returns the new
        running token count. Raises BudgetExceeded if it would overflow."""
        ...

    def snapshot_for_handoff(
        self, task_id: str, attempt_id: str,
    ) -> HandoffBlob: ...

    def restore_handoff(
        self, task_id: str, handoff_blob_id: str, new_attempt_id: str,
    ) -> int: ...


@runtime_checkable
class ContextBudget(Protocol):
    """Read-side companion to ContextDistiller.charge().

    Used by drivers to decide whether to keep accumulating context or to
    trigger a snapshot_for_handoff() before hitting I11.
    """

    def remaining(self, task_id: str) -> Optional[int]:
        """Returns remaining tokens, or None if budget is unset (unlimited)."""
        ...

    def total(self, task_id: str) -> Optional[int]:
        """Returns the configured budget, or None if unset."""
        ...


def assert_satisfies_distiller(obj: object) -> None:
    """Runtime assertion helper for the Protocol.

    Mirrors assert_satisfies_protocol / assert_satisfies_pdp / assert_satisfies_gateway
    style used by other spec/interfaces/*.py modules.
    """
    if not isinstance(obj, ContextDistiller):
        raise AssertionError(
            f"object {obj!r} does not satisfy ContextDistiller Protocol"
        )


def assert_satisfies_budget(obj: object) -> None:
    if not isinstance(obj, ContextBudget):
        raise AssertionError(
            f"object {obj!r} does not satisfy ContextBudget Protocol"
        )