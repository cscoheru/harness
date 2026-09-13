/**
 * T-V1.2.0J+.11: orchestrator aggregateResults cancel-noise guard unit test.
 *
 * Coverage (per §6 forward scope D11, deferred from v1.2.0j+.10+ closure):
 *   - aggregateResults failed_steps WARN suppressed when task was cancelled
 *     (the failed_steps are cancelled-induced _recordStepFailure artifacts,
 *     NOT real plan execution failures)
 *   - aggregateResults throwing AggregateError is silent during cancel
 *     (planStep may not have been called before cancel fired)
 *   - Regression: WARN still emitted when task was NOT cancelled
 *     (guard must not over-suppress — real plan failures still surface)
 *
 * Race reproduction strategy:
 *   Mock commander.planStep to synchronously call taskStore.markCancelled(taskId)
 *   inside its implementation. This simulates orchestrator.cancel() racing with
 *   dispatch() in the L306-L404 window. After planStep mock returns:
 *     - L306 markRunning already wrote 'running' BEFORE planStep (per
 *       orchestrator.ts:306) — but planStep mock's markCancelled overwrites it
 *       back to 'cancelled'
 *     - L404 safeMarkCompleted is cancelled-aware → preserves 'cancelled'
 *     - L419 finalEntry.status === 'cancelled' → isCancelled=true → noise
 *       suppressed
 *
 * @file wrapper/test/unit/orchestrator_aggregate_cancel.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Suppress DEEPSEEK_API_KEY auto-log at module import time
process.env["DEEPSEEK_API_KEY"] = "sk-test-key-for-aggregate-cancel";

// Mock deepseek_client so deepseekInvoke returns a successful response.
// This is the dsh-fallback path that safeMarkCompleted (L404) honours.
vi.mock("../../dsh/deepseek_client.js", () => ({
  deepseekInvoke: vi.fn(async () => ({
    stdout: "ok",
    stderr: "",
    exitCode: 0,
    wallMs: 50,
    traceId: undefined,
    tokenUsage: undefined,
    denialReason: undefined,
  })),
}));

import { dispatch } from "../../orchestrator/orchestrator.js";
import * as taskStoreModule from "../../orchestrator/task_store.js";
import * as queueStoreModule from "../../orchestrator/queue_store.js";
import * as workerPoolModule from "../../orchestrator/worker_pool.js";
import * as commanderModule from "../../orchestrator/commander.js";
import { AggregateError } from "../../orchestrator/types.js";
import type { Task } from "../../orchestrator/types.js";

let tempDir: string;

function makeTask(taskId: string): Task {
  const now = new Date().toISOString();
  return {
    task_id: taskId,
    status: "pending",
    workflow_pack: "worker",
    workflow_version: "1.0",
    input_blob_id: null,
    created_at: now,
    updated_at: now,
    result_blob_id: null,
  };
}

/**
 * Mock planStep that cancels the task synchronously (simulates cancel() racing
 * with dispatch() in the L306-L404 window). After this returns, status is
 * 'cancelled' — preserved by safeMarkCompleted (L404 cancelled-aware guard).
 *
 * NOTE: planStep receives the full Task object as its first arg, NOT a task_id
 * string. We extract task.task_id before calling markCancelled.
 */
function setupPlanStepCancel(): void {
  vi.spyOn(commanderModule, "planStep").mockImplementation(async (task) => {
    taskStoreModule.getDefaultTaskStore().markCancelled(task.task_id);
    return { steps: [], plan_metadata: { source: "mock-cancel-noise" } };
  });
}

/**
 * Mock planStep that does NOT cancel (used by regression test).
 */
function setupPlanStepNoCancel(): void {
  vi.spyOn(commanderModule, "planStep").mockResolvedValue({
    steps: [],
    plan_metadata: { source: "mock-no-cancel" },
  });
}

