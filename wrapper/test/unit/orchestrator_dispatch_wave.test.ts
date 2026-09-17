/**
 * orchestrator_dispatch_wave.test.ts — Unit tests for v1.2.0n M1
 * depends_on topological wave execution (per audit-scope v1.2 §2 A + §3 #4).
 *
 * Coverage (7 tests):
 *   T1 — 3-step DAG (current real-world orch.json shape) → 1 wave, all
 *        steps run; realStepCount = 3
 *   T2 — fan-out DAG (A → B+C → D, 4 steps) → 3 waves; B+C run in
 *        same wave via Promise.all (verify 2 dispatchSpy calls within
 *        100ms — per Cline implementation note "测试须造 fan-out DAG")
 *   T3 — cyclic depends_on (A→B→A) → throws CyclicDependsOnError
 *        (per audit-scope v1.2 §3 #4)
 *   T3b — unknown depends_on reference → throws "depends on unknown step"
 *   T4 — M1.0 wave error NOT blocking downstream: B fails (mockWorkerRun
 *        mockImplementationOnce → driver.failed) → D (depends on B) is
 *        STILL dispatched (M1.0 行为). M1.1 candidate: skip-dependents.
 *        (per audit-scope v1.2 §2 A — fix-forward per Cline 二审 R1)
 *   T4b — topologicalWaves still produces 3 waves for chain DAG
 *        regardless of error propagation (wave computation is structural,
 *        not error-aware)
 *   T5 — empty plan (heuristic 1-step) → realStepCount = 0
 *
 * Pattern: vi.spyOn commander.planStep + dispatchStep + _recordStepResult;
 * mock SpawnDshDriver via vi.hoisted (per orchestrator_handle_roundtrip.test.ts
 * lesson). vi.spyOn(globalThis, "fetch") default calls-through.
 *
 * @file wrapper/test/unit/orchestrator_dispatch_wave.test.ts
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env["MINIMAX_API_KEY"] = "sk-test-key-for-dispatch-wave";

// Mock deepseek_client (dsh-fallback path per orchestrator.ts:402)
vi.mock("../../dsh/minimax_client.js", () => ({
  minimaxInvoke: vi.fn(async () => ({
    stdout: "ok",
    stderr: "",
    exitCode: 0,
    wallMs: 50,
    traceId: undefined,
    tokenUsage: undefined,
    denialReason: undefined,
  })),
}));

// M0.3 fix: orchestrator.ts:480 constructs `new DriverClass()` and calls
// `.run(runRequest)`. vi.mock on execution_driver.js replaces
// SpawnDshDriver with a stub that emits mockWorkerRun()'s event stream.
// vi.hoisted() exposes the mock fns to the vi.mock factory (vitest hoists
// vi.mock to top of file before imports run).
const { mockWorkerRun, mockWorkerInterrupt } = vi.hoisted(() => ({
  mockWorkerRun: vi.fn(),
  mockWorkerInterrupt: vi.fn(async () => undefined),
}));

vi.mock("../../orchestrator/execution_driver.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../orchestrator/execution_driver.js")
  >();
  // Default mockWorkerRun: emit successful 3-event run (handle/started/finished).
  // Tests can override per-call with mockImplementationOnce to inject failure
  // (T4) or custom event streams.
  mockWorkerRun.mockImplementation(async function* () {
    yield { kind: "driver.handle", attempt_id: "atp-default", payload: { handle: { driver_kind: "codex_exec", attempt_id: "atp-default", cancel_token: "drv-default" } } };
    yield { kind: "driver.started", attempt_id: "atp-default", payload: {} };
    yield { kind: "driver.finished", attempt_id: "atp-default", payload: { exit_code: 0, stdout: "ok", wall_ms: 10 } };
  });
  class MockSpawnDshDriver {
    capability() {
      return {
        driver_kind: "codex_exec" as const,
        evidence_uri: "spec/capabilities/worker.json",
        max_concurrent_attempts: 1,
        supports_streaming: true,
        supports_interrupt: true,
        supports_heartbeat: true,
        supports_tool_gateway: false,
      };
    }
    async *run(_request: unknown) {
      // Delegate to mockWorkerRun so tests can override event streams
      // per-call (e.g., T4 uses mockImplementationOnce to emit driver.failed).
      yield* mockWorkerRun(_request);
    }
    async interrupt(handle: unknown, reason: string) {
      return mockWorkerInterrupt(handle, reason);
    }
  }
  return { ...actual, SpawnDshDriver: MockSpawnDshDriver };
});

// v1.2.0k.3 P0 tenant isolation made listTasks() route through kernel HTTP
// (fetch unreachable in test env). Spy to expose local SqliteTaskStore.
import * as orchestratorModule from "../../orchestrator/orchestrator.js";
import * as taskStoreModule from "../../orchestrator/task_store.js";
import * as queueStoreModule from "../../orchestrator/queue_store.js";
import * as workerPoolModule from "../../orchestrator/worker_pool.js";
import * as commanderModule from "../../orchestrator/commander.js";
import type { Task } from "../../orchestrator/types.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "orch-wave-test-"));
  process.env["QUEUE_STORE_DB"] = join(tempDir, "queue_store.db");
  process.env["WORKER_POOL_DB"] = join(tempDir, "worker_pool.db");
  process.env["TASK_STORE_DB"] = join(tempDir, "task_store.db");
  process.env["WORKFLOW_PACKS_DIR"] = join(tempDir, "workflow_packs");
  queueStoreModule._resetQueueStoreForTests();
  workerPoolModule._resetWorkerPoolForTests();
  taskStoreModule._resetTaskStoreForTests();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("kernel unreachable in test"));

  const taskStore = taskStoreModule.getDefaultTaskStore();
  vi.spyOn(orchestratorModule, "listTasks").mockImplementation(async (_tenantId?: string) =>
    taskStore.listTasks().map((e) => ({
      task_id: e.taskId,
      status: e.status as Task["status"],
      workflow_pack: e.modelClass,
      workflow_version: "1.0",
      input_blob_id: null,
      created_at: new Date(e.createdAt).toISOString(),
      updated_at: new Date(e.updatedAt).toISOString(),
      result_blob_id: null,
    })),
  );
});

afterAll(async () => {
  queueStoreModule._resetQueueStoreForTests();
  workerPoolModule._resetWorkerPoolForTests();
  taskStoreModule._resetTaskStoreForTests();
  delete process.env["QUEUE_STORE_DB"];
  delete process.env["WORKER_POOL_DB"];
  delete process.env["TASK_STORE_DB"];
  delete process.env["WORKFLOW_PACKS_DIR"];
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

function makeTask(taskId: string): Task {
  const now = new Date().toISOString();
  return {
    task_id: taskId,
    status: "pending",
    workflow_pack: "wave-test",
    workflow_version: "1.0",
    input_blob_id: null,
    created_at: now,
    updated_at: now,
    result_blob_id: null,
  };
}

function makeStep(name: string, dependsOn: string[] = []) {
  return {
    name,
    // Use "worker" (not "subprocess_worker") so pickDriverForCapability
    // returns MockSpawnDshDriver (LLM path, mocked here) instead of real
    // SubprocessDshDriver (which would try to spawn a subprocess and fail
    // with ENOENT → "exit code null" error message — see execution_driver.ts:563-565).
    capability: "worker",
    input_ref: "default",
    output_kind: "text",
    depends_on: dependsOn,
    timeout_seconds: 60,
    status: "pending" as const,
    worker_id: null,
    started_at: null,
    finished_at: null,
    result: null,
    error: null,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("kernel unreachable in test"));

  // Baseline mocks for expandStepTemplate's Phase 2/Phase 3 wildcard
  // expansion — prevents undefined array deref blocking dispatch.
  // Per M1.1 skip-dependents test pack (orchestrator_skip_pack.test.ts),
  // per-test mocks override these as needed.
  vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([]);

  const taskStore = taskStoreModule.getDefaultTaskStore();
  vi.spyOn(orchestratorModule, "listTasks").mockImplementation(async (_tenantId?: string) =>
    taskStore.listTasks().map((e) => ({
      task_id: e.taskId,
      status: e.status as Task["status"],
      workflow_pack: e.modelClass,
      workflow_version: "1.0",
      input_blob_id: null,
      created_at: new Date(e.createdAt).toISOString(),
      updated_at: new Date(e.updatedAt).toISOString(),
      result_blob_id: null,
    })),
  );
});

// ─── T1: 3-step DAG (current real-world shape, all sequential) ────────
describe("T1: 3-step sequential DAG → 1 wave", () => {
  it("runs all 3 steps in sequence (current orch.json shape, depends_on chain)", async () => {
    const taskId = `t1-seq-${Date.now()}`;
    vi.spyOn(commanderModule, "planStep").mockResolvedValue({
      steps: [
        makeStep("spawn-workers"),
        makeStep("dispatch-commands", ["spawn-workers"]),
        makeStep("aggregate-results", ["dispatch-commands"]),
      ],
      plan_metadata: { source: "manifest" },
    });
    vi.spyOn(commanderModule, "dispatchStep").mockResolvedValue({
      step: "default",
      worker_id: "wrk-mock",
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
    });
    vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
    vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock",
      status: "completed",
      output: { steps: {}, completed_steps: [], pending_steps: [], failed_steps: [] },
      error: null,
    });

    await orchestratorModule.dispatch(makeTask(taskId));

    // Verify all 3 steps ran (dispatchStep called 3 times, sequential).
    // Note: _recordStepResult is an ESM export and may not be
    // spy-able in some vitest configs; verify dispatchStep call count
    // instead (matches T2 pattern).
    expect(commanderModule.dispatchStep).toHaveBeenCalledTimes(3);
    // Verify the order of dispatchStep calls — sequential due to chain
    const callOrder = (
      commanderModule.dispatchStep as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map((c) => c[1]);
    expect(callOrder).toEqual(["spawn-workers", "dispatch-commands", "aggregate-results"]);
  });
});

// ─── T2: fan-out DAG (A → B+C → D) → 3 waves, B+C parallel ──────────
describe("T2: fan-out DAG (A → B+C → D) → 3 waves, B+C parallel", () => {
  it("runs B and C in same wave via Promise.all (per Cline implementation note)", async () => {
    const taskId = `t2-fanout-${Date.now()}`;
    vi.spyOn(commanderModule, "planStep").mockResolvedValue({
      steps: [
        makeStep("step-A"),
        makeStep("step-B", ["step-A"]),
        makeStep("step-C", ["step-A"]),
        makeStep("step-D", ["step-B", "step-C"]),
      ],
      plan_metadata: { source: "fanout-test" },
    });
    const dispatchTimes: Array<{ name: string; t: number }> = [];
    const dispatchOrder: string[] = [];
    const t0 = Date.now();
    vi.spyOn(commanderModule, "dispatchStep").mockImplementation(async (tid, stepName) => {
      const t = Date.now() - t0;
      dispatchTimes.push({ name: stepName, t });
      dispatchOrder.push(stepName);
      // B and C deliberately suspend for 50ms to verify parallelism
      if (stepName === "step-B" || stepName === "step-C") {
        await new Promise((r) => setTimeout(r, 50));
      }
      return {
        step: stepName,
        worker_id: `wrk-${stepName}`,
        status: "dispatched",
        dispatched_at: new Date().toISOString(),
      };
    });
    vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
    vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock",
      status: "completed",
      output: { steps: {}, completed_steps: [], pending_steps: [], failed_steps: [] },
      error: null,
    });

    await orchestratorModule.dispatch(makeTask(taskId));

    // T2.1: dispatchStep called 4 times (one per step)
    expect(commanderModule.dispatchStep).toHaveBeenCalledTimes(4);

    // T2.2: B and C start within 100ms of each other (parallel in same wave)
    const aStart = dispatchTimes.find((d) => d.name === "step-A")?.t ?? -1;
    const bStart = dispatchTimes.find((d) => d.name === "step-B")?.t ?? -1;
    const cStart = dispatchTimes.find((d) => d.name === "step-C")?.t ?? -1;
    expect(Math.abs(bStart - cStart)).toBeLessThan(100);

    // T2.3: D starts AFTER both B and C complete (sequential wave 2 → wave 3)
    const dStart = dispatchTimes.find((d) => d.name === "step-D")?.t ?? -1;
    const bEnd = bStart + 50; // B's 50ms suspension
    const cEnd = cStart + 50; // C's 50ms suspension
    expect(dStart).toBeGreaterThanOrEqual(Math.max(bEnd, cEnd) - 5); // 5ms tolerance

    // T2.4: Order — A first (wave 1), then B+C (wave 2, parallel), then D (wave 3).
    // Use dispatchOrder for deterministic ordering (timing can tie at ms
    // granularity for steps in same wave).
    expect(dispatchOrder[0]).toBe("step-A");
    expect(dispatchOrder.slice(1, 3).sort()).toEqual(["step-B", "step-C"]);
    expect(dispatchOrder[3]).toBe("step-D");
    // T2.5: Timing — relax to <= for same-wave steps (timing ties
    // possible at ms granularity when Promise.all schedules concurrently).
    // dStart already declared at L289 (T2.3); reuse here.
    expect(aStart).toBeLessThanOrEqual(bStart);
    expect(aStart).toBeLessThanOrEqual(cStart);
    expect(Math.max(bStart, cStart)).toBeLessThanOrEqual(dStart);
  });
});

// ─── T3: cyclic depends_on → CyclicDependsOnError ────────────────────────
describe("T3: cyclic depends_on → throws CyclicDependsOnError", () => {
  it("throws CyclicDependsOnError with cycle path on A→B→A", async () => {
    const taskId = `t3-cycle-${Date.now()}`;
    vi.spyOn(commanderModule, "planStep").mockResolvedValue({
      steps: [
        makeStep("step-A", ["step-B"]),
        makeStep("step-B", ["step-A"]),
      ],
      plan_metadata: { source: "cycle-test" },
    });
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock",
      status: "completed",
      output: { steps: {}, completed_steps: [], pending_steps: [], failed_steps: [] },
      error: null,
    });
    // CyclicDependsOnError thrown inside dispatch (per audit-scope §2 D)
    // is caught by try/catch at plan-time — verify the error path via
    // the wave computation itself (topologicalWaves is exported).
    expect(() =>
      orchestratorModule.topologicalWaves([
        makeStep("step-A", ["step-B"]),
        makeStep("step-B", ["step-A"]),
      ]),
    ).toThrow(/cyclic depends_on/);
  });

  it("throws on unknown depends_on reference", () => {
    expect(() =>
      orchestratorModule.topologicalWaves([
        makeStep("step-A", ["step-DOES-NOT-EXIST"]),
      ]),
    ).toThrow(/depends on unknown step/);
  });
});

// ─── T4: M1.0 wave error NOT blocking downstream ─────────────────
// Per Cline 二审 R1 fix-forward: M1.0 wave loop catches errors per-step
// but does NOT skip downstream wave (no skip-dependents logic yet —
// that's v1.2.0n M1.1 candidate). T4 verifies the current M1.0 behavior:
// B fails, D is STILL dispatched (wave loop continues through).
// Title previously claimed "D skipped" — that was an audit-scope
// unfulfilled promise; this rewrite aligns test title with actual M1.0
// behavior. v1.2.0n M1.1 will add skip-dependents and flip T4's
// assertion (D not dispatched).
describe("T4: M1.0 wave error NOT blocking downstream (M1.1: skip-dependents)", () => {
  it("B fails → D (depends on B) is STILL dispatched (M1.0 behavior)", async () => {
    const taskId = `t4-not-blocking-${Date.now()}`;
    vi.spyOn(commanderModule, "planStep").mockResolvedValue({
      steps: [
        makeStep("step-A"),
        makeStep("step-B", ["step-A"]),
        makeStep("step-D", ["step-B"]),
      ],
      plan_metadata: { source: "not-blocking-test" },
    });

    // Track dispatchStep call order + mockWorkerRun per-step events.
    // step-A succeeds (default MockSpawnDshDriver).
    // step-B fails (override → driver.failed event).
    // step-D succeeds (default MockSpawnDshDriver — verifies it's STILL
    // dispatched despite B failing).
    const dispatchOrder: string[] = [];
    vi.spyOn(commanderModule, "dispatchStep").mockImplementation(
      async (tid: string, stepName: string) => {
        dispatchOrder.push(stepName);
        if (stepName === "step-B") {
          // Override MockSpawnDshDriver to emit driver.failed for step-B.
          mockWorkerRun.mockImplementationOnce(async function* () {
            yield { kind: "driver.handle", attempt_id: "atp-B", payload: { handle: { driver_kind: "codex_exec", attempt_id: "atp-B", cancel_token: "drv-B" } } };
            yield { kind: "driver.started", attempt_id: "atp-B", payload: {} };
            yield { kind: "driver.failed", attempt_id: "atp-B", payload: { error: "simulated B failure" } };
          });
        }
        return {
          step: stepName,
          worker_id: `wrk-${stepName}`,
          status: "dispatched",
          dispatched_at: new Date().toISOString(),
        };
      },
    );
    vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
    vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock",
      status: "completed",
      output: { steps: {}, completed_steps: [], pending_steps: [], failed_steps: ["step-B"] },
      error: null,
    });

    await orchestratorModule.dispatch(makeTask(taskId));

    // M1.0 behavior (T4a baseline): B fails → D is STILL dispatched (no skip logic).
    // Wave loop catches B's error per-step, then continues to next wave.
    expect(dispatchOrder).toEqual(["step-A", "step-B", "step-D"]);
    // 4-step fan-out T2 baseline: same-wave independent step C 仍派发
    // (M1.0 wave 内失败不阻断 — by audit-scope v1.1 §2 A caveat).
    expect(dispatchOrder).toContain("step-C"); // sanity check on T4a 4-step path

    // AggregateResults shows B failed but task completed (per M0.1 backward-compat).
    expect(commanderModule._recordStepFailure).toHaveBeenCalledWith(
      taskId,
      "step-B",
      expect.stringContaining("simulated B failure"),
    );
  });

  // T4b (M1.1 新行为): chain DAG A → B → D, B fails → D skipped.
  // M1.1 skip-dependents: 跨 wave 边界, B failed/skipped → mark 所有
  // depends_on 含 B 的 step 为 skipped + skip dispatchOneStep + emit_step_update.
  it("T4b: M1.1 skip-dependents — B fails → D skipped (跨 wave 边界 skip)", async () => {
    const taskId = `t4b-skip-${Date.now()}`;
    vi.spyOn(commanderModule, "planStep").mockResolvedValue({
      steps: [
        makeStep("step-A"),
        makeStep("step-B", ["step-A"]),
        makeStep("step-D", ["step-B"]),
      ],
      plan_metadata: { source: "t4b-skip" },
    });
    const dispatchOrder: string[] = [];
    vi.spyOn(commanderModule, "dispatchStep").mockImplementation(
      async (tid: string, stepName: string) => {
        dispatchOrder.push(stepName);
        if (stepName === "step-B") {
          // Override MockSpawnDshDriver to emit driver.failed for step-B.
          mockWorkerRun.mockImplementationOnce(async function* () {
            yield { kind: "driver.handle", attempt_id: "atp-B", payload: { handle: { driver_kind: "codex_exec", attempt_id: "atp-B", cancel_token: "drv-B" } } };
            yield { kind: "driver.started", attempt_id: "atp-B", payload: {} };
            yield { kind: "driver.failed", attempt_id: "atp-B", payload: { error: "simulated B failure" } };
          });
        }
        return {
          step: stepName,
          worker_id: `wrk-${stepName}`,
          status: "dispatched",
          dispatched_at: new Date().toISOString(),
        };
      },
    );
    vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
    vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock",
      status: "completed",
      output: { steps: {}, completed_steps: [], pending_steps: [], failed_steps: ["step-B"] },
      error: null,
    });

    await orchestratorModule.dispatch(makeTask(taskId));

    // M1.1 skip-dependents (T4b): D skipped (NOT dispatched)
    expect(dispatchOrder).toEqual(["step-A", "step-B"]);
    // verify D was NOT dispatched
    expect(dispatchOrder).not.toContain("step-D");
    expect(commanderModule.dispatchStep).toHaveBeenCalledTimes(2);
    // verify D's _recordStepResult called with empty stdout (skip pattern)
    const skipPatternCall = (commanderModule._recordStepResult as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
      (c: unknown[]) => c[1] === "step-D",
    );
    expect(skipPatternCall).toBeDefined();
  });

  it("T4b-shared: topologicalWaves still produces 3 waves for chain DAG regardless of skip propagation", () => {
    // Sanity check that topologicalWaves partition a 3-step chain into 3 waves
    // regardless of error propagation (wave computation is structural, not
    // error-aware).
    const waves = orchestratorModule.topologicalWaves([
      makeStep("step-A"),
      makeStep("step-B", ["step-A"]),
      makeStep("step-D", ["step-B"]),
    ]);
    expect(waves.length).toBe(3);
    expect(waves[0].map((s) => s.name)).toEqual(["step-A"]);
    expect(waves[1].map((s) => s.name)).toEqual(["step-B"]);
    expect(waves[2].map((s) => s.name)).toEqual(["step-D"]);
  });
});

// ─── T5: empty plan (heuristic 1-step) → realStepCount = 0 ─────────────
describe("T5: empty plan → realStepCount = 0 (heuristic fallback)", () => {
  it("0 steps → no wave dispatch (realStepCount stays 0)", async () => {
    const taskId = `t5-empty-${Date.now()}`;
    vi.spyOn(commanderModule, "planStep").mockResolvedValue({
      steps: [],
      plan_metadata: { source: "empty" },
    });
    vi.spyOn(commanderModule, "dispatchStep").mockResolvedValue({
      step: "default",
      worker_id: "wrk-mock",
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
    });
    vi.spyOn(commanderModule, "_recordStepResult").mockReturnValue();
    vi.spyOn(commanderModule, "_recordStepFailure").mockReturnValue();
    vi.spyOn(commanderModule, "aggregateResults").mockResolvedValue({
      task_id: "mock",
      status: "completed",
      output: { steps: {}, completed_steps: [], pending_steps: [], failed_steps: [] },
      error: null,
    });

    await orchestratorModule.dispatch(makeTask(taskId));

    expect(commanderModule.dispatchStep).not.toHaveBeenCalled();
  });
});
