-- Fish Harness kernel schema (canonical, executable)
-- File: spec/kernel-schema.sql
-- Version: v0.9.2 (closes Codex v0.9 MERGED CHANGES REQUIRED)
-- This file MUST be applied via PRAGMA + CREATE TABLE statements.
-- CI runs this file with `sqlite3 :memory: < spec/kernel-schema.sql` and
-- then executes the spike tests in spikes/m0/ against the resulting DB.
--
-- v0.9-A delta:
--   + tasks.context_budget_tokens INTEGER (nullable; if set, kernel enforces I11)
--   + context_snapshots table (L0/L1/L2/L3 snapshot ledger)
--   + trg_snapshot_budget_check (I11: working_set token total <= task budget)
--   + trg_handoff_trust_label (I14: L3 handoff cannot be untrusted_external)
--
-- v0.9.1 delta (closes Codex v0.9-A CHANGES REQUIRED):
--   + trg_snapshot_no_update (context_snapshots append-only; UPDATE rejected)
--   + trg_snapshot_no_delete (context_snapshots append-only; DELETE rejected)
--   + trg_lineage_l2_needs_parent (L2 must have parent_snapshot_id pointing to an L1)
--   + trg_lineage_l3_needs_parent (L3 must have parent_snapshot_id pointing to an L2)
--   + trg_lineage_same_task (parent_snapshot_id.task_id must equal NEW.task_id)
--   + trg_snapshot_event_emit (AFTER INSERT writes task_events row, type=context.snapshot)
--
-- v0.9-B delta (load balancing; spec/worker-pool.md):
--   + workers table (worker_id / host / capabilities_json / status /
--       last_heartbeat_at / current_attempt_id / registered_at / drained_at)
--   + idx_workers_status / idx_workers_host / idx_workers_attempt (3 indexes)
--   + idx_worker_one_active_attempt (partial unique: 每 worker 最多 1 active attempt)
--   + trg_attempt_active_needs_worker (I15: active attempt 必须有 worker_id)
--   + trg_attempt_worker_exists        (I15 伴生: worker_id 必须存在)
--   + trg_worker_heartbeat_renew       (I16: heartbeat 必须推进 last_heartbeat_at)
--   + trg_worker_drain_pause           (I17: drain 时 current_attempt_id 不能已 terminal)
--
-- v0.9.4 delta (closes Codex v0.9.3 CHANGES REQUIRED / 14/20 PASS):
--   ~ trg_attempt_worker_exists_update: NEW.worker_id != OLD.worker_id
--                                    → NEW.worker_id IS NOT OLD.worker_id
--                                    (NULL-safe; closes OLD=NULL three-valued-logic bypass)
--   + trg_attempt_owner_consistent_update (P0-M2-2 attempt-side backstop)
--   ~ trg_worker_dispatched_event_emit → trg_worker_registered_event_emit
--                                    event_type 'worker.dispatched' → 'worker.registered'
--   + trg_attempt_dispatched_event_emit_insert/update
--                                    (real worker.dispatched emitted on attempt claim,
--                                     payload contains task_id/worker_id/strategy/dispatched_at)
--   Totals (v0.9.4): 13 project tables / 14 incl. sqlite_sequence
--                    26 triggers (was 24, +2 net)
--                    27 named indexes / 39 incl. autoindex
--                    12 event schemas (was 11, +1 for worker.registered)
--
-- v0.9.2 delta (closes Codex v0.9 MERGED CHANGES REQUIRED):
--   ~ trg_snapshot_event_emit: payload_json now includes task_id + attempt_id
--   ~ trg_attempt_active_needs_worker: covers UPDATE OF status, worker_id (closes P0-M2-2 / P0-9I UPDATE bypass)
--   ~ trg_attempt_worker_exists: covers UPDATE OF worker_id (closes ghost-worker UPDATE bypass)
--   + task_attempts.worker_id FK -> workers(worker_id) (closes P0-M2-2)
--   ~ trg_worker_heartbeat_renew: NEW <= OLD (strictly monotonic; closes P0-9J backward heartbeat)
--                                AND BEFORE UPDATE OF last_heartbeat_at (no longer fires on unrelated UPDATEs)
--   ~ trg_lineage_l2_needs_parent: parent.level must be L0/L1 (closes P1-1 L3-with-L1-parent bypass)
--   ~ trg_lineage_l3_needs_parent: parent.level must be L2 (closes P1-1 same)
--   + trg_worker_ownership: workers.current_attempt_id must point to attempt whose worker_id == self
--   + trg_worker_no_draining_insert: rejects INSERT status='draining' (closes P0-9K INSERT bypass)
--   + trg_worker_no_reactivate: rejects drained/stale -> active/draining (closes P0-9K reactivation)
--   + trg_worker_dispatched_event_emit: emit worker.dispatched on INSERT
--   + trg_worker_heartbeat_event_emit: emit worker.heartbeat on heartbeat advance
--   + trg_worker_drained_event_emit: emit worker.drained on status transition
--   Totals (v0.9.2): 13 project tables / 14 incl. sqlite_sequence
--                    21 triggers (was 15)
--                    27 named indexes / 39 incl. autoindex
--                    11 event schemas
--
-- IMPORTANT: production connections MUST issue `PRAGMA foreign_keys=ON` after
-- sqlite3.connect(); the per-connection default is OFF. spike helpers do this
-- in _helpers.connect_with_fk().

