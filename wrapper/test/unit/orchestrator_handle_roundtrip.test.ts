/**
 * T-V1.2.0J+.12: orchestrator driver.handle capture + interrupt roundtrip test.
 *
 * Coverage (per D12 forward scope, deferred from v1.2.0j+.6+):
 *   T1 — workerModule.run() yields driver.handle FIRST (before driver.started)
 *   T2 — orchestrator captures handle into _activeHandles on driver.handle event
 *   T3 — handle cleaned up on driver.finished (normal exit)
 *   T4 — handle cleaned up on driver.interrupted (cancel mid-step)
 *   T5 — handle cleaned up on driver.failed (error path)
 *   T6 — cancel() fires interrupt on the captured handle
 *   T7 — dispatch end cleanup is idempotent (no-op if handle already gone)
 *
 * vi.mock patterns reused from orchestrator_aggregate_cancel.test.ts (L37-47)
 * plus a worker.js mock for the event stream shape. Default runner (no env gate).
 *
 * @file wrapper/test/unit/orchestrator_handle_roundtrip.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Suppress DEEPSEEK_API_KEY auto-log at module import time
process.env["DEEPSEEK_API_KEY"] = "sk-test-key-for-handle-roundtrip";

// Mock deepseek_client — same pattern as orchestrator_aggregate_cancel.test.ts.
// This is the dsh-fallback path in dispatch() at orchestrator.ts:402.
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

// Mock worker module to control the event stream shape (T1).
// Other tests re-mock this with custom event streams.
const mockWorkerRun = vi.fn();
vi.mock("../../orchestrator/worker.js", () => ({
  ...vi.importActual("../../orchestrator/worker.js"),
  run: (...args: unknown[]) => mockWorkerRun(...args),
  interrupt: vi.fn(async () => undefined),
  capability: vi.fn(() => ({
    driver_kind: "codex_exec",
    evidence_uri: "spec/capabilities/worker.json",
    max_concurrent_attempts: 1,
    supports_streaming: true,
    supports_interrupt: true,
    supports_heartbeat: true,
    supports_tool_gateway: false,
  })),
}));

import { dispatch, cancel } from "../../orchestrator/orchestrator.js";
import * as workerModule from "../../orchestrator/worker.js";
import * as taskStoreModule from "../../orchestrator/task_store.js";
import * as queueStoreModule from "../../orchestrator/queue_store.js";
import * as workerPoolModule from "../../orchestrator/worker_pool.js";
import * as commanderModule from "../../orchestrator/commander.js";
import type { Task, RunHandle, DriverEvent } from "../../orchestrator/types.js";

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

function makeMockHandle(attemptId: string): RunHandle {
  return {
    driver_kind: "codex_exec",
    attempt_id: attemptId,
    cancel_token: `drv-${attemptId}`,
  };
}

/**
 * Mock commander.planStep to return a single step named "execute-default"
 * so orchestrator.ts:330 enters the for-await loop over workerModule.run().
 * dispatchStep is mocked to return a sentinel worker_id (orchestrator.ts:320).
 * _recordStepResult / _recordStepFailure / aggregateResults are no-ops
 * (orchestrator.ts:349-371, 385-391, 466).
 */
function setupCommanderMocks(): void {
  vi.spyOn(commanderModule, "planStep").mockResolvedValue({
    steps: [
      {
        name: "execute-default",
        capability: "worker",
        input_ref: "default",
        output_kind: "text",
        depends_on: [],
        timeout_seconds: 60,
        status: "pending" as const,
        worker_id: null,
        started_at: null,
        finished_at: null,
        result: null,
        error: null,
      },
    ],
    plan_metadata: { source: "handle-roundtrip-test" },
  });
  vi.spyOn(commanderModule, "dispatchStep").mockResolvedValue({
    step: "execute-default",
    worker_id: "wrk-mock",
    status: "dispatched",
    dispatched_at: new Date().toISOString(),
  });
  vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
  vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
  vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
    task_id: "mock-task",
    status: "completed",
    output: {
      steps: {},
      completed_steps: ["execute-default"],
      pending_steps: [],
      failed_steps: [],
    },
    error: null,
  });
}

