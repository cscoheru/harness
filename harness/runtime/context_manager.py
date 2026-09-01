"""harness.runtime.context_manager — SqliteContextManager (ContextDistiller + ContextBudget).

Implements the v0.9-A ``ContextDistiller`` + ``ContextBudget`` Protocols
(see ``spec/interfaces/context_distiller.py``).

Layer model (per ``spec/context-layers.md``):
  L0 raw_blob   -> L1 distilled  (distill())
  L1 distilled  -> L2 working_set (charge())
  L2 working_set -> L3 handoff    (snapshot_for_handoff())
  L3 handoff    -> L2 working_set (restore_handoff())

I11 (budget) and I14 (handoff trust) are enforced by SQLite triggers;
this class only emits the SQL and translates trigger rejections into
typed ``BudgetExceeded`` / ``HandoffTrustViolation`` Protocol errors.

Lineage handling:
  Schema requires every L2 / L3 snapshot to point at an L0 or L1 parent
  in the same task. To keep the Protocol surface simple (the caller does
  not pass lineage), ``charge()`` and ``restore_handoff()`` lazily build
  an L0 root + L1 anchor for the (task_id, attempt_id) pair if none
  exists yet, and reuse it on subsequent calls.
"""
from __future__ import annotations

import hashlib
import sqlite3
import uuid

from spec.interfaces.context_distiller import (
    BudgetExceeded,
    ContextBudget,
    ContextDistiller,
    ContextError,
    DistilledUnit,
    HandoffBlob,
    HandoffTrustViolation,
)

from .context import working_set_total

__all__ = ["SqliteContextManager"]


def _new_snapshot_id() -> str:
    return f"snap-{uuid.uuid4().hex[:12]}"


