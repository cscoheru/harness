"""harness.gateway.egress — HttpEgressService + PinnedResolver (v1.0 production).

Lift of ``spikes/m0/egress-httpx-actual.py`` v0.8 PinnedResolver (BLOCKED_NETWORKS
+ resolve / validate_ip / reject_rebinding). Behavior preserved byte-for-byte
so ``spikes/m0/egress-httpx-actual.py`` 8-case security test set stays green
unchanged.

Production hardening beyond the spike:
  - ``HttpEgressService.fetch()`` runs the request through the pinned
    resolver BEFORE opening a connection (URL host must be in the
    allowlist). On a 3xx redirect, the target host is re-validated.
  - Retryable failures (ConnectError / RemoteProtocolError) are retried
    up to ``max_retries`` with exponential backoff (base 0.5s, factor 2,
    cap 8s). 4xx and 5xx (other than the listed retryables) surface
    immediately — backoff only kicks in for transport-level faults.
  - Without a configured proxy, ``fetch()`` raises
    ``ProxyUnreachableError`` (SSRF mitigation: refuses to fall back
    to direct connection).

Acceptance (per ``docs/v1.0-ga-team-plan.md`` §2 T-TG-1):
  ``python3 spikes/m0/egress-httpx-actual.py`` — 8 cases 全绿 (行为零变化)
"""
from __future__ import annotations

import asyncio
import ipaddress
import random
from typing import Optional
from urllib.parse import urlparse

import httpx

__all__ = [
    "BLOCKED_NETWORKS",
    "PinnedResolver",
    "EgressError",
    "ProxyUnreachableError",
    "RedirectBlocked",
    "HttpEgressService",
]


# Hard-block these networks regardless of allowlist (mirrors spike).
BLOCKED_NETWORKS = [
    ipaddress.ip_network(n) for n in [
        "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
        "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16",
        "224.0.0.0/4", "240.0.0.0/4",
        "::1/128", "fc00::/7", "fe80::/10",
    ]
]


class EgressError(Exception):
    """Base for egress failures."""


class ProxyUnreachableError(EgressError):
    """Raised when configured proxy cannot be reached (or is not configured)."""


class RedirectBlocked(EgressError):
    """Raised when a 3xx redirect target fails to re-pin."""


class PinnedResolver:
    """Pin-DNS resolver. Allowlist host → IP mapping; rejects private/metadata.

    Behavior lifted from ``spikes/m0/egress-httpx-actual.py:37-88``. The
    spike test set verifies every method here; the production
    ``HttpEgressService`` composes on top.
    """

    def __init__(self, allowlist: dict[str, list[str]]):
        self.allowlist = allowlist  # host -> [pinned IPs]

    def resolve(self, host: str) -> list[str]:
        """Return ONLY the allowlist IPs for ``host``; reject unlisted."""
        if host not in self.allowlist:
            raise PermissionError(f"host not in egress allowlist: {host}")
        ips = self.allowlist[host]
        for ip in ips:
            self.validate_ip(ip)  # even pinned IPs must not be private
        return list(ips)

    def validate_ip(self, ip_str: str) -> None:
        """Reject if ``ip_str`` falls in BLOCKED_NETWORKS."""
        ip = ipaddress.ip_address(ip_str)
        for net in BLOCKED_NETWORKS:
            if ip in net:
                raise PermissionError(
                    f"egress IP blocked: {ip_str} is in {net} "
                    f"(private/metadata/link-local/multicast)"
                )

    def reject_rebinding(self, host: str, observed_ips: list[str]) -> None:
        """Verify observed connection IPs are still in the pinned set."""
        allowed = set(self.allowlist.get(host, []))
        for ip in observed_ips:
            if ip not in allowed:
                raise PermissionError(
                    f"DNS rebinding detected: {host} resolved to {ip}, "
                    f"not in pinned set {allowed}"
                )


class HttpEgressService:
    """Async egress with pinned DNS, redirect re-pin, exponential backoff.

    Args:
        resolver: PinnedResolver (allowlist host → IPs).
        proxy: Proxy URL. If None AND no transport injected, ``fetch()``
            refuses to run (SSRF mitigation).
        max_retries: Total attempts (1 = no retry; 3 = original + 2 retries).
        base_delay: First backoff in seconds (default 0.5).
        factor: Backoff multiplier per attempt (default 2.0).
        max_delay: Backoff cap in seconds (default 8.0).
        transport: Optional httpx.AsyncBaseTransport for tests
            (e.g. ``httpx.MockTransport``).
    """

    _RETRYABLE: tuple[type[Exception], ...] = (
        httpx.ConnectError,
        httpx.RemoteProtocolError,
    )

    def __init__(
        self,
        resolver: PinnedResolver,
        proxy: Optional[str] = None,
        max_retries: int = 3,
        base_delay: float = 0.5,
        factor: float = 2.0,
        max_delay: float = 8.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._resolver = resolver
        self._proxy = proxy
        self._max_retries = max_retries
        self._base_delay = base_delay
        self._factor = factor
        self._max_delay = max_delay
        self._transport = transport

    @property
    def proxy(self) -> Optional[str]:
        return self._proxy

    @property
    def resolver(self) -> PinnedResolver:
        return self._resolver

    def backoff_delay(self, attempt: int) -> float:
        """Exponential backoff with cap; attempt 0 → base_delay."""
        base = self._base_delay * (self._factor ** attempt)
        return min(base, self._max_delay)

    async def fetch(self, url: str) -> httpx.Response:
        """Fetch URL with pinned DNS, redirect re-pin, exponential backoff.

        Raises:
            ProxyUnreachableError: no proxy + no injected transport
                (SSRF refusal), or all retries exhausted on transport faults.
            RedirectBlocked: redirect target host not in allowlist (or its
                IP fails validate_ip). Propagates from ``PinnedResolver``
                as ``PermissionError`` → wrapped here.
        """
        if self._proxy is None and self._transport is None:
            raise ProxyUnreachableError(
                "no pinned proxy configured; refuse to send (SSRF risk)"
            )

        # Pinned DNS: validate URL host before any connection attempt.
        host = self._validate_host(url)

        last_exc: Optional[Exception] = None
        for attempt in range(self._max_retries):
            try:
                async with httpx.AsyncClient(
                    proxy=self._proxy, transport=self._transport
                ) as client:
                    response = await client.get(url)
                if response.is_redirect:
                    new_url = response.headers.get("location") or str(response.url)
                    self._validate_host(new_url)
                    async with httpx.AsyncClient(
                        proxy=self._proxy, transport=self._transport
                    ) as client:
                        response = await client.get(new_url)
                return response
            except PermissionError as e:
                # Allowlist violation (initial URL or redirect target) — not retryable.
                raise RedirectBlocked(str(e)) from e
            except self._RETRYABLE as e:
                last_exc = e
                if attempt < self._max_retries - 1:
                    delay = self.backoff_delay(attempt) * random.uniform(1.0, 1.1)
                    await asyncio.sleep(delay)
                    continue
        raise ProxyUnreachableError(
            f"all {self._max_retries} attempts exhausted: {last_exc}"
        )

    @staticmethod
    def _host_of(url: str) -> str:
        return (urlparse(url).hostname or "").lower()

    def _validate_host(self, url: str) -> str:
        """Resolve+validate host; wrap PermissionError as RedirectBlocked."""
        host = self._host_of(url)
        try:
            self._resolver.resolve(host)
        except PermissionError as e:
            raise RedirectBlocked(str(e)) from e
        return host