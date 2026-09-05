/**
 * Queue store — in-memory + SQLite-backed queue with backpressure (v1.2.0d NEW).
 *
 * Why dual-model (per D8 + F25/F26):
 *   - In-memory ring buffer for the hot path: dispatch() → enqueue() O(1)
 *   - SQLite WAL persistence for crash recovery + overflow (per ADR 0009
 *     single-host WAL constraint; per-host file at /data/queue_store.db)
 *   - 429 Retry-After response when in-flight queue saturates (HTTP RFC 6585 §4)
 *   - 202 Accepted + Location header when overflow lands in SQLite pending
 *     queue (HTTP RFC 7231 §6.3.3)
 *
 * Schema (simplified, per F3 — no cross-DB FK):
 *   - task_id TEXT PRIMARY KEY
 *   - payload_json TEXT NOT NULL (raw JSON of dispatch request)
 *   - enqueued_at INTEGER NOT NULL (unix epoch ms)
 *   - status TEXT NOT NULL CHECK IN ('pending','dispatched','completed','failed')
 *
 * 5-method QueueStore Protocol (per types.ts):
 *   enqueue / dequeue / peek / reclaim / pending_count
 *
 * Deployment note (per §3.7 v1.2.0b + newvps-harness-deploy-gotchas.md):
 *   wrapper image is bind-mounted from host (`..:/app:ro`), so better-sqlite3
 *   must be npm-installed on the host (U3) before bind mount — its native
 *   binary is then visible inside the container.
 */

import Database from "better-sqlite3";
import { mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default per-host SQLite path. Env override via QUEUE_STORE_DB (no
 *  hardcoded secrets — path only, per §2 hygiene gate). */
const QUEUE_STORE_DB = "/data/queue_store.db";

/** SQLite WAL busy timeout (per ADR 0009 line 35 — single-host constraint). */
const BUSY_TIMEOUT_MS = 5000;

/** Default max in-flight tasks before backpressure kicks in (per D8).
 *  Env override via QUEUE_MAX_IN_FLIGHT for test injection. */
const DEFAULT_MAX_IN_FLIGHT = 50;

/** Retry-After header value (seconds) when 429 returned (per F26). */
const RETRY_AFTER_SECONDS = 30;

// ─── Types ───────────────────────────────────────────────────────────────────

export type EnqueueResult =
  | { status: "accepted"; task_id: string; location: string }
  | { status: "throttled"; task_id: string; retry_after: number };

export interface QueueTask {
  task_id: string;
  payload: Record<string, unknown>;
  enqueued_at: number;
  status: "pending" | "dispatched" | "completed" | "failed";
}

// ─── Schema bootstrap ────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS queue_tasks (
    task_id        TEXT PRIMARY KEY,
    payload_json   TEXT NOT NULL,
    enqueued_at    INTEGER NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('pending','dispatched','completed','failed'))
  );

  CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_queue_enqueued_at ON queue_tasks(enqueued_at);
