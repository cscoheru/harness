"""Protocol package marker.

File: spec/interfaces/__init__.py
Version: v0.7

CI imports spec.interfaces.* to verify all six Protocols exist and have
type-checked signatures. The conformance test spikes/m0/conformance-second-impl.py
imports each Protocol and asserts a second implementation satisfies it.
"""

from .execution_driver import (
    DriverCapabilities,
    DriverEvent,
    DriverEventKind,
    DriverKind,
    ExecutionDriver,
    RunHandle,
    RunRequest,
    assert_satisfies_protocol,
)
from .workflow_pack import PackManifest, PackPlan, PackStep, WorkflowPack
from .tool_provider import (
    CapabilityClass,
    CapabilityKind,
    CapabilitySpec,
    PolicyDecision,
    ToolInvocationGateway,
    ToolProvider,
    ToolRequest,
    ToolResponse,
    assert_satisfies_gateway,
)
from .policy_decision import PolicyBundle, PolicyDecisionPoint, PolicyRule, assert_satisfies_pdp
from .artifact_store import ArtifactStore, BlobRef, PutRequest, PutResult
from .event_sink import EventEnvelope, EventSink, SinkKind, SinkResult

__all__ = [
    # execution_driver
    "DriverCapabilities",
    "DriverEvent",
    "DriverEventKind",
    "DriverKind",
    "ExecutionDriver",
    "RunHandle",
    "RunRequest",
    "assert_satisfies_protocol",
    # workflow_pack
    "PackManifest",
    "PackPlan",
    "PackStep",
    "WorkflowPack",
    # tool_provider
    "CapabilityClass",
    "CapabilityKind",
    "CapabilitySpec",
    "PolicyDecision",
    "ToolInvocationGateway",
    "ToolProvider",
    "ToolRequest",
    "ToolResponse",
    "assert_satisfies_gateway",
    # policy_decision
    "PolicyBundle",
    "PolicyDecisionPoint",
    "PolicyRule",
    "assert_satisfies_pdp",
    # artifact_store
    "ArtifactStore",
    "BlobRef",
    "PutRequest",
    "PutResult",
    # event_sink
    "EventEnvelope",
    "EventSink",
    "SinkKind",
    "SinkResult",
]