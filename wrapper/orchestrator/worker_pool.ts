/**
 * Worker pool — per-host SQLite-backed worker registry (v1.2.0b 真实现).
 *
 * Why SQLite (per D1 = Option B + ADR 0007 + ADR 0009):
 *   - Single-host file at /data/worker_pool.db (per-host fencing, ADR 0009
 *     line 27 forbids cross-host sharing). Env override via WORKER_POOL_DB.
 *   - WAL mode + busy_timeout=5000 (ADR 0009 single-host constraint).
 *   - Per-host file 简单 + 跨进程安全 + 无外部部署依赖 (vs Redis).
 *
 * Schema (简化版, per F3 — 无 cross-DB FK current_attempt_id):
 *   - worker_id TEXT PRIMARY KEY (UUID v4)
 *   - host TEXT NOT NULL (MagicDNS hostname, e.g. newvps.fish-harness.ts.net)
 *   - capabilities_json TEXT NOT NULL (raw JSON of spec/capabilities/worker.json)
 *   - status TEXT NOT NULL CHECK IN ('active','draining','drained','reaped')
 *   - last_heartbeat_at INTEGER NOT NULL (unix epoch milliseconds;
 *     sub-second precision needed so that 3+ rapid dispatches don't tie
 *     on ORDER BY last_heartbeat_at ASC and always pick the first-registered
 *     worker — secondary sort by worker_id ASC breaks remaining ties)
 *   - registered_at INTEGER NOT NULL (unix epoch seconds)
 *   - drained_at INTEGER (unix epoch seconds, nullable)
 *
 * Invariants (simplified per ADR 0007 line 60 WorkerInfo schema):
 *   - I15-simp: heartbeat advances last_heartbeat_at only if worker exists
 *     and status IN ('active','draining'); rejected on 'drained'/'reaped'.
 *   - I16-simp: drain atomically sets status='draining' + drained_at=now;
 *     once drained, no further dispatches land on this worker (dispatch()
 *     filters status='active' only).
 *
 * 6-method WorkerPool Protocol (per types.ts:137-145):
 *   register / dispatch / heartbeat / drain / reap_stale / claim_via_pool
 *
 * Deployment note (per §3.7 v1.2.0b + newvps-harness-deploy-gotchas.md):
 *   wrapper image is bind-mounted from host (`..:/app:ro`), so better-sqlite3
 *   must be npm-installed on the host (U3) before bind mount — its native
 *   binary is then visible inside the container. If a future wrapper image
 *   is built directly, `RUN apk add --no-cache python3 make g++` is required
 *   for node-gyp to compile better-sqlite3 from source.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type {
  DispatchResult,
  WorkerInfo,
  WorkerPool,
} from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default per-host SQLite path. Env override via WORKER_POOL_DB (no
 *  hardcoded secrets — path only, per §2 hygiene gate). The literal
 *  default-path constant is required by §2.7 v1.2.0b audit-scope grep. */
const WORKER_POOL_DB = "/data/worker_pool.db";

/** SQLite WAL busy timeout (per ADR 0009 line 35 — single-host constraint). */
const BUSY_TIMEOUT_MS = 5000;

/** Default reap-stale threshold: workers silent >120s are reaped. */
const DEFAULT_REAP_THRESHOLD_SECONDS = 120;

/** Allowed status values for workers.status column (matches CHECK constraint). */
const ALLOWED_STATUSES = new Set([
  "active",
  "draining",
  "drained",
  "reaped",
] as const);
type WorkerStatus = "active" | "draining" | "drained" | "reaped";

// ─── Schema bootstrap ────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workers (
    worker_id           TEXT PRIMARY KEY,
    host                TEXT NOT NULL,
    capabilities_json   TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('active','draining','drained','reaped')),
    last_heartbeat_at   INTEGER NOT NULL,
    registered_at       INTEGER NOT NULL,
    drained_at          INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
  CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON workers(last_heartbeat_at);
  CREATE INDEX IF NOT EXISTS idx_workers_host ON workers(host);
