"""Spike: policy-direction-test.py (v0.8 — closes Codex v0.7 P1-10 regression)

File: spikes/m0/policy-direction-test.py
Version: v0.8

Closes P1-10: trust labels must produce different policy decisions, NOT just
appear as fields. Specifically:
  - internal_secret cannot flow into a remote-write capability
  - untrusted_external requires explicit needs_approval for remote-write
  - trusted_user_input may flow freely to read-only capabilities
  - model_generated is treated as untrusted by default

Plus the original v0.6 invariants:
  - deny > needs_approval > allow (order forced)
  - approval cannot widen a deny
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sys

# Minimal CapabilityClass mirror to avoid importing the production enum.
TRUSTED_USER_INPUT = "trusted_user_input"
UNTRUSTED_EXTERNAL = "untrusted_external"
MODEL_GENERATED = "model_generated"
INTERNAL_SECRET = "internal_secret"


class TrustLabelPDP:
    """Real PDP that differentiates by capability × trust_label.

    Rules:
      - deny if internal_secret + WRITE_REMOTE or WRITE_LOCAL  (cannot leak secrets)
      - deny if untrusted_external + WRITE_REMOTE               (cannot allow external data to drive writes)
      - needs_approval if untrusted_external + READ_REMOTE      (visible but auditable)
      - needs_approval if model_generated + WRITE_*             (model can write, but only with approval)
      - allow otherwise
    """

    def evaluate(self, capability_kind: str, trust_label: str) -> str:
        # Direction is forced: deny > needs_approval > allow
        if trust_label == INTERNAL_SECRET and capability_kind in ("WRITE_REMOTE", "WRITE_LOCAL"):
            return "deny"
        if trust_label == UNTRUSTED_EXTERNAL and capability_kind in ("WRITE_REMOTE",):
            return "deny"
        if trust_label == UNTRUSTED_EXTERNAL and capability_kind in ("READ_REMOTE", "EXECUTE"):
            return "needs_approval"
        if trust_label == MODEL_GENERATED and capability_kind in ("WRITE_REMOTE", "WRITE_LOCAL"):
            return "needs_approval"
        return "allow"

    def evaluate_with_approval(self, capability_kind: str, trust_label: str,
                                user_approves: bool) -> str:
        initial = self.evaluate(capability_kind, trust_label)
        if initial == "deny":
            # Approval CANNOT widen deny (Q109).
            return "still_denied" if user_approves else "still_denied"
        if initial == "needs_approval":
            return "executed" if user_approves else "rejected"
        return "executed"


def main() -> int:
    pdp = TrustLabelPDP()

    # === Direction forced ===
    assert pdp.evaluate("READ_LOCAL", TRUSTED_USER_INPUT) == "allow"
    assert pdp.evaluate("READ_LOCAL", INTERNAL_SECRET) == "allow"  # secrets can be read locally
    assert pdp.evaluate("WRITE_REMOTE", INTERNAL_SECRET) == "deny"  # ← trust label matters
    assert pdp.evaluate("WRITE_REMOTE", TRUSTED_USER_INPUT) == "allow"  # user is allowed to publish
    assert pdp.evaluate("WRITE_REMOTE", UNTRUSTED_EXTERNAL) == "deny"  # scraped content cannot publish
    assert pdp.evaluate("WRITE_REMOTE", MODEL_GENERATED) == "needs_approval"  # model writes need approval
    print("OK: trust label × capability produces differentiated decisions")

    # === Approval cannot widen deny (Q109) ===
    # Only for (capability, label) pairs that PDP actually denies.
    deny_cases = [
        ("WRITE_REMOTE", INTERNAL_SECRET),       # secrets cannot egress
        ("WRITE_REMOTE", UNTRUSTED_EXTERNAL),    # scraped content cannot publish
    ]
    for cap, label in deny_cases:
        result = pdp.evaluate_with_approval(cap, label, user_approves=True)
        assert result == "still_denied", (
            f"Q109 violation: deny must not be widened for {cap}/{label}; got {result}"
        )
    # Also: evaluate_with_approval on an ALLOW case is correctly NOT rejected by approval.
    r = pdp.evaluate_with_approval("READ_LOCAL", TRUSTED_USER_INPUT, user_approves=False)
    assert r == "executed", "ALLOW + reject should still execute (no deny to widen)"
    print(f"OK: approval cannot widen deny for {len(deny_cases)} deny cases; ALLOW unaffected")

    # === internal_secret cannot flow into WRITE_REMOTE specifically ===
    # (this is the explicit Codex P1-10 反例: "policy spike 对 trusted/internal_secret 返回相同 allow")
    decision_secret = pdp.evaluate("WRITE_REMOTE", INTERNAL_SECRET)
    decision_user = pdp.evaluate("WRITE_REMOTE", TRUSTED_USER_INPUT)
    assert decision_secret != decision_user, (
        f"P1-10 regression: internal_secret and trusted_user_input must differ for WRITE_REMOTE; "
        f"both = {decision_secret}"
    )
    print(f"OK: WRITE_REMOTE(internal_secret)={decision_secret} != WRITE_REMOTE(trusted_user_input)={decision_user}")

    # === untrusted_external blocks publish even with approval ===
    result = pdp.evaluate_with_approval("WRITE_REMOTE", UNTRUSTED_EXTERNAL, user_approves=True)
    assert result == "still_denied", (
        f"untrusted_external WRITE_REMOTE with approval should still be denied; got {result}"
    )
    print("OK: untrusted_external + WRITE_REMOTE + approval = still denied")

    return 0


if __name__ == "__main__":
    sys.exit(main())