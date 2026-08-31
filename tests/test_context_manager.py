"""SqliteContextManager integration tests.

Covers: distill idempotency, charge (working_set grows + returns total),
snapshot_for_handoff compresses to budget gap, restore_handoff rebuilds
under a new (terminal) attempt, BudgetExceeded when charge overflows I11
trigger, remaining/total budget reads.
"""
from __future__ import annotations

import sqlite3
import uuid

import pytest

from harness.runtime._db import seed_task
from harness.runtime.context_manager import SqliteContextManager
from spec.interfaces.context_distiller import (
    BudgetExceeded,
    ContextError,
    assert_satisfies_budget,
    assert_satisfies_distiller,
)


def _seed_blob(conn: sqlite3.Connection, byte_size: int = 400) -> str:
    """Insert a raw blobs row so distill() has something to point at.

    Inline (mirrors mutation_suite.py pattern); not yet lifted into
    harness.runtime.
    """
    blob_id = f"blob-{uuid.uuid4().hex[:12]}"
    sha = uuid.uuid4().hex + uuid.uuid4().hex
    conn.execute(
        "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
        "  content_type, trust_label) "
        "VALUES (?, ?, ?, 'raw://test', 'application/octet-stream', "
        "  'trusted_user_input')",
        (blob_id, byte_size, sha),
    )
    conn.commit()
    return blob_id


def _seed_terminal_attempt(
    conn: sqlite3.Connection, task_id: str, attempt_id: str,
    fence: int, worker_id: str,
) -> None:
    """Insert a TERMINAL attempt row (status='succeeded') for FK reference.

    Used by restore_handoff tests — the new attempt row can be terminal
    because the partial UNIQUE index ``idx_attempts_one_active`` only
    conflicts on active status; the active row is the original ``att_a``.
    """
    conn.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at) "
        "VALUES (?, 'test', '[]', 'active', '2026-08-30T12:00:00.000Z')",
        (worker_id,),
    )
    conn.execute(
        "INSERT INTO task_attempts "
        "  (task_id, attempt_id, fence_version, worker_id, status, "
        "   lease_token, lease_expires_at, status_version, driver_kind, "
        "   finished_at) "
        "VALUES (?, ?, ?, ?, 'succeeded', 'lease-x', "
        "  '2099-01-01T00:00:00Z', 1, 'codex_sdk', '2026-08-30T12:01:00.000Z')",
        (task_id, attempt_id, fence, worker_id),
    )
    conn.commit()


def test_distill_is_idempotent(conn: sqlite3.Connection) -> None:
    mgr = SqliteContextManager(conn)
    raw = _seed_blob(conn, byte_size=400)  # 100 tokens (400 // 4)
    unit1 = mgr.distill(raw, trust_label="trusted_user_input")
    unit2 = mgr.distill(raw, trust_label="trusted_user_input")
    assert unit1.distilled_blob_id == unit2.distilled_blob_id
    assert unit1.token_count == 100  # 400 // 4
    assert unit1.trust_label == "trusted_user_input"


def test_distill_missing_raw_blob_raises_context_error(conn: sqlite3.Connection) -> None:
    mgr = SqliteContextManager(conn)
    with pytest.raises(ContextError):
        mgr.distill("blob-does-not-exist", "trusted_user_input")


def test_charge_grows_working_set_and_returns_total(
    conn: sqlite3.Connection, attempt,
) -> None:
    mgr = SqliteContextManager(conn)
    raw = _seed_blob(conn, byte_size=400)
    unit = mgr.distill(raw, "trusted_user_input")
    task_id, attempt_id, _lease, _fence = attempt
    # Set budget AFTER the attempt is claimed.
    conn.execute(
        "UPDATE tasks SET context_budget_tokens=? WHERE task_id=?",
        (1000, task_id),
    )
    conn.commit()

    total = mgr.charge(task_id, attempt_id, unit.distilled_blob_id)
    assert total == 100
    total2 = mgr.charge(task_id, attempt_id, unit.distilled_blob_id)
    assert total2 == 200