-- ==================== PRAGMA ====================
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

-- ==================== META ====================
CREATE TABLE schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    note       TEXT
);

CREATE TABLE harness_meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);

-- ==================== TASKS ====================
-- A task is the durable unit of user intent.
-- workflow_run_id is OPTIONAL in M1 (see PRD-v0.7 Q115).
CREATE TABLE tasks (
    task_id              TEXT PRIMARY KEY,
    tenant_id            TEXT NOT NULL,
    workflow_pack        TEXT NOT NULL,
    workflow_version     TEXT NOT NULL,
    input_blob_id        TEXT,                  -- FK to blobs
    status               TEXT NOT NULL CHECK (status IN (
                            'pending', 'claimed', 'running',
                            'cancel_requested', 'canceled',
                            'succeeded', 'failed', 'abandoned'
                          )),
    priority             INTEGER NOT NULL DEFAULT 0,
    budget_cents         INTEGER,               -- nullable; if set, kernel enforces
    context_budget_tokens INTEGER,              -- v0.9-A: NULL = unlimited; otherwise I11 enforced
    fence_version        INTEGER NOT NULL DEFAULT 0,
    cancel_requested_at  TEXT,
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    terminal_at          TEXT,
    terminal_reason      TEXT,
    metadata_json        TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (input_blob_id) REFERENCES blobs(blob_id) ON DELETE RESTRICT
);

CREATE INDEX idx_tasks_status_priority ON tasks(status, priority DESC, created_at);
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id, status);
CREATE INDEX idx_tasks_terminal ON tasks(status, terminal_at);

-- ==================== TASK ATTEMPTS ====================
-- An attempt is one (re)try. fence_version must match task.fence_version at insert
-- and is bumped atomically on every state transition (Q107).
CREATE TABLE task_attempts (
    task_id              TEXT NOT NULL,
    attempt_id           TEXT NOT NULL,
    fence_version        INTEGER NOT NULL,      -- must equal task.fence_version at insert
    worker_id            TEXT,                  -- NULL until claimed
    status               TEXT NOT NULL CHECK (status IN (
                            'pending', 'claimed', 'running',
                            'cancel_requested', 'canceled',
                            'succeeded', 'failed', 'expired'
                          )),
    lease_token          TEXT,                  -- renewed on heartbeat
    lease_expires_at     TEXT,
    status_version       INTEGER NOT NULL DEFAULT 0,  -- bumps on every status transition (I5)
    capability_profile   TEXT,                  -- JSON: bound to evidence
    driver_kind          TEXT NOT NULL,         -- 'codex_sdk' | 'codex_app_server' | 'codex_exec'
    started_at           TEXT,
    finished_at          TEXT,
    failure_code         TEXT,                  -- e.g. 'policy_denied', 'lease_lost', 'budget_exceeded'
    failure_message      TEXT,
    PRIMARY KEY (task_id, attempt_id),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES workers(worker_id)   -- v0.9.2: closes P0-M2-2 ghost-worker UPDATE
);

CREATE INDEX idx_attempts_status ON task_attempts(status, lease_expires_at);
CREATE INDEX idx_attempts_worker ON task_attempts(worker_id, status);

-- Only one non-terminal attempt per task. This enforces the invariant
-- "at most one active attempt per task" at the database layer.
CREATE UNIQUE INDEX idx_attempts_one_active
    ON task_attempts(task_id)
    WHERE status IN ('claimed', 'running', 'cancel_requested');

-- v0.9-B: attempt_id is unique across the table so that workers.current_attempt_id
-- can FK-reference it (SQLite FK requires the referenced column to be PK or UNIQUE).
CREATE UNIQUE INDEX idx_attempts_attempt_id_unique
    ON task_attempts(attempt_id);

-- v0.9-B I15: at most one active attempt per worker. Combined with
-- idx_attempts_one_active above, this gives the (task × worker) 2D
-- uniqueness needed by WorkerPool fairness rules.
CREATE UNIQUE INDEX idx_worker_one_active_attempt
    ON task_attempts(worker_id)
    WHERE worker_id IS NOT NULL
      AND status IN ('claimed', 'running', 'cancel_requested');

-- ==================== WORKERS (v0.9-B) ====================
-- Worker registry + lifecycle (see spec/worker-pool.md).
-- A worker_id is a TEXT (host:pid:uuid form) so it can be referenced across
-- multiple hosts sharing the SQLite WAL file.
CREATE TABLE workers (
    worker_id              TEXT PRIMARY KEY,        -- e.g. 'host01:1234:abc...'
    host                   TEXT NOT NULL,
    capabilities_json      TEXT NOT NULL DEFAULT '[]',  -- JSON array of capability ids
    status                 TEXT NOT NULL CHECK (status IN (
                              'active', 'draining', 'drained', 'stale'
                            )),
    last_heartbeat_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    current_attempt_id     TEXT,                    -- nullable; non-NULL iff worker has active attempt
    registered_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    drained_at             TEXT,                    -- set when status='drained'
    FOREIGN KEY (current_attempt_id) REFERENCES task_attempts(attempt_id)
);

CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_host ON workers(host);
CREATE INDEX idx_workers_attempt ON workers(current_attempt_id)
    WHERE current_attempt_id IS NOT NULL;

-- ==================== EVENTS ====================
-- Append-only event log. Every state transition emits one event envelope.
CREATE TABLE task_events (
    event_id             TEXT PRIMARY KEY,
    task_id              TEXT,                   -- v0.9.2: nullable for worker.* events (NULL = worker-scoped, no FK)
    attempt_id           TEXT,                   -- v0.9.2: nullable for worker.* events
    event_type           TEXT NOT NULL,
    payload_json         TEXT NOT NULL,
    source_event_id      TEXT,                  -- for dedupe vs external sinks
    source_sequence      INTEGER,               -- per-sink monotonic
    causation_id         TEXT,                  -- parent event_id
    dedupe_key           TEXT,                  -- idempotency key for the event itself
    redaction_version    INTEGER NOT NULL DEFAULT 1,
    recorded_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_events_task_recorded ON task_events(task_id, recorded_at);
CREATE INDEX idx_events_dedupe ON task_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_events_causation ON task_events(causation_id) WHERE causation_id IS NOT NULL;

-- ==================== AUDIT LOG ====================
-- Append-only; never UPDATE or DELETE. Records every privileged action.
CREATE TABLE audit_log (
    audit_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id              TEXT,
    attempt_id           TEXT,
    actor                TEXT NOT NULL,         -- 'kernel' | 'user:<id>' | 'system'
    action               TEXT NOT NULL,
    target               TEXT,                  -- resource being acted on
    decision             TEXT NOT NULL,         -- 'allow' | 'deny' | 'approve' | 'reject' | 'pending'
    reason               TEXT,
    policy_decision_id   TEXT,
    approval_id          TEXT,
    redacted_payload     TEXT,
    recorded_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_task ON audit_log(task_id, recorded_at);
CREATE INDEX idx_audit_actor ON audit_log(actor, recorded_at);

-- ==================== APPROVALS ====================
-- Approval supersede chain (Q111): a new approval can replace old one ONLY when
-- old.status = 'unknown'; new approval MUST reference new attempt + new policy decision.
-- Approvals: each approval may be superseded by AT MOST ONE child approval
-- (single-consumption). Combined with the atomic UPDATE on old status below,
-- this makes supersede single-consumer (P0-M2 fix).
CREATE TABLE approvals (
    approval_id              TEXT PRIMARY KEY,
    task_id                  TEXT NOT NULL,
    attempt_id               TEXT NOT NULL,
    policy_decision_id       TEXT NOT NULL,
    status                   TEXT NOT NULL CHECK (status IN (
                                'pending', 'approved', 'rejected', 'unknown', 'expired', 'consumed'
                              )),
    requested_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    decided_at               TEXT,
    decided_by               TEXT,
    decision_reason          TEXT,
    supersedes_approval_id   TEXT,             -- non-null when superseding
    FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempts(task_id, attempt_id),
    FOREIGN KEY (supersedes_approval_id) REFERENCES approvals(approval_id)
);

-- Each old approval can be superseded by at most one child.
CREATE UNIQUE INDEX idx_approvals_one_child
    ON approvals(supersedes_approval_id)
    WHERE supersedes_approval_id IS NOT NULL;

CREATE INDEX idx_approvals_task ON approvals(task_id, status);
CREATE INDEX idx_approvals_supersedes ON approvals(supersedes_approval_id) WHERE supersedes_approval_id IS NOT NULL;

-- ==================== POLICY DECISIONS ====================
CREATE TABLE policy_decisions (
    policy_decision_id   TEXT PRIMARY KEY,
    task_id              TEXT NOT NULL,
    attempt_id           TEXT NOT NULL,
    decision             TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'needs_approval')),
    reason               TEXT NOT NULL,
    rule_path            TEXT,                  -- e.g. 'web.fetch:domain=*.example.com'
    trust_label          TEXT NOT NULL,         -- trusted_user_input | untrusted_external | model_generated | internal_secret
    evaluated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempts(task_id, attempt_id)
);

CREATE INDEX idx_policy_task ON policy_decisions(task_id, evaluated_at);

-- ==================== ARTIFACTS / BLOBS / LINKS ====================
-- Three-layer data model (Q114): blob (bytes) -> artifact (named) -> task_link (ownership).
CREATE TABLE blobs (
    blob_id          TEXT PRIMARY KEY,
    byte_size        INTEGER NOT NULL CHECK (byte_size >= 0),
    sha256           TEXT NOT NULL UNIQUE,
    storage_class    TEXT NOT NULL DEFAULT 'local_fs' CHECK (storage_class IN ('local_fs', 's3', 'memory')),
    storage_uri      TEXT NOT NULL,             -- path or s3 URI
    content_type     TEXT,                      -- MIME; null for opaque
    trust_label      TEXT NOT NULL CHECK (trust_label IN (
                        'trusted_user_input',
                        'untrusted_external',
                        'model_generated',
                        'internal_secret'
                      )),
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    redacted_at      TEXT,                      -- when blob was redacted
    redaction_version INTEGER
);

