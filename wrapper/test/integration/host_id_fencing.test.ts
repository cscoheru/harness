/**
 * wrapper/test/integration/host_id_fencing.test.ts — v1.2.0c NEW
 *
 * Verifies host-id fencing per ADR 0009 line 68 — partial unique index
 * `idx_dispatches_task_host ON dispatches(task_id, host_id) WHERE status='active'`
 * prevents two hosts from concurrently dispatching the same task_id.
 *
 * Gated by RUN_HOST_FENCING_E2E=1; default vitest run skips with describe.skip.
 * Reason: requires kernel-side schema applied (spec/kernel-schema.sql §3.9).
 *
 * What this verifies (per §4.14 audit-scope):
 *   - recordDispatch(task, hostA) → OK
 *   - recordDispatch(task, hostB) → HostIdFencingError
 *   - recordDispatch(task, hostA, status='completed') → OK (release fence)
 *   - recordDispatch(task, hostB) after release → OK
 *   - completeDispatch(task, hostA, 'failed') → fence released
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import {
  HostFence,
  HostIdFencingError,
  setDefaultFenceForTests,
  _resetForTests,
} from "../../orchestrator/host_fencing.js";

const E2E = process.env["RUN_HOST_FENCING_E2E"] === "1";
const d = E2E ? describe : describe.skip;

d("host_id_fencing (RUN_HOST_FENCING_E2E=1)", () => {
  let fence: HostFence;

  beforeEach(() => {
    const db = new BetterSqlite3(":memory:");
    fence = new HostFence(db);
    setDefaultFenceForTests(fence);
  });

  afterEach(() => {
    fence.close();
    _resetForTests();
  });

  it("recordDispatch succeeds on first host", () => {
    fence.recordDispatch("task-1", "newvps.fish-harness.ts.net", "active");
    const rec = fence.checkFencing("task-1");
    expect(rec?.host_id).toBe("newvps.fish-harness.ts.net");
    expect(rec?.status).toBe("active");
  });

  it("recordDispatch on different host throws HostIdFencingError", () => {
    fence.recordDispatch("task-2", "newvps.fish-harness.ts.net", "active");
    expect(() =>
      fence.recordDispatch("task-2", "edge1.fish-harness.ts.net", "active"),
    ).toThrow(HostIdFencingError);
  });

  it("HostIdFencingError carries task_id, host_id, existing_host_id", () => {
    fence.recordDispatch("task-3", "newvps.fish-harness.ts.net", "active");
    try {
      fence.recordDispatch("task-3", "macbook.fish-harness.ts.net", "active");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HostIdFencingError);
      const e = err as HostIdFencingError;
      expect(e.task_id).toBe("task-3");
      expect(e.host_id).toBe("macbook.fish-harness.ts.net");
      expect(e.existing_host_id).toBe("newvps.fish-harness.ts.net");
    }
  });

  it("recordDispatch on same host after completion succeeds (re-dispatch)", () => {
    fence.recordDispatch("task-4", "edge1.fish-harness.ts.net", "active");
    fence.completeDispatch("task-4", "edge1.fish-harness.ts.net", "completed");
    // Now another host can take it
    expect(() =>
      fence.recordDispatch("task-4", "macbook.fish-harness.ts.net", "active"),
    ).not.toThrow();
  });

  it("completeDispatch sets status and completed_at", () => {
    fence.recordDispatch("task-5", "edge2.fish-harness.ts.net", "active");
    fence.completeDispatch("task-5", "edge2.fish-harness.ts.net", "failed");
    const rec = fence.checkFencing("task-5");
    expect(rec?.status).toBe("failed");
    expect(rec?.completed_at).not.toBeNull();
  });

  it("checkFencing returns null for unknown task_id", () => {
    const rec = fence.checkFencing("unknown-task");
    expect(rec).toBeNull();
  });

  it("completeDispatch on unknown task is a no-op (no error)", () => {
    expect(() =>
      fence.completeDispatch("unknown", "anywhere", "completed"),
    ).not.toThrow();
  });
});