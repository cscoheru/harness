"""harness.drivers — v1.0 production ExecutionDriver stubs.

Submodules:
    _stub:       Shared stub base class (idempotent event stream cache,
                 no subprocess / no network / no SDK imports).
    codex_sdk:   ``CodexSdkDriver`` — ``driver_kind=CODEX_SDK``. Real
                 Codex Python SDK integration deferred to v1.1.
    codex_exec:  ``CodexExecDriver`` — ``driver_kind=CODEX_EXEC``.
                 Real ``codex exec --json`` subprocess deferred to v1.1.

Neither driver claims ``supports_tool_gateway=True`` — the Protocol
mandates this for any driver that has never produced real evidence
(see spec/interfaces/execution_driver.py §ExecutionDriver).
"""
from ._stub import StubDriverBase
from .codex_sdk import CodexSdkDriver
from .codex_exec import CodexExecDriver

__all__ = [
    "StubDriverBase",
    "CodexSdkDriver",
    "CodexExecDriver",
]