CREATE TABLE artifacts (
    artifact_id      TEXT PRIMARY KEY,
    blob_id          TEXT NOT NULL,
    kind             TEXT NOT NULL,             -- 'report.markdown' | 'transcript.json' | etc.
    title            TEXT,
    schema_ref       TEXT,                      -- JSON Schema URL or relative path
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (blob_id) REFERENCES blobs(blob_id) ON DELETE RESTRICT
);

CREATE INDEX idx_artifacts_kind ON artifacts(kind);

CREATE TABLE task_links (
    link_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id          TEXT NOT NULL,
    artifact_id      TEXT NOT NULL,
    role             TEXT NOT NULL CHECK (role IN ('input', 'output', 'intermediate', 'evidence')),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY (artifact_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
    UNIQUE (task_id, artifact_id, role)
);

CREATE INDEX idx_links_artifact ON task_links(artifact_id);
CREATE INDEX idx_links_task_role ON task_links(task_id, role);

-- ==================== CONTEXT SNAPSHOTS (v0.9-A) ====================
-- Ledger for the 4-layer context model (L0 raw_blob / L1 distilled / L2 working_set / L3 handoff).
-- Defined in spec/context-layers.md. I11 (budget) and I14 (handoff trust) enforced below.
CREATE TABLE context_snapshots (
    snapshot_id          TEXT PRIMARY KEY,
    task_id              TEXT NOT NULL,
    attempt_id           TEXT NOT NULL,
    level                TEXT NOT NULL CHECK (level IN ('L0','L1','L2','L3')),
    raw_blob_id          TEXT,                -- L0/L1 source; nullable for L2/L3 composed
    distilled_blob_id    TEXT,                -- L1/L2/L3 composed output; FK to blobs
    token_count          INTEGER NOT NULL CHECK (token_count >= 0),
    trust_label          TEXT NOT NULL CHECK (trust_label IN (
                            'trusted_user_input',
                            'untrusted_external',
                            'model_generated',
                            'internal_secret'
                          )),
    distiller_version    TEXT,                -- which ContextDistiller impl produced this
    parent_snapshot_id   TEXT,                -- for L2/L3 lineage
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempts(task_id, attempt_id),
    FOREIGN KEY (raw_blob_id) REFERENCES blobs(blob_id),
    FOREIGN KEY (distilled_blob_id) REFERENCES blobs(blob_id),
    FOREIGN KEY (parent_snapshot_id) REFERENCES context_snapshots(snapshot_id)
);

CREATE INDEX idx_snapshots_task_level ON context_snapshots(task_id, level, created_at);
CREATE INDEX idx_snapshots_attempt ON context_snapshots(attempt_id, level);
CREATE INDEX idx_snapshots_distilled ON context_snapshots(distilled_blob_id)
    WHERE distilled_blob_id IS NOT NULL;
CREATE INDEX idx_snapshots_parent ON context_snapshots(parent_snapshot_id)
    WHERE parent_snapshot_id IS NOT NULL;

-- ==================== KERNEL INVARIANTS (enforced at SQL layer where possible) ====================
-- Invariant I1: attempt.fence_version MUST equal task.fence_version at insert
-- (strict equality, not >=). Any mismatch is rejected.
-- This closes the P0-2 oversized-fence regression Codex reproduced in v0.7.

-- v0.9.3 NULL-safe rewrite: previous WHEN-clause compared a subquery to a
-- literal, returning UNKNOWN when the subquery produced NULL (e.g. a missing
-- or not-yet-existing task_id). UNKNOWN is falsy in WHEN, so RAISE was
-- silently skipped — attackers could INSERT attempts with arbitrary
-- fence_version when the task row was absent. NOT EXISTS is NULL-safe by
-- construction (returns TRUE iff no matching row exists).
CREATE TRIGGER trg_attempt_fence_insert
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1 FROM tasks
    WHERE task_id = NEW.task_id
      AND fence_version = NEW.fence_version
)
BEGIN
    SELECT RAISE(ABORT,
        'attempt.fence_version must EQUAL task.fence_version at insert (got attempt=' ||
        NEW.fence_version || ' task=' || COALESCE(
            (SELECT fence_version FROM tasks WHERE task_id = NEW.task_id), 'NULL'
        ) || ')'
    );
END;

-- Invariant I3: terminal task cannot transition back to non-terminal.
-- 'failed' is NOT terminal here: failed tasks may be retried (claim() permits it).
-- Truly terminal statuses: succeeded, canceled, abandoned.
-- This trigger also blocks attempt INSERT against a terminal task via the
-- claim flow (which sets task status='claimed'); however claim() additionally
-- asserts the UPDATE rowcount so a terminal task is rejected before trigger.
CREATE TRIGGER trg_task_terminal_lock
BEFORE UPDATE ON tasks
FOR EACH ROW
WHEN OLD.status IN ('succeeded', 'canceled', 'abandoned')
     AND NEW.status NOT IN ('succeeded', 'canceled', 'abandoned')
BEGIN
    SELECT RAISE(ABORT, 'terminal task cannot transition to non-terminal');
END;

-- Invariant I3b: NO attempt INSERT against a terminal task. The claim flow
-- first UPDATEs the task to 'claimed' (caught by trg_task_terminal_lock if
-- terminal), but a buggy caller could attempt to insert an attempt without
-- updating task status. This trigger is a belt-and-suspenders backstop.
CREATE TRIGGER trg_attempt_terminal_task_insert
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN (
    SELECT status FROM tasks WHERE task_id = NEW.task_id
) IN ('succeeded', 'canceled', 'abandoned')
BEGIN
    SELECT RAISE(ABORT, 'cannot insert attempt for terminal task');