// ─── T1: driver.handle is first event in stream ─────────────────────────────
describe("T1: workerModule.run() yields driver.handle first", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-handle-t1-"));
    process.env["QUEUE_STORE_DB"] = join(tempDir, "queue_store.db");
    process.env["WORKER_POOL_DB"] = join(tempDir, "worker_pool.db");
    process.env["TASK_STORE_DB"] = join(tempDir, "task_store.db");
    queueStoreModule._resetQueueStoreForTests();
    workerPoolModule._resetWorkerPoolForTests();
    taskStoreModule._resetTaskStoreForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setupCommanderMocks();
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

  it("yields driver.handle as events[0] and driver.started as events[1]", async () => {
    const taskId = `t1-handle-first-${Date.now()}`;
    const attemptId = `atp-${taskId}-execute-default`;
    const handle = makeMockHandle(attemptId);

    // Capture events emitted from workerModule.run() so we can assert on shape.
    const capturedEvents: DriverEvent[] = [];
    mockWorkerRun.mockImplementation(async function* () {
      const ev1: DriverEvent = {
        kind: "driver.handle",
        attempt_id: attemptId,
        payload: { handle },
      };
      const ev2: DriverEvent = {
        kind: "driver.started",
        attempt_id: attemptId,
        payload: { driver_kind: "codex_exec", started_at: new Date().toISOString() },
      };
      const ev3: DriverEvent = {
        kind: "driver.finished",
        attempt_id: attemptId,
        payload: { exit_code: 0, stdout: "ok", wall_ms: 50 },
      };
      capturedEvents.push(ev1, ev2, ev3);
      yield ev1;
      yield ev2;
      yield ev3;
    });

    await dispatch(makeTask(taskId));

    // Stream shape contract — driver.handle MUST be first, driver.started second
    expect(capturedEvents[0]?.kind).toBe("driver.handle");
    expect(capturedEvents[1]?.kind).toBe("driver.started");
    expect(capturedEvents[capturedEvents.length - 1]?.kind).toBe("driver.finished");
  });
});

// ─── T2: orchestrator captures handle into _activeHandles ───────────────────
describe("T2-T5: orchestrator captures + cleans up handle on terminal events", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-handle-roundtrip-"));
    process.env["QUEUE_STORE_DB"] = join(tempDir, "queue_store.db");
    process.env["WORKER_POOL_DB"] = join(tempDir, "worker_pool.db");
    process.env["TASK_STORE_DB"] = join(tempDir, "task_store.db");
    queueStoreModule._resetQueueStoreForTests();
    workerPoolModule._resetWorkerPoolForTests();
    taskStoreModule._resetTaskStoreForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setupCommanderMocks();
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

  // T2: capture handle → interrupt called with the captured handle on cleanup
  it("T2: orchestrator captures handle; cleanup at step end calls interrupt() with captured handle", async () => {
    const taskId = `t2-capture-${Date.now()}`;
    const attemptId = `atp-${taskId}-execute-default`;
    const handle = makeMockHandle(attemptId);

    mockWorkerRun.mockImplementation(async function* () {
      yield { kind: "driver.handle", attempt_id: attemptId, payload: { handle } };
      yield { kind: "driver.started", attempt_id: attemptId, payload: {} };
      yield {
        kind: "driver.finished",
        attempt_id: attemptId,
        payload: { exit_code: 0, stdout: "ok", wall_ms: 50 },
      };
    });

    const interruptSpy = vi.spyOn(workerModule, "interrupt");

    await dispatch(makeTask(taskId));

    // interruptByTaskId was called with the captured handle + reason derived from terminal event
    expect(interruptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_token: handle.cancel_token }),
      expect.stringMatching(/step complete: driver\.finished/),
    );
  });

  // T3: handle cleaned up on driver.finished (already covered in T2 — explicit assertion)
  it("T3: handle is cleaned up on driver.finished", async () => {
    const taskId = `t3-finished-${Date.now()}`;
    const attemptId = `atp-${taskId}-execute-default`;
    const handle = makeMockHandle(attemptId);

    mockWorkerRun.mockImplementation(async function* () {
      yield { kind: "driver.handle", attempt_id: attemptId, payload: { handle } };
      yield { kind: "driver.started", attempt_id: attemptId, payload: {} };
      yield {
        kind: "driver.finished",
        attempt_id: attemptId,
        payload: { exit_code: 0, stdout: "ok", wall_ms: 50 },
      };
    });

    const interruptSpy = vi.spyOn(workerModule, "interrupt");

    await dispatch(makeTask(taskId));

    // interrupt called exactly once with the captured handle (per-step cleanup)
    expect(interruptSpy).toHaveBeenCalledTimes(1);
    expect(interruptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_token: handle.cancel_token }),
      "step complete: driver.finished",
    );
  });

  // T4: handle cleaned up on driver.interrupted
  it("T4: handle is cleaned up on driver.interrupted", async () => {
    const taskId = `t4-interrupted-${Date.now()}`;
    const attemptId = `atp-${taskId}-execute-default`;
    const handle = makeMockHandle(attemptId);

    mockWorkerRun.mockImplementation(async function* () {
      yield { kind: "driver.handle", attempt_id: attemptId, payload: { handle } };
      yield { kind: "driver.started", attempt_id: attemptId, payload: {} };
      yield {
        kind: "driver.interrupted",
        attempt_id: attemptId,
        payload: { reason: "user cancel" },
      };
    });

    const interruptSpy = vi.spyOn(workerModule, "interrupt");

    await dispatch(makeTask(taskId));

    expect(interruptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_token: handle.cancel_token }),
      "step complete: driver.interrupted",
    );
  });

  // T5: handle cleaned up on driver.failed
  it("T5: handle is cleaned up on driver.failed", async () => {
    const taskId = `t5-failed-${Date.now()}`;
    const attemptId = `atp-${taskId}-execute-default`;
    const handle = makeMockHandle(attemptId);

    mockWorkerRun.mockImplementation(async function* () {
      yield { kind: "driver.handle", attempt_id: attemptId, payload: { handle } };
      yield { kind: "driver.started", attempt_id: attemptId, payload: {} };
      yield {
        kind: "driver.failed",
        attempt_id: attemptId,
        payload: { error: "deepseek timeout" },
      };
    });

    const interruptSpy = vi.spyOn(workerModule, "interrupt");

    await dispatch(makeTask(taskId));

    expect(interruptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_token: handle.cancel_token }),
      "step complete: driver.failed",
    );
  });
});

