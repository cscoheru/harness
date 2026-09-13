"""harness.__main__ — entry point for `python -m harness`.

Default (no args): print package version (v1.0 behavior preserved per
``docs/v1.0-ga-team-plan.md`` §2 T-DO-1 contract).

New in v1.2.0k (per ADR 0012 Decision a): `server` subcommand launches
the FastAPI HTTP daemon via uvicorn. ``python -m harness server --port 4001``
starts the kernel HTTP facade.

The v1.0 runtime had no main loop (workers / gateway / drivers were
library APIs, not standalone processes); the container smoke was a
version print. v1.2.0k adds the server subcommand while preserving
the default behavior — `python -m harness` still prints version.
"""
from __future__ import annotations

import sys

import harness

__version__ = harness.__version__


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "server":
        # Defer import until needed — keeps `python -m harness` fast
        # for the v1.0 version-print smoke test.
        from harness.server import main_server

        sys.exit(main_server(sys.argv[2:]) or 0)
    # Default v1.0 behavior: print package version.
    print(__version__)


if __name__ == "__main__":
    main()