describe("orchestrator — aggregateResults cancel-noise guard (D11)", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-aggregate-cancel-test-"));
    process.env["QUEUE_STORE_DB"] = join(tempDir, "queue_store.db");
    process.env["WORKER_POOL_DB"] = join(tempDir, "worker_pool.db");
    process.env["TASK_STORE_DB"] = join(tempDir, "task_store.db");
    queueStoreModule._resetQueueStoreForTests();
    workerPoolModule._resetWorkerPoolForTests();
    taskStoreModule._resetTaskStoreForTests();
    // Do NOT silence console.warn — we want to detect noise.
    // console.log is silenced to keep test output clean.
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Default: aggregateResults returns failed_steps (the noisy scenario).
    // Individual tests override as needed.
    vi.spyOn(commanderModule, "dispatchStep").mockResolvedValue({
      step: "execute-default",
      worker_id: "wrk-mock",
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
    });
    vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
    vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    queueStoreModule._resetQueueStoreForTests();
    workerPoolModule._resetWorkerPoolForTests();
    taskStoreModule._resetTaskStoreForTests();
    delete process.env["TASK_STORE_DB"];
    delete process.env["QUEUE_STORE_DB"];
    delete process.env["WORKER_POOL_DB"];
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 1 — failed_steps WARN suppressed when task was cancelled
  // ─────────────────────────────────────────────────────────────────────
  it("aggregateResults failed_steps is silent when task was cancelled (no WARN)", async () => {
    setupPlanStepCancel();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock-task",
      status: "failed",
      output: {
        steps: {},
        failed_steps: ["mock-step-1", "mock-step-2"],
        pending_steps: [],
        completed_steps: [],
      },
      error: "2/2 step(s) failed: mock-step-1, mock-step-2",
    });

    const taskId = `cancel-noise-${Date.now()}`;
    const task = makeTask(taskId);
    const warnSpy = vi.spyOn(console, "warn");

    await dispatch(task);

    // Verify the noisy WARN was NOT emitted
    const noiseWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("aggregateResults:") &&
        call[0].includes("plan step(s) failed"),
    );
    expect(noiseWarnings).toHaveLength(0);

    // Verify task is in 'cancelled' status (the precondition for suppression)
    const finalEntry = taskStoreModule.getDefaultTaskStore().getTask(taskId);
    expect(finalEntry?.status).toBe("cancelled");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 2 — regression: failed_steps WARN still emitted when NOT cancelled
  // ─────────────────────────────────────────────────────────────────────
  it("aggregateResults failed_steps still WARNs when task was NOT cancelled (regression)", async () => {
    setupPlanStepNoCancel();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock-task",
      status: "failed",
      output: {
        steps: {},
        failed_steps: ["mock-step-1"],
        pending_steps: [],
        completed_steps: [],
      },
      error: "1/1 step(s) failed: mock-step-1",
    });

    const taskId = `no-cancel-noise-${Date.now()}`;
    const task = makeTask(taskId);
    const warnSpy = vi.spyOn(console, "warn");

    await dispatch(task);

    // Verify the noisy WARN WAS emitted (regression — must not over-suppress)
    const noiseWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("aggregateResults:") &&
        call[0].includes("plan step(s) failed"),
    );
    expect(noiseWarnings.length).toBeGreaterThan(0);
    expect(String(noiseWarnings[0]?.[0])).toContain("1 plan step(s) failed");

    // Verify task is in 'completed' status (not cancelled)
    const finalEntry = taskStoreModule.getDefaultTaskStore().getTask(taskId);
    expect(finalEntry?.status).toBe("completed");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 3 — aggregateResults throwing AggregateError is silent during cancel
  // ─────────────────────────────────────────────────────────────────────
  it("aggregateResults throwing AggregateError is silent when task was cancelled (no WARN)", async () => {
    setupPlanStepCancel();
    const taskId = `aggregate-throw-cancel-${Date.now()}`;
    vi.spyOn(commanderModule, "aggregateResults").mockRejectedValue(
      new AggregateError(taskId, [], null, "No steps tracked for task"),
    );

    const task = makeTask(taskId);
    const warnSpy = vi.spyOn(console, "warn");

    // Should not throw — aggregateResults error is caught at orchestrator.ts
    await expect(dispatch(task)).resolves.toBeDefined();

    // Verify the noisy WARN was NOT emitted
    const noiseWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("commander.aggregateResults failed"),
    );
    expect(noiseWarnings).toHaveLength(0);

    // Verify task is in 'cancelled' status
    const finalEntry = taskStoreModule.getDefaultTaskStore().getTask(taskId);
    expect(finalEntry?.status).toBe("cancelled");
  });
});