END;

-- v0.9-B Invariant I15 (companion): an active attempt (claimed/running/
-- cancel_requested) MUST reference a non-NULL worker_id. Closes P0-9I.
-- v0.9.2: split into INSERT + UPDATE OF (status, worker_id) to close
-- P0-M2-2 / P0-9I UPDATE bypass (pending+NULL → UPDATE status='claimed'
-- would otherwise pass). SQLite requires separate triggers per operation.
CREATE TRIGGER trg_attempt_active_needs_worker_insert
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN NEW.status IN ('claimed', 'running', 'cancel_requested')
     AND NEW.worker_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'I15: active attempt must reference a worker_id');
END;

CREATE TRIGGER trg_attempt_active_needs_worker_update
BEFORE UPDATE OF status, worker_id ON task_attempts
FOR EACH ROW
WHEN NEW.status IN ('claimed', 'running', 'cancel_requested')
     AND NEW.worker_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'I15: active attempt must reference a worker_id (UPDATE path)');
END;

-- v0.9-B Invariant I15 (companion): if worker_id is set, the referenced
-- worker MUST exist in the workers table. Closes P0-9N.
-- v0.9.2: split into INSERT + UPDATE OF worker_id to close ghost-worker
-- UPDATE bypass.
CREATE TRIGGER trg_attempt_worker_exists_insert
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN NEW.worker_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM workers WHERE worker_id = NEW.worker_id)
BEGIN
    SELECT RAISE(ABORT, 'I15: task_attempts.worker_id must reference an existing workers row');
END;

CREATE TRIGGER trg_attempt_worker_exists_update
BEFORE UPDATE OF worker_id ON task_attempts
FOR EACH ROW
WHEN NEW.worker_id IS NOT NULL
     AND NEW.worker_id IS NOT OLD.worker_id
     AND NOT EXISTS (SELECT 1 FROM workers WHERE worker_id = NEW.worker_id)
BEGIN
    SELECT RAISE(ABORT, 'I15: task_attempts.worker_id must reference an existing workers row (UPDATE path)');
END;

-- v0.9.4 P0-M2-2 attempt-side backstop (closes Codex v0.9.3 finding):
-- After UPDATE OF worker_id on task_attempts, the new state MUST be consistent
-- with workers.current_attempt_id pointers. Specifically: NO worker other than
-- NEW.worker_id may have current_attempt_id = NEW.attempt_id. If NEW.worker_id
-- is NULL, NO worker at all may have current_attempt_id = NEW.attempt_id.
-- This is the reverse direction of trg_worker_ownership_update; together
-- they enforce bidirectional ownership consistency across both tables.
-- Previously: changing task_attempts.worker_id from w-own-a to w-own-b left
-- w-own-a.current_attempt_id pointing at the same attempt, silently breaking
-- the invariant. The trigger now fires whenever the UPDATE would create that
-- dangling-pointer state.
CREATE TRIGGER trg_attempt_owner_consistent_update
BEFORE UPDATE OF worker_id ON task_attempts
FOR EACH ROW
WHEN NEW.worker_id IS NOT OLD.worker_id
     AND EXISTS (
         SELECT 1 FROM workers
         WHERE current_attempt_id = NEW.attempt_id
           AND (NEW.worker_id IS NULL OR worker_id != NEW.worker_id)
     )
BEGIN
    SELECT RAISE(ABORT,
        'attempt ownership: task_attempts.worker_id UPDATE from ' ||
        COALESCE(OLD.worker_id, '<NULL>') || ' to ' || COALESCE(NEW.worker_id, '<NULL>') ||
        ' for attempt_id=' || NEW.attempt_id ||
        ' would leave a dangling pointer in workers.current_attempt_id; ' ||
        'clear the other worker''s pointer first'
    );
END;

-- ==================== v0.9-A INVARIANTS ====================
-- Invariant I11 (context budget): for L2/L3 snapshot INSERTs, the running sum
-- of token_count across (task_id, level IN ('L2','L3')) plus the new row's
-- token_count MUST NOT exceed tasks.context_budget_tokens (when set, i.e. not NULL).
-- This is checked at INSERT time; the trigger fires BEFORE INSERT.
-- A NULL context_budget_tokens means "no budget set" (no enforcement).
CREATE TRIGGER trg_snapshot_budget_check
BEFORE INSERT ON context_snapshots
FOR EACH ROW
WHEN NEW.level IN ('L2','L3')
     AND (SELECT context_budget_tokens FROM tasks WHERE task_id=NEW.task_id) IS NOT NULL
     AND (
         SELECT COALESCE(SUM(token_count), 0)
         FROM context_snapshots
         WHERE task_id=NEW.task_id AND level IN ('L2','L3')
     ) + NEW.token_count > (
         SELECT context_budget_tokens FROM tasks WHERE task_id=NEW.task_id
     )
BEGIN
    SELECT RAISE(ABORT, 'I11: working_set token_count exceeds task.context_budget_tokens');
END;

