"""harness.testing.echo_server — InProcessEgressServer (v1.0 testing fixture).

In-process HTTP echo server for local integration tests. Production egress
(HttpEgressService) blocks 127.0.0.0/8 (see ``harness/gateway/egress.py``
``BLOCKED_NETWORKS``), so tests that need a deterministic upstream MUST
use plain httpx to talk to this server — not HttpEgressService.

Hard invariants:
  - Bound to 127.0.0.1 ONLY. The host is hardcoded; this is a fixture,
    not a production egress target.
  - ``port=0`` lets the kernel pick an ephemeral port (so multiple
    concurrent test runs cannot collide).
  - Lifecycle is owned by ``__enter__`` / ``__exit__``: ``__exit__``
    calls ``shutdown()`` (signal serve_forever to exit) THEN
    ``server_close()`` (release the listening socket). On exit the
    socket is closed; subsequent connect() attempts fail with
    ``ConnectionRefusedError``.
  - Thread is daemon so it never blocks process exit if ``__exit__``
    is skipped in a test failure path.

End-to-end smoke: ``python3 -m harness.testing.echo_server`` exercises
all five contract phases (import, GET/POST echo, post-exit
disconnect, re-bind, host check).
"""
from __future__ import annotations

import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

__all__ = ["InProcessEgressServer"]


# Pin to loopback only. Hardcoded on purpose — see module docstring.
_FIXTURE_HOST = "127.0.0.1"


class _EchoHandler(BaseHTTPRequestHandler):
    """HTTP handler that echoes request method + path (GET) or body (POST).

    Methods:
      - GET /echo or /echo?... → 200, body = ``"echo: GET /echo"``
      - POST /echo            → 200, body = request payload verbatim
      - anything else         → 404
    """

    # Silence default access log to keep test output clean.
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        if self.path.startswith("/echo"):
            body = f"echo: GET {self.path}".encode("utf-8")
            self._send(200, body, "text/plain; charset=utf-8")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self) -> None:  # noqa: N802
        if self.path.startswith("/echo"):
            length = int(self.headers.get("Content-Length", "0") or "0")
            payload = self.rfile.read(length) if length > 0 else b""
            self._send(200, payload, "application/octet-stream")
        else:
            self._send(404, b"not found", "text/plain")


class InProcessEgressServer:
    """In-process HTTP echo server bound to 127.0.0.1.

    Use as a context manager. Inside the ``with`` block, ``port`` /
    ``base_url`` are reachable; after the block, the socket is closed.

    Example:
        with InProcessEgressServer() as srv:
            resp = httpx.get(f"{srv.base_url}/echo")
            assert resp.status_code == 200

    Args:
        port: TCP port to bind. ``0`` (default) lets the kernel pick
            an ephemeral free port — recommended for tests.
    """

    def __init__(self, port: int = 0) -> None:
        # Hardcoded host — see module docstring on why.
        self._host = _FIXTURE_HOST
        # ThreadingHTTPServer.server_bind() runs in __init__, so the
        # socket is allocated eagerly. If bind fails (e.g. port in use
        # and port != 0), the exception propagates and no thread is
        # started — clean failure.
        self._server = ThreadingHTTPServer((self._host, port), _EchoHandler)
        self._thread: Optional[threading.Thread] = None

    # ---- read-only properties ----

    @property
    def host(self) -> str:
        """The bound host. Always ``"127.0.0.1"``."""
        return self._host

    @property
    def port(self) -> int:
        """The bound TCP port (kernel-assigned if ``port=0`` was passed)."""
        # server_address[1] is the bound port for AF_INET servers.
        return int(self._server.server_address[1])

    @property
    def base_url(self) -> str:
        """``http://127.0.0.1:{port}`` — drop-in URL prefix for tests."""
        return f"http://{self._host}:{self.port}"

    # ---- context manager ----

    def __enter__(self) -> "InProcessEgressServer":
        # Start serve_forever in a daemon thread. Daemon=True so the
        # thread never blocks process exit if __exit__ is skipped in a
        # test failure path.
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            name=f"InProcessEgressServer-{self.port}",
            daemon=True,
        )
        self._thread.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        # Step 1: signal serve_forever to exit (returns when handler
        # loop drains). This is blocking but the thread is daemon.
        self._server.shutdown()
        # Step 2: actually close the listening socket and release the
        # port. Without this, the port stays bound until GC.
        self._server.server_close()
        # Join thread for clean shutdown (daemon, so won't hang).
        if self._thread is not None:
            self._thread.join(timeout=2.0)
        # Do not suppress exceptions — let them propagate per __exit__.
        return None


# ==================== module-level smoke ====================
def _smoke() -> int:
    """5-phase contract smoke; mirrors the T-TG-5 task contract."""
    import httpx

    print("=" * 60)
    print("T-TG-5 smoke: InProcessEgressServer (5 phases)")
    print("=" * 60)

    # Phase 1: import OK (already happened via `from harness.testing`)
    print("\n[Phase 1] import harness.testing.InProcessEgressServer ... OK")

    # Phase 2: GET/POST echo 200 inside `with`
    print("\n[Phase 2] inside `with`: GET / POST echo")
    with InProcessEgressServer() as srv:
        r_get = httpx.get(f"{srv.base_url}/echo")
        assert r_get.status_code == 200, f"GET /echo expected 200, got {r_get.status_code}"
        assert r_get.text == "echo: GET /echo", f"unexpected body: {r_get.text!r}"
        print(f"  ✓ GET /echo → 200, body={r_get.text!r}")

        r_post = httpx.post(f"{srv.base_url}/echo", content=b"hello world")
        assert r_post.status_code == 200, f"POST /echo expected 200, got {r_post.status_code}"
        assert r_post.content == b"hello world", f"echo mismatch: {r_post.content!r}"
        print(f"  ✓ POST /echo → 200, body={r_post.content!r} (round-trip)")

    # Phase 3: post-exit connect must fail
    print("\n[Phase 3] post-exit: connect refused")
    port_after = srv.port  # properties still readable after close
    base_after = srv.base_url
    try:
        httpx.get(f"{base_after}/echo", timeout=1.0)
    except (httpx.ConnectError, httpx.ConnectTimeout, ConnectionRefusedError, OSError) as e:
        print(f"  ✓ connect failed as expected: {type(e).__name__}")
    else:
        raise AssertionError(
            f"post-exit connect succeeded; server still listening on {base_after}"
        )

    # Phase 4: re-bind — two consecutive `with` blocks
    print("\n[Phase 4] consecutive `with` blocks: rebind OK")
    with InProcessEgressServer() as srv_a:
        url_a = srv_a.base_url
        r = httpx.get(f"{url_a}/echo")
        assert r.status_code == 200
    with InProcessEgressServer() as srv_b:
        url_b = srv_b.base_url
        assert url_a != url_b or srv_a.port != srv_b.port, "ephemeral ports must differ"
        r = httpx.get(f"{url_b}/echo")
        assert r.status_code == 200
    print(f"  ✓ first  base_url={url_a}")
    print(f"  ✓ second base_url={url_b}")
    print(f"  ✓ both blocks bound + released (no port collision)")

    # Phase 5: host must be 127.0.0.1
    print("\n[Phase 5] host is hardcoded 127.0.0.1")
    with InProcessEgressServer() as srv:
        assert srv.host == "127.0.0.1", f"host must be 127.0.0.1, got {srv.host!r}"
        print(f"  ✓ host={srv.host!r} (hardcoded; BLOCKED_NETWORKS proof)")

    print("\n" + "=" * 60)
    print("ALL 5 PHASES PASS")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(_smoke())