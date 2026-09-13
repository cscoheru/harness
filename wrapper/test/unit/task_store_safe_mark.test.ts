/**
 * T-V1.2.0J+.10: safeMarkCompleted / safeMarkFailed unit tests (D8 race fix).
 *
 * Coverage (per §6 forward scope D8, deferred from v1.2.0j+.9+ closure):
 *   - safeMarkCompleted honours prior cancelled/failed/completed status
 *     (returns false, no overwrite)
 *   - safeMarkCompleted writes when current status is pending/running
 *     (returns true, status transitions to completed)
 *   - safeMarkFailed honours prior cancelled/completed status
 *   - safeMarkFailed writes when current status is pending/running/failed
 *     (retry path: legitimate failure can overwrite prior failure)
 *   - safe* returns false when task_id does not exist
 *
 * These are unit tests (no env gate, run in default `npm test`). They guard
 * the store-level invariant: terminal writes (markCompleted/markFailed) must
 * NOT race-overwrite a prior cancelled status. The orchestrator-level E2E
 * race test is in wrapper/test/integration/dispatch_race_cancel.test.ts.
 *
 * @file wrapper/test/unit/task_store_safe_mark.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteTaskStore,
  safeMarkCompleted,
  safeMarkFailed,
} from "../../orchestrator/task_store.js";
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
  tempDir = mkdtempSync(join(tmpdir(), "task-store-safe-mark-test-"));
  store = new SqliteTaskStore({ dbPath: join(tempDir, "test.db") });
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("safeMarkCompleted — cancelled-aware terminal write", () => {
  it("honours prior cancelled status (returns false, no overwrite)", () => {
    const entry = mkEntry({ taskId: "cancel-then-complete" });
    store.setTask(entry);
    store.markCancelled("cancel-then-complete");

    const ok = safeMarkCompleted(store, "cancel-then-complete", '{"ok":true}');
    expect(ok).toBe(false);
    expect(store.getTask("cancel-then-complete")?.status).toBe("cancelled");
  });

  it("honours prior failed status (returns false, no overwrite)", () => {
    const entry = mkEntry({ taskId: "fail-then-complete" });
    store.setTask(entry);
    store.markFailed("fail-then-complete", "prior error");

    const ok = safeMarkCompleted(store, "fail-then-complete", '{"ok":true}');
    expect(ok).toBe(false);
    expect(store.getTask("fail-then-complete")?.status).toBe("failed");
  });

  it("writes when current status is pending", () => {
    const entry = mkEntry({ taskId: "pending-to-complete" });
    store.setTask(entry);

    const ok = safeMarkCompleted(store, "pending-to-complete", '{"ok":true}');
    expect(ok).toBe(true);
    expect(store.getTask("pending-to-complete")?.status).toBe("completed");
    expect(store.getTask("pending-to-complete")?.resultJson).toBe('{"ok":true}');
  });

  it("writes when current status is running", () => {
    const entry = mkEntry({ taskId: "running-to-complete" });
    store.setTask(entry);
    store.markRunning("running-to-complete");

    const ok = safeMarkCompleted(store, "running-to-complete", '{"ok":true}');
    expect(ok).toBe(true);
    expect(store.getTask("running-to-complete")?.status).toBe("completed");
  });

  it("returns false when task_id does not exist", () => {
    const ok = safeMarkCompleted(store, "never-existed", '{"ok":true}');
    expect(ok).toBe(false);
  });
});

describe("safeMarkFailed — cancelled-aware terminal write", () => {
  it("honours prior cancelled status (returns false, no overwrite)", () => {
    const entry = mkEntry({ taskId: "cancel-then-fail" });
    store.setTask(entry);
    store.markCancelled("cancel-then-fail");

    const ok = safeMarkFailed(store, "cancel-then-fail", "should not stick");
    expect(ok).toBe(false);
    expect(store.getTask("cancel-then-fail")?.status).toBe("cancelled");
  });

  it("honours prior completed status (returns false, no overwrite)", () => {
    const entry = mkEntry({ taskId: "complete-then-fail" });
    store.setTask(entry);
    store.markCompleted("complete-then-fail", '{"ok":true}');

    const ok = safeMarkFailed(store, "complete-then-fail", "should not stick");
    expect(ok).toBe(false);
    expect(store.getTask("complete-then-fail")?.status).toBe("completed");
  });

  it("overwrites prior failed status (retry path — legitimate)", () => {
    const entry = mkEntry({ taskId: "fail-then-fail-retry" });
    store.setTask(entry);
    store.markFailed("fail-then-fail-retry", "first error");

    const ok = safeMarkFailed(store, "fail-then-fail-retry", "retry error");
    expect(ok).toBe(true);
    expect(store.getTask("fail-then-fail-retry")?.status).toBe("failed");
    expect(store.getTask("fail-then-fail-retry")?.error).toBe("retry error");
  });

  it("writes when current status is pending", () => {
    const entry = mkEntry({ taskId: "pending-to-fail" });
    store.setTask(entry);

    const ok = safeMarkFailed(store, "pending-to-fail", "new error");
    expect(ok).toBe(true);
    expect(store.getTask("pending-to-fail")?.status).toBe("failed");
  });

  it("writes when current status is running", () => {
    const entry = mkEntry({ taskId: "running-to-fail" });
    store.setTask(entry);
    store.markRunning("running-to-fail");

    const ok = safeMarkFailed(store, "running-to-fail", "runtime error");
    expect(ok).toBe(true);
    expect(store.getTask("running-to-fail")?.status).toBe("failed");
  });

  it("returns false when task_id does not exist", () => {
    const ok = safeMarkFailed(store, "never-existed", "new error");
    expect(ok).toBe(false);
  });
});