def test_charge_over_budget_raises_budget_exceeded(
    conn: sqlite3.Connection, attempt,
) -> None:
    mgr = SqliteContextManager(conn)
    raw = _seed_blob(conn, byte_size=400)  # 100 tokens
    unit = mgr.distill(raw, "trusted_user_input")
    task_id, attempt_id, _lease, _fence = attempt
    conn.execute(
        "UPDATE tasks SET context_budget_tokens=? WHERE task_id=?",
        (150, task_id),
    )
    conn.commit()

    mgr.charge(task_id, attempt_id, unit.distilled_blob_id)  # 100 — fits
    with pytest.raises(BudgetExceeded):
        mgr.charge(task_id, attempt_id, unit.distilled_blob_id)  # +100 = 200 > 150


def test_snapshot_for_handoff_then_restore(
    conn: sqlite3.Connection, attempt,
) -> None:
    mgr = SqliteContextManager(conn)
    raw = _seed_blob(conn, byte_size=400)
    unit = mgr.distill(raw, "trusted_user_input")
    task_id, att_a, _lease, fence = attempt
    # Unlimited budget — compressed = ws_total (spike pattern L179-188).
    mgr.charge(task_id, att_a, unit.distilled_blob_id)  # 100 used

    handoff = mgr.snapshot_for_handoff(task_id, att_a)
    assert handoff.compressed_token_count == 100  # ws_total since budget unset
    assert handoff.trust_label == "trusted_user_input"

    # Restore under a NEW terminal attempt (succeeded) so FK is satisfied
    # without violating idx_attempts_one_active (which is partial on
    # status IN active).
    att_b = "att-b-success"
    _seed_terminal_attempt(conn, task_id, att_b, fence, worker_id="w-test-2")
    new_total = mgr.restore_handoff(task_id, handoff.handoff_blob_id, att_b)
    # working_set = L2 att_a (100) + L3 att_a (100) + L2 att_b (100) = 300
    assert new_total == 300


def test_restore_over_budget_raises_budget_exceeded(
    conn: sqlite3.Connection, attempt,
) -> None:
    mgr = SqliteContextManager(conn)
    raw = _seed_blob(conn, byte_size=200)  # 50 tokens
    unit = mgr.distill(raw, "trusted_user_input")
    task_id, att_a, _lease, fence = attempt
    conn.execute(
        "UPDATE tasks SET context_budget_tokens=? WHERE task_id=?",
        (100, task_id),
    )
    conn.commit()
    mgr.charge(task_id, att_a, unit.distilled_blob_id)  # ws=50

    handoff = mgr.snapshot_for_handoff(task_id, att_a)  # compressed = 50; ws=100
    att_b = "att-b-bust"
    _seed_terminal_attempt(conn, task_id, att_b, fence, worker_id="w-test-2")
    # restore(+50) → ws=150 > 100 → BudgetExceeded at restore time.
    with pytest.raises(BudgetExceeded):
        mgr.restore_handoff(task_id, handoff.handoff_blob_id, att_b)


def test_remaining_and_total_reflect_budget(
    conn: sqlite3.Connection, attempt,
) -> None:
    mgr = SqliteContextManager(conn)
    raw = _seed_blob(conn, byte_size=400)
    unit = mgr.distill(raw, "trusted_user_input")
    task_id, att, _l, _f = attempt
    conn.execute(
        "UPDATE tasks SET context_budget_tokens=? WHERE task_id=?",
        (500, task_id),
    )
    conn.commit()
    mgr.charge(task_id, att, unit.distilled_blob_id)  # 100 used
    assert mgr.total(task_id) == 500
    assert mgr.remaining(task_id) == 400
    # Unset budget → None. Need a separate task.
    task_id_none = seed_task(conn)
    assert mgr.total(task_id_none) is None
    assert mgr.remaining(task_id_none) is None


def test_manager_satisfies_protocols(conn: sqlite3.Connection) -> None:
    mgr = SqliteContextManager(conn)
    assert_satisfies_distiller(mgr)
    assert_satisfies_budget(mgr)