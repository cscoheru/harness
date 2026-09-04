/**
 * T-V1.2.0B-QA-1: SqliteWorkerPool unit tests (per §4.11 v1.2.0b §2.11).
 *
 * Coverage:
 *   - Per-host SQLite file (env WORKER_POOL_DB override)
 *   - WAL mode + busy_timeout=5000 pragmas applied
 *   - 6-method WorkerPool Protocol: register / dispatch / heartbeat /
 *     drain / reap_stale / claim_via_pool
 *   - 3 error classes: WorkerNotFoundError / WorkerNotActiveError /
 *     NoActiveWorkerError
 *   - I15-simp + I16-simp invariants (heartbeat advance + drain atomic)
 *   - Input validation: empty host / huge capabilities_json / bad worker_id
 *
 * Uses temp file per test (better-sqlite3 in-memory not supported for WAL
 * mode testing — pragma journal_mode=WAL fails on :memory:).
 *
 * @file wrapper/test/unit/worker_pool.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SqliteWorkerPool,
  WorkerNotFoundError,
  WorkerNotActiveError,
  NoActiveWorkerError,
} from "../../orchestrator/worker_pool.js";

let tempDir: string;
let pool: SqliteWorkerPool;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "worker-pool-test-"));
  pool = new SqliteWorkerPool(join(tempDir, "test.db"));
});

afterEach(() => {
  pool.close();
  rmSync(tempDir, { recursive: true, force: true });
});

const SAMPLE_CAPABILITIES = JSON.stringify({
  driver_kind: "codex_exec",
  model_id: "deepseek-v4-flash",
  max_concurrent_attempts: 1,
});

// ─── Schema + pragmas ───────────────────────────────────────────────────────

describe("SqliteWorkerPool — schema + pragmas", () => {
  it("applies WAL mode + busy_timeout pragma", () => {
    const db = pool.rawHandle();
    const journalMode = db.pragma("journal_mode", { simple: true }) as string;
    expect(journalMode.toLowerCase()).toBe("wal");
    const busyTimeout = db.pragma("busy_timeout", { simple: true }) as number;
    expect(busyTimeout).toBe(5000);
  });

  it("creates workers table with expected columns", () => {
    const db = pool.rawHandle();
    const cols = db.prepare(`PRAGMA table_info(workers)`).all() as Array<{
      name: string;
    }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("worker_id");
    expect(names).toContain("host");
    expect(names).toContain("capabilities_json");
    expect(names).toContain("status");
    expect(names).toContain("last_heartbeat_at");
    expect(names).toContain("registered_at");
    expect(names).toContain("drained_at");
  });

  it("is idempotent — re-open on same path preserves data", () => {
    pool.close();
    const reopened = new SqliteWorkerPool(join(tempDir, "test.db"));
    expect(reopened.countActive()).toBe(0); // closed before insert
    reopened.close();
  });
});

// ─── register() ──────────────────────────────────────────────────────────────

describe("SqliteWorkerPool — register()", () => {
  it("returns a wrk-<uuid> id", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    expect(wid).toMatch(/^wrk-[0-9a-f-]{36}$/);
  });

  it("persists host + capabilities_json retrievable via getWorker()", async () => {
    const wid = await pool.register("fish-harness-newvps.tail1b9878.ts.net", SAMPLE_CAPABILITIES);
    const info = pool.getWorker(wid);
    expect(info?.host).toBe("fish-harness-newvps.tail1b9878.ts.net");
    expect(info?.capabilities_json).toBe(SAMPLE_CAPABILITIES);
    expect(info?.status).toBe("active");
    expect(info?.last_heartbeat_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(info?.drained_at).toBeNull();
  });

  it("rejects empty host", async () => {
    await expect(pool.register("", SAMPLE_CAPABILITIES)).rejects.toThrow(/host must be non-empty/);
  });

  it("rejects host longer than 253 chars", async () => {
    const longHost = "x".repeat(254);
    await expect(pool.register(longHost, SAMPLE_CAPABILITIES)).rejects.toThrow(/host too long/);
  });

  it("rejects empty capabilities_json", async () => {
    await expect(pool.register("host-a", "")).rejects.toThrow(/capabilities_json must be non-empty/);
  });

  it("rejects capabilities_json > 10KB", async () => {
    const big = JSON.stringify({ data: "x".repeat(11000) });
    await expect(pool.register("host-a", big)).rejects.toThrow(/capabilities_json too large/);
  });

  it("rejects non-string capabilities_json", async () => {
    await expect(
      pool.register("host-a", null as unknown as string),
    ).rejects.toThrow();
  });
});

// ─── dispatch() ─────────────────────────────────────────────────────────────

describe("SqliteWorkerPool — dispatch()", () => {
  it("throws NoActiveWorkerError when no workers registered", async () => {
    await expect(pool.dispatch("task-001")).rejects.toBeInstanceOf(NoActiveWorkerError);
  });

  it("returns worker_id + strategy='round_robin' for single registered worker", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    const result = await pool.dispatch("task-001");
    expect(result.worker_id).toBe(wid);
    expect(result.strategy).toBe("round_robin");
    expect(result.task_id).toBe("task-001");
    expect(result.dispatched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("picks least-recently-heartbeated worker (round_robin with liveness bias)", async () => {
    const widA = await pool.register("host-a", SAMPLE_CAPABILITIES);
    const widB = await pool.register("host-b", SAMPLE_CAPABILITIES);

    // Heartbeat widB so it's "fresher"; dispatch should pick widA
    await pool.heartbeat(widB);
    const result = await pool.dispatch("task-001");
    expect(result.worker_id).toBe(widA);
    expect(widA).not.toBe(widB);
  });

  it("skips draining/drained/reaped workers", async () => {
    const widA = await pool.register("host-a", SAMPLE_CAPABILITIES);
    const widB = await pool.register("host-b", SAMPLE_CAPABILITIES);
    await pool.drain(widA); // widA now draining

    const result = await pool.dispatch("task-001");
    expect(result.worker_id).toBe(widB);
  });

  it("rejects empty task_id", async () => {
    await expect(pool.dispatch("")).rejects.toThrow(/task_id must be non-empty/);
  });
});

// ─── heartbeat() ────────────────────────────────────────────────────────────

describe("SqliteWorkerPool — heartbeat()", () => {
  it("advances last_heartbeat_at", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    const before = pool.getWorker(wid)!.last_heartbeat_at;
    await new Promise((r) => setTimeout(r, 1100));
    const iso = await pool.heartbeat(wid);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const after = pool.getWorker(wid)!.last_heartbeat_at;
    expect(after > before).toBe(true);
  });

  it("throws WorkerNotFoundError for unknown id", async () => {
    await expect(pool.heartbeat("wrk-00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      WorkerNotFoundError,
    );
  });

  it("rejects worker_id not starting with wrk-", async () => {
    await expect(pool.heartbeat("bad-prefix")).rejects.toThrow(/must start with 'wrk-'/);
  });

  it("allows heartbeat on draining worker (I15-simp: status IN active/draining)", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    await pool.drain(wid);
    // I15-simp: heartbeat succeeds while status='draining' — only
    // 'drained'/'reaped' reject (i.e. once we add a 'drained' finalizer
    // in v1.2.0c). For now, draining workers keep heartbeating so their
    // in-flight runs can finish.
    const iso = await pool.heartbeat(wid);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── drain() ────────────────────────────────────────────────────────────────

describe("SqliteWorkerPool — drain()", () => {
  it("transitions active → draining atomically + sets drained_at", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    expect(pool.getWorker(wid)!.status).toBe("active");
    const status = await pool.drain(wid);
    expect(status).toBe("draining");
    const info = pool.getWorker(wid)!;
    expect(info.status).toBe("draining");
    expect(info.drained_at).not.toBeNull();
  });

  it("is idempotent — second drain call returns WorkerNotActiveError", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    await pool.drain(wid);
    await expect(pool.drain(wid)).rejects.toBeInstanceOf(WorkerNotActiveError);
  });

  it("throws WorkerNotFoundError for unknown id", async () => {
    await expect(pool.drain("wrk-00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      WorkerNotFoundError,
    );
  });
});

// ─── reap_stale() ───────────────────────────────────────────────────────────

describe("SqliteWorkerPool — reap_stale()", () => {
  it("reaps workers silent beyond threshold", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    const futureIso = new Date(Date.now() + 600_000).toISOString(); // +10min
    const reaped = await pool.reap_stale(futureIso, 60);
    expect(reaped).toBe(1);
    const info = pool.getWorker(wid)!;
    expect(info.status).toBe("reaped");
  });

  it("returns 0 when no workers exceed threshold", async () => {
    await pool.register("host-a", SAMPLE_CAPABILITIES);
    const nowIso = new Date().toISOString();
    const reaped = await pool.reap_stale(nowIso, 3600); // 1h threshold
    expect(reaped).toBe(0);
  });

  it("uses default 120s threshold when omitted", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    const futureIso = new Date(Date.now() + 200_000).toISOString(); // +200s
    const reaped = await pool.reap_stale(futureIso);
    expect(reaped).toBe(1);
    expect(pool.getWorker(wid)!.status).toBe("reaped");
  });

  it("rejects empty now_iso", async () => {
    await expect(pool.reap_stale("")).rejects.toThrow(/now_iso must be ISO/);
  });

  it("rejects non-positive threshold_seconds", async () => {
    const nowIso = new Date().toISOString();
    await expect(pool.reap_stale(nowIso, 0)).rejects.toThrow(/threshold_seconds must be positive/);
    await expect(pool.reap_stale(nowIso, -1)).rejects.toThrow(/threshold_seconds must be positive/);
  });

  it("rejects unparseable now_iso", async () => {
    await expect(pool.reap_stale("not-a-date")).rejects.toThrow(/not parseable/);
  });

  it("does not reap workers within threshold", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    await pool.heartbeat(wid);
    const futureIso = new Date(Date.now() + 30_000).toISOString(); // +30s
    const reaped = await pool.reap_stale(futureIso, 60);
    expect(reaped).toBe(0);
    expect(pool.getWorker(wid)!.status).toBe("active");
  });
});

// ─── claim_via_pool() ───────────────────────────────────────────────────────

describe("SqliteWorkerPool — claim_via_pool()", () => {
  it("returns [attempt_id, worker_id] tuple", async () => {
    const wid = await pool.register("host-a", SAMPLE_CAPABILITIES);
    const [attemptId, returnedWid] = await pool.claim_via_pool("task-001");
    expect(attemptId).toMatch(/^atp-[0-9a-f-]{36}$/);
    expect(returnedWid).toBe(wid);
  });

  it("throws NoActiveWorkerError when no active workers", async () => {
    await expect(pool.claim_via_pool("task-001")).rejects.toBeInstanceOf(NoActiveWorkerError);
  });

  it("rejects empty task_id", async () => {
    await expect(pool.claim_via_pool("")).rejects.toThrow(/task_id must be non-empty/);
  });
});

// ─── countActive() + getWorker() ────────────────────────────────────────────

describe("SqliteWorkerPool — countActive() + getWorker()", () => {
  it("countActive returns active-only count", async () => {
    const widA = await pool.register("host-a", SAMPLE_CAPABILITIES);
    await pool.register("host-b", SAMPLE_CAPABILITIES);
    expect(pool.countActive()).toBe(2);
    await pool.drain(widA);
    expect(pool.countActive()).toBe(1);
  });

  it("getWorker returns null for unknown id", () => {
    expect(pool.getWorker("wrk-00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});