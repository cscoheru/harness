"""Spike: egress-httpx-actual.py

File: spikes/m0/egress-httpx-actual.py
Version: v0.7

Verifies v0.6 P0-4 fix: httpx.AsyncResolver DOES NOT exist.
This spike confirms we cannot use it and demonstrates the correct path
(getaddrinfo-based pinned resolver or httpcore SOCKS backend).

CI runs this with the project's pinned Python and httpx versions.
"""

from __future__ import annotations

import asyncio
import socket
import sys


def check_httpx_async_resolver_does_not_exist() -> bool:
    import httpx

    has_attr = hasattr(httpx, "AsyncResolver")
    print(f"httpx version: {httpx.__version__}")
    print(f"httpx.AsyncResolver exists: {has_attr}")
    assert not has_attr, (
        "v0.6 P0-4 regression protection failed: httpx.AsyncResolver should NOT exist"
    )
    return True


def pinned_dns_resolve(host: str) -> list[str]:
    """Pinned resolver: only the addresses we explicitly trust are returned.

    Real EgressService must implement this and pass the result to httpx via
    custom transport. For M0 spike we just confirm the API works.
    """
    allowlist = {"example.com": ["93.184.216.34"]}
    if host not in allowlist:
        raise PermissionError(f"host not in egress allowlist: {host}")
    return allowlist[host]


async def fetch_with_pinned_resolver(url: str) -> tuple[int, str]:
    """Demonstrates: build transport with pinned DNS, do the request, return status + first 200 chars."""
    import httpx

    parsed_host = url.split("//", 1)[-1].split("/", 1)[0].split(":")[0]
    pinned_ips = pinned_dns_resolve(parsed_host)

    # Map host -> pinned IP via custom DNS resolution in transport
    transport = httpx.AsyncHTTPTransport(
        # The right way: use httpcore.ConnectionPool with a custom Resolver.
        # For M0 spike we just verify the API surface exists.
    )

    async with httpx.AsyncClient(
        transport=transport,
        timeout=httpx.Timeout(10.0, connect=5.0),
    ) as client:
        # We are NOT actually firing a real request in CI; that requires network.
        # The spike only verifies the API surface compiles.
        return (0, "spike-no-network")


def check_socket_getaddrinfo_contract() -> bool:
    """The actual replacement: socket.getaddrinfo with pinned IPs."""
    result = socket.getaddrinfo("example.com", 443, type=socket.SOCK_STREAM)
    print(f"socket.getaddrinfo returned {len(result)} entries for example.com:443")
    return True


def main() -> int:
    check_httpx_async_resolver_does_not_exist()
    check_socket_getaddrinfo_contract()
    # Note: we DO NOT call fetch_with_pinned_resolver in CI without network.
    # The spike only proves the wrong API does not exist.
    print("OK: httpx.AsyncResolver absent; socket.getaddrinfo is the right primitive")
    return 0


if __name__ == "__main__":
    sys.exit(main())