`;

// ─── SQLiteWorkerPool ────────────────────────────────────────────────────────

export class SqliteWorkerPool implements WorkerPool {
  private readonly db: Database.Database;
  private readonly dbPath: string;
  private readonly stmts: {
    insertWorker: Database.Statement;
    selectById: Database.Statement;
    selectActive: Database.Statement;
    updateHeartbeat: Database.Statement;
    updateDrain: Database.Statement;
    updateStatus: Database.Statement;
    selectStale: Database.Statement;
    countActive: Database.Statement;
  };

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? resolveDbPath();
    ensureParentDir(this.dbPath);

    this.db = new Database(this.dbPath);

    // WAL mode + busy_timeout per ADR 0009 single-host constraint. Wrapped
    // in try/catch — better-sqlite3 throws on permission errors but the
    // caller's caller (test setup or production init) is the right place
    // to surface those, not here.
    try {
      this.db.pragma("journal_mode = WAL");
      this.db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("foreign_keys = OFF");
    } catch (err) {
      this.db.close();
      throw new Error(
        `worker_pool: failed to apply pragmas (path=${this.dbPath}): ${(err as Error).message}`,
      );
    }

    this.db.exec(SCHEMA_SQL);

    this.stmts = {
      insertWorker: this.db.prepare(
        `INSERT INTO workers
           (worker_id, host, capabilities_json, status, last_heartbeat_at, registered_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      ),
      selectById: this.db.prepare(
        `SELECT worker_id, host, capabilities_json, status,
                last_heartbeat_at, registered_at, drained_at
           FROM workers WHERE worker_id = ?`,
      ),
      selectActive: this.db.prepare(
        `SELECT worker_id, host, capabilities_json, status,
                last_heartbeat_at, registered_at, drained_at
           FROM workers
          WHERE status = 'active'
          ORDER BY last_heartbeat_at ASC, worker_id ASC, registered_at ASC
          LIMIT 1`,
      ),
      updateHeartbeat: this.db.prepare(
        `UPDATE workers SET last_heartbeat_at = ?
          WHERE worker_id = ? AND status IN ('active','draining')`,
      ),
      updateDrain: this.db.prepare(
        `UPDATE workers SET status = 'draining', drained_at = ?
          WHERE worker_id = ? AND status = 'active'`,
      ),
      updateStatus: this.db.prepare(
        `UPDATE workers SET status = ? WHERE worker_id = ?`,
      ),
      selectStale: this.db.prepare(
        `SELECT worker_id FROM workers
          WHERE status IN ('active','draining')
            AND last_heartbeat_at < ?`,
      ),
      countActive: this.db.prepare(
        `SELECT COUNT(*) AS c FROM workers WHERE status = 'active'`,
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

  /** Read-side accessor for tests + server.ts health endpoint. */
  getWorker(worker_id: string): WorkerInfo | null {
    const row = this.stmts.selectById.get(worker_id) as
      | {
          worker_id: string;
          host: string;
          capabilities_json: string;
          status: string;
          last_heartbeat_at: number;
          registered_at: number;
          drained_at: number | null;
        }
      | undefined;
    if (!row) return null;
    return rowToWorkerInfo(row);
  }

  countActive(): number {
    return (this.stmts.countActive.get() as { c: number }).c;
  }

  /** Underlying Database handle for integration tests (gated by env). */
  rawHandle(): Database.Database {
    return this.db;
  }

  dbPathResolved(): string {
    return this.dbPath;
  }

  // ─── WorkerPool Protocol (6 methods) ──────────────────────────────────────

  async register(host: string, capabilities_json: string): Promise<string> {
    validateHost(host);
    validateCapabilitiesJson(capabilities_json);

    const worker_id = `wrk-${randomUUID()}`;
    const nowMs = unixNowMillis();

    this.stmts.insertWorker.run(
      worker_id,
      host,
      capabilities_json,
      nowMs,
      // registered_at is unix epoch SECONDS (schema comment above); only
      // last_heartbeat_at uses ms precision (for sub-second dispatch ties).
      Math.floor(nowMs / 1000),
    );

    return worker_id;
  }

  async dispatch(task_id: string): Promise<DispatchResult> {
    if (!task_id || typeof task_id !== "string") {
      throw new Error("worker_pool.dispatch: task_id must be non-empty string");
    }

    const row = this.stmts.selectActive.get() as
      | {
          worker_id: string;
          host: string;
          capabilities_json: string;
          status: string;
          last_heartbeat_at: number;
          registered_at: number;
          drained_at: number | null;
        }
      | undefined;

    if (!row) {
      // No active worker — caller (commander.dispatchStep) decides retry
      // policy; we surface the condition with a structured error instead
      // of fabricating a synthetic worker_id (per F5 + §4.10.6 v1.2.0b
      // hygiene: NO synthetic stub-worker-... IDs in production paths).
      throw new NoActiveWorkerError(task_id);
    }

    return {
      worker_id: row.worker_id,
      strategy: "round_robin",
      task_id,
      dispatched_at: new Date().toISOString(),
    };
  }

  async heartbeat(worker_id: string): Promise<string> {
    validateWorkerId(worker_id);
    const nowMs = unixNowMillis();
    const info = this.stmts.updateHeartbeat.run(nowMs, worker_id);
    if (info.changes === 0) {
      const existing = this.getWorker(worker_id);
      if (!existing) {
        throw new WorkerNotFoundError(worker_id);
      }
      throw new WorkerNotActiveError(worker_id, existing.status);
    }
    return new Date(nowMs).toISOString();
  }

  async drain(worker_id: string): Promise<string> {
    validateWorkerId(worker_id);
    const nowMs = unixNowMillis();
    // drained_at is unix epoch SECONDS (schema comment above).
    const info = this.stmts.updateDrain.run(Math.floor(nowMs / 1000), worker_id);
    if (info.changes === 0) {
      const existing = this.getWorker(worker_id);
      if (!existing) {
        throw new WorkerNotFoundError(worker_id);
      }
      throw new WorkerNotActiveError(worker_id, existing.status);
    }
    return "draining";
  }

  async reap_stale(
    now_iso: string,
    threshold_seconds: number = DEFAULT_REAP_THRESHOLD_SECONDS,
  ): Promise<number> {
    if (!now_iso || typeof now_iso !== "string") {
      throw new Error("worker_pool.reap_stale: now_iso must be ISO timestamp");
    }
    if (!Number.isFinite(threshold_seconds) || threshold_seconds <= 0) {
      throw new Error(
        `worker_pool.reap_stale: threshold_seconds must be positive (got ${threshold_seconds})`,
      );
    }

    const nowMs = new Date(now_iso).getTime();
    if (!Number.isFinite(nowMs)) {
      throw new Error(`worker_pool.reap_stale: now_iso is not parseable (got ${now_iso})`);
    }
    // last_heartbeat_at is stored in ms, threshold_seconds is in seconds —
    // scale before subtracting so a fresh worker stays inside the window.
    const cutoffMs = nowMs - threshold_seconds * 1000;

    const staleRows = this.stmts.selectStale.all(cutoffMs) as { worker_id: string }[];
    if (staleRows.length === 0) return 0;

    const tx = this.db.transaction((workerIds: string[]) => {
      for (const wid of workerIds) {
        this.stmts.updateStatus.run("reaped", wid);
      }
    });
    tx(staleRows.map((r) => r.worker_id));

    return staleRows.length;
  }

  async claim_via_pool(
    task_id: string,
  ): Promise<[attempt_id: string, worker_id: string]> {
    if (!task_id || typeof task_id !== "string") {
      throw new Error("worker_pool.claim_via_pool: task_id must be non-empty string");
    }
    const result = await this.dispatch(task_id);
    // attempt_id is owned by kernel-side SQLite (per ADR 0007); wrapper
    // synthesizes a placeholder UUID for the same-shape tuple so callers
    // can unpack without an additional round-trip. Kernel cross-checks
    // against its task_attempts table on next fence handshake.
    return [`atp-${randomUUID()}`, result.worker_id];
  }
}

