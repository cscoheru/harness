"""harness.testing — v1.0 test fixtures and helpers.

Submodules:
    echo_server: ``InProcessEgressServer`` — stdlib HTTP echo server bound
                 to 127.0.0.1, lifecycle owned by context manager. Use
                 with plain httpx (production HttpEgressService blocks
                 loopback per ``harness/gateway/egress.py`` BLOCKED_NETWORKS).
"""
from .echo_server import InProcessEgressServer

__all__ = ["InProcessEgressServer"]