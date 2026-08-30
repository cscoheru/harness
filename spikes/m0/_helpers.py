"""Shared test helpers for spikes/m0/.

File: spikes/m0/_helpers.py
Version: v0.9-B (v0.9-A base + worker_pool helpers)

Centralizes:
  - make_db(): create a fresh SQLite, apply spec/kernel-schema.sql
  - seed_task(): insert a pending task
  - claim(): INSERT attempt under correct fence protocol
  - seed_blob(): insert a blobs row + return blob_id
  - insert_snapshot(): append a context_snapshots row
  - register_worker(): INSERT a workers row + return worker_id (v0.9-B)
  - heartbeat_worker(): advance last_heartbeat_at (v0.9-B)
  - drain_worker(): transition to 'draining' (v0.9-B)
  - reap_stale_workers(): mark stale workers (v0.9-B)
  - claim_via_pool(): dispatch + claim composite (v0.9-B)

Spike modules import from here so the schema path is consistent.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA = os.path.normpath(
    os.path.join(HERE, "..", "..", "spec", "kernel-schema.sql")
)


def make_db() -> sqlite3.Connection:
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    with open(SCHEMA, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    # Closes Codex v0.9-A P0-9C regression: per-connection FK must be ON.
    conn.execute("PRAGMA foreign_keys = ON")
    # Defensive assertion: any caller of make_db() / connect_with_fk() MUST see FK=1.
    fk_state = conn.execute("PRAGMA foreign_keys").fetchone()
    assert fk_state[0] == 1, f"FK not enabled after make_db(); got {fk_state}"
    return conn


def connect_with_fk(path: str | None = None,
                    row_factory: bool = True,
                    apply_schema: bool = False) -> sqlite3.Connection:
    """Connect to a SQLite DB and FORCE PRAGMA foreign_keys=ON.

    SQLite's PRAGMA foreign_keys is per-connection; the default is OFF.
    schema PRAGMA in kernel-schema.sql only affects the connection that
    executes it. Any new sqlite3.connect() call MUST go through this helper
    (or replicate its body). Closes Codex v0.9-A P0-9C regression.

    Args:
      path: existing DB file. If None, creates a fresh tempfile and applies
        schema (equivalent to make_db()).
      apply_schema: if True, run kernel-schema.sql on connect (only safe
        for fresh DBs). Default False — caller is responsible for schema
        already being present.
    """
    if path is None:
        fd, path = tempfile.mkstemp(suffix=".sqlite")
        os.close(fd)
        apply_schema = True  # fresh DB: schema must be applied
    conn = sqlite3.connect(path)
    if row_factory:
        conn.row_factory = sqlite3.Row
    if apply_schema:
        with open(SCHEMA, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
    conn.execute("PRAGMA foreign_keys = ON")
    fk_state = conn.execute("PRAGMA foreign_keys").fetchone()
    assert fk_state[0] == 1, f"FK not enabled in connect_with_fk(); got {fk_state}"
    return conn


def seed_task(
    conn: sqlite3.Connection,
    status: str = "pending",
    context_budget_tokens: int | None = None,
) -> str:
    """Seed a task. v0.9-A adds context_budget_tokens argument."""
    task_id = f"task-{uuid.uuid4().hex[:12]}"
    if context_budget_tokens is None:
        conn.execute(
            "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status) "
            "VALUES (?, 't1', 'web_research', '1.0.0', ?)",
            (task_id, status),
        )
    else:
        conn.execute(
            "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status, "
            "  context_budget_tokens) VALUES (?, 't1', 'web_research', '1.0.0', ?, ?)",
            (task_id, status, context_budget_tokens),
        )
    conn.commit()
    return task_id


def claim(conn: sqlite3.Connection, task_id: str, worker_id: str) -> tuple[str, int]:
    """Atomic claim.

    Closes v0.7 P0-2 regression:
      1. UPDATE tasks SET fence_version += 1 + status='claimed'; ASSERT rowcount == 1.
         (A terminal task produces rowcount=0; this is rejected.)
      2. Read the new task fence.
      3. INSERT attempt with that exact fence. Trigger trg_attempt_fence_insert
         enforces strict equality (rejects attempt.fence_version != task.fence_version).
      4. Belt-and-suspenders: trg_attempt_terminal_task_insert also blocks attempt
         INSERT if task is in a terminal state.

    v0.9-B I15: an active attempt requires worker_id IS NOT NULL AND
    worker_id must reference an existing workers row. This helper
    auto-registers the worker if absent (preserves v0.7-v0.9-A test backward
    compatibility); direct INSERTs that bypass this helper still get rejected
    by trg_attempt_worker_exists / trg_attempt_active_needs_worker.

    Returns (attempt_id, fence_version) on success.
    Raises ClaimRejected on rowcount mismatch, trigger rejection, or uniqueness conflict.
    """
    attempt_id = f"att-{uuid.uuid4().hex[:12]}"
    lease_token = uuid.uuid4().hex
    # v0.9-B I15 helper-side precondition: ensure worker exists. We use
    # INSERT OR IGNORE so repeated calls with the same worker_id are idempotent.
    # Must COMMIT before BEGIN IMMEDIATE — Python sqlite3 leaves an implicit
    # transaction open after execute(); nested BEGIN fails.
    conn.execute(
        "INSERT OR IGNORE INTO workers (worker_id, host, capabilities_json, "
        "  status, last_heartbeat_at) "
        "VALUES (?, 'helper-default', '[]', 'active', ?)",
        (worker_id, _now_iso()),
    )
    conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    try:
        # Step 1: bump task fence. Must affect exactly one row.
        cur = conn.execute(
            "UPDATE tasks SET fence_version = fence_version + 1, "
            "  status='claimed', updated_at=strftime('%Y-%m-%dT%H:%M:%S.%fZ','now') "
            "WHERE task_id=? AND status IN ('pending','failed')",
            (task_id,),
        )
        if cur.rowcount != 1:
            conn.rollback()
            raise ClaimRejected(
                f"claim rejected: task {task_id} not in pending/failed "
                f"(rowcount={cur.rowcount}, status likely terminal)"
            )
        # Step 2: read the new task fence (within the same transaction)
        row = conn.execute(
            "SELECT fence_version FROM tasks WHERE task_id=?", (task_id,)
        ).fetchone()
        assert row is not None
        new_task_fence = row["fence_version"]
        # Step 3: INSERT attempt at exactly that fence.
        # Trigger trg_attempt_fence_insert enforces attempt.fence_version == task.fence_version.
        # Trigger trg_attempt_terminal_task_insert blocks attempt INSERT against terminal task
        # (defense in depth in case claim flow ever skips task UPDATE).
        try:
            conn.execute(
                "INSERT INTO task_attempts "
                "(task_id, attempt_id, fence_version, worker_id, status, "
                " lease_token, lease_expires_at, status_version, driver_kind) "
                "VALUES (?, ?, ?, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
                (task_id, attempt_id, new_task_fence, worker_id,
                 lease_token, "2099-01-01T00:00:00Z"),
            )
        except sqlite3.IntegrityError as e:
            conn.rollback()
            raise ClaimRejected(f"attempt INSERT rejected by trigger/constraint: {e}")
        conn.commit()
    except sqlite3.Error as e:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        if isinstance(e, ClaimRejected):
            raise
        raise
    return attempt_id, new_task_fence


class ClaimRejected(Exception):
    """Raised when a claim is rejected (terminal task, trigger rejection, etc.)."""


def release_attempt(conn: sqlite3.Connection, attempt_id: str, final_status: str = "expired") -> None:
    """Mark an attempt terminal AND reset its task to 'failed' so a new claim
    can be issued. Bumps status_version. Closes the v0.7 P0-2 path where
    sequential claims failed because task stayed in 'claimed'.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE task_attempts SET status=?, status_version=status_version+1, "
            "  finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE attempt_id=?",
            (final_status, attempt_id),
        )
        conn.execute(
            "UPDATE tasks SET status='failed', "
            "  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  terminal_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "  terminal_reason=? "
            "WHERE task_id=(SELECT task_id FROM task_attempts WHERE attempt_id=?) "
            "  AND status IN ('claimed','running')",
            (final_status, attempt_id),
        )
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        raise


