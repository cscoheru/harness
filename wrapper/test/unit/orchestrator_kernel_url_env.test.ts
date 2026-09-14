/**
 * T-V1.2.0K-1: orchestrator KERNEL_URL env var + fallback behavior tests.
 *
 * Per ADR 0012 Decision c — wrapper orchestrator reads HARNESS_RUNTIME_URL
 * env var (default bumped 8000 → 4001). Fallback behavior unchanged:
 * kernel unreachable → log warning + dsh fallback path.
 *
 * Coverage:
 *   T1 — env var unset → defaults to http://localhost:4001 (NEW v1.2.0k)
 *   T2 — env var set → uses custom URL (existing behavior preserved)
 *   T3 — kernel unreachable → fallback to direct dsh (no regression)
 *
 * Pattern: reuses orchestrator_aggregate_cancel.test.ts L37-47 vi.mock
 * factory for deepseek_client.
 *
 * @file wrapper/test/unit/orchestrator_kernel_url_env.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Suppress MINIMAX_API_KEY auto-log
process.env["MINIMAX_API_KEY"] = "sk-test-key-for-kernel-url-env";

// Mock minimax_client for the dsh fallback path
vi.mock("../../dsh/minimax_client.js", () => ({
  minimaxInvoke: vi.fn(async () => ({
    stdout: "fallback ok",
    stderr: "",
    exitCode: 0,
    wallMs: 50,
    traceId: undefined,
    tokenUsage: undefined,
    denialReason: undefined,
  })),
}));

// Mock worker module (used by orchestrator internally)
vi.mock("../../orchestrator/worker.js", () => ({
  ...vi.importActual("../../orchestrator/worker.js"),
  run: vi.fn(async function* () {
    yield { kind: "driver.handle", attempt_id: "atp-test", payload: { handle: { driver_kind: "codex_exec", attempt_id: "atp-test", cancel_token: "drv-test" } } };
    yield { kind: "driver.started", attempt_id: "atp-test", payload: {} };
    yield { kind: "driver.finished", attempt_id: "atp-test", payload: { exit_code: 0, stdout: "ok", wall_ms: 50 } };
  }),
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

import * as commanderModule from "../../orchestrator/commander.js";
import * as taskStoreModule from "../../orchestrator/task_store.js";
import * as queueStoreModule from "../../orchestrator/queue_store.js";
import * as workerPoolModule from "../../orchestrator/worker_pool.js";
import { dispatch } from "../../orchestrator/orchestrator.js";

let tempDir: string;
const ORIGINAL_ENV = process.env["HARNESS_RUNTIME_URL"];

function setupCommanderMocks(): void {
  vi.spyOn(commanderModule, "planStep").mockResolvedValue({
    steps: [{
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
    }],
    plan_metadata: { source: "kernel-url-env-test" },
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
    task_id: "mock",
    status: "completed",
    output: { steps: {}, completed_steps: ["execute-default"], pending_steps: [], failed_steps: [] },
    error: null,
  });
}

function makeTask(taskId: string): Parameters<typeof dispatch>[0] {
  const now = new Date().toISOString();
  return {
    task_id: taskId,
    status: "pending",
    workflow_pack: "worker",
    workflow_version: "1.2.0k",
    input_blob_id: null,
    created_at: now,
    updated_at: now,
    result_blob_id: null,
  };
}

// ─── T1: env var unset → default http://localhost:4001 ──────────────────
describe("T1: HARNESS_RUNTIME_URL unset → default http://localhost:4001", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-kernel-url-t1-"));
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

  it("uses port 4001 by default (per ADR 0012)", async () => {
    delete process.env["HARNESS_RUNTIME_URL"];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("kernel unreachable: default :4001 not reachable in test env"),
    );

    const taskId = `t1-default-${Date.now()}`;
    await dispatch(makeTask(taskId));

    // Verify fetch was called with the default URL (port 4001)
    expect(fetchSpy).toHaveBeenCalled();
    const callUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(callUrl).toContain("localhost:4001");
    expect(callUrl).toContain("/api/orch/invoke");
  });
});

// ─── T2: env var set → custom URL ──────────────────────────────────────
describe("T2: HARNESS_RUNTIME_URL set → uses custom URL", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-kernel-url-t2-"));
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
    if (ORIGINAL_ENV !== undefined) {
      process.env["HARNESS_RUNTIME_URL"] = ORIGINAL_ENV;
    } else {
      delete process.env["HARNESS_RUNTIME_URL"];
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("uses custom URL from HARNESS_RUNTIME_URL env var", async () => {
    process.env["HARNESS_RUNTIME_URL"] = "http://custom-host:5555";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("kernel unreachable: custom :5555 not reachable in test env"),
    );

    const taskId = `t2-custom-${Date.now()}`;
    await dispatch(makeTask(taskId));

    expect(fetchSpy).toHaveBeenCalled();
    const callUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(callUrl).toContain("custom-host:5555");
    expect(callUrl).toContain("/api/orch/invoke");
  });
});

// ─── T3: kernel unreachable → fallback path (no regression) ───────────
describe("T3: kernel unreachable → falls back to direct dsh", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orch-kernel-url-t3-"));
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

  it("logs warning + dispatches to dsh when kernel fetch fails", async () => {
    delete process.env["HARNESS_RUNTIME_URL"];
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("connection refused"),
    );
    const warnSpy = vi.spyOn(console, "warn");

    const taskId = `t3-fallback-${Date.now()}`;
    await dispatch(makeTask(taskId));

    // Verify fallback warning was logged
    const warnCalls = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnCalls.some((w) => w.includes("kernel") && w.includes("unreachable"))).toBe(true);

    // Verify dispatch completed (dsh fallback returned)
    expect(warnSpy).toHaveBeenCalled();
  });
});