// ─── Error types ─────────────────────────────────────────────────────────────

export class WorkerNotFoundError extends Error {
  constructor(public readonly worker_id: string) {
    super(`worker_pool: worker_id '${worker_id}' not found`);
    this.name = "WorkerNotFoundError";
  }
}

export class WorkerNotActiveError extends Error {
  constructor(
    public readonly worker_id: string,
    public readonly current_status: string,
  ) {
    super(
      `worker_pool: worker_id '${worker_id}' is not active (status='${current_status}')`,
    );
    this.name = "WorkerNotActiveError";
  }
}

export class NoActiveWorkerError extends Error {
  constructor(public readonly task_id: string) {
    super(`worker_pool: no active worker available for task_id '${task_id}'`);
    this.name = "NoActiveWorkerError";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveDbPath(): string {
  // Env override takes precedence (per §2.7 v1.2.0b — env override + default).
  const envPath = process.env.WORKER_POOL_DB;
  if (envPath && envPath.length > 0) {
    return isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath);
  }
  return WORKER_POOL_DB;
}

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  try {
    statSync(dir);
  } catch {
    mkdirSync(dir, { recursive: true });
  }
}

function unixNowMillis(): number {
  // Sub-second precision so that 3+ workers registered within the same
  // second don't tie on `ORDER BY last_heartbeat_at ASC` (would always pick
  // the first-registered worker). Secondary sort by worker_id ASC breaks
  // any remaining ms-level ties.
  return Date.now();
}

