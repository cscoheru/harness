/**
 * T-V1.2.0L.5-QA-1: WorkflowPack upstream stdout injection tests (v1.2.0l.5 NEW).
 *
 * Validates that v1.2.0l.5's ${step::<name>::<field>} template-var mechanism
 * works correctly inside step.input_ref, with POSIX shell-escape safety.
 * (Separator is `::` not `.` because bash interprets `.` inside `${...}`
 * as a parameter-modifier prefix and rejects it with "bad substitution".)
 *
 *   T1: ${step::<name>::stdout} resolves to that step's stdout (no escape needed)
 *   T2: ${step::<name>::stdout} with `"` / `$HOME` / `` ` `` / `\` → escaped safely
 *   T3: ${step::<unknown-step>::stdout} leaves literal in place
 *   T4: ${step::<not-yet-completed>::stdout} leaves literal in place
 *   T5: ${task.prompt} still works (regression — v1.2.0l.1 contract preserved)
 *
 * Mechanism (per v1.2.0l.5 plan §1.1):
 *   - workflow_pack.ts expandStepTemplate() runs at plan() time (NOT at
 *     dispatch time), reading commander._stepTracker via getStepStatuses()
 *   - field mapping: stdout → result.stdout, host → host, wallMs → wallMs,
 *     exit_code → result.exit_code
 *   - if upstream step is not found OR status !== "completed" / "failed" →
 *     literal ${step.<name>.<field>} preserved so bash reports clear error
 *   - shell-escape on substitution: `"` → `\"`, `\` → `\\`, `$` → `\$`,
 *     backtick → `` \` ``
 *
 * Test strategy: write a fake manifest JSON to a temp WORKFLOW_PACKS_DIR,
 * spy on commander.getStepStatuses to return synthetic prior-step stdout,
 * call workflowPack.plan(task), inspect the returned PlanStep.input_ref
 * to verify template expansion.
 *
 * @file test/unit/workflow_pack_upstream_injection.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempPacksDir: string;
let origWorkflowPacksDir: string | undefined;

beforeEach(() => {
  tempPacksDir = mkdtempSync(join(tmpdir(), "wp-upstream-test-"));
  origWorkflowPacksDir = process.env["WORKFLOW_PACKS_DIR"];
  process.env["WORKFLOW_PACKS_DIR"] = tempPacksDir;
});

afterEach(() => {
  if (origWorkflowPacksDir === undefined) {
    delete process.env["WORKFLOW_PACKS_DIR"];
  } else {
    process.env["WORKFLOW_PACKS_DIR"] = origWorkflowPacksDir;
  }
  rmSync(tempPacksDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Helper: write a minimal manifest to the temp packs dir and stub
 * commander.getStepStatuses to return the given prior-step statuses.
 * Returns the workflowPack module so callers can call plan().
 */
async function setupTest(opts: {
  manifest: object;
  priorSteps: Array<{ name: string; status: string; stdout: string; host: string | null; wallMs: number | null; exit_code?: number | null }>;
}): Promise<{ plan: typeof import("../../orchestrator/workflow_pack.js")["plan"]; loadManifest: typeof import("../../orchestrator/workflow_pack.js")["loadManifest"] }> {
  const manifestPath = join(tempPacksDir, "test-pack.json");
  writeFileSync(manifestPath, JSON.stringify(opts.manifest), "utf-8");

  // Reset module cache so workflowPack.ts re-evaluates PACKS_DIR at import time.
  vi.resetModules();
  // Stub commander.getStepStatuses BEFORE importing workflow_pack.
  vi.doMock("../../orchestrator/commander.js", () => ({
    getStepStatuses: () =>
      opts.priorSteps.map((s) => ({
        name: s.name,
        capability: "subprocess_worker",
        status: s.status as "pending" | "dispatched" | "running" | "completed" | "failed" | "cancelled",
        worker_id: "wrk-test",
        host: s.host,
        started_at: "2026-09-15T00:00:00.000Z",
        finished_at: "2026-09-15T00:00:01.000Z",
        stdout: s.stdout,
        error: null,
        wallMs: s.wallMs,
      })),
    // Stub other symbols workflow_pack.ts imports but doesn't actually use
    // at module-load time:
    __initTracker: () => undefined,
  }));

  // Now import workflow_pack (and the mocked commander) fresh.
  const wp = await import("../../orchestrator/workflow_pack.js");
  return { plan: wp.plan, loadManifest: wp.loadManifest };
}

const fakeManifest = {
  name: "test-pack",
  version: "1.2.0l.5-test",
  description: "Fake manifest for upstream-injection tests",
  required_capabilities: ["subprocess_worker"],
  optional_capabilities: [],
  output_kind: "structured",
  default_plan: {
    steps: [
      {
        name: "consume",
        capability: "subprocess_worker",
        // input_ref will be overwritten per-test
        input_ref: "",
        output_kind: "structured",
        depends_on: [],
        timeout_seconds: 30,
      },
    ],
  },
};

const fakeTask = {
  task_id: "t-upstream-test-1234",
  status: "pending" as const,
  workflow_pack: "test-pack",
  workflow_version: "1.2.0l.5-test",
  input_blob_id: null,
  created_at: "2026-09-15T00:00:00.000Z",
  updated_at: "2026-09-15T00:00:00.000Z",
  result_blob_id: null,
  metadata: { prompt: "compute 10+9 and 9-2" },
};

