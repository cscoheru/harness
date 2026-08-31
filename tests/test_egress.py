"""HttpEgressService + PinnedResolver integration tests.

No real network: uses httpx.MockTransport per DISPATCH-T-QA-2 §3. This is
also why we never exercise 127.0.0.1 (BLOCKED_NETWORKS covers it).
"""
from __future__ import annotations

import httpx
import pytest

from harness.gateway.egress import (
    BLOCKED_NETWORKS,
    HttpEgressService,
    PinnedResolver,
    ProxyUnreachableError,
    RedirectBlocked,
)


def test_pinned_resolver_allows_pinned_ip() -> None:
    r = PinnedResolver(allowlist={"api.example.com": ["93.184.216.34"]})
    assert r.resolve("api.example.com") == ["93.184.216.34"]


def test_pinned_resolver_rejects_unlisted_host() -> None:
    r = PinnedResolver(allowlist={"api.example.com": ["93.184.216.34"]})
    with pytest.raises(PermissionError):
        r.resolve("evil.example.com")


def test_pinned_resolver_rejects_blocked_ip_even_if_allowlisted() -> None:
    # Even if someone tries to allowlist 10.0.0.1, BLOCKED_NETWORKS wins.
    r = PinnedResolver(allowlist={"lan.local": ["10.0.0.1"]})
    with pytest.raises(PermissionError):
        r.resolve("lan.local")


@pytest.mark.parametrize("ip", ["10.0.0.5", "127.0.0.1", "169.254.169.254", "::1"])
def test_pinned_resolver_blocks_private_ip_set(ip: str) -> None:
    r = PinnedResolver(allowlist={"x": [ip]})
    with pytest.raises(PermissionError):
        r.resolve("x")


def test_reject_rebinding_catches_unexpected_ip() -> None:
    r = PinnedResolver(allowlist={"api.example.com": ["93.184.216.34"]})
    # observed_ips includes an IP NOT in the pinned set → DNS rebinding detected.
    with pytest.raises(PermissionError):
        r.reject_rebinding("api.example.com", ["93.184.216.34", "10.0.0.1"])


def test_egress_refuses_without_proxy_or_transport() -> None:
    """SSRF refusal: refuse to fall back to direct connection."""
    r = PinnedResolver(allowlist={"api.example.com": ["93.184.216.34"]})
    svc = HttpEgressService(resolver=r)  # no proxy, no transport
    with pytest.raises(ProxyUnreachableError):
        import asyncio
        asyncio.run(svc.fetch("https://api.example.com/page"))


def test_egress_happy_path_with_mock_transport() -> None:
    """MockTransport short-circuits all I/O — PinnedResolver still gates host."""
    r = PinnedResolver(allowlist={"api.example.com": ["93.184.216.34"]})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": True})

    svc = HttpEgressService(
        resolver=r, transport=httpx.MockTransport(handler), max_retries=1,
    )
    import asyncio
    resp = asyncio.run(svc.fetch("https://api.example.com/page"))
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_egress_unlisted_host_raises_redirect_blocked() -> None:
    """Even with a transport, an unlisted host is rejected by the resolver."""
    r = PinnedResolver(allowlist={"api.example.com": ["93.184.216.34"]})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200)  # never reached

    svc = HttpEgressService(
        resolver=r, transport=httpx.MockTransport(handler), max_retries=1,
    )
    import asyncio
    with pytest.raises(RedirectBlocked):
        asyncio.run(svc.fetch("https://evil.example.com/page"))


def test_egress_redirect_to_unlisted_host_blocked() -> None:
    """3xx to a host NOT in the allowlist must raise RedirectBlocked."""
    r = PinnedResolver(allowlist={
        "api.example.com": ["93.184.216.34"],
        # Note: redirect target host is NOT in allowlist.
    })

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.example.com":
            return httpx.Response(302, headers={"location": "https://evil.example.com/x"})
        return httpx.Response(200)

    svc = HttpEgressService(
        resolver=r, transport=httpx.MockTransport(handler), max_retries=1,
    )
    import asyncio
    with pytest.raises(RedirectBlocked):
        asyncio.run(svc.fetch("https://api.example.com/page"))


def test_backoff_delay_is_exponential_capped() -> None:
    r = PinnedResolver(allowlist={"x": ["93.184.216.34"]})
    svc = HttpEgressService(resolver=r, base_delay=0.5, factor=2.0, max_delay=8.0)
    assert svc.backoff_delay(0) == 0.5
    assert svc.backoff_delay(1) == 1.0
    assert svc.backoff_delay(2) == 2.0
    assert svc.backoff_delay(3) == 4.0
    assert svc.backoff_delay(4) == 8.0   # cap
    assert svc.backoff_delay(10) == 8.0  # cap holds


def test_retry_on_connect_error_then_success() -> None:
    """ConnectError twice, then success — backoff is exercised, third try wins."""
    r = PinnedResolver(allowlist={"api.example.com": ["93.184.216.34"]})
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise httpx.ConnectError("simulated", request=request)
        return httpx.Response(200, json={"ok": True})

    svc = HttpEgressService(
        resolver=r,
        transport=httpx.MockTransport(handler),
        max_retries=3,
        base_delay=0.001,  # speed up the test
        factor=2.0,
        max_delay=0.01,
    )
    import asyncio
    resp = asyncio.run(svc.fetch("https://api.example.com/page"))
    assert resp.status_code == 200
    assert call_count["n"] == 3