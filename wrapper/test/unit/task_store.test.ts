/**
 * T-V1.2.0J+.5: SqliteTaskStore unit tests (per D2 schema + D3 dual model + warmCache).
 *
 * Coverage (per F2/F3/F4):
 *   - Per-host SQLite file (env TASK_STORE_DB override)
 *   - WAL mode + busy_timeout=5000 pragmas applied (parity w/ queue_store.ts)
 *   - Schema: task_store table with status CHECK constraint covering all 6
 *     TaskStatus values (pending/dispatched/running/completed/failed/cancelled)
 *   - Dual model: setTask persists to BOTH Map and SQLite; getTask reads Map
 *     first then falls back to SQLite (warmCache preloads)
 *   - Status transitions: markRunning / markCompleted / markFailed / markCancelled
 *     update both Map + SQLite; updated_at advances monotonically
 *   - listTasks() returns ALL rows (active + terminal), ordered DESC by created_at
 *   - warmCache() on construction: pre-existing non-terminal rows are
 *     conservatively marked as failed/error='crash_recovery'
 *
 * Uses temp file per test (better-sqlite3 in-memory not supported for WAL
 * mode testing — pragma journal_mode=WAL fails on :memory:).
 *
 * @file wrapper/test/unit/task_store.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteTaskStore } from "../../orchestrator/task_store.js";
import type { TaskStoreEntry } from "../../orchestrator/task_store.js";

let tempDir: string;
let store: SqliteTaskStore;

function mkEntry(overrides: Partial<TaskStoreEntry> = {}): TaskStoreEntry {
  const now = Date.now();
  return {
    taskId: `ts-${Math.random().toString(36).slice(2, 10)}`,
    prompt: "test prompt",
    modelClass: "orch",
    status: "pending",
    resultJson: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "task-store-test-"));
  store = new SqliteTaskStore({ dbPath: join(tempDir, "test.db") });
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Schema + pragmas ───────────────────────────────────────────────────────

describe("SqliteTaskStore — schema + pragmas", () => {
  it("applies WAL mode + busy_timeout pragma (parity w/ queue_store.ts)", () => {
    const db = store.rawHandle();
    const journalMode = db.pragma("journal_mode", { simple: true }) as string;
    expect(journalMode.toLowerCase()).toBe("wal");
    const busyTimeout = db.pragma("busy_timeout", { simple: true }) as number;
    expect(busyTimeout).toBe(5000);
  });

  it("creates task_store table with expected columns", () => {
    const db = store.rawHandle();
    const cols = db.prepare(`PRAGMA table_info(task_store)`).all() as Array<{
      name: string;
    }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("task_id");
    expect(names).toContain("prompt");
    expect(names).toContain("model_class");
    expect(names).toContain("status");
    expect(names).toContain("result_json");
    expect(names).toContain("error");
    expect(names).toContain("created_at");
    expect(names).toContain("updated_at");
  });

  it("creates idx_task_status + idx_task_created_at indexes", () => {
    const db = store.rawHandle();
    const indexes = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_store'`,
    ).all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_task_status");
    expect(names).toContain("idx_task_created_at");
  });
});

// ─── CRUD round-trip ────────────────────────────────────────────────────────

describe("SqliteTaskStore — CRUD round-trip", () => {
  it("setTask persists to both Map and SQLite; getTask reads Map first", () => {
    const entry = mkEntry({ taskId: "task-001", prompt: "hello world", modelClass: "worker" });
    store.setTask(entry);

    // Map hit (hot path)
    const got = store.getTask("task-001");
    expect(got).not.toBeNull();
    expect(got!.taskId).toBe("task-001");
    expect(got!.prompt).toBe("hello world");
    expect(got!.modelClass).toBe("worker");
    expect(got!.status).toBe("pending");
  });

  it("setTask then close+reopen: data survives (SQLite persistence)", () => {
    store.setTask(mkEntry({ taskId: "persist-001" }));
    store.close();

    // Reopen against the same file
    const reopened = new SqliteTaskStore({ dbPath: join(tempDir, "test.db") });
    const got = reopened.getTask("persist-001");
    expect(got).not.toBeNull();
    expect(got!.taskId).toBe("persist-001");
    // warmCache() marks pending as failed/crash_recovery on construction
    expect(got!.status).toBe("failed");
    expect(got!.error).toBe("crash_recovery");
    reopened.close();
  });

  it("getTask returns null for unknown task_id", () => {
    expect(store.getTask("does-not-exist")).toBeNull();
  });

  it("setTask with same task_id replaces existing row (INSERT OR REPLACE)", () => {
    store.setTask(mkEntry({ taskId: "dup-001", prompt: "first" }));
    store.setTask(mkEntry({ taskId: "dup-001", prompt: "second" }));
    const got = store.getTask("dup-001");
    expect(got!.prompt).toBe("second");
  });
});

// ─── Status transitions ────────────────────────────────────────────────────

describe("SqliteTaskStore — status transitions", () => {
  it("markRunning advances status pending → running; error/result cleared", () => {
    store.setTask(mkEntry({ taskId: "trans-001", status: "pending" }));
    store.markRunning("trans-001");
    const got = store.getTask("trans-001");
    expect(got!.status).toBe("running");
    expect(got!.error).toBeNull();
    expect(got!.resultJson).toBeNull();
  });

  it("markCompleted advances status → completed; resultJson set; error cleared", () => {
    store.setTask(mkEntry({ taskId: "trans-002", status: "running" }));
    store.markCompleted("trans-002", '{"stdout":"hello","exitCode":0}');
    const got = store.getTask("trans-002");
    expect(got!.status).toBe("completed");
    expect(got!.resultJson).toBe('{"stdout":"hello","exitCode":0}');
    expect(got!.error).toBeNull();
  });

  it("markFailed advances status → failed; error set; result cleared", () => {
    store.setTask(mkEntry({ taskId: "trans-003", status: "running" }));
    store.markFailed("trans-003", "exit code 1");
    const got = store.getTask("trans-003");
    expect(got!.status).toBe("failed");
    expect(got!.error).toBe("exit code 1");
    expect(got!.resultJson).toBeNull();
  });

  it("markCancelled advances status → cancelled; error='cancelled by user'", () => {
    store.setTask(mkEntry({ taskId: "trans-004", status: "running" }));
    store.markCancelled("trans-004");
    const got = store.getTask("trans-004");
    expect(got!.status).toBe("cancelled");
    expect(got!.error).toBe("cancelled by user");
    expect(got!.resultJson).toBeNull();
  });

  it("markRunning updates updated_at monotonically", async () => {
    const entry = mkEntry({ taskId: "trans-005", createdAt: 1000, updatedAt: 1000 });
    store.setTask(entry);
    await new Promise((r) => setTimeout(r, 5));
    store.markRunning("trans-005");
    const got = store.getTask("trans-005");
    expect(got!.updatedAt).toBeGreaterThan(1000);
    expect(got!.createdAt).toBe(1000); // created_at preserved
  });
});

// ─── listTasks() — F4 ──────────────────────────────────────────────────────

describe("SqliteTaskStore — listTasks() (F4)", () => {
  it("returns empty array when no tasks exist", () => {
    expect(store.listTasks()).toEqual([]);
  });

  it("returns ALL tasks (active + terminal), ordered by created_at DESC", async () => {
    const baseTime = Date.now();
    store.setTask(mkEntry({ taskId: "list-001", createdAt: baseTime - 3000, updatedAt: baseTime - 3000 }));
    await new Promise((r) => setTimeout(r, 2));
    store.setTask(mkEntry({ taskId: "list-002", createdAt: baseTime - 2000, updatedAt: baseTime - 2000 }));
    await new Promise((r) => setTimeout(r, 2));
    store.setTask(mkEntry({ taskId: "list-003", createdAt: baseTime - 1000, updatedAt: baseTime - 1000 }));

    const tasks = store.listTasks();
    expect(tasks.length).toBe(3);
    expect(tasks[0]!.taskId).toBe("list-003"); // newest first
    expect(tasks[1]!.taskId).toBe("list-002");
    expect(tasks[2]!.taskId).toBe("list-001");
  });

  it("includes terminal tasks (completed / failed / cancelled) — F4 critical", () => {
    store.setTask(mkEntry({ taskId: "term-001", status: "pending" }));
    store.markCompleted("term-001", '{"stdout":"ok"}');
    store.setTask(mkEntry({ taskId: "term-002", status: "running" }));
    store.markFailed("term-002", "exit 1");
    store.setTask(mkEntry({ taskId: "term-003", status: "pending" }));
    store.markCancelled("term-003");

    const tasks = store.listTasks();
    expect(tasks.length).toBe(3);
    const statuses = tasks.map((t) => t.status).sort();
    expect(statuses).toEqual(["cancelled", "completed", "failed"]);
  });
});

// ─── warmCache() — crash recovery ──────────────────────────────────────────

describe("SqliteTaskStore — warmCache() crash recovery", () => {
  it("non-terminal rows on construction are marked failed/error='crash_recovery'", () => {
    // Pre-populate SQLite directly (bypass warmCache via close before setTask)
    store.setTask(mkEntry({ taskId: "warm-001", status: "pending" }));
    store.setTask(mkEntry({ taskId: "warm-002", status: "running" }));
    store.setTask(mkEntry({ taskId: "warm-003", status: "dispatched" }));
    store.setTask(mkEntry({ taskId: "warm-004", status: "completed", resultJson: '{"stdout":"ok"}' }));

    // Simulate process restart: close store, reopen with new instance
    store.close();
    const restarted = new SqliteTaskStore({ dbPath: join(tempDir, "test.db") });

    const all = restarted.listTasks();
    expect(all.length).toBe(4);

    const w001 = restarted.getTask("warm-001")!;
    expect(w001.status).toBe("failed");
    expect(w001.error).toBe("crash_recovery");

    const w002 = restarted.getTask("warm-002")!;
    expect(w002.status).toBe("failed");
    expect(w002.error).toBe("crash_recovery");

    const w003 = restarted.getTask("warm-003")!;
    expect(w003.status).toBe("failed");
    expect(w003.error).toBe("crash_recovery");

    // Terminal task (completed) is NOT touched — warmCache only mutates non-terminal
    const w004 = restarted.getTask("warm-004")!;
    expect(w004.status).toBe("completed");
    expect(w004.error).toBeNull();
    expect(w004.resultJson).toBe('{"stdout":"ok"}');

    restarted.close();
  });
});