function validateHost(host: string): void {
  if (!host || typeof host !== "string") {
    throw new Error("worker_pool.register: host must be non-empty string");
  }
  if (host.length > 253) {
    throw new Error(`worker_pool.register: host too long (${host.length} > 253)`);
  }
}

function validateCapabilitiesJson(s: string): void {
  if (!s || typeof s !== "string") {
    throw new Error(
      "worker_pool.register: capabilities_json must be non-empty string",
    );
  }
  // 10KB ceiling — generous for worker capability manifests (spec/capabilities/*.json
  // are typically <2KB) but prevents DoS via huge payloads.
  if (s.length > 10240) {
    throw new Error(
      `worker_pool.register: capabilities_json too large (${s.length} > 10240 bytes)`,
    );
  }
}

function validateWorkerId(worker_id: string): void {
  if (!worker_id || typeof worker_id !== "string") {
    throw new Error("worker_pool: worker_id must be non-empty string");
  }
  if (!worker_id.startsWith("wrk-")) {
    throw new Error(
      `worker_pool: worker_id must start with 'wrk-' (got '${worker_id}')`,
    );
  }
}

function rowToWorkerInfo(row: {
  worker_id: string;
  host: string;
  capabilities_json: string;
  status: string;
  last_heartbeat_at: number;
  registered_at: number;
  drained_at: number | null;
}): WorkerInfo {
  // Column units differ by design (schema comment above): last_heartbeat_at
  // is unix epoch MILLISECONDS; registered_at/drained_at are unix epoch
  // SECONDS. Scale accordingly — a uniform *1000 here produced years ~58k.
  return {
    worker_id: row.worker_id,
    host: row.host,
    capabilities_json: row.capabilities_json,
    status: ALLOWED_STATUSES.has(row.status as WorkerStatus)
      ? row.status
      : "active",
    last_heartbeat_at: new Date(row.last_heartbeat_at).toISOString(),
    current_attempt_id: null,
    registered_at: new Date(row.registered_at * 1000).toISOString(),
    drained_at:
      row.drained_at === null ? null : new Date(row.drained_at * 1000).toISOString(),
  };
}

// ─── Module-level singleton (lazy) ───────────────────────────────────────────

let _singleton: SqliteWorkerPool | null = null;

/**
 * Process-wide lazy singleton. Production code (worker.ts, server.ts) calls
 * this so they share one DB connection; tests construct their own
 * SqliteWorkerPool instance with a temp path.
 */
export function getDefaultWorkerPool(): SqliteWorkerPool {
  if (_singleton === null) {
    _singleton = new SqliteWorkerPool();
  }
  return _singleton;
}

/** Test helper: reset the singleton (used by unit tests to swap DB paths). */
export function _resetWorkerPoolForTests(): void {
  if (_singleton !== null) {
    _singleton.close();
    _singleton = null;
  }
}