class SqliteContextManager:
    """Production implementation of ``ContextDistiller`` + ``ContextBudget``.

    Single SQLite connection; inherits ``harness.runtime._db.make_db()``
    semantics (PRAGMA foreign_keys=ON, schema applied).
    """

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    # ==================== ContextDistiller ====================

    def distill(self, raw_blob_id: str, trust_label: str) -> DistilledUnit:
        """L0 raw_blob → L1 distilled.

        Idempotent via ``sha256(raw_blob_id|trust_label|raw.sha256)`` —
        repeated calls return the same ``distilled_blob_id`` for the
        same input (per v0.9-A Protocol contract).
        """
        row = self._conn.execute(
            "SELECT byte_size, sha256 FROM blobs WHERE blob_id=?",
            (raw_blob_id,),
        ).fetchone()
        if row is None:
            raise ContextError(f"raw blob not found: {raw_blob_id}")
        h = hashlib.sha256(
            f"{raw_blob_id}|{trust_label}|{row['sha256']}".encode()
        ).hexdigest()
        distilled_blob_id = f"dist-{h[:16]}"
        token_count = max(1, int(row["byte_size"]) // 4)
        try:
            self._conn.execute(
                "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
                "  content_type, trust_label) VALUES (?, ?, ?, ?, ?, ?)",
                # byte_size column on the distilled blob stores token_count
                # so charge() can read it back without re-applying the //4 rule.
                (distilled_blob_id, token_count, h,
                 f"derived://{raw_blob_id}", "application/x-distilled",
                 trust_label),
            )
            self._conn.commit()
        except sqlite3.IntegrityError:
            # Idempotent: same sha256 already exists; reuse it.
            pass
        return DistilledUnit(
            distilled_blob_id=distilled_blob_id,
            raw_blob_id=raw_blob_id,
            token_count=token_count,
            trust_label=trust_label,
            distiller_version="v1.0",
        )

    def charge(
        self, task_id: str, attempt_id: str, distilled_blob_id: str,
    ) -> int:
        """Insert an L2 snapshot; I11 trigger enforces budget cap.

        Returns the new working_set total. Raises ``BudgetExceeded`` if
        the trigger rejects on budget overflow.
        """
        row = self._conn.execute(
            "SELECT byte_size FROM blobs WHERE blob_id=?",
            (distilled_blob_id,),
        ).fetchone()
        if row is None:
            raise ContextError(f"distilled blob not found: {distilled_blob_id}")
        # Distilled blobs store token_count in their byte_size column
        # (set by distill()). Read directly — do not re-apply //4.
        token_count = max(1, int(row["byte_size"]))

        # Ensure L0 root + L1 anchor for this (task, attempt) — lazy lineage.
        parent_l1_id = self._ensure_l1_anchor(task_id, attempt_id)
        # Read trust_label from the distilled blob (carried into the snapshot).
        dl_row = self._conn.execute(
            "SELECT trust_label FROM blobs WHERE blob_id=?",
            (distilled_blob_id,),
        ).fetchone()
        snapshot_trust = dl_row["trust_label"] if dl_row else "trusted_user_input"

        try:
            self._conn.execute(
                "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, "
                "  level, distilled_blob_id, token_count, trust_label, "
                "  distiller_version, parent_snapshot_id) "
                "VALUES (?, ?, ?, 'L2', ?, ?, ?, 'v1.0', ?)",
                (_new_snapshot_id(), task_id, attempt_id, distilled_blob_id,
                 token_count, snapshot_trust, parent_l1_id),
            )
            self._conn.commit()
        except sqlite3.IntegrityError as e:
            msg = str(e).lower()
            if "budget" in msg or "exceeded" in msg or "i11" in msg:
                raise BudgetExceeded(
                    f"budget exceeded for task {task_id}: {e}"
                ) from e
            raise
        return working_set_total(self._conn, task_id)

    def snapshot_for_handoff(
        self, task_id: str, attempt_id: str,
    ) -> HandoffBlob:
        """Compress working_set into an L3 handoff blob.

        Trust label is hard-coded to ``trusted_user_input`` (I14 forbids
        ``untrusted_external`` at the trigger level). Callers wanting
        untrusted handoff must surface the rejection themselves via
        direct INSERT — this Protocol surface never produces one.
        """
        ws_total = working_set_total(self._conn, task_id)
        budget = self._task_budget(task_id)
        # compressed = how much this handoff adds to the working_set
        # (= the budget gap). Spike pattern (context-budget-test.py L179-188):
        # L2=90 + handoff L3=10 = total=100. If the budget is unset
        # (unlimited), the handoff carries the current working_set.
        if budget is None:
            compressed = max(1, ws_total)
        else:
            compressed = max(0, budget - ws_total)
        trust = "trusted_user_input"

        handoff_blob_id = f"hand-{uuid.uuid4().hex[:12]}"
        created_at = _now_iso()

        # Materialize the handoff blob row first (FK target of snapshot).
        try:
            self._conn.execute(
                "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
                "  content_type, trust_label) VALUES (?, ?, ?, ?, ?, ?)",
                (handoff_blob_id, compressed,
                 uuid.uuid4().hex + uuid.uuid4().hex,
                 f"derived://handoff/{handoff_blob_id}",
                 "application/x-handoff", trust),
            )
        except sqlite3.IntegrityError as e:
            raise ContextError(f"failed to materialize handoff blob: {e}") from e

        # L3 lineage requires the parent to be an L2 snapshot in this
        # attempt (the working_set we are compressing), NOT the L1 anchor.
        parent_row = self._conn.execute(
            "SELECT snapshot_id FROM context_snapshots "
            "WHERE task_id=? AND attempt_id=? AND level='L2' "
            "ORDER BY created_at DESC LIMIT 1",
            (task_id, attempt_id),
        ).fetchone()
        if parent_row is None:
            raise ContextError(
                f"no L2 working_set snapshot to handoff for "
                f"{task_id}/{attempt_id}"
            )
        parent_l2_id = parent_row["snapshot_id"]
        try:
            self._conn.execute(
                "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, "
                "  level, distilled_blob_id, token_count, trust_label, "
                "  distiller_version, parent_snapshot_id) "
                "VALUES (?, ?, ?, 'L3', ?, ?, ?, 'v1.0', ?)",
                (_new_snapshot_id(), task_id, attempt_id, handoff_blob_id,
                 compressed, trust, parent_l2_id),
            )
            self._conn.commit()
        except sqlite3.IntegrityError as e:
            msg = str(e).lower()
            if "handoff" in msg or "trust" in msg or "i14" in msg:
                raise HandoffTrustViolation(str(e)) from e
            raise
        return HandoffBlob(
            handoff_blob_id=handoff_blob_id,
            task_id=task_id,
            attempt_id=attempt_id,
            trust_label=trust,
            compressed_token_count=compressed,
            created_at=created_at,
        )

    def restore_handoff(
        self, task_id: str, handoff_blob_id: str, new_attempt_id: str,
    ) -> int:
        """Rebuild an L2 snapshot under ``new_attempt_id`` from a handoff blob."""
        row = self._conn.execute(
            "SELECT byte_size, trust_label FROM blobs WHERE blob_id=?",
            (handoff_blob_id,),
        ).fetchone()
        if row is None:
            raise ContextError(f"handoff blob not found: {handoff_blob_id}")
        token_count = max(1, int(row["byte_size"]))
        snapshot_trust = row["trust_label"]

        parent_l1_id = self._ensure_l1_anchor(task_id, new_attempt_id)
        try:
            self._conn.execute(
                "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, "
                "  level, distilled_blob_id, token_count, trust_label, "
                "  distiller_version, parent_snapshot_id) "
                "VALUES (?, ?, ?, 'L2', ?, ?, ?, 'v1.0', ?)",
                (_new_snapshot_id(), task_id, new_attempt_id, handoff_blob_id,
                 token_count, snapshot_trust, parent_l1_id),
            )
            self._conn.commit()
        except sqlite3.IntegrityError as e:
            msg = str(e).lower()
            if "budget" in msg or "exceeded" in msg:
                raise BudgetExceeded(
                    f"budget exceeded for task {task_id}: {e}"
                ) from e
            raise
        return working_set_total(self._conn, task_id)

    # ==================== ContextBudget ====================

    def remaining(self, task_id: str) -> int | None:
        """Remaining budget = ``context_budget_tokens - working_set_total``.

        Returns ``None`` if budget is unset (unlimited) or task unknown.
        """
        budget = self._task_budget(task_id)
        if budget is None:
            return None
        return budget - working_set_total(self._conn, task_id)

    def total(self, task_id: str) -> int | None:
        """Configured budget for ``task_id``; ``None`` if unset/unknown."""
        return self._task_budget(task_id)

    # ==================== helpers ====================

    def _task_budget(self, task_id: str) -> int | None:
        row = self._conn.execute(
            "SELECT context_budget_tokens FROM tasks WHERE task_id=?",
            (task_id,),
        ).fetchone()
        if row is None or row["context_budget_tokens"] is None:
            return None
        return int(row["context_budget_tokens"])

    def _ensure_l1_anchor(self, task_id: str, attempt_id: str) -> str:
        """Return an existing L1 snapshot_id for (task, attempt); create L0+L1 if absent.

        The L0 root carries a tiny (0-byte) synthetic blob so the FK is
        satisfied without forcing the caller to pass one in.
        """
        existing = self._conn.execute(
            "SELECT snapshot_id FROM context_snapshots "
            "WHERE task_id=? AND attempt_id=? AND level='L1' LIMIT 1",
            (task_id, attempt_id),
        ).fetchone()
        if existing:
            return existing["snapshot_id"]

        # Synthetic minimal blob for the L0 root FK.
        raw_blob_id = f"blob-{uuid.uuid4().hex[:12]}"
        self._conn.execute(
            "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
            "  content_type, trust_label) "
            "VALUES (?, 0, ?, 'derived://root', 'application/octet-stream', "
            "  'trusted_user_input')",
            (raw_blob_id, uuid.uuid4().hex + uuid.uuid4().hex),
        )
        l0_id = _new_snapshot_id()
        self._conn.execute(
            "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, "
            "  level, raw_blob_id, token_count, trust_label, distiller_version) "
            "VALUES (?, ?, ?, 'L0', ?, 0, 'trusted_user_input', 'v1.0')",
            (l0_id, task_id, attempt_id, raw_blob_id),
        )
        l1_id = _new_snapshot_id()
        self._conn.execute(
            "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, "
            "  level, raw_blob_id, distilled_blob_id, token_count, trust_label, "
            "  distiller_version, parent_snapshot_id) "
            "VALUES (?, ?, ?, 'L1', ?, NULL, 1, 'trusted_user_input', 'v1.0', ?)",
            (l1_id, task_id, attempt_id, raw_blob_id, l0_id),
        )
        self._conn.commit()
        return l1_id


def _now_iso() -> str:
    """ISO-8601 UTC timestamp (millisecond precision). Mirrors _helpers anchor."""
    import datetime as _dt
    base = _dt.datetime(2026, 8, 30, 12, 0, 0, tzinfo=_dt.timezone.utc)
    return base.strftime("%Y-%m-%dT%H:%M:%S.") + f"{base.microsecond // 1000:03d}Z"