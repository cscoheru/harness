"""harness.runtime.context — context snapshot / budget primitives (v0.9-A lift).

Lift of ``spikes/m0/_helpers.py`` lines 246-325. Behavior preserved: trust
labels, INSERT columns, working-set total (L2+L3 only) used by I11 enforcement.

Public API (NOW.md §2 T-BE-1):
    insert_snapshot, working_set_total
    TRUSTED_USER_INPUT, UNTRUSTED_EXTERNAL, MODEL_GENERATED, INTERNAL_SECRET,
    VALID_TRUST_LABELS
"""
from __future__ import annotations

import sqlite3
import uuid

__all__ = [
    "TRUSTED_USER_INPUT",
    "UNTRUSTED_EXTERNAL",
    "MODEL_GENERATED",
    "INTERNAL_SECRET",
    "VALID_TRUST_LABELS",
    "insert_snapshot",
    "working_set_total",
]

# Trust labels (mirror spec/.../context_distiller.py and blobs.trust_label).
TRUSTED_USER_INPUT = "trusted_user_input"
UNTRUSTED_EXTERNAL = "untrusted_external"
MODEL_GENERATED = "model_generated"
INTERNAL_SECRET = "internal_secret"

VALID_TRUST_LABELS = (
    TRUSTED_USER_INPUT,
    UNTRUSTED_EXTERNAL,
    MODEL_GENERATED,
    INTERNAL_SECRET,
)


def insert_snapshot(
    conn: sqlite3.Connection,
    task_id: str,
    attempt_id: str,
    level: str,
    token_count: int,
    trust_label: str = TRUSTED_USER_INPUT,
    raw_blob_id: str | None = None,
    distilled_blob_id: str | None = None,
    parent_snapshot_id: str | None = None,
    distiller_version: str | None = "v0",
) -> str:
    """INSERT a context_snapshots row. Returns snapshot_id.

    Raises sqlite3.IntegrityError if I11/I14 triggers fire (budget exceeded or
    untrusted_external handoff), or if FK / CHECK constraints fail.
    """
    snapshot_id = f"snap-{uuid.uuid4().hex[:12]}"
    conn.execute(
        "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, level, "
        "  raw_blob_id, distilled_blob_id, token_count, trust_label, "
        "  distiller_version, parent_snapshot_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (snapshot_id, task_id, attempt_id, level,
         raw_blob_id, distilled_blob_id, token_count, trust_label,
         distiller_version, parent_snapshot_id),
    )
    conn.commit()
    return snapshot_id


def working_set_total(conn: sqlite3.Connection, task_id: str) -> int:
    """Sum of L2/L3 token_count for a task. Used by I11 enforcement."""
    row = conn.execute(
        "SELECT COALESCE(SUM(token_count), 0) AS total "
        "FROM context_snapshots "
        "WHERE task_id=? AND level IN ('L2','L3')",
        (task_id,),
    ).fetchone()
    return int(row["total"])