`;

// ─── SqliteQueueStore ────────────────────────────────────────────────────────

export class SqliteQueueStore {
  private readonly db: Database.Database;
  private readonly dbPath: string;
  private readonly inMemory: QueueTask[] = [];
  private readonly maxInFlight: number;
  private readonly stmts: {
    insertPending: Database.Statement;
    selectPending: Database.Statement;
    selectNonCompleted: Database.Statement;
    markDispatched: Database.Statement;
    markCompleted: Database.Statement;
    countPending: Database.Statement;
  };

  constructor(opts?: { dbPath?: string; maxInFlight?: number }) {
    this.dbPath = opts?.dbPath ?? resolveDbPath();
    this.maxInFlight = opts?.maxInFlight ?? readMaxInFlightEnv();

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
        `queue_store: failed to apply pragmas (path=${this.dbPath}): ${(err as Error).message}`,
      );
    }

    this.db.exec(SCHEMA_SQL);

    this.stmts = {
      insertPending: this.db.prepare(
        `INSERT OR REPLACE INTO queue_tasks (task_id, payload_json, enqueued_at, status)
         VALUES (?, ?, ?, 'pending')`,
      ),
      selectPending: this.db.prepare(
        `SELECT task_id, payload_json, enqueued_at, status
           FROM queue_tasks WHERE status = 'pending'
          ORDER BY enqueued_at ASC LIMIT 1`,
      ),
      // v1.2.0d formal M-fix: reclaim must pull pending AND dispatched rows
      // (dispatched = dequeued into hot path but never completed — crash
      // recovery re-dispatches them), ordered oldest-first.
      selectNonCompleted: this.db.prepare(
        `SELECT task_id, payload_json, enqueued_at, status
           FROM queue_tasks WHERE status != 'completed'
          ORDER BY enqueued_at ASC`,
      ),
      markDispatched: this.db.prepare(
        `UPDATE queue_tasks SET status = 'dispatched' WHERE task_id = ?`,
      ),
      markCompleted: this.db.prepare(
        `UPDATE queue_tasks SET status = 'completed' WHERE task_id = ?`,
      ),
      countPending: this.db.prepare(
        `SELECT COUNT(*) AS c FROM queue_tasks WHERE status = 'pending'`,
      ),
    };
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

  dbPathResolved(): string {
    return this.dbPath;
  }

  /** Current in-memory queue depth (active in-flight tasks). */
  inFlightCount(): number {
    return this.inMemory.length;
  }

  // ─── QueueStore Protocol (5 methods) ──────────────────────────────────────

  /**
   * Enqueue a new task. Hot path: try in-memory first. If queue depth >= maxInFlight
   * → return throttled (429 Retry-After). Else append to in-memory AND SQLite pending
   * for crash recovery.
   */
  enqueue(task_id: string, payload: Record<string, unknown>): EnqueueResult {
    if (!task_id || typeof task_id !== "string") {
      throw new Error("queue_store.enqueue: task_id must be non-empty string");
    }
    if (typeof payload !== "object" || payload === null) {
      throw new Error("queue_store.enqueue: payload must be object");
    }

    if (this.inMemory.length >= this.maxInFlight) {
      // 429 Retry-After (per F26 + HTTP RFC 6585 §4)
      return {
        status: "throttled",
        task_id,
        retry_after: RETRY_AFTER_SECONDS,
      };
    }

    const nowMs = Date.now();
    const task: QueueTask = {
      task_id,
      payload,
      enqueued_at: nowMs,
      status: "pending",
    };

    // 1) In-memory hot path
    this.inMemory.push(task);

    // 2) SQLite WAL persistence (for crash recovery + reclaim path)
    this.stmts.insertPending.run(task_id, JSON.stringify(payload), nowMs);

    // 202 Accepted + Location header (per F26 + HTTP RFC 7231 §6.3.3)
    return {
      status: "accepted",
      task_id,
      location: `/api/v1/status/${encodeURIComponent(task_id)}`,
    };
  }

  /**
   * Dequeue the next pending task from in-memory (FIFO).
   * v1.2.0d formal M-fix: also markDispatched on the SQLite side — otherwise
   * pendingCount() stays stale and reclaim() would re-dispatch a task that
   * already left the hot path (double-dispatch on crash recovery).
   */
  dequeue(): QueueTask | null {
    const task = this.inMemory.shift() ?? null;
    if (task) {
      this.stmts.markDispatched.run(task.task_id);
    }
    return task;
  }

  /** Peek at the next pending task without removing it. */
  peek(): QueueTask | null {
    return this.inMemory[0] ?? null;
  }

  /**
   * Reclaim path: scan SQLite for non-completed tasks (pending + dispatched)
   * and re-populate in-memory hot path. Called by orchestrator when a worker
   * completes a task, and on cold start for crash recovery (per F26).
   *
   * v1.2.0d formal M-fix: rows already present in in-memory are skipped
   * (no duplicates); 'dispatched' rows are re-pulled — a dequeued-but-never-
   * completed task is exactly what crash recovery must re-dispatch.
   */
  reclaim(): number {
    let count = 0;
    const hot = new Set(this.inMemory.map((t) => t.task_id));
    const rows = this.stmts.selectNonCompleted.all() as Array<{
      task_id: string;
      payload_json: string;
      enqueued_at: number;
      status: string;
    }>;
    for (const row of rows) {
      if (this.inMemory.length >= this.maxInFlight) break;
      if (hot.has(row.task_id)) continue;
      const task: QueueTask = {
        task_id: row.task_id,
        payload: JSON.parse(row.payload_json),
        enqueued_at: row.enqueued_at,
        status: "pending",
      };
      this.inMemory.push(task);
      this.stmts.markDispatched.run(row.task_id);
      count++;
    }
    return count;
  }

  /** Pending count from SQLite (overflow queue depth). */
  pendingCount(): number {
    return (this.stmts.countPending.get() as { c: number }).c;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveDbPath(): string {
  const envPath = process.env.QUEUE_STORE_DB;
  if (envPath && envPath.length > 0) {
    return isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath);
  }
  return QUEUE_STORE_DB;
}

function readMaxInFlightEnv(): number {
  const v = process.env.QUEUE_MAX_IN_FLIGHT;
  if (v && /^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    if (n > 0) return n;
  }
  return DEFAULT_MAX_IN_FLIGHT;
}

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  try {
    statSync(dir);
  } catch {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Module-level singleton (lazy) ───────────────────────────────────────────

let _singleton: SqliteQueueStore | null = null;

/**
 * Process-wide lazy singleton. Production code (orchestrator.ts) calls this
 * so they share one queue; tests construct their own SqliteQueueStore instance
 * with a temp path.
 */
export function getDefaultQueueStore(): SqliteQueueStore {
  if (_singleton === null) {
    _singleton = new SqliteQueueStore();
  }
  return _singleton;
}

/** Test helper: reset the singleton (used by unit tests to swap DB paths). */
export function _resetQueueStoreForTests(): void {
  if (_singleton !== null) {
    _singleton.close();
    _singleton = null;
  }
}