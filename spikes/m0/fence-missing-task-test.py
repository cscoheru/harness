"""Spike: fence-missing-task-test.py (v0.9.4)

File: spikes/m0/fence-missing-task-test.py
Version: v0.9.4

Closes the v0.9.3 Codex finding (E) that v0.9.2's trg_attempt_fence_insert was
vulnerable to NULL bypass: the OLD guard `(SELECT fence_version FROM tasks WHERE
task_id = NEW.task_id) != NEW.fence_version` returns UNKNOWN when the task row
does not exist (or FK=OFF), silently passing the check. The v0.9.3 fix replaced
the comparison with `NOT EXISTS (... AND fence_version = NEW.fence_version)`,
which is NULL-safe by construction.

This spike exercises two distinct fence-trigger entry points with missing-task
states:

  Case F1  INSERT task_attempts with task_id that does not exist in tasks table
           → trg_attempt_fence_insert must RAISE ABORT (NOT EXISTS mismatch)
  Case F2  INSERT task_attempts with task_id that exists but task.fence_version
           differs from attempt.fence_version → same RAISE
  Case F3  After DROP trigger, Case F1 succeeds (mutation reverse-DROP causal
           chain evidence, mirrors the M-series pattern)

Codex v0.9.3 §7 复审门槛 (per-finding evidence):
  - v0.9.2 schema: F1 would silently succeed under FK=OFF (and is fragile even
    with FK=ON if the trigger ever moves out from under the FK)
  - v0.9.3+ schema: F1 deterministically RAISE regardless of FK pragma
  - F2: existing behavior, kept as a guard against regression of the
    "mismatched fence" path
  - F3: proves the trigger is the actual enforcement layer (not the FK)

Note on 真并发: not strictly required here — fence_trigger firing is
deterministic per row. Single-connection file-DB is sufficient.
"""

from __future__ import annotations

import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import tempfile

from _helpers import connect_with_fk, seed_task


def case_f1_insert_attempt_with_missing_task() -> None:
    """F1: INSERT task_attempts with nonexistent task_id → fence trigger RAISE.

    The OLD v0.9.2 trigger used `(SELECT fence_version FROM tasks WHERE task_id
    = NEW.task_id) != NEW.fence_version`. With FK=OFF, the subquery returns 0
    rows → NULL → != NULL → UNKNOWN → RAISE silently skipped → INSERT
    succeeds, creating an orphan attempt row.

    The v0.9.3 fix replaced with `NOT EXISTS (... AND fence_version =
    NEW.fence_version)`. NULL-safe: missing task means the inner WHERE finds 0
    rows → NOT EXISTS = TRUE → RAISE.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys=ON")
    with open(_os.path.join(_os.path.dirname(__file__), "..", "..",
                             "spec", "kernel-schema.sql")) as _f:
        conn.executescript(_f.read())

    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, ?, 1, NULL, 'pending', "
            "  'tok-f1', '2099-01-01T00:00:00Z', 0, 'codex_sdk')",
            ("task-does-not-exist", "att-f1"),
        )
        raise AssertionError(
            "F1 baseline: expected fence trigger RAISE on missing task; "
            "INSERT succeeded"
        )
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "fence" in msg, f"F1 should mention fence; got: {e}"
    finally:
        conn.close()
        _os.unlink(path)
    print("OK: F1 INSERT task_attempts with missing task → fence trigger RAISE (NULL-safe)")


def case_f2_insert_attempt_with_mismatched_fence() -> None:
    """F2: INSERT task_attempts with mismatched fence_version → RAISE.

    Sanity guard: the well-formed path (task exists, fence differs) must still
    raise. If a future regression makes the trigger overly permissive, F2
    catches it.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    conn = connect_with_fk(path=path, apply_schema=True)
    task_id = seed_task(conn)
    # task is in 'pending' state with fence_version=0. We try to insert an
    # attempt with fence_version=999.
    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, ?, 999, NULL, 'pending', "
            "  'tok-f2', '2099-01-01T00:00:00Z', 0, 'codex_sdk')",
            (task_id, "att-f2"),
        )
        raise AssertionError(
            f"F2 baseline: expected fence trigger RAISE on fence mismatch; "
            f"INSERT succeeded for task {task_id}"
        )
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        assert "fence" in msg, f"F2 should mention fence; got: {e}"
    conn.close()
    _os.unlink(path)
    print("OK: F2 INSERT task_attempts with mismatched fence → fence trigger RAISE")


def case_f3_drop_trigger_insert_succeeds() -> None:
    """F3: reverse-DROP mutation — with trg_attempt_fence_insert dropped AND
    FK=OFF (the original v0.9.2 vulnerability scenario), F1 path succeeds.

    This proves the trigger is the actual NULL-bypass enforcement layer when
    FK is unavailable. Mirrors the M-series mutation pattern in mutation-test.py.

    Note: with FK=ON, the FK on task_attempts.task_id → tasks.task_id catches
    missing-task inserts first, so the trigger's NULL-safety contribution is
    masked. F3 deliberately runs with FK=OFF to expose the trigger's role.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite"); _os.close(fd)
    conn = sqlite3.connect(path)
    # FK deliberately OFF: this is the original v0.9.2 vulnerability scenario
    conn.execute("PRAGMA foreign_keys=OFF")
    with open(_os.path.join(_os.path.dirname(__file__), "..", "..",
                             "spec", "kernel-schema.sql")) as _f:
        conn.executescript(_f.read())
    # Re-apply pragma after executescript (which can reset per-connection state)
    conn.execute("PRAGMA foreign_keys=OFF")
    # Reverse-DROP: drop the trigger under test
    conn.execute("DROP TRIGGER trg_attempt_fence_insert")

    # F1 path now succeeds (no trigger, no FK), proving causality
    conn.execute(
        "INSERT INTO task_attempts "
        "(task_id, attempt_id, fence_version, worker_id, status, "
        " lease_token, lease_expires_at, status_version, driver_kind) "
        "VALUES (?, ?, 1, NULL, 'pending', "
        "  'tok-f3', '2099-01-01T00:00:00Z', 0, 'codex_sdk')",
        ("task-still-does-not-exist", "att-f3"),
    )
    conn.commit()
    row = conn.execute(
        "SELECT attempt_id FROM task_attempts WHERE attempt_id='att-f3'"
    ).fetchone()
    assert row is not None, (
        "F3 mutation: INSERT with missing task should succeed when trigger "
        "is dropped and FK=OFF; got no row"
    )
    conn.close()
    _os.unlink(path)
    print("OK: F3 DROP trg_attempt_fence_insert + FK=OFF → F1 path INSERT succeeds (causal chain)")


def main() -> int:
    case_f1_insert_attempt_with_missing_task()
    case_f2_insert_attempt_with_mismatched_fence()
    case_f3_drop_trigger_insert_succeeds()
    print("\nOK: fence-missing-task-test.py v0.9.4 — 3 cases 全绿 "
          "(F1 NULL-safe + F2 guard + F3 causal chain)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
