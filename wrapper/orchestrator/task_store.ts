/**
 * Task store — wrapper-side task lifecycle persistence (v1.2.0j+.5 NEW).
 *
 * Why dual-model (per D3 + F2):
 *   - In-memory Map for hot path (setTask / getTask) — O(1) for live dispatch flow
 *   - SQLite WAL persistence for crash recovery + cross-restart reads
 *     (per ADR 0009 single-host WAL; per-host file at /data/task_store.db)
 *
 * Why this is NOT kernel tasks table (per D5 + F4):
 *   - Kernel `tasks` table (harness/runtime/_db.py) stores orchestration attempt
 *     state with fence_version, attempt_id, worker_id, tenant_id — much wider
 *     surface than what the wrapper needs for its own lifecycle.
 *   - Wrapper-side store intentionally narrower — status, prompt, model_class,
 *     result JSON, error. No fence_version / attempt_id / tenant_id (those
 *     remain in kernel; wrapper queries kernel via /api/orch/status when
 *     needed).
 *
 * Status lifecycle (per F3):
 *   pending → running → completed | failed | cancelled
 *
 * Crash recovery (per warmCache):
 *   On construction, any non-terminal row (pending / dispatched / running) is
 *   conservatively marked as `failed` with error='crash_recovery'. We cannot
 *   prove completion after restart; phantom "completed" state would silently
 *   lose data. Caller may re-dispatch if needed.
 *
 * Schema (per D2):
 *   - task_id      TEXT PRIMARY KEY
 *   - prompt       TEXT NOT NULL
 *   - model_class  TEXT NOT NULL
 *   - status       TEXT NOT NULL CHECK IN ('pending','dispatched','running',
 *                                            'completed','failed','cancelled')
 *   - result_json  TEXT              (JSON.stringify of {stdout, exitCode,
 *                                                    stderr, wallMs})
 *   - error        TEXT              (error string on failed/cancelled)
 *   - created_at   INTEGER NOT NULL  (unix epoch ms; cross-wrapper consistency)
 *   - updated_at   INTEGER NOT NULL  (unix epoch ms)
 *
 * F3 partial closure note (per R10):
 *   _activeControllers registry in orchestrator.ts is the placeholder for
 *   cancel propagation. Full workerModule.run() integration requires
 *   refactoring run() to expose RunHandle — deferred to v1.2.0j+.6+ (F3+).
 *
 * Deployment note (per §3.7 v1.2.0b + newvps-harness-deploy-gotchas.md):
 *   wrapper image is bind-mounted from host (`..:/app:ro`), so better-sqlite3
 *   must be npm-installed on the host (U3) before bind mount — its native
 *   binary is then visible inside the container.
 *
 * @file wrapper/orchestrator/task_store.ts
 */

