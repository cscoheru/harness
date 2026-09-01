"""harness — fish-harness v1.0 runtime (Python kernel).

Public API (per docs/v1.0-ga-team-plan.md §2 T-BE-5):

The 10 runtime Protocols re-exported from this package:
    WorkerPool, EventSink, ContextDistiller, ContextBudget, ContextManager,
    ArtifactStore, ToolInvocationGateway, ToolProvider, PolicyDecisionPoint,
    ExecutionDriver.

Note: ``PolicyDecisionPoint`` is the Protocol name (per
``spec/interfaces/policy_decision.py``); ``PolicyDecision`` in that same
module is the *frozen dataclass* returned by ``PDP.evaluate()`` — they are
distinct types. ``WorkflowPack`` (``spec/interfaces/workflow_pack.py``)
is a data-only carrier and is not counted as a runtime Protocol.

Behavior implementations live in subpackages (``harness.runtime``,
``harness.gateway``, ...) and are added incrementally per the GA plan §2
task list (T-BE-1..T-DD-6). ``spikes/m0/_helpers.py`` remains the
spike-suite reference and is not deleted.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

__version__ = "1.0.0a0"


@runtime_checkable
class WorkerPool(Protocol):
    """Worker pool dispatcher. See ``spec/interfaces/worker_pool.py``."""


@runtime_checkable
class EventSink(Protocol):
    """Task / worker event sink. See ``spec/interfaces/event_sink.py``."""


@runtime_checkable
class ContextDistiller(Protocol):
    """Context L1 distiller. See ``spec/interfaces/context_distiller.py``."""


@runtime_checkable
class ContextBudget(Protocol):
    """Context token budget. See ``spec/interfaces/context_distiller.py``."""


@runtime_checkable
class ContextManager(ContextDistiller, ContextBudget, Protocol):
    """Composite alias: ContextDistiller + ContextBudget (per GA plan §2 T-BE-5).

    ``ContextManager`` is the convenience name used in the GA plan to refer
    to the joint surface of ContextDistiller (distill raw blobs into L1 units)
    and ContextBudget (charge tokens; enforce ``context_budget_tokens`` cap).
    """


@runtime_checkable
class ArtifactStore(Protocol):
    """Artifact / blob store. See ``spec/interfaces/artifact_store.py``."""


@runtime_checkable
class ToolInvocationGateway(Protocol):
    """Tool invocation gateway (PDP → audit → lease+fence → provider).
    See ``spec/interfaces/tool_provider.py``."""


@runtime_checkable
class ToolProvider(Protocol):
    """Outbound tool capability. See ``spec/interfaces/tool_provider.py``.

    Concrete impl: ``harness.gateway.HttpEgressService`` (pinned-DNS,
    allowlist, SSRF block, redirect re-pin, exponential backoff).
    """


@runtime_checkable
class PolicyDecisionPoint(Protocol):
    """Policy decision point. See ``spec/interfaces/policy_decision.py``.

    Note: ``PolicyDecision`` (the frozen dataclass returned by
    ``PolicyDecisionPoint.evaluate()``) is a distinct type — it lives in
    ``spec/interfaces/tool_provider.py`` and is *not* re-exported here.
    """


@runtime_checkable
class ExecutionDriver(Protocol):
    """Code-running backend contract. See ``spec/interfaces/execution_driver.py``.

    Concrete impls: ``harness.drivers.CodexSdkDriver`` /
    ``CodexExecDriver`` (stubs in v1.0; real SDK integration deferred to v1.1+).
    """


__all__ = [
    "WorkerPool",
    "EventSink",
    "ContextDistiller",
    "ContextBudget",
    "ContextManager",
    "ArtifactStore",
    "ToolInvocationGateway",
    "ToolProvider",
    "PolicyDecisionPoint",
    "ExecutionDriver",
    "__version__",
]