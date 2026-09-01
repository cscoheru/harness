"""harness.benchmark — T-QA-3 throughput / latency benchmark suite.

CLI: ``python -m harness.benchmark.runner`` (see DISPATCH-T-QA-3 §行为契约).

Hard gate (default run, --tasks=50 --workers=4): p99 < 5000 ms.  If the
gate fails, the CLI exits with a non-zero status so the deploy workflow
can block on it.

Submodule import uses PEP 562 ``__getattr__`` to avoid Python 3.14's
RuntimeWarning ('harness.benchmark.runner found in sys.modules after
import of package harness.benchmark') when the CLI is invoked via
``python -m harness.benchmark.runner`` — see harness/testing/__init__.py
for the same pattern.
"""
__all__ = ["runner"]


def __getattr__(name: str):
    if name == "runner":
        # FAIL-1 fix (Codex v1.0.0a1 review): ``from . import runner`` triggers
        # PEP 562 __getattr__("runner") recursion (Python's import system calls
        # hasattr on the parent package). Use importlib.import_module to break
        # the cycle. Harness/testing/__init__.py is unaffected because its
        # lazy exports are attribute names (``run_mutations`` / ``MUTATIONS``)
        # not submodule names.
        import importlib

        return importlib.import_module("harness.benchmark.runner")
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")