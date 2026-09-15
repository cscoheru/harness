/**
 * T-V1.2.0L-QA-1: WorkerPool capability-matched dispatch tests (v1.2.0l NEW).
 *
 * Validates that v1.2.0l's F24 capability routing works:
 *   - dispatch(task_id, "subprocess") only returns workers whose
 *     capabilities_json declares the "subprocess" capability tag
 *   - round-robin distribution when multiple matching workers exist
 *   - graceful fallback to any-active worker when no capability match
 *
 * Capabilities JSON shape (what workers register):
 *   { "capability": "subprocess", ... } — single tag
 *   { "capability": ["subprocess", "http"] } — array of tags
 *   { "driver_kind": "subprocess", ... } — alternative shape from worker.ts autoRegister()
 *
 * The SQL LIKE pattern matches `%\"<capability>\"%`, so both single-tag and
 * array-of-tags shapes are matched.
 *
 * @file test/unit/worker_pool_capability_match.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteWorkerPool } from "../../orchestrator/worker_pool.js";

let tempDir: string;
let pool: SqliteWorkerPool;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pool-cap-test-"));
  pool = new SqliteWorkerPool(join(tempDir, "test.db"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  pool.close();
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Helper: register a worker with capabilities JSON containing the given tags.
async function registerWorker(host: string, capabilities: Record<string, unknown>): Promise<string> {
  const capsJson = JSON.stringify(capabilities);
  return await pool.register(host, capsJson);
}

describe("WorkerPool — capability-matched dispatch (v1.2.0l F24)", () => {
  it("returns capability_match strategy when a matching worker exists", async () => {
    await registerWorker("edge1.fish-harness.ts.net", {
      capability: "subprocess",
      driver_kind: "subprocess",
    });
    const result = await pool.dispatch("task-1", "subprocess");
    expect(result.strategy).toBe("capability_match");
    expect(result.task_id).toBe("task-1");
  });

  it("falls back to round_robin when no capability match exists", async () => {
    // Register a worker with only "llm" capability; ask for "subprocess"
    await registerWorker("edge1.fish-harness.ts.net", {
      capability: "llm",
      driver_kind: "codex_exec",
    });
    const result = await pool.dispatch("task-1", "subprocess");
    expect(result.strategy).toBe("round_robin");
    // Still returned the only available worker (no throw)
    expect(result.worker_id).toMatch(/^wrk-/);
  });

  it("matches when capability is declared as an array of tags", async () => {
    await registerWorker("edge2.fish-harness.ts.net", {
      capability: ["subprocess", "http"],
      driver_kind: "subprocess",
    });
    const result = await pool.dispatch("task-1", "subprocess");
    expect(result.strategy).toBe("capability_match");
  });

  it("matches capability declared at any nesting depth (string contains check)", async () => {
    await registerWorker("edge3.fish-harness.ts.net", {
      metadata: { capability: "subprocess" },
    });
    const result = await pool.dispatch("task-1", "subprocess");
    expect(result.strategy).toBe("capability_match");
  });

  it("dispatches to no-match worker when only other capability workers exist", async () => {
    await registerWorker("a.host", { capability: "llm" });
    await registerWorker("b.host", { capability: "http" });
    const result = await pool.dispatch("task-1", "subprocess");
    // Neither matches subprocess → falls back to round_robin (any-active)
    expect(result.strategy).toBe("round_robin");
  });

  it("round-robins among multiple matching workers", async () => {
    await registerWorker("e1", { capability: "subprocess" });
    await registerWorker("e2", { capability: "subprocess" });
    await registerWorker("e3", { capability: "subprocess" });
    await registerWorker("other", { capability: "llm" });

    // Yield to the event loop between dispatches so the post-dispatch
    // heartbeat bump (Date.now()) yields a different millisecond per
    // dispatch. Without this, 3+ same-millisecond registrations all tie
    // on registered_at + worker_id and the same worker is picked every
    // time. (Production callers get the same guarantee via real network
    // latency + heartbeat cadence.)
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const result = await pool.dispatch(`task-${i}`, "subprocess");
      expect(result.strategy).toBe("capability_match");
      seen.add(result.worker_id);
      await new Promise<void>((r) => setTimeout(r, 5));
    }
    // 3 different dispatches should pick 3 different workers (round-robin)
    expect(seen.size).toBe(3);
    expect([...seen].every((w) => w.startsWith("wrk-"))).toBe(true);
  });

  it("treats capability='' (empty) as no-capability-match — falls back to round_robin", async () => {
    await registerWorker("e1", { capability: "subprocess" });
    const result = await pool.dispatch("task-1", "");
    // Empty string is falsy → dispatch() treats as "no capability"
    expect(result.strategy).toBe("round_robin");
  });

  it("throws NoActiveWorkerError when no workers exist (regardless of capability)", async () => {
    await expect(pool.dispatch("task-1", "subprocess")).rejects.toThrow(/no active worker/i);
  });

  it("backward compat: dispatch(task_id) without capability still works (round_robin)", async () => {
    await registerWorker("e1", { capability: "subprocess" });
    const result = await pool.dispatch("task-1"); // no capability arg
    expect(result.strategy).toBe("round_robin");
    expect(result.worker_id).toMatch(/^wrk-/);
  });
});
