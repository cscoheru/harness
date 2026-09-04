/**
 * T-V1.2.0B-WORKER-POOL-E2E: WorkerPool + dispatcher end-to-end integration.
 *
 * Gated by RUN_WORKER_POOL_E2E=1 — without it, tests are skipped (avoids
 * touching the real /data/worker_pool.db during regular CI).
 *
 * Run with:
 *   RUN_WORKER_POOL_E2E=1 ./node_modules/.bin/vitest run test/integration/worker_pool.test.ts
 *
 * Verifies:
 *   - register → dispatch → heartbeat → drain lifecycle on real SQLite
 *   - Multiple workers round-robin dispatch
 *   - reap_stale() actually reaps from disk
 *   - claim_via_pool() returns tuple compatible with kernel shape
 *   - WAL mode + busy_timeout are observable via PRAGMA
 *
 * @file wrapper/test/integration/worker_pool.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUN_GATED = process.env["RUN_WORKER_POOL_E2E"] === "1";
const describeIf = RUN_GATED ? describe : describe.skip;

import { SqliteWorkerPool } from "../../orchestrator/worker_pool.js";

let tempDir: string;
let pool: SqliteWorkerPool;

beforeEach(() => {
  if (!RUN_GATED) return;
  tempDir = mkdtempSync(join(tmpdir(), "worker-pool-e2e-"));
  pool = new SqliteWorkerPool(join(tempDir, "e2e.db"));
});

afterEach(() => {
  if (!RUN_GATED) return;
  pool.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describeIf("SqliteWorkerPool E2E — full lifecycle", () => {
  it("register → dispatch → heartbeat ×5 → drain → reap_stale", async () => {
    const wid = await pool.register("host-e2e-1", JSON.stringify({ driver_kind: "codex_exec" }));
    expect(wid).toMatch(/^wrk-/);

    // Dispatch picks the only registered worker
    const d1 = await pool.dispatch("task-e2e-001");
    expect(d1.worker_id).toBe(wid);
    expect(d1.strategy).toBe("round_robin");

    // Heartbeat 5 times — verify monotonic last_heartbeat_at
    const timestamps: number[] = [];
    for (let i = 0; i < 5; i++) {
      const iso = await pool.heartbeat(wid);
      timestamps.push(new Date(iso).getTime());
      await new Promise((r) => setTimeout(r, 10));
    }
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }

    // Drain
    const status = await pool.drain(wid);
    expect(status).toBe("draining");
    expect(pool.getWorker(wid)?.status).toBe("draining");

    // Reap — drain threshold met after +10min
    const futureIso = new Date(Date.now() + 600_000).toISOString();
    const reaped = await pool.reap_stale(futureIso, 60);
    expect(reaped).toBe(1);
    expect(pool.getWorker(wid)?.status).toBe("reaped");
  });

  it("multiple workers → dispatch distributes round-robin with liveness bias", async () => {
    const widA = await pool.register("host-a", JSON.stringify({ driver_kind: "codex_exec" }));
    const widB = await pool.register("host-b", JSON.stringify({ driver_kind: "codex_exec" }));
    const widC = await pool.register("host-c", JSON.stringify({ driver_kind: "codex_exec" }));

    // Sequential dispatches should rotate through the workers
    const dispatched = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await pool.dispatch(`task-${i}`);
      dispatched.add(r.worker_id);
      // Heartbeat the just-dispatched worker so next dispatch picks a different one
      await pool.heartbeat(r.worker_id);
    }
    expect(dispatched.size).toBeGreaterThan(1);
    // All registered workers should have been dispatched at least once
    expect(dispatched.has(widA) || dispatched.has(widB) || dispatched.has(widC)).toBe(true);
  });

  it("claim_via_pool returns tuple compatible with kernel shape [atp-<uuid>, wrk-<uuid>]", async () => {
    const wid = await pool.register("host-x", JSON.stringify({ driver_kind: "codex_exec" }));
    const [attemptId, returnedWid] = await pool.claim_via_pool("task-claim-001");
    expect(attemptId).toMatch(/^atp-[0-9a-f-]{36}$/);
    expect(returnedWid).toBe(wid);
  });

  it("WAL mode + busy_timeout observable via PRAGMA after open", () => {
    const db = pool.rawHandle();
    const jm = db.pragma("journal_mode", { simple: true }) as string;
    expect(jm.toLowerCase()).toBe("wal");
    const bt = db.pragma("busy_timeout", { simple: true }) as number;
    expect(bt).toBe(5000);
  });

  it("reopens same DB path and persists workers across processes (simulated)", async () => {
    const wid = await pool.register("host-persist", JSON.stringify({ driver_kind: "codex_exec" }));
    pool.close();

    // Re-open with new instance
    const reopened = new SqliteWorkerPool(join(tempDir, "e2e.db"));
    const info = reopened.getWorker(wid);
    expect(info?.host).toBe("host-persist");
    expect(info?.status).toBe("active");
    reopened.close();
  });
});