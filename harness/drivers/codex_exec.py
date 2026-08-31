"""harness.drivers.codex_exec — CodexExecDriver (v1.0 stub).

Satisfies the ``ExecutionDriver`` Protocol with ``driver_kind=
CODEX_EXEC``. v1.0 ships the stub only; real ``codex exec --json``
subprocess integration is deferred to v1.1 per
``docs/v1.0-ga-team-plan.md`` §2 T-TG-4.

Inherits all behavior from ``StubDriverBase``; this module exists so
the import path ``harness.drivers.codex_exec`` resolves and the kernel
can statically distinguish driver kinds.
"""
from __future__ import annotations

from spec.interfaces.execution_driver import DriverKind

from ._stub import StubDriverBase

__all__ = ["CodexExecDriver"]


class CodexExecDriver(StubDriverBase):
    """v1.0 stub driver — real codex exec subprocess deferred to v1.1."""

    _driver_kind = DriverKind.CODEX_EXEC
    _evidence_uri = "file://harness/drivers/evidence-exec-stub.json"
    _notes = "v1.0 stub; real codex exec subprocess deferred to v1.1"