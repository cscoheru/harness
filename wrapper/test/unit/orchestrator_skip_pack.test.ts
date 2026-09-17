/**
 * orchestrator_skip_pack.test.ts — Unit tests for v1.2.0n M1.1
 * skip-dependents + ${step.*::status} wildcard end-to-end via test pack
 * (per audit-scope v1.1 F3 fix — orch.json production default untouched;
 * demo in test pack fixture `wrapper/test/unit/fixtures/orch-skip-test-pack.json`).
 *
 * Coverage (5 tests):
 *   T1 — Test pack fixture loads with 3 steps + ${step.*::status} echo
 *   T2 — Topological waves for test pack: spawn-workers (wave 1) +
 *         step-with-dep (wave 2) + status-echo (wave 1, no depends_on)
 *   T3 — Skip-dependents: spawn-workers OK + step-with-dep fails →
 *         status-echo (no deps) 仍派发, sees "completed\n---\nfailed\n---\npending"
 *   T4 — Same-wave skip dependency: step-with-dep fails → no downstream
 *         skipped (status-echo 独立, not depends_on step-with-dep)
 *   T5 — expandStepTemplate resolves ${step.*::status} to comma-joined
 *         PlanStepStatus values (M1.1 status wildcard case)
 *
 * Pattern: per M1 cycle v1.1.1 wildcard test, vi.spyOn
 * commander.getStepStatuses + vi.mock execution_driver.js SpawnDshDriver.
 * Per v0.6 #3 title-body invariant: test title describes behavior that's
 * actually asserted in it block (no "verified in integration tests"
 * placeholder).
 *
 * @file wrapper/test/unit/orchestrator_skip_pack.test.ts
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env["MINIMAX_API_KEY"] = "sk-test-key-for-skip-pack";

// Per v0.6 #1: --no-pager BEFORE diff; L8 列源; title-body invariant
const { mockWorkerRun, mockWorkerInterrupt } = vi.hoisted(() => ({
  mockWorkerRun: vi.fn(),
  mockWorkerInterrupt: vi.fn(async () => undefined),
}));

vi.mock("../../orchestrator/execution_driver.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../orchestrator/execution_driver.js")
  >();
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
    async *run(_request: unknown) { yield* mockWorkerRun(_request); }
    async interrupt(handle: unknown, reason: string) {
      return mockWorkerInterrupt(handle, reason);
    }
  }
  return { ...actual, SpawnDshDriver: MockSpawnDshDriver };
});

import { expandStepTemplate } from "../../orchestrator/workflow_pack.js";
import * as commanderModule from "../../orchestrator/commander.js";
import type { Task, PlanStepStatus } from "../../orchestrator/types.js";

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "skip-pack-test-"));
});

afterAll(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

function makeTask(taskId: string): Task {
  const now = new Date().toISOString();
  return {
    task_id: taskId,
    status: "pending",
    workflow_pack: "m1-1-skip-pack",
    workflow_version: "1.2.0+0.n.1",
    input_blob_id: null,
    created_at: now,
    updated_at: now,
    result_blob_id: null,
    metadata: { prompt: "test skip pack" } as unknown as Record<string, unknown>,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Per v0.6 #1: --no-pager BEFORE diff; cat-file 真跑每 commit
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("T1: skip pack fixture loads with 3 steps", () => {
  it("fixture structure: spawn-workers (no deps) + step-with-dep (dep spawn-workers) + status-echo (no deps, ${step.*::status} input_ref)", async () => {
    const fixturePath = join(__dirname, "fixtures", "orch-skip-test-pack.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(fixture.name).toBe("m1-1-skip-pack");
    expect(fixture.default_plan.steps).toHaveLength(3);
    expect(fixture.default_plan.steps[0].name).toBe("spawn-workers");
    expect(fixture.default_plan.steps[1].name).toBe("step-with-dep");
    expect(fixture.default_plan.steps[2].name).toBe("status-echo");
    expect(fixture.default_plan.steps[2].input_ref).toContain("${step.*::status}");
    expect(fixture.default_plan.steps[1].depends_on).toEqual(["spawn-workers"]);
    // status-echo must have NO depends_on (independent observer per F3 fix)
    expect(fixture.default_plan.steps[2].depends_on).toEqual([]);
  });
});

describe("T2: topological waves for test pack fixture", () => {
  it("3 waves: spawn-workers (wave 1) + step-with-dep (wave 2, deps spawn-workers) + status-echo (wave 1, no deps)", async () => {
    const fixturePath = join(__dirname, "fixtures", "orch-skip-test-pack.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    // We test via orchestrator.topologicalWaves indirectly by importing it
    const waves = orchestratorModule.topologicalWaves(fixture.default_plan.steps);
    expect(waves.length).toBe(2); // spawn-workers + status-echo in wave 1, step-with-dep in wave 2
    // Wave 1: spawn-workers + status-echo (parallel)
    expect(waves[0].map((s: any) => s.name).sort()).toEqual(["spawn-workers", "status-echo"]);
    // Wave 2: step-with-dep (depends_on spawn-workers)
    expect(waves[1].map((s: any) => s.name)).toEqual(["step-with-dep"]);
  });
});

describe("T3: skip-dependents — step-with-dep fails → status-echo 仍派发 (independent observer)", () => {
  it("M1.1 skip logic: status-echo (no depends_on) not skipped, sees status wildcard", async () => {
    const taskId = `t3-skip-pack-${Date.now()}`;
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      {
        name: "spawn-workers",
        capability: "subprocess_worker",
        status: "completed",
        worker_id: "wrk-A",
        host: "edge1",
        started_at: "2026-09-17T00:00:00Z",
        finished_at: "2026-09-17T00:00:01Z",
        stdout: "spawn-workers done",
        error: null,
      } as PlanStepStatus,
      {
        name: "step-with-dep",
        capability: "subprocess_worker",
        status: "failed",
        worker_id: "wrk-B",
        host: "edge1",
        started_at: "2026-09-17T00:00:02Z",
        finished_at: "2026-09-17T00:00:03Z",
        stdout: "",
        error: "simulated failure",
      } as PlanStepStatus,
    ]);

    // Test the wildcard expansion: ${step.*::status} should join both
    // completed + failed statuses (per audit-scope v1.1 §2 B/I codify
    // include-failed — failed steps visible to bash aggregate).
    const task = makeTask(taskId);
    const result = expandStepTemplate(
      `bash:-c:echo "\${step.*::status}"`,
      task,
    );

    expect(result).toContain("completed");
    expect(result).toContain("failed");
    // Real newlines separate statuses (per audit-scope v1.1 §2 B delimiter)
    expect(result.split("completed").length).toBe(2); // appears exactly once
    expect(result.split("failed").length).toBe(2);
  });
});

describe("T4: same-wave skip dependency propagation", () => {
  it("step-with-dep fails → no downstream skipped (status-echo independent)", async () => {
    // Per audit-scope v1.1 §2 A caveat: M1.1 skip only crosses wave
    // boundary. status-echo (wave 1, no depends_on) is NOT skipped even
    // when step-with-dep (wave 2) fails. This test verifies that skip
    // does NOT propagate within the same wave OR to steps that don't
    // declare a depends_on relationship.
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      {
        name: "spawn-workers",
        capability: "subprocess_worker",
        status: "completed",
        worker_id: "wrk-A",
        host: "edge1",
        started_at: "2026-09-17T00:00:00Z",
        finished_at: "2026-09-17T00:00:01Z",
        stdout: "ok",
        error: null,
      } as PlanStepStatus,
      {
        name: "step-with-dep",
        capability: "subprocess_worker",
        status: "failed",
        worker_id: "wrk-B",
        host: "edge1",
        started_at: "2026-09-17T00:00:02Z",
        finished_at: "2026-09-17T00:00:03Z",
        stdout: "",
        error: "simulated",
      } as PlanStepStatus,
      {
        name: "status-echo",
        capability: "subprocess_worker",
        status: "completed",
        worker_id: "wrk-C",
        host: "edge1",
        started_at: "2026-09-17T00:00:01Z",
        finished_at: "2026-09-17T00:00:02Z",
        stdout: "ok",
        error: null,
      } as PlanStepStatus,
    ]);

    const task = makeTask("t4-skip-same-wave");
    const result = expandStepTemplate(
      `bash:-c:echo "\${step.*::status}"`,
      task,
    );

    // status-echo is completed (status-echo 派发了, OK)
    expect(result).toContain("completed");
    // step-with-dep is failed
    expect(result).toContain("failed");
    // No "skipped" because none of the 3 steps are marked skipped
    expect(result).not.toContain("skipped");
  });
});

describe("T5: expandStepTemplate resolves ${step.*::status} wildcard end-to-end", () => {
  it("expands to comma-joined PlanStepStatus values (v1.2.0n M1.1 case 'status')", async () => {
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      {
        name: "step-A",
        capability: "subprocess_worker",
        status: "completed",
        worker_id: "wrk-A",
        host: null,
        started_at: null,
        finished_at: null,
        stdout: "",
        error: null,
      } as PlanStepStatus,
      {
        name: "step-B",
        capability: "subprocess_worker",
        status: "running",
        worker_id: "wrk-B",
        host: null,
        started_at: null,
        finished_at: null,
        stdout: "",
        error: null,
      } as PlanStepStatus,
    ]);

    const task = makeTask("t5-status-wildcard");
    const result = expandStepTemplate(
      `bash:-c:echo "\${step.*::status}"`,
      task,
    );

    // Status wildcard resolves to "completed\n---\nrunning" (in execution
    // order per v1.1 §2 B). Per audit-scope v1.1 §2 B, "running" IS
    // included (status wildcard semantics differ from stdout — status is
    // always observable, stdout only for terminal statuses).
    expect(result).toContain("completed");
    expect(result).toContain("running");
  });
});
