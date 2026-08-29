-- Fish Harness kernel schema (canonical, executable)
-- File: spec/kernel-schema.sql
-- Version: v0.7
-- This file MUST be applied via PRAGMA + CREATE TABLE statements.
-- CI runs this file with `sqlite3 :memory: < spec/kernel-schema.sql` and
-- then executes the spike tests in spikes/m0/ against the resulting DB.

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
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_attempts_status ON task_attempts(status, lease_expires_at);
CREATE INDEX idx_attempts_worker ON task_attempts(worker_id, status);

-- Only one non-terminal attempt per task. This enforces the invariant
-- "at most one active attempt per task" at the database layer.
CREATE UNIQUE INDEX idx_attempts_one_active
    ON task_attempts(task_id)
    WHERE status IN ('claimed', 'running', 'cancel_requested');

-- ==================== EVENTS ====================
-- Append-only event log. Every state transition emits one event envelope.
CREATE TABLE task_events (
    event_id             TEXT PRIMARY KEY,
    task_id              TEXT NOT NULL,
    attempt_id           TEXT,
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

-- ==================== KERNEL INVARIANTS (enforced at SQL layer where possible) ====================
-- Invariant I1: attempt.fence_version MUST equal task.fence_version at insert
-- (strict equality, not >=). Any mismatch is rejected.
-- This closes the P0-2 oversized-fence regression Codex reproduced in v0.7.

CREATE TRIGGER trg_attempt_fence_insert
BEFORE INSERT ON task_attempts
FOR EACH ROW
WHEN NEW.fence_version != (
    SELECT fence_version FROM tasks WHERE task_id = NEW.task_id
)
BEGIN
    SELECT RAISE(ABORT, 'attempt.fence_version must EQUAL task.fence_version at insert (got attempt=' || NEW.fence_version || ' task=' || (SELECT fence_version FROM tasks WHERE task_id = NEW.task_id) || ')');
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

-- ==================== DONE ====================
-- This schema is the canonical source for the kernel DB.
-- Any application code that creates tables or columns not listed here
-- violates the spec and must be either (a) added here, or (b) rejected in review.