import Database from "better-sqlite3";
import { mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { TaskStatus } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default per-host SQLite path. Env override via TASK_STORE_DB (no
 *  hardcoded secrets — path only, per §2 hygiene gate). */
const TASK_STORE_DB = "/data/task_store.db";

/** SQLite WAL busy timeout (per ADR 0009 line 35 — single-host constraint). */
const BUSY_TIMEOUT_MS = 5000;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * In-memory + SQLite row representation of a wrapper task.
 * Distinct from `Task` (types.ts) which is the kernel-facing payload;
 * TaskStoreEntry is the wrapper-side lifecycle record.
 */
export interface TaskStoreEntry {
  taskId: string;
  prompt: string;
  modelClass: string;
  status: TaskStatus;
  resultJson: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Schema bootstrap ────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS task_store (
    task_id      TEXT PRIMARY KEY,
    prompt       TEXT NOT NULL,
    model_class  TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN (
                   'pending','dispatched','running','completed','failed','cancelled'
                 )),
    result_json  TEXT,
    error        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_task_status     ON task_store(status);
  CREATE INDEX IF NOT EXISTS idx_task_created_at ON task_store(created_at);
`;

// ─── SqliteTaskStore ─────────────────────────────────────────────────────────

/**
 * SQLite-backed task store with in-memory Map hot path.
 * Pattern mirrors SqliteQueueStore (queue_store.ts) for consistency:
 *   - WAL + busy_timeout=5000 + synchronous=NORMAL pragmas
 *   - env override for DB path (TASK_STORE_DB)
 *   - singleton via getDefaultTaskStore() + _resetTaskStoreForTests()
 *   - prepared statements cached in constructor
 */
export class SqliteTaskStore {
  private readonly db: Database.Database;
  private readonly dbPath: string;
  private readonly inMemory = new Map<string, TaskStoreEntry>();
  private readonly stmts: {
    upsert: Database.Statement;
    updateStatus: Database.Statement;
    selectById: Database.Statement;
    selectActive: Database.Statement;
    selectAll: Database.Statement;
  };

  constructor(opts?: { dbPath?: string }) {
    this.dbPath = opts?.dbPath ?? resolveDbPath();

    ensureParentDir(this.dbPath);
    this.db = new Database(this.dbPath);

    try {
      this.db.pragma("journal_mode = WAL");
      this.db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("foreign_keys = OFF");
    } catch (err) {
      this.db.close();
      throw new Error(
        `task_store: failed to apply pragmas (path=${this.dbPath}): ${(err as Error).message}`,
      );
    }

    this.db.exec(SCHEMA_SQL);

    this.stmts = {
      upsert: this.db.prepare(
        `INSERT OR REPLACE INTO task_store
           (task_id, prompt, model_class, status, result_json, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      updateStatus: this.db.prepare(
        `UPDATE task_store
            SET status=?, error=?, result_json=?, updated_at=?
          WHERE task_id=?`,
      ),
      selectById: this.db.prepare(
        `SELECT task_id, prompt, model_class, status, result_json, error, created_at, updated_at
           FROM task_store WHERE task_id=?`,
      ),
      selectActive: this.db.prepare(
        `SELECT task_id, prompt, model_class, status, result_json, error, created_at, updated_at
           FROM task_store
          WHERE status NOT IN ('completed','failed','cancelled')
          ORDER BY created_at ASC`,
      ),
      selectAll: this.db.prepare(
        `SELECT task_id, prompt, model_class, status, result_json, error, created_at, updated_at
           FROM task_store
          ORDER BY created_at DESC`,
      ),
    };

    this.warmCache();
  }

  /** Best-effort graceful close — flushes WAL + releases file lock. */
  close(): void {
    try {
      this.db.close();
    } catch {
      // idempotent
    }
  }

  /** Underlying Database handle for integration tests (gated by env). */
  rawHandle(): Database.Database {
    return this.db;
  }

  /** Resolved DB path — exposed for diagnostics / tests. */
  dbPathResolved(): string {
    return this.dbPath;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  /**
   * Insert or replace a task entry. Both in-memory Map and SQLite row updated.
   * Hot path for dispatch() — called once per task creation.
   */
  setTask(entry: TaskStoreEntry): void {
    this.inMemory.set(entry.taskId, entry);
    this.stmts.upsert.run(
      entry.taskId,
      entry.prompt,
      entry.modelClass,
      entry.status,
      entry.resultJson,
      entry.error,
      entry.createdAt,
      entry.updatedAt,
    );
  }

  /**
   * Get a task entry. Map first → SQLite fallback. Result is cached in Map on
   * first read so subsequent getTask(taskId) calls hit the hot path.
   */
  getTask(taskId: string): TaskStoreEntry | null {
    const cached = this.inMemory.get(taskId);
    if (cached) return cached;
    const row = this.stmts.selectById.get(taskId) as DbRow | undefined;
    if (!row) return null;
    const entry = rowToEntry(row);
    this.inMemory.set(taskId, entry);
    return entry;
  }

  /**
   * List ALL tasks (terminal + active). Reads from SQLite (not Map) to ensure
   * complete view across process restart — per F4, listTasks() must return
   * terminal tasks that are no longer in memory.
   */
  listTasks(): TaskStoreEntry[] {
    const rows = this.stmts.selectAll.all() as DbRow[];
    return rows.map(rowToEntry);
  }

  // ─── Status transitions ───────────────────────────────────────────────────

  /** Mark a task as running. Called by orchestrator.dispatch() before invoke. */
  markRunning(taskId: string): void {
    const now = Date.now();
    this.updateInMemory(taskId, { status: "running", error: null, resultJson: null, updatedAt: now });
    this.stmts.updateStatus.run("running", null, null, now, taskId);
  }

  /** Mark a task as completed with a JSON-serialized result. */
  markCompleted(taskId: string, resultJson: string): void {
    const now = Date.now();
    this.updateInMemory(taskId, { status: "completed", resultJson, error: null, updatedAt: now });
    this.stmts.updateStatus.run("completed", null, resultJson, now, taskId);
  }

  /** Mark a task as failed with an error message. */
  markFailed(taskId: string, error: string): void {
    const now = Date.now();
    this.updateInMemory(taskId, { status: "failed", error, resultJson: null, updatedAt: now });
    this.stmts.updateStatus.run("failed", error, null, now, taskId);
  }

  /** Mark a task as cancelled (per F3). */
  markCancelled(taskId: string): void {
    const now = Date.now();
    this.updateInMemory(taskId, { status: "cancelled", error: "cancelled by user", resultJson: null, updatedAt: now });
    this.stmts.updateStatus.run("cancelled", "cancelled by user", null, now, taskId);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  /** Patch a Map entry (no SQLite write). SQLite write is caller's job. */
  private updateInMemory(taskId: string, patch: Partial<TaskStoreEntry>): void {
    const existing = this.inMemory.get(taskId);
    if (!existing) return;
    this.inMemory.set(taskId, { ...existing, ...patch });
  }

  /**
   * Crash recovery: on construction, scan SQLite for non-terminal rows
   * (pending / dispatched / running) and mark them as `failed` with
   * error='crash_recovery'. Conservative: we cannot prove completion after
   * restart, so we mark uncertain state as failed. Caller may re-dispatch.
   *
   * Per R3 mitigation: phantom "completed" state would silently lose data.
   * Conservative failure is correct behavior.
   */
  private warmCache(): void {
    const rows = this.stmts.selectActive.all() as DbRow[];
    const now = Date.now();
    for (const row of rows) {
      const entry = rowToEntry(row);
      entry.status = "failed";
      entry.error = entry.error ?? "crash_recovery";
      entry.updatedAt = now;
      this.inMemory.set(entry.taskId, entry);
      this.stmts.updateStatus.run("failed", entry.error, null, now, entry.taskId);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveDbPath(): string {
  const envPath = process.env.TASK_STORE_DB;
  if (envPath && envPath.length > 0) {
    return isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath);
  }
  return TASK_STORE_DB;
}

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  try {
    statSync(dir);
  } catch {
    mkdirSync(dir, { recursive: true });
  }
}

interface DbRow {
  task_id: string;
  prompt: string;
  model_class: string;
  status: string;
  result_json: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

function rowToEntry(row: DbRow): TaskStoreEntry {
  return {
    taskId: row.task_id,
    prompt: row.prompt,
    modelClass: row.model_class,
    status: row.status as TaskStatus,
    resultJson: row.result_json,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Module-level singleton (lazy) ───────────────────────────────────────────

let _singleton: SqliteTaskStore | null = null;

/**
 * Process-wide lazy singleton. Production code (orchestrator.ts) calls this
 * so they share one task store; tests construct their own SqliteTaskStore
 * instance with a temp path.
 */
export function getDefaultTaskStore(): SqliteTaskStore {
  if (_singleton === null) {
    _singleton = new SqliteTaskStore();
  }
  return _singleton;
}

/** Test helper: reset the singleton (used by unit tests to swap DB paths). */
export function _resetTaskStoreForTests(): void {
  if (_singleton !== null) {
    _singleton.close();
    _singleton = null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// v1.2.0j+.10+ NEW (D8 race fix): cancelled-aware terminal-write helpers.
// Standalone functions (not class methods) to match the module-level calling
// style in orchestrator.ts. Both check current SQLite status BEFORE writing;
// returns true if the write succeeded, false if skipped because the task was
// already in a terminal state (cancelled / failed / completed) that the
// caller should not overwrite. This prevents the dsh-fallback path from
// racing with orchestrator.cancel() and overwriting a cancelled status.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cancelled-aware markCompleted.
 * Writes 'completed' status only if the task is currently NOT in a terminal
 * state ('cancelled', 'failed', 'completed'). Returns true if the write
 * happened, false if it was skipped to preserve an earlier terminal state.
 */
export function safeMarkCompleted(
  store: SqliteTaskStore,
  taskId: string,
  resultJson: string,
): boolean {
  const current = store.getTask(taskId);
  if (current === null) return false;
  if (current.status === "cancelled" || current.status === "failed" || current.status === "completed") {
    return false;
  }
  store.markCompleted(taskId, resultJson);
  return true;
}

/**
 * Cancelled-aware markFailed.
 * Writes 'failed' status only if the task is currently NOT in a terminal
 * state ('cancelled', 'completed'). 'failed' is NOT protected here because
 * a legitimate retry should be able to overwrite a prior failure — but a
 * prior 'completed' or 'cancelled' should win. Returns true if the write
 * happened, false if skipped.
 */
export function safeMarkFailed(
  store: SqliteTaskStore,
  taskId: string,
  error: string,
): boolean {
  const current = store.getTask(taskId);
  if (current === null) return false;
  if (current.status === "cancelled" || current.status === "completed") {
    return false;
  }
  store.markFailed(taskId, error);
  return true;
}