def transition_attempt(
    conn: sqlite3.Connection,
    attempt_id: str,
    from_status: str,
    to_status: str,
    extra_where: str = "",
    extra_params: tuple = (),
) -> int:
    """Atomic attempt status transition. Bumps status_version.

    Returns rowcount. Caller MUST verify rowcount == 1.
    The caller is responsible for binding attempt_id + lease_token + fence_version
    in extra_where (defense in depth).
    """
    cur = conn.execute(
        f"UPDATE task_attempts "
        f"SET status=?, status_version=status_version+1, "
        f"  finished_at=CASE WHEN ? IN ('succeeded','failed','canceled','expired') "
        f"    THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE finished_at END "
        f"WHERE attempt_id=? AND status=? {extra_where}",
        (to_status, to_status, attempt_id, from_status, *extra_params),
    )
    conn.commit()
    return cur.rowcount


# ==================== v0.9-A context helpers ====================

# Trust labels (mirror spec/.../context_distiller.py and blobs.trust_label)
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


def seed_blob(
    conn: sqlite3.Connection,
    trust_label: str = TRUSTED_USER_INPUT,
    byte_size: int = 42,
    sha256: str | None = None,
) -> str:
    """Insert a blobs row. Returns blob_id. The 4 trust labels are enforced by
    the v0.7 blobs.trust_label CHECK constraint; this helper uses sane defaults.
    """
    if sha256 is None:
        sha256 = uuid.uuid4().hex + uuid.uuid4().hex  # 64 hex chars
    blob_id = f"blob-{uuid.uuid4().hex[:12]}"
    conn.execute(
        "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
        "  content_type, trust_label) VALUES (?, ?, ?, ?, ?, ?)",
        (blob_id, byte_size, sha256,
         f"file:///tmp/{blob_id}",
         "application/octet-stream",
         trust_label),
    )
    conn.commit()
    return blob_id


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


