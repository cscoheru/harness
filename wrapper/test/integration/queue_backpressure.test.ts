/**
 * T-V1.2.0D-QA-3: Queue backpressure E2E test (gated by RUN_QUEUE_BACKPRESSURE_E2E=1).
 *
 * Per F30 (mock mode per v1.2.0c pattern) — inject mockMaxInFlight=2 to
 * trigger 429 throttling deterministically without depending on real OS
 * memory pressure.
 *
 * Verifies (per D8 + F26):
 *   - First 2 enqueues land in in-memory (accepted + Location header)
 *   - 3rd enqueue returns throttled (429 Retry-After)
 *   - dequeue() drains in-memory
 *   - reclaim() pulls pending back into in-memory (overflow replay)
 *   - SQLite pending_count tracks overflow queue depth
 *
 * Run with:
 *   RUN_QUEUE_BACKPRESSURE_E2E=1 ./node_modules/.bin/vitest run test/integration/queue_backpressure.test.ts
 *
 * @file wrapper/test/integration/queue_backpressure.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const RUN_GATED = process.env["RUN_QUEUE_BACKPRESSURE_E2E"] === "1";
const describeIf = RUN_GATED ? describe : describe.skip;

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteQueueStore } from "../../orchestrator/queue_store.js";

let tempDir: string;
let store: SqliteQueueStore;

beforeEach(() => {
  if (!RUN_GATED) return;
  tempDir = mkdtempSync(join(tmpdir(), "queue-bp-e2e-"));
  // Per F30: mock maxInFlight=2 for deterministic backpressure trigger
  store = new SqliteQueueStore({ dbPath: join(tempDir, "test.db"), maxInFlight: 2 });
});

afterEach(() => {
  if (!RUN_GATED) return;
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describeIf("SqliteQueueStore backpressure E2E (per F30 mock mode)", () => {
  it("first 2 enqueues return accepted with Location header", () => {
    const r1 = store.enqueue("task-001", { prompt: "hello" });
    expect(r1.status).toBe("accepted");
    expect(r1).toMatchObject({
      task_id: "task-001",
      location: "/api/v1/status/task-001",
    });

    const r2 = store.enqueue("task-002", { prompt: "world" });
    expect(r2.status).toBe("accepted");
  });

  it("3rd enqueue returns throttled (429 Retry-After per F26)", () => {
    store.enqueue("task-001", {});
    store.enqueue("task-002", {});
    const r3 = store.enqueue("task-003", {});

    expect(r3.status).toBe("throttled");
    if (r3.status === "throttled") {
      expect(r3.retry_after).toBe(30);
      expect(r3.task_id).toBe("task-003");
    }
  });

  it("drain → reclaim → overflow replay round-trip", () => {
    // Fill to max
    store.enqueue("task-001", { n: 1 });
    store.enqueue("task-002", { n: 2 });

    // New tasks overflow (throttled, not in SQLite either)
    const t1 = store.enqueue("task-003", {});
    expect(t1.status).toBe("throttled");

    // Drain in-memory
    expect(store.dequeue()?.task_id).toBe("task-001");
    expect(store.dequeue()?.task_id).toBe("task-002");
    expect(store.inFlightCount()).toBe(0);

    // reclaim pulls pending SQLite entries (should be 2)
    const reclaimed = store.reclaim();
    expect(reclaimed).toBe(2);
    expect(store.inFlightCount()).toBe(2);
  });

  it("pendingCount tracks overflow queue depth", () => {
    expect(store.pendingCount()).toBe(0);
    store.enqueue("task-001", {});
    store.enqueue("task-002", {});
    expect(store.pendingCount()).toBe(2);

    // dequeue decrements (FIFO)
    store.dequeue();
    expect(store.pendingCount()).toBe(1);
  });

  it("100-task flood: partial 202 + partial 429", () => {
    let acceptedCount = 0;
    let throttledCount = 0;

    for (let i = 0; i < 100; i++) {
      const r = store.enqueue(`task-${i.toString().padStart(3, "0")}`, { i });
      if (r.status === "accepted") acceptedCount++;
      else if (r.status === "throttled") throttledCount++;
    }

    expect(acceptedCount).toBe(2); // maxInFlight=2
    expect(throttledCount).toBe(98);
  });
});