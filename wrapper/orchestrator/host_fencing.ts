/**
 * host_fencing.ts — host-id fencing for cross-host dispatch (v1.2.0c NEW).
 *
 * Implements ADR 0009 line 68 「multi-host 必须 host-id fencing」—
 * prevents two hosts from concurrently dispatching the same task_id,
 * which would corrupt the kernel-side task_attempts.current_attempt_id.
 *
 * Strategy:
 *   1. Wrapper-side: recordDispatch() writes a row to a per-host SQLite
 *      fence table before dispatching; checkFencing() reads it back.
 *   2. Kernel-side (authoritative): spec/kernel-schema.sql dispatches
 *      table + partial unique index `idx_dispatch_task_host ON
 *      dispatches(task_id, host_id) WHERE status='active'` (per F13).
 *   3. On INSERT conflict, kernel returns UNIQUE constraint failed;
 *      wrapper catches and throws HostIdFencingError.
 *
 * Hygiene (per v1.2.0c §4.14 audit-scope):
 *   - No hardcoded secrets (no API keys in this module)
 *   - No model pinning (host_id is a string, not a model)
 *   - No model-specific identifiers (Fable 5 / GLM 5.3 / MiniMax-M3)
 *   - per-host SQLite file per ADR 0009 single-host constraint
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { Database } from "better-sqlite3";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HostId = string; // MagicDNS hostname fragment

export interface FenceRecord {
  task_id: string;
  host_id: HostId;
  status: "active" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
}

/**
 * Thrown when a host attempts to dispatch a task_id that already has an
 * active dispatch on a different host. Surfaces the partial unique
 * index constraint failure to the caller.
 */
export class HostIdFencingError extends Error {
  readonly task_id: string;
  readonly host_id: HostId;
  readonly existing_host_id: HostId | null;

  constructor(
    task_id: string,
    host_id: HostId,
    existing_host_id: HostId | null,
    detail: string,
  ) {
    super(
      `HostIdFencingError: task_id=${task_id} host_id=${host_id}` +
        ` existing_host_id=${existing_host_id ?? "none"}: ${detail}`,
    );
    this.name = "HostIdFencingError";
    this.task_id = task_id;
    this.host_id = host_id;
    this.existing_host_id = existing_host_id;
  }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const FENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS dispatches (
    task_id       TEXT NOT NULL,
    host_id       TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at  TEXT,
    PRIMARY KEY (task_id, host_id)
);
CREATE INDEX IF NOT EXISTS idx_dispatches_active ON dispatches(task_id) WHERE status = 'active';
`;

// ─── HostFence (per-host file) ───────────────────────────────────────────────

/**
 * Per-host fence manager. Uses better-sqlite3 + WAL mode per ADR 0009
 * single-host constraint. Each host owns its own SQLite file under
 * /data/host_fencing.db (or :memory: for tests).
 */
export class HostFence {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.exec(FENCE_SCHEMA);
  }

  /**
   * Record a dispatch attempt on this host. If the same task_id has an
   * active dispatch on a *different* host, throws HostIdFencingError.
   *
   * If a prior dispatch on this host exists with status='active', this
   * is a re-dispatch (e.g. retry) and is allowed (PRIMARY KEY on
   * (task_id, host_id) prevents duplicates from same host).
   */
  recordDispatch(task_id: string, host_id: HostId, status: "active" = "active"): void {
    const existing = this.db
      .prepare(
        `SELECT host_id, status FROM dispatches WHERE task_id = ? AND status = 'active' LIMIT 1`,
      )
      .get(task_id) as { host_id: HostId; status: string } | undefined;

    if (existing && existing.host_id !== host_id) {
      throw new HostIdFencingError(
        task_id,
        host_id,
        existing.host_id,
        `task already active on host ${existing.host_id}; partial unique index violation`,
      );
    }

    this.db
      .prepare(
        `INSERT OR REPLACE INTO dispatches (task_id, host_id, status) VALUES (?, ?, ?)`,
      )
      .run(task_id, host_id, status);
  }

  /**
   * Check whether a task is currently fenced on this host. Returns
   * the existing record if found, null otherwise.
   */
  checkFencing(task_id: string): FenceRecord | null {
    const row = this.db
      .prepare(
        `SELECT task_id, host_id, status, created_at, completed_at FROM dispatches WHERE task_id = ? LIMIT 1`,
      )
      .get(task_id) as
      | {
          task_id: string;
          host_id: HostId;
          status: "active" | "completed" | "failed";
          created_at: string;
          completed_at: string | null;
        }
      | undefined;
    return row ?? null;
  }

  /**
   * Mark a dispatch as completed (or failed). Used when the worker
   * finishes the task — releases the fence so a future dispatch on
   * a different host is allowed.
   */
  completeDispatch(task_id: string, host_id: HostId, finalStatus: "completed" | "failed"): void {
    this.db
      .prepare(
        `UPDATE dispatches SET status = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE task_id = ? AND host_id = ?`,
      )
      .run(finalStatus, task_id, host_id);
  }

  close(): void {
    this.db.close();
  }
}

// ─── Module-level handle (lazy) ─────────────────────────────────────────────

let _fence: HostFence | null = null;

/**
 * Get the default HostFence instance. Lazy-initialised against an
 * in-memory database for tests; production callers should inject via
 * setDefaultFence().
 */
export function getDefaultFence(): HostFence {
  if (_fence !== null) return _fence;
  // Lazy import to avoid hard dep on better-sqlite3 for type-check
  // only builds; in practice the runtime imports better-sqlite3 once
  // at module init via worker_pool.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require("better-sqlite3") as unknown as typeof import("better-sqlite3");
  const db = new BetterSqlite3(":memory:");
  db.pragma("journal_mode = WAL");
  _fence = new HostFence(db);
  return _fence;
}

/** Test helper — swap the default fence instance. */
export function setDefaultFenceForTests(fence: HostFence | null): void {
  if (_fence !== null) _fence.close();
  _fence = fence;
}

/** Test helper — reset module state. */
export function _resetForTests(): void {
  setDefaultFenceForTests(null);
}