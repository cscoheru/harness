"""Spike: policy-direction-test.py

File: spikes/m0/policy-direction-test.py
Version: v0.7

Verifies Q109 / P1-10: deny decisions can NEVER be widened by approval.
A request that policy denies MUST stay denied even if the user "approves" it.
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import tempfile
import uuid

from _helpers import make_db, seed_task, claim


def evaluate(pdp_rules: list[dict], capability_id: str, trust_label: str) -> str:
    """Returns 'allow' | 'deny' | 'needs_approval'.

    Direction is forced: deny > needs_approval > allow.
    """
    decisions = []
    for rule in pdp_rules:
        if rule["capability_pattern"] == "*" or rule["capability_pattern"] == capability_id:
            decisions.append(rule["decision"])
    if "deny" in decisions:
        return "deny"
    if "needs_approval" in decisions:
        return "needs_approval"
    return "allow"


def attempt_with_approval(
    rule_set: list[dict], capability_id: str, trust_label: str, user_approves: bool
) -> str:
    """Simulates the full flow: evaluate, then if needs_approval, user decides."""
    initial = evaluate(rule_set, capability_id, trust_label)
    if initial == "allow":
        return "executed"
    if initial == "deny":
        # approval CANNOT expand rights
        if user_approves:
            return "still_denied"  # invariant: deny wins
        return "still_denied"
    # needs_approval path
    return "executed" if user_approves else "rejected"


def main() -> int:
    rules = [
        {"rule_id": "r1", "capability_pattern": "secret.read", "decision": "deny"},
        {"rule_id": "r2", "capability_pattern": "web.fetch", "decision": "needs_approval"},
        {"rule_id": "r3", "capability_pattern": "*", "decision": "allow"},
    ]

    # Case A: deny rule beats user approval
    result = attempt_with_approval(rules, "secret.read", "trusted_user_input", user_approves=True)
    assert result == "still_denied", (
        f"Q109 violation: deny must NOT be widened by approval; got {result}"
    )

    # Case B: needs_approval behaves correctly
    result = attempt_with_approval(rules, "web.fetch", "trusted_user_input", user_approves=True)
    assert result == "executed", "needs_approval + user approves = executed"
    result = attempt_with_approval(rules, "web.fetch", "trusted_user_input", user_approves=False)
    assert result == "rejected", "needs_approval + user rejects = rejected"

    # Case C: unconditional allow (no deny rule present)
    result = attempt_with_approval(rules, "compute.pi", "trusted_user_input", user_approves=False)
    assert result == "executed", "unconditional allow = executed regardless of approval"

    print("OK: deny > needs_approval > allow direction enforced; approval cannot widen deny")
    return 0


if __name__ == "__main__":
    sys.exit(main())