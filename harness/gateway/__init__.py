"""harness.gateway — v1.0 production gateway subpackage.

Submodules:
    egress:         HttpEgressService (pinned DNS, redirect re-pin,
                    exponential backoff, proxy-must-be-configured SSRF
                    mitigation) + PinnedResolver lift. T-TG-1.
    gateway:        ToolInvocationGatewayImpl — ADR 0005 six-step chain
                    (lease/fence → PDP → audit → provider → artifact_store
                    → task_links). T-TG-2.
    artifact_store: RealArtifactStore — local_fs backend that satisfies
                    the ArtifactStore Protocol (atomic write, sha256
                    verification, idempotent put, RESTRICT-aware delete).
                    T-TG-3.
"""
from .egress import (
    BLOCKED_NETWORKS,
    HttpEgressService,
    PinnedResolver,
    EgressError,
    ProxyUnreachableError,
    RedirectBlocked,
)
from .gateway import ToolInvocationGatewayImpl, GatewayError
from .artifact_store import (
    RealArtifactStore,
    BlobConflictError,
    Sha256MismatchError,
    BlobNotFoundError,
)

__all__ = [
    # T-TG-1
    "BLOCKED_NETWORKS",
    "HttpEgressService",
    "PinnedResolver",
    "EgressError",
    "ProxyUnreachableError",
    "RedirectBlocked",
    # T-TG-2
    "ToolInvocationGatewayImpl",
    "GatewayError",
    # T-TG-3
    "RealArtifactStore",
    "BlobConflictError",
    "Sha256MismatchError",
    "BlobNotFoundError",
]