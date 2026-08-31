"""harness.testing — v1.0 test fixtures and helpers.

Submodules:
    echo_server: ``InProcessEgressServer`` — stdlib HTTP echo server bound
                 to 127.0.0.1, lifecycle owned by context manager. Use
                 with plain httpx (production HttpEgressService blocks
                 loopback per ``harness/gateway/egress.py`` BLOCKED_NETWORKS).
    mutation_suite: ``run_mutations() -> dict[str, bool]`` — reverse-DROP
                 causal-chain evidence for schema constraints (v0.9.4 M1-M18,
                 M12 removed). CLI: ``python -m harness.testing.mutation_suite``.

Lazy attribute access: importing this package does NOT eagerly pull in
``mutation_suite`` (which is a heavy module — runs 17 file-DB mutations).
Callers that need it can either:
  - ``python -m harness.testing.mutation_suite``   (recommended)
  - ``from harness.testing.mutation_suite import run_mutations, MUTATIONS``
This avoids Python 3.14 RuntimeWarning about sys.modules pollution when
``python -m harness.testing.mutation_suite`` runs after ``harness.testing``
is already imported by ``__init__``.
"""
from .echo_server import InProcessEgressServer

__all__ = ["InProcessEgressServer", "run_mutations", "MUTATIONS"]


def __getattr__(name: str):
    """Lazy submodule attribute access (PEP 562)."""
    if name in ("run_mutations", "MUTATIONS"):
        from . import mutation_suite as _ms
        return getattr(_ms, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")