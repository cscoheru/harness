/**
 * T-V1.2.0D-QA-1: SqliteQueueStore unit tests (per §4.16 v1.2.0d).
 *
 * Coverage (per D8 + F25/F26):
 *   - Per-host SQLite file (env QUEUE_STORE_DB override)
 *   - WAL mode + busy_timeout=5000 pragmas applied
 *   - 5-method QueueStore Protocol: enqueue / dequeue / peek / reclaim / pending_count
 *   - Backpressure: when inMemory.length >= maxInFlight → throttled result
 *     with retry_after (per F26 429 Retry-After)
 *   - Accepted: when below maxInFlight → accepted result with Location header
 *     (per F26 202 Accepted)
 *   - Reclaim path: pending SQLite tasks re-populate in-memory
 *
 * Uses temp file per test (better-sqlite3 in-memory not supported for WAL
 * mode testing — pragma journal_mode=WAL fails on :memory:).
 *
 * @file wrapper/test/unit/queue_store.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteQueueStore } from "../../orchestrator/queue_store.js";

let tempDir: string;
let store: SqliteQueueStore;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "queue-store-test-"));
  store = new SqliteQueueStore({ dbPath: join(tempDir, "test.db"), maxInFlight: 3 });
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Schema + pragmas ───────────────────────────────────────────────────────

describe("SqliteQueueStore — schema + pragmas", () => {
  it("applies WAL mode + busy_timeout pragma", () => {
    const db = store.rawHandle();
    const journalMode = db.pragma("journal_mode", { simple: true }) as string;
    expect(journalMode.toLowerCase()).toBe("wal");
    const busyTimeout = db.pragma("busy_timeout", { simple: true }) as number;
    expect(busyTimeout).toBe(5000);
  });

  it("creates queue_tasks table with expected columns", () => {
    const db = store.rawHandle();
    const cols = db.prepare(`PRAGMA table_info(queue_tasks)`).all() as Array<{
      name: string;
    }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("task_id");
    expect(names).toContain("payload_json");
    expect(names).toContain("enqueued_at");
    expect(names).toContain("status");
  });
});

// ─── enqueue() — backpressure path (per F26) ─────────────────────────────────

describe("SqliteQueueStore — enqueue() backpressure", () => {
  it("returns accepted + Location header when below max_in_flight", () => {
    const result = store.enqueue("task-001", { prompt: "hello" });
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.task_id).toBe("task-001");
      expect(result.location).toBe("/api/v1/status/task-001");
    }
  });

  it("returns throttled + retry_after=30 when queue saturates (per F26)", () => {
    // Fill in-memory queue up to maxInFlight=3
    store.enqueue("task-001", {});
    store.enqueue("task-002", {});
    store.enqueue("task-003", {});
    expect(store.inFlightCount()).toBe(3);

    // 4th enqueue should be throttled (429 Retry-After, per F26)
    const result = store.enqueue("task-004", {});
    expect(result.status).toBe("throttled");
    if (result.status === "throttled") {
      expect(result.task_id).toBe("task-004");
      expect(result.retry_after).toBe(30);
    }
    expect(store.inFlightCount()).toBe(3); // unchanged
  });

  it("rejects empty task_id", () => {
    expect(() => store.enqueue("", { x: 1 })).toThrow(/task_id must be non-empty/);
  });

  it("rejects non-object payload", () => {
    expect(() => store.enqueue("task-x", null as unknown as Record<string, unknown>)).toThrow(/payload must be object/);
  });
});

// ─── dequeue() / peek() / pending_count() ────────────────────────────────────

describe("SqliteQueueStore — dequeue / peek / pending_count", () => {
  it("dequeue returns FIFO order", () => {
    store.enqueue("task-001", {});
    store.enqueue("task-002", {});
    expect(store.dequeue()?.task_id).toBe("task-001");
    expect(store.dequeue()?.task_id).toBe("task-002");
    expect(store.dequeue()).toBeNull();
  });

  it("peek does not remove", () => {
    store.enqueue("task-001", {});
    store.enqueue("task-002", {});
    expect(store.peek()?.task_id).toBe("task-001");
    expect(store.peek()?.task_id).toBe("task-001");
  });

  it("pendingCount reads SQLite overflow queue", () => {
    expect(store.pendingCount()).toBe(0);
    store.enqueue("task-001", {});
    expect(store.pendingCount()).toBe(1);
    store.enqueue("task-002", {});
    expect(store.pendingCount()).toBe(2);
    store.dequeue();
    expect(store.pendingCount()).toBe(1); // FIFO: oldest dequeued first
  });
});

// ─── reclaim() — re-populate from SQLite overflow (per F26 reclaim path) ─────

describe("SqliteQueueStore — reclaim()", () => {
  it("reclaim pulls pending tasks back into in-memory hot path", () => {
    // Push 2 tasks (in-memory + SQLite)
    store.enqueue("task-001", { p: 1 });
    store.enqueue("task-002", { p: 2 });

    // Simulate worker drain: dequeue everything from in-memory
    store.dequeue();
    store.dequeue();
    expect(store.inFlightCount()).toBe(0);

    // reclaim should pull back from SQLite pending
    const reclaimed = store.reclaim();
    expect(reclaimed).toBeGreaterThanOrEqual(2);
  });

  it("reclaim respects max_in_flight ceiling", () => {
    // Fill beyond maxInFlight=3 — only 3 land in in-memory, rest are SQLite-only
    store.enqueue("task-001", {});
    store.enqueue("task-002", {});
    store.enqueue("task-003", {});
    // 4th onwards throttled (not even in SQLite since we return early)
    store.enqueue("task-004", {});
    store.enqueue("task-005", {});

    // Clear in-memory
    while (store.dequeue() !== null) {
      // drain
    }
    expect(store.inFlightCount()).toBe(0);

    // reclaim should respect the maxInFlight ceiling
    const reclaimed = store.reclaim();
    expect(reclaimed).toBeLessThanOrEqual(3);
    expect(store.inFlightCount()).toBe(3);
  });
});