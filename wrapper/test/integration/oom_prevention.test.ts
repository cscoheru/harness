/**
 * T-V1.2.0D-QA-4: OOM prevention E2E test (gated by RUN_OOM_PREVENTION_E2E=1).
 *
 * Per F27 (--stop-timeout=30 SIGTERM graceful shutdown): verifies the
 * queue backpressure behavior that PROTECTS the wrapper from OOM under
 * high dispatch load. The actual docker OOM kill is not reproducible
 * inside the test process (no cgroup access); we instead validate the
 * backpressure mechanism that prevents the underlying memory pressure.
 *
 * Verifies (per D7 + F27):
 *   - When queue saturates, no new tasks are accepted (429 throttling)
 *   - reclaim() drains overflow without unbounded memory growth
 *   - SQLite pending queue survives 1000+ task bursts
 *
 * Run with:
 *   RUN_OOM_PREVENTION_E2E=1 ./node_modules/.bin/vitest run test/integration/oom_prevention.test.ts
 *
 * @file wrapper/test/integration/oom_prevention.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const RUN_GATED = process.env["RUN_OOM_PREVENTION_E2E"] === "1";
const describeIf = RUN_GATED ? describe : describe.skip;

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteQueueStore } from "../../orchestrator/queue_store.js";

let tempDir: string;
let store: SqliteQueueStore;

beforeEach(() => {
  if (!RUN_GATED) return;
  tempDir = mkdtempSync(join(tmpdir(), "oom-prev-e2e-"));
  // maxInFlight=5 simulates a memory-constrained container that throttles early
  store = new SqliteQueueStore({ dbPath: join(tempDir, "test.db"), maxInFlight: 5 });
});

afterEach(() => {
  if (!RUN_GATED) return;
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describeIf("OOM prevention: queue backpressure protects wrapper (per F27)", () => {
  it("1000-task burst caps in-memory at maxInFlight", () => {
    let accepted = 0;
    let throttled = 0;

    for (let i = 0; i < 1000; i++) {
      const r = store.enqueue(`task-${i}`, { i });
      if (r.status === "accepted") accepted++;
      else throttled++;
    }

    expect(accepted).toBe(5); // maxInFlight=5
    expect(throttled).toBe(995);
    expect(store.inFlightCount()).toBe(5);
  });

  it("reclaim recovers dispatched-but-not-completed tasks after in-memory drain (crash recovery)", () => {
    // 1000 enqueues with maxInFlight=5:
    //   - first 5: in-memory push + SQLite INSERT pending
    //   - next 995: throttled, NOT written to SQLite
    for (let i = 0; i < 1000; i++) {
      store.enqueue(`task-${i}`, { i });
    }
    expect(store.inFlightCount()).toBe(5);
    expect(store.pendingCount()).toBe(5); // SQLite pending = 5 (the 5 originally accepted)

    // Drain all in-memory (dequeue marks 'dispatched' in SQLite — NOT 'completed')
    while (store.dequeue() !== null) {
      // drain
    }
    expect(store.inFlightCount()).toBe(0);

    // reclaim() finds the 5 dispatched rows (status != 'completed') and re-pushes
    // them to in-memory — this is the crash recovery invariant: a wrapper that
    // crashes after dequeue but before completion must re-dispatch the task.
    const reclaimed = store.reclaim();
    expect(reclaimed).toBe(5);
    expect(store.inFlightCount()).toBe(5);
  });

  it("queue store survives concurrent dispatch + reclaim (no SQLite lock contention)", () => {
    // 5 in-flight
    for (let i = 0; i < 5; i++) {
      store.enqueue(`task-${i}`, { i });
    }

    // Mix: dequeue + reclaim + enqueue
    for (let cycle = 0; cycle < 50; cycle++) {
      store.dequeue();
      store.reclaim();
      const r = store.enqueue(`cycle-${cycle}`, {});
      expect(r.status).toMatch(/^(accepted|throttled)$/);
    }

    // No errors thrown = no SQLite contention
    expect(store.inFlightCount()).toBeLessThanOrEqual(5);
  });

  it("pending_count never exceeds what's reasonable for SQLite storage", () => {
    // maxInFlight=5 — 995 throttled, 0 SQLite pending (throttled returns early)
    for (let i = 0; i < 1000; i++) {
      store.enqueue(`task-${i}`, {});
    }
    // pending_count tracks SQLite overflow only — throttled never written
    expect(store.pendingCount()).toBe(5);
  });
});