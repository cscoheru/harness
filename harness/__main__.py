"""harness.__main__ — entry point for `python -m harness`.

Enables the Dockerfile CMD `["python", "-m", "harness"]` to print the
package version (per ``docs/v1.0-ga-team-plan.md`` §2 T-DO-1). The v1.0
runtime has no main loop yet (workers / gateway / drivers are library
APIs, not standalone processes); the container smoke is therefore a
version print. Real ``__main__`` work (CLI / daemon mode) is deferred
to v1.1.
"""
from __future__ import annotations

import harness

if __name__ == "__main__":
    print(harness.__version__)