-- Invariant I14 (handoff trust): an L3 handoff snapshot's trust_label CANNOT be
-- untrusted_external. This closes the P0-9B regression risk where an attacker-
-- controlled blob could poison the next attempt's working_set.
CREATE TRIGGER trg_handoff_trust_label
BEFORE INSERT ON context_snapshots
FOR EACH ROW
WHEN NEW.level='L3' AND NEW.trust_label='untrusted_external'
BEGIN
    SELECT RAISE(ABORT, 'I14: L3 handoff trust_label cannot be untrusted_external');
END;

-- Invariant I15 (lineage: L2 must have parent at L0 or L1): a L2 working_set
-- entry MUST have a parent_snapshot_id pointing to an L0 or L1 in the same
-- task. Closed at DB layer so drivers cannot bypass lineage rules via
-- application code.
-- v0.9.2: closes P1-1 — parent.level is now actually checked (was: NULL-only).
CREATE TRIGGER trg_lineage_l2_needs_parent
BEFORE INSERT ON context_snapshots
FOR EACH ROW
WHEN NEW.level = 'L2'
     AND (
         NEW.parent_snapshot_id IS NULL
         OR COALESCE(
             (SELECT level FROM context_snapshots WHERE snapshot_id = NEW.parent_snapshot_id),
             ''
         ) NOT IN ('L0', 'L1')
     )
BEGIN
    SELECT RAISE(ABORT,
        'lineage: L2 snapshot must have parent_snapshot_id of level L0 or L1, got parent level="' ||
        COALESCE(
            (SELECT level FROM context_snapshots WHERE snapshot_id = NEW.parent_snapshot_id),
            'NULL'
        ) || '"'
    );
END;

-- Invariant I16 (lineage: L3 must have parent at L2): a L3 handoff MUST have
-- a parent_snapshot_id pointing to an L2 in the same task.
-- v0.9.2: closes P1-1 — L3 using L1 as parent was previously accepted.
CREATE TRIGGER trg_lineage_l3_needs_parent
BEFORE INSERT ON context_snapshots
FOR EACH ROW
WHEN NEW.level = 'L3'
     AND (
         NEW.parent_snapshot_id IS NULL
         OR COALESCE(
             (SELECT level FROM context_snapshots WHERE snapshot_id = NEW.parent_snapshot_id),
             ''
         ) != 'L2'
     )
BEGIN
    SELECT RAISE(ABORT,
        'lineage: L3 handoff must have parent_snapshot_id of level L2, got parent level="' ||
        COALESCE(
            (SELECT level FROM context_snapshots WHERE snapshot_id = NEW.parent_snapshot_id),
            'NULL'
        ) || '"'
    );
END;

-- Invariant I17 (lineage: parent must be in same task): closes cross-task parent
-- spoofing (Codex v0.9-A P1-1 reproduction).
CREATE TRIGGER trg_lineage_same_task
BEFORE INSERT ON context_snapshots
FOR EACH ROW
WHEN NEW.parent_snapshot_id IS NOT NULL
     AND (SELECT task_id FROM context_snapshots WHERE snapshot_id = NEW.parent_snapshot_id) IS NOT NULL
     AND (SELECT task_id FROM context_snapshots WHERE snapshot_id = NEW.parent_snapshot_id) != NEW.task_id
BEGIN
    SELECT RAISE(ABORT, 'lineage: parent_snapshot_id must belong to the same task');
END;

-- Invariant I18 (append-only): context_snapshots is an append-only ledger
-- (like task_events and audit_log). Closes Codex v0.9-A P0-M2-1 (I11/I14
-- bypass via UPDATE). Any UPDATE on context_snapshots is rejected with the
-- ABORT message naming the row id.
CREATE TRIGGER trg_snapshot_no_update
BEFORE UPDATE ON context_snapshots
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'context_snapshots is append-only; UPDATE rejected (snapshot_id=' || OLD.snapshot_id || ')');
END;

CREATE TRIGGER trg_snapshot_no_delete
BEFORE DELETE ON context_snapshots
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'context_snapshots is append-only; DELETE rejected (snapshot_id=' || OLD.snapshot_id || ')');
END;

