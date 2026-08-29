"""WorkflowPack Protocol — pluggable business workflows.

File: spec/interfaces/workflow_pack.py
Version: v0.7

A WorkflowPack defines the "what to do" for a task, while the kernel handles
"how to make it durable". Packs are stateless; all state lives in blobs/artifacts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class PackManifest:
    name: str  # e.g. 'web_research'
    version: str  # semver; pinned in tasks.workflow_version
    description: str
    required_capabilities: tuple[str, ...]  # e.g. ('web.search', 'web.fetch')
    optional_capabilities: tuple[str, ...]
    input_schema_ref: str  # relative path to JSON Schema
    output_kind: str  # 'report.markdown' | 'transcript.json' | ...


@dataclass(frozen=True)
class PackStep:
    """One step in a workflow. Stateless; may re-run safely."""

    name: str
    capability: str  # capability id
    input_ref: str  # blob_id or relative path
    output_kind: str
    depends_on: tuple[str, ...]
    timeout_seconds: int


@dataclass(frozen=True)
class PackPlan:
    """A directed acyclic graph of steps. The kernel walks this.

    The kernel enforces dependency order, retry policy, and cancel propagation.
    The Pack only describes WHAT runs, not HOW.
    """

    steps: tuple[PackStep, ...]


@runtime_checkable
class WorkflowPack(Protocol):
    """Stateless. The kernel may load many versions side-by-side.

    Properties:
      - plan() MUST be deterministic for a given input_blob_id + workflow_version.
      - manifest() MUST be stable across processes; the kernel caches it.
      - The pack MUST NOT directly call any external service. All side effects
        go through ToolInvocationGateway (see tool_provider.py).
    """

    def manifest(self) -> PackManifest: ...

    async def plan(
        self, input_blob_id: str, context: dict
    ) -> PackPlan: ...