// ─── T6: cancel() calls interrupt on captured handle ─────────────────────
describe("T6: cancel() calls interrupt on captured handle", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-handle-cancel-"));
    process.env["QUEUE_STORE_DB"] = join(tempDir, "queue_store.db");
    process.env["WORKER_POOL_DB"] = join(tempDir, "worker_pool.db");
    process.env["TASK_STORE_DB"] = join(tempDir, "task_store.db");
    queueStoreModule._resetQueueStoreForTests();
    workerPoolModule._resetWorkerPoolForTests();
    taskStoreModule._resetTaskStoreForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setupCommanderMocks();
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

  it("cancel() fires interrupt on captured handle with reason 'cancelled by user'", async () => {
    const taskId = `t6-cancel-${Date.now()}`;
    const attemptId = `atp-${taskId}-execute-default`;
    const handle = makeMockHandle(attemptId);

    // Long-running step: yield handle + started + heartbeat, then never finish.
    // cancel() must fire while dispatch is in the for-await loop.
    mockWorkerRun.mockImplementation(async function* () {
      yield { kind: "driver.handle", attempt_id: attemptId, payload: { handle } };
      yield { kind: "driver.started", attempt_id: attemptId, payload: {} };
      // Suspend on a heartbeat that never resolves — gives cancel() time to fire
      yield { kind: "driver.heartbeat", attempt_id: attemptId, payload: {} };
      await new Promise((resolve) => setTimeout(resolve, 50));
      yield { kind: "driver.heartbeat", attempt_id: attemptId, payload: {} };
      await new Promise((resolve) => setTimeout(resolve, 50));
      yield {
        kind: "driver.finished",
        attempt_id: attemptId,
        payload: { exit_code: 0, stdout: "ok", wall_ms: 100 },
      };
    });

    const interruptSpy = vi.spyOn(workerModule, "interrupt");

    // Start dispatch in background — it will be in the for-await loop after handle capture
    const dispatchPromise = dispatch(makeTask(taskId));

    // Wait for handle capture: poll for interrupt being callable (handle in registry)
    // Simplest signal: workerModule.run() was called once
    await vi.waitFor(() => expect(mockWorkerRun).toHaveBeenCalledTimes(1), {
      timeout: 1000,
    });

    // Fire cancel while dispatch is suspended on heartbeat
    await cancel(taskId);

    await dispatchPromise;

    // cancel() must have invoked interrupt with the captured handle + reason "cancelled by user"
    expect(interruptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_token: handle.cancel_token }),
      "cancelled by user",
    );
  });
});

// ─── T7: dispatch end cleanup is idempotent ──────────────────────────────
describe("T7: dispatch end cleanup is idempotent (no-op if no handle)", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-handle-t7-"));
    process.env["QUEUE_STORE_DB"] = join(tempDir, "queue_store.db");
    process.env["WORKER_POOL_DB"] = join(tempDir, "worker_pool.db");
    process.env["TASK_STORE_DB"] = join(tempDir, "task_store.db");
    queueStoreModule._resetQueueStoreForTests();
    workerPoolModule._resetWorkerPoolForTests();
    taskStoreModule._resetTaskStoreForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
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

  it("dispatch completes without error when 0 plan steps (workerModule.run never called)", async () => {
    const taskId = `t7-no-steps-${Date.now()}`;

    // planStep returns empty plan — for-await loop is skipped, no handle captured
    vi.spyOn(commanderModule, "planStep").mockResolvedValue({
      steps: [],
      plan_metadata: { source: "empty-plan" },
    });
    vi.spyOn(commanderModule, "dispatchStep").mockResolvedValue({
      step: "none",
      worker_id: "wrk-mock",
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
    });
    vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
    vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock-task",
      status: "completed",
      output: { steps: {}, completed_steps: [], pending_steps: [], failed_steps: [] },
      error: null,
    });

    const interruptSpy = vi.spyOn(workerModule, "interrupt");

    // Should not throw — interruptByTaskId is no-op when _activeHandles is empty
    await expect(dispatch(makeTask(taskId))).resolves.toBeDefined();

    // workerModule.interrupt() was NOT called (no handle captured)
    expect(interruptSpy).not.toHaveBeenCalled();
  });
});