# ==================== v0.9-B worker helpers ====================

import datetime as _dt
import json as _json


def _now_iso(offset_seconds: float = 0.0) -> str:
    """ISO-8601 UTC timestamp with millisecond precision.

    Format: YYYY-MM-DDTHH:MM:SS.mmmZ (matches spec/kernel-schema.sql default).
    Offset allows tests to control "now" for heartbeat / reap_stale assertions.
    """
    base = _dt.datetime(2026, 8, 30, 12, 0, 0, tzinfo=_dt.timezone.utc)
    delta = _dt.timedelta(seconds=offset_seconds)
    # truncate microseconds to milliseconds for cross-tool consistency
    full = base + delta
    return full.strftime("%Y-%m-%dT%H:%M:%S.") + f"{full.microsecond // 1000:03d}Z"


def register_worker(
    conn: sqlite3.Connection,
    host: str = "host-test",
    capabilities_json: str = '["web.fetch"]',
    worker_id: str | None = None,
) -> str:
    """Register a worker. Returns worker_id.

    Default worker_id form: '<host>:<pid>:<uuid>' (mirrors §13.2 Q209 decision).
    v0.9-B trigger trg_worker_heartbeat_renew is INSERT-tolerant (it only fires
    on UPDATE); the row is created with last_heartbeat_at = now and status='active'.
    """
    if worker_id is None:
        import os as _os
        pid = _os.getpid()
        worker_id = f"{host}:{pid}:{uuid.uuid4().hex[:8]}"
    conn.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at) VALUES (?, ?, ?, 'active', ?)",
        (worker_id, host, capabilities_json, _now_iso()),
    )
    conn.commit()
    return worker_id


def heartbeat_worker(conn: sqlite3.Connection, worker_id: str,
                     offset_seconds: float = 5.0) -> str:
    """Advance worker.last_heartbeat_at. Returns the new timestamp.

    Closes P0-9J: must provide an offset > 0 vs the current value, or the
    trg_worker_heartbeat_renew trigger will ABORT.
    """
    new_ts = _now_iso(offset_seconds=offset_seconds)
    conn.execute(
        "UPDATE workers SET last_heartbeat_at=? WHERE worker_id=? AND status='active'",
        (new_ts, worker_id),
    )
    conn.commit()
    return new_ts


def drain_worker(conn: sqlite3.Connection, worker_id: str) -> str:
    """Transition worker to 'draining'. Returns new status.

    Closes P0-9K: if worker.current_attempt_id points at an already-terminal
    task_attempts row, trg_worker_drain_pause ABORTs. Caller MUST ensure the
    attempt is still active (or NULL) before calling.
    """
    conn.execute(
        "UPDATE workers SET status='draining' WHERE worker_id=? AND status='active'",
        (worker_id,),
    )
    conn.commit()
    return "draining"


def reap_stale_workers(conn: sqlite3.Connection, now_offset_seconds: float,
                       threshold_seconds: int = 30) -> int:
    """Mark workers with last_heartbeat_at older than threshold as 'stale'.

    Returns the number of reaped workers. SQLite-side implementation; the
    WorkerPool Protocol surface delegates to this in production.
    """
    cutoff = _now_iso(offset_seconds=now_offset_seconds - threshold_seconds)
    cur = conn.execute(
        "UPDATE workers SET status='stale' "
        "WHERE status='active' AND last_heartbeat_at < ?",
        (cutoff,),
    )
    conn.commit()
    return cur.rowcount