-- Invariant I19 (event emission): every INSERT into context_snapshots MUST also
-- append a row to task_events with event_type='context.snapshot'. This makes the
-- snapshot ledger observable through the same event stream as other kernel
-- transitions and closes Codex v0.9-A P1-3.
-- v0.9.2: payload_json now includes task_id and attempt_id so the actual
-- emitted payload satisfies spec/events/context.snapshot.json required[].
CREATE TRIGGER trg_snapshot_event_emit
AFTER INSERT ON context_snapshots
FOR EACH ROW
BEGIN
    INSERT INTO task_events (
        event_id, task_id, attempt_id, event_type, payload_json, recorded_at
    ) VALUES (
        'evt-' || NEW.snapshot_id,
        NEW.task_id,
        NEW.attempt_id,
        'context.snapshot',
        json_object(
            'snapshot_id', NEW.snapshot_id,
            'task_id', NEW.task_id,
            'attempt_id', NEW.attempt_id,
            'level', NEW.level,
            'token_count', NEW.token_count,
            'trust_label', NEW.trust_label,
            'parent_snapshot_id', NEW.parent_snapshot_id,
            'raw_blob_id', NEW.raw_blob_id,
            'distilled_blob_id', NEW.distilled_blob_id
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
END;

-- ==================== v0.9-B INVARIANTS ====================
-- Invariant I16 (worker heartbeat must STRICTLY advance last_heartbeat_at):
-- any UPDATE OF last_heartbeat_at on an active worker MUST set it to a strictly
-- newer value. ISO 8601 with milliseconds is lexicographically monotonic when
-- widths are fixed; helpers enforce this format.
-- Closes P0-9J (v0.9.1 only rejected equal; backward 12:00:00 → 11:00:00 was
-- accepted). v0.9.2: NEW <= OLD instead of OLD = NEW.
-- Also BEFORE UPDATE OF last_heartbeat_at — does NOT fire on unrelated
-- UPDATEs (e.g. status changes).
CREATE TRIGGER trg_worker_heartbeat_renew
BEFORE UPDATE OF last_heartbeat_at ON workers
FOR EACH ROW
WHEN NEW.status = 'active'
     AND NEW.last_heartbeat_at <= OLD.last_heartbeat_at
BEGIN
    SELECT RAISE(ABORT, 'I16: worker heartbeat must strictly advance last_heartbeat_at (worker_id=' || OLD.worker_id || '; OLD=' || OLD.last_heartbeat_at || ' NEW=' || NEW.last_heartbeat_at || ')');
END;

-- Invariant I17 (drain pause with stale current_attempt_id): a worker
-- transitioning from active → draining MUST NOT have a current_attempt_id
-- pointing at an already-terminal task_attempts row (stale pointer).
-- Closes P0-9K (UPDATE path).
CREATE TRIGGER trg_worker_drain_pause
BEFORE UPDATE OF status ON workers
FOR EACH ROW
WHEN OLD.status = 'active' AND NEW.status = 'draining'
     AND NEW.current_attempt_id IS NOT NULL
     AND (
         SELECT status FROM task_attempts WHERE attempt_id = NEW.current_attempt_id
     ) IN ('succeeded','failed','canceled','expired')
BEGIN
    SELECT RAISE(ABORT, 'I17: cannot drain worker with stale current_attempt_id (worker_id=' || OLD.worker_id || ')');
END;

-- v0.9.2 I17 INSERT bypass backstop: a worker cannot be INSERTed directly
-- in 'draining' state (must go through active → drain lifecycle).
-- Closes P0-9K INSERT bypass.
CREATE TRIGGER trg_worker_no_draining_insert
BEFORE INSERT ON workers
FOR EACH ROW
WHEN NEW.status = 'draining'
BEGIN
    SELECT RAISE(ABORT, 'I17: worker cannot be INSERTed directly in draining status (worker_id=' || NEW.worker_id || '); use register() then drain()');
END;

-- v0.9.2 I17 reactivation backstop: a worker in 'drained' or 'stale' cannot
-- transition back to active or draining.
-- Closes P0-9K reactivation bypass.
CREATE TRIGGER trg_worker_no_reactivate
BEFORE UPDATE OF status ON workers
FOR EACH ROW
WHEN OLD.status IN ('drained', 'stale')
     AND NEW.status IN ('active', 'draining')
BEGIN
    SELECT RAISE(ABORT, 'I17: cannot transition worker from terminal status ' || OLD.status || ' back to ' || NEW.status || ' (worker_id=' || OLD.worker_id || ')');
END;

-- v0.9.2 I15 companion on workers: workers.current_attempt_id, when non-NULL,
-- MUST reference an attempt whose worker_id equals self.worker_id. Closes
-- P0-M2-2 bidirectional-consistency bypass: w-other.current_attempt_id
-- could previously point at attempt held by w-owner, FK still passed.
-- SQLite requires separate triggers per operation.
-- v0.9.3 NULL-safe rewrite: same three-valued-logic bug as the fence
-- trigger above — `(SELECT worker_id ...) != NEW.worker_id` is UNKNOWN when
-- the attempt row is absent or its worker_id is NULL, and an UNKNOWN WHEN
-- skips RAISE. NOT EXISTS makes the bypass impossible.
CREATE TRIGGER trg_worker_ownership_insert
BEFORE INSERT ON workers
FOR EACH ROW
WHEN NEW.current_attempt_id IS NOT NULL
     AND NOT EXISTS (
         SELECT 1 FROM task_attempts
         WHERE attempt_id = NEW.current_attempt_id
           AND worker_id IS NOT NULL
           AND worker_id = NEW.worker_id
     )
BEGIN
    SELECT RAISE(ABORT,
        'worker ownership: workers.current_attempt_id=' || NEW.current_attempt_id ||
        ' belongs to worker_id=' || COALESCE(
            (SELECT worker_id FROM task_attempts WHERE attempt_id = NEW.current_attempt_id),
            '<missing>'
        ) || ', not worker_id=' || NEW.worker_id
    );
END;

CREATE TRIGGER trg_worker_ownership_update
BEFORE UPDATE OF current_attempt_id ON workers
FOR EACH ROW
WHEN NEW.current_attempt_id IS NOT NULL
     AND NEW.current_attempt_id IS NOT OLD.current_attempt_id
     AND NOT EXISTS (
         SELECT 1 FROM task_attempts
         WHERE attempt_id = NEW.current_attempt_id
           AND worker_id IS NOT NULL
           AND worker_id = NEW.worker_id
     )
BEGIN
    SELECT RAISE(ABORT,
        'worker ownership: workers.current_attempt_id=' || NEW.current_attempt_id ||
        ' belongs to worker_id=' || COALESCE(
            (SELECT worker_id FROM task_attempts WHERE attempt_id = NEW.current_attempt_id),
            '<missing>'
        ) || ', not worker_id=' || NEW.worker_id
    );
END;

-- v0.9.4 worker event emission (closes Codex v0.9.3 P1-2 finding).
-- The original trg_worker_dispatched_event_emit fired on INSERT INTO workers
-- and named the event 'worker.dispatched', but its payload was registration-
-- shaped (host/capabilities/status/dispatched_at) while spec/worker-pool.md
-- §5.1 defines worker.dispatched as task→worker assignment (task_id +
-- worker_id + strategy + dispatched_at). The two events were conflated.
-- v0.9.4 split: registration emits 'worker.registered'; task-attempt INSERT/
-- UPDATE with non-NULL worker_id emits 'worker.dispatched'.
CREATE TRIGGER trg_worker_registered_event_emit
AFTER INSERT ON workers
FOR EACH ROW
BEGIN
    INSERT INTO task_events (
        event_id, task_id, attempt_id, event_type, payload_json, recorded_at
    ) VALUES (
        'evt-wr-' || NEW.worker_id,
        NULL,
        NULL,
        'worker.registered',
        json_object(
            'worker_id', NEW.worker_id,
            'host', NEW.host,
            'capabilities_json', NEW.capabilities_json,
            'status', NEW.status,
            'registered_at', NEW.registered_at
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
END;

-- Real worker.dispatched event (closes v0.9.3 P1-2). Emitted when an attempt
-- becomes active and bound to a worker (i.e. INSERT with worker_id set and
-- status in the active set). Payload matches spec/worker-pool.md §5.1.
CREATE TRIGGER trg_attempt_dispatched_event_emit_insert
AFTER INSERT ON task_attempts
FOR EACH ROW
WHEN NEW.worker_id IS NOT NULL
     AND NEW.status IN ('claimed', 'running', 'cancel_requested')
BEGIN
    INSERT INTO task_events (
        event_id, task_id, attempt_id, event_type, payload_json, recorded_at
    ) VALUES (
        'evt-wd-' || NEW.task_id || '-' || NEW.attempt_id,
        NEW.task_id,
        NEW.attempt_id,
        'worker.dispatched',
        json_object(
            'task_id', NEW.task_id,
            'worker_id', NEW.worker_id,
            'attempt_id', NEW.attempt_id,
            'strategy', 'capability_match',
            'dispatched_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
END;

-- worker.dispatched on UPDATE OF worker_id (worker takeover / handoff).
-- Fires only when worker_id actually changes and the attempt is active.
CREATE TRIGGER trg_attempt_dispatched_event_emit_update
AFTER UPDATE OF worker_id, status ON task_attempts
FOR EACH ROW
WHEN NEW.worker_id IS NOT NULL
     AND NEW.worker_id IS NOT OLD.worker_id
     AND NEW.status IN ('claimed', 'running', 'cancel_requested')
BEGIN
    INSERT INTO task_events (
        event_id, task_id, attempt_id, event_type, payload_json, recorded_at
    ) VALUES (
        'evt-wd-upd-' || NEW.task_id || '-' || NEW.attempt_id,
        NEW.task_id,
        NEW.attempt_id,
        'worker.dispatched',
        json_object(
            'task_id', NEW.task_id,
            'worker_id', NEW.worker_id,
            'attempt_id', NEW.attempt_id,
            'strategy', 'worker_takeover',
            'dispatched_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
END;

CREATE TRIGGER trg_worker_heartbeat_event_emit
AFTER UPDATE OF last_heartbeat_at ON workers
FOR EACH ROW
WHEN OLD.last_heartbeat_at != NEW.last_heartbeat_at
BEGIN
    INSERT INTO task_events (
        event_id, task_id, attempt_id, event_type, payload_json, recorded_at
    ) VALUES (
        'evt-wh-' || NEW.worker_id || '-' || NEW.last_heartbeat_at,
        NULL,
        NULL,
        'worker.heartbeat',
        json_object(
            'worker_id', NEW.worker_id,
            'last_heartbeat_at', NEW.last_heartbeat_at,
            'current_attempt_id', NEW.current_attempt_id
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
END;

CREATE TRIGGER trg_worker_drained_event_emit
AFTER UPDATE OF status ON workers
FOR EACH ROW
WHEN NEW.status IN ('draining', 'drained', 'stale')
     AND OLD.status != NEW.status
BEGIN
    INSERT INTO task_events (
        event_id, task_id, attempt_id, event_type, payload_json, recorded_at
    ) VALUES (
        'evt-wdr-' || NEW.worker_id || '-' || NEW.status,
        NULL,
        NULL,
        'worker.drained',
        json_object(
            'worker_id', NEW.worker_id,
            'status', NEW.status,
            'current_attempt_id', NEW.current_attempt_id,
            'drained_at', COALESCE(NEW.drained_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
END;

-- ==================== DONE ====================
-- This schema is the canonical source for the kernel DB.
-- Any application code that creates tables or columns not listed here
-- violates the spec and must be either (a) added here, or (b) rejected in review.