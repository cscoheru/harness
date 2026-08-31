"""harness.drivers.codex_sdk — CodexSdkDriver (v1.0 stub).

Satisfies the ``ExecutionDriver`` Protocol with ``driver_kind=
CODEX_SDK``. v1.0 ships the stub only; real Codex Python SDK integration
is deferred to v1.1 per ``docs/v1.0-ga-team-plan.md`` §2 T-TG-4.

Inherits all behavior from ``StubDriverBase``; this module exists so
the import path ``harness.drivers.codex_sdk`` resolves and the kernel
can statically distinguish driver kinds.
"""
from __future__ import annotations

from spec.interfaces.execution_driver import DriverKind

from ._stub import StubDriverBase

__all__ = ["CodexSdkDriver"]


class CodexSdkDriver(StubDriverBase):
    """v1.0 stub driver — real Codex SDK deferred to v1.1."""

    _driver_kind = DriverKind.CODEX_SDK
    _evidence_uri = "file://harness/drivers/evidence-sdk-stub.json"
    _notes = "v1.0 stub; real Codex Python SDK deferred to v1.1"