describe("workflow_pack upstream stdout injection (v1.2.0l.5)", () => {
  it("T1: ${step::<name>::stdout} resolves to that step's stdout (no escape needed)", async () => {
    const { plan } = await setupTest({
      manifest: {
        ...fakeManifest,
        default_plan: {
          steps: [
            {
              ...fakeManifest.default_plan.steps[0],
              input_ref: 'bash:-c:echo "got: ${step::producer::stdout}"',
            },
          ],
        },
      },
      priorSteps: [
        {
          name: "producer",
          status: "completed",
          stdout: "[commander-1] computing 10+9 -> 19\n[commander-2] computing 9-2 -> 7\n",
          host: "edge2.fish-harness.ts.net",
          wallMs: 6,
        },
      ],
    });
    const result = await plan(fakeTask);
    expect(result.plan_metadata.source).toBe("manifest");
    const step = result.steps.find((s) => s.name === "consume");
    expect(step).toBeDefined();
    // Expect the literal upstream stdout inlined; newlines + special chars
    // pass through (bash double-quoted strings allow literal newlines).
    expect(step!.input_ref).toContain("got: [commander-1] computing 10+9 -> 19");
    expect(step!.input_ref).toContain("-> 7");
  });

  it("T2: ${step::<name>::stdout} escapes `\"`, `$`, `` ` ``, `\\` for bash double-quote safety", async () => {
    const { plan } = await setupTest({
      manifest: {
        ...fakeManifest,
        default_plan: {
          steps: [
            {
              ...fakeManifest.default_plan.steps[0],
              input_ref: 'bash:-c:echo "raw: ${step::producer::stdout}"',
            },
          ],
        },
      },
      priorSteps: [
        {
          name: "producer",
          status: "completed",
          // Malicious-ish stdout containing every char that breaks
          // bash double-quoted interpolation:
          stdout: '"; $HOME; echo "`whoami`\\n',
          host: "edge3.fish-harness.ts.net",
          wallMs: 12,
        },
      ],
    });
    const result = await plan(fakeTask);
    const step = result.steps.find((s) => s.name === "consume");
    expect(step).toBeDefined();
    // Every dangerous char must be backslash-escaped so the value remains
    // a literal string inside the bash -c double-quoted context.
    expect(step!.input_ref).toContain('\\"');          // " → \"
    expect(step!.input_ref).toContain("\\$");          // $ → \$
    expect(step!.input_ref).toContain("\\`");          // ` → \`
    expect(step!.input_ref).toContain("\\\\");          // \ → \\
    // The dangerous commands must NOT survive verbatim (would break quote).
    expect(step!.input_ref).not.toMatch(/(?<!\\)"; rm -rf/);
  });

  it("T3: ${step::<unknown-step>::stdout} leaves literal in place", async () => {
    const { plan } = await setupTest({
      manifest: {
        ...fakeManifest,
        default_plan: {
          steps: [
            {
              ...fakeManifest.default_plan.steps[0],
              input_ref: 'bash:-c:echo "got: ${step::nonexistent::stdout}"',
            },
          ],
        },
      },
      priorSteps: [
        {
          name: "producer",
          status: "completed",
          stdout: "real value",
          host: "edge2.fish-harness.ts.net",
          wallMs: 6,
        },
      ],
    });
    const result = await plan(fakeTask);
    const step = result.steps.find((s) => s.name === "consume");
    expect(step).toBeDefined();
    // Literal preserved so bash sees ${step::nonexistent::stdout} verbatim.
    expect(step!.input_ref).toContain("${step::nonexistent::stdout}");
    expect(step!.input_ref).not.toContain("real value");
  });

  it("T4: ${step::<name-not-yet-completed>::stdout} leaves literal in place", async () => {
    const { plan } = await setupTest({
      manifest: {
        ...fakeManifest,
        default_plan: {
          steps: [
            {
              ...fakeManifest.default_plan.steps[0],
              input_ref: 'bash:-c:echo "got: ${step::producer::stdout}"',
            },
          ],
        },
      },
      priorSteps: [
        {
          name: "producer",
          status: "running", // not yet completed
          stdout: "",
          host: "edge2.fish-harness.ts.net",
          wallMs: null,
        },
      ],
    });
    const result = await plan(fakeTask);
    const step = result.steps.find((s) => s.name === "consume");
    expect(step).toBeDefined();
    expect(step!.input_ref).toContain("${step::producer::stdout}");
  });

  it("T5: ${task.prompt} still resolves (v1.2.0l.1 regression)", async () => {
    const { plan } = await setupTest({
      manifest: {
        ...fakeManifest,
        default_plan: {
          steps: [
            {
              ...fakeManifest.default_plan.steps[0],
              input_ref: 'bash:-c:echo "user said: ${task.prompt}"',
            },
          ],
        },
      },
      priorSteps: [],
    });
    const result = await plan(fakeTask);
    const step = result.steps.find((s) => s.name === "consume");
    expect(step).toBeDefined();
    expect(step!.input_ref).toContain("user said: compute 10+9 and 9-2");
  });
});