def dispatch_worker(conn: sqlite3.Connection, task_id: str,
                    required_capability: str | None = None) -> str:
    """Pick an 'active' worker for the task. Atomic across concurrent writers.

    Strategy (v0.9.2 Q210 + v0.9.4 P1-3 fix): capability-match first, then
    round-robin among eligible workers via per-worker dispatch counts stored
    in harness_meta.

    v0.9.4 (closes Codex v0.9.3 P1-3 finding): the v0.9.2 helper did
    SELECT counts then UPSERT — two concurrent calls would both read
    count=0, both pick the same winner (or both increment to 1), resulting
    in lost update. Now uses BEGIN IMMEDIATE to serialize concurrent
    dispatch_worker() calls across connections, so the SELECT+UPSERT is
    atomic per winner. Combined with partial unique index
    idx_worker_one_active_attempt on the actual claim INSERT, this prevents
    double-dispatch and lost-update in 真并发.

    Returns the worker_id of the eligible worker with the lowest dispatch
    count (ties broken by last_heartbeat_at DESC, then worker_id ASC).
    Raises LookupError if no eligible worker exists.
    Raises RuntimeError if called inside an existing transaction (BEGIN
    IMMEDIATE inside a txn would silently no-op or raise).
    """
    if conn.in_transaction:
        raise RuntimeError(
            "dispatch_worker() must not be called inside an existing transaction; "
            "BEGIN IMMEDIATE inside a transaction would fail or silently no-op"
        )

    # Pre-flight: collect eligible workers (read-only, no lock needed).
    rows = conn.execute(
        "SELECT worker_id, capabilities_json FROM workers WHERE status='active'"
    ).fetchall()
    eligible: list[str] = []
    if required_capability:
        for r in rows:
            try:
                caps = _json.loads(r["capabilities_json"])
            except _json.JSONDecodeError:
                continue
            if required_capability in caps:
                eligible.append(r["worker_id"])
    else:
        eligible = [r["worker_id"] for r in rows]
    if not eligible:
        raise LookupError(f"NoWorkerAvailable: no active worker for task {task_id}")

    # BEGIN IMMEDIATE acquires the SQLite write lock — concurrent
    # dispatch_worker() calls on other connections BLOCK until this
    # transaction commits. This makes the SELECT counts + UPSERT atomic,
    # eliminating the v0.9.2 lost-update under 真并发.
    conn.execute("BEGIN IMMEDIATE")
    try:
        # Re-fetch with current counts under the write lock. The ORDER BY
        # uses SQL's native DESC on heartbeat (correctly negated by SQLite's
        # DESC modifier; the previous _neg_ts_key Python helper was misnamed
        # — it actually sorted ASC).
        placeholders = ",".join("?" * len(eligible))
        winner_row = conn.execute(
            f"SELECT w.worker_id FROM workers w "
            f"LEFT JOIN harness_meta m "
            f"  ON m.k = 'dispatch:worker:' || w.worker_id "
            f"WHERE w.worker_id IN ({placeholders}) AND w.status = 'active' "
            f"ORDER BY COALESCE(CAST(m.v AS INTEGER), 0) ASC, "
            f"         w.last_heartbeat_at DESC, w.worker_id ASC "
            f"LIMIT 1",
            eligible,
        ).fetchone()
        if winner_row is None:
            conn.rollback()
            raise LookupError(f"NoWorkerAvailable: no eligible worker for task {task_id}")
        winner = winner_row["worker_id"]

        # Atomic increment (UPSERT): first dispatch inserts '1', subsequent
        # dispatches DO UPDATE SET v = CAST(v AS INTEGER) + 1.
        conn.execute(
            "INSERT INTO harness_meta (k, v) VALUES (?, '1') "
            "ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1",
            (f"dispatch:worker:{winner}",),
        )
        conn.commit()
    except sqlite3.Error:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        raise
    return winner


def claim_via_pool(conn: sqlite3.Connection, task_id: str,
                   required_capability: str | None = None) -> tuple[str, str]:
    """Composite: dispatch_worker() → claim(task_id, worker_id).

    Returns (attempt_id, worker_id). This is the canonical v0.9-B entry point
    for drivers. Closes P0-9O: dispatch MUST go through claim(), not bypass it.

    Updates both workers.current_attempt_id AND workers.last_heartbeat_at in a
    single statement; the I16 trigger trg_worker_heartbeat_renew rejects any
    active-worker UPDATE that does not advance last_heartbeat_at.
    """
    worker_id = dispatch_worker(conn, task_id, required_capability=required_capability)
    attempt_id, _fence = claim(conn, task_id, worker_id)
    # Wire worker.current_attempt_id AND advance last_heartbeat_at in one UPDATE
    # so the I16 trg_worker_heartbeat_renew trigger does not fire.
    conn.execute(
        "UPDATE workers SET current_attempt_id=?, last_heartbeat_at=? "
        "WHERE worker_id=?",
        (attempt_id, _now_iso(offset_seconds=15.0), worker_id),
    )
    conn.commit()
    return attempt_id, worker_id