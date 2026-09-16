/**
 * workflow_pack_wildcard.test.ts — Unit tests for v1.2.0n M1
 * wildcard ${step.*::field} template var (per audit-scope v1.1 §2 B/E).
 *
 * Coverage (5 tests):
 *   T1 — 3-step DAG all completed → wildcard concatenates 3 stdout with
 *        `\n---\n` delimiter; bash double-quote-unescape of `\n` to real
 *        newline (per Cline implementation note "真实换行而非 literal `\n`")
 *   T2 — 1 step completed + 1 failed → wildcard contains both (failed
 *        included per audit-scope v1.1 §2 I)
 *   T3 — 1 step pending → wildcard skips pending steps (only completed/
 *        failed contribute)
 *   T4 — stdout containing `"; rm -rf /` → shellEscape produces
 *        `\"; rm -rf /`, bash sees literal string (no injection)
 *   T5 — delimiter is real newline (orch.json L30 double-quoted string
 *        interprets `\n` as actual newline when bash expands `${...}`)
 *
 * Pattern: vi.spyOn commander.getStepStatuses to provide synthetic
 * step tracker state. expandStepTemplate is now exported (M1 export for
 * test visibility).
 *
 * @file wrapper/test/unit/workflow_pack_wildcard.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { expandStepTemplate } from "../../orchestrator/workflow_pack.js";
import * as commanderModule from "../../orchestrator/commander.js";
import type { PlanStepStatus, Task } from "../../orchestrator/types.js";

function makeTask(taskId: string): Task {
  const now = new Date().toISOString();
  return {
    task_id: taskId,
    status: "pending",
    workflow_pack: "wildcard-test",
    workflow_version: "1.0",
    input_blob_id: null,
    created_at: now,
    updated_at: now,
    result_blob_id: null,
    metadata: { prompt: "test prompt" } as unknown as Record<string, unknown>,
  };
}

function makeStepStatus(name: string, stdout: string, status: PlanStepStatus["status"] = "completed"): PlanStepStatus {
  return {
    name,
    capability: "subprocess_worker",
    status,
    worker_id: "wrk-mock",
    host: "edge-test",
    started_at: "2026-09-16T00:00:00Z",
    finished_at: "2026-09-16T00:00:01Z",
    stdout,
    error: null,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── T1: 3 completed steps → wildcard concatenates with delimiter ─────
describe("T1: 3 completed steps → wildcard concatenates 3 stdout", () => {
  it("joins with `\\n---\\n` delimiter (real newlines, per Cline note)", () => {
    const taskId = `t1-${Date.now()}`;
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      makeStepStatus("step-A", "stdout-A-content"),
      makeStepStatus("step-B", "stdout-B-content"),
      makeStepStatus("step-C", "stdout-C-content"),
    ]);

    // bash sees: echo "stdout-A-content\n---\nstdout-B-content\n---\nstdout-C-content"
    // The `\n` in JS string is a LITERAL backslash-n; bash will interpret it
    // as real newline when expanding inside double quotes.
    const result = expandStepTemplate(
      `echo "\${step.*::stdout}"`,
      makeTask(taskId),
    );

    // The JS string `\n` is two characters: backslash + n
    // But the WILDCARD_RE replace returns `values.join("\n---\n")` where
    // `\n` in TS source is a real newline (LF character).
    // Per Cline note: the delimiter MUST be real newlines so bash inside
    // a double-quoted string sees them as actual line breaks.
    expect(result).toBe(`echo "stdout-A-content\n---\nstdout-B-content\n---\nstdout-C-content"`);

    // Sanity: literal `\n` (backslash-n, 2 chars) is NOT what we want;
    // confirm we have real newlines (LF, 1 char each)
    expect(result).toContain(String.fromCharCode(10)); // LF character
  });
});

// ─── T2: completed + failed → both included ─────────────────────────────
describe("T2: completed + failed steps → both included in wildcard", () => {
  it("includes failed step stdout (per audit-scope v1.1 §2 I)", () => {
    const taskId = `t2-${Date.now()}`;
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      makeStepStatus("step-A", "stdout-A"),
      makeStepStatus("step-B", "stdout-B-FAILED", "failed"),
    ]);

    const result = expandStepTemplate(`echo "\${step.*::stdout}"`, makeTask(taskId));

    expect(result).toContain("stdout-A");
    expect(result).toContain("stdout-B-FAILED");
    // Delimiter `\n---\n` contains `---` so split("---") yields 2 segments
    // (the parts before/after `---`); with N values joined, expected segments = N.
    expect(result.split("---").length).toBe(2);
  });
});

// ─── T3: pending → skipped ───────────────────────────────────────────────
describe("T3: pending step → wildcard skips (only completed/failed contribute)", () => {
  it("excludes pending/running steps from wildcard concatenation", () => {
    const taskId = `t3-${Date.now()}`;
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      makeStepStatus("step-A", "stdout-A"),
      makeStepStatus("step-B", "stdout-B-PENDING", "pending"),
      makeStepStatus("step-C", "stdout-C"),
    ]);

    const result = expandStepTemplate(`echo "\${step.*::stdout}"`, makeTask(taskId));

    expect(result).toContain("stdout-A");
    expect(result).toContain("stdout-C");
    expect(result).not.toContain("stdout-B-PENDING");
  });
});

// ─── T4: shellEscape against injection ────────────────────────────────
describe("T4: stdout with injection chars → shellEscape prevents command injection", () => {
  it("escapes `;` `\"` `\\$` backtick so bash sees literal string", () => {
    const taskId = `t4-${Date.now()}`;
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      // Step stdout contains classic injection payload
      makeStepStatus("step-A", `"; DROP TABLE workers; echo "`),
    ]);

    const result = expandStepTemplate(`echo "\${step.*::stdout}"`, makeTask(taskId));

    // INVARIANT 1: escape produces \" (TS source `\\"`) so bash inside
    // double quotes treats the next " as literal — SQL payload stays
    // string literal, not command.
    expect(result).toMatch(/echo \\"/);

    // INVARIANT 2: no RAW quote immediately before `;` (which would
    // close bash string + execute SQL). Use negative lookbehind so
    // escaped `\";` doesn't match.
    expect(result).not.toMatch(/(?<!\\)";/);

    // INVARIANT 3: DROP TABLE payload is still embedded (as literal).
    expect(result).toContain("DROP TABLE workers");
  });
});

// ─── T5: delimiter is real newline (not literal `\n`) ──────────────────
describe("T5: delimiter is REAL newline (per Cline implementation note)", () => {
  it("uses LF character (0x0A) for `\\n`, not backslash-n", () => {
    const taskId = `t5-${Date.now()}`;
    vi.spyOn(commanderModule, "getStepStatuses").mockReturnValue([
      makeStepStatus("step-A", "A"),
      makeStepStatus("step-B", "B"),
    ]);

    const result = expandStepTemplate(`echo "\${step.*::stdout}"`, makeTask(taskId));

    // CRITICAL: per Cline report "wildcard delimiter 须真实换行而非 literal `\n`
    // (orch.json L30 双引号串内) — 须写测试钉死"
    //
    // In TS source code, the string "\n---\n" is a real newline sequence
    // (LF chars). When bash expands ${step.*::stdout} inside a double-quoted
    // string, it should see actual LF bytes, NOT the two-char sequence
    // backslash + n.
    const lfCount = (result.match(/\n/g) ?? []).length;
    expect(lfCount).toBeGreaterThanOrEqual(2); // At least 2 newlines (3-segment delimiter)

    // Negative: no literal backslash-n (the bug to avoid)
    expect(result).not.toMatch(/\\n/); // no literal \n (backslash + n)
  });
});
