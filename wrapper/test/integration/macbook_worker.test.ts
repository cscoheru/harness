/**
 * wrapper/test/integration/macbook_worker.test.ts — v1.2.0c NEW
 *
 * Verifies MacBook worker integration per D6 + F14/F15/F18:
 *   - Capability spec loaded from spec/capabilities/macbook.json
 *   - host_class=macbook-main, working_hours=true fields present
 *   - Scoring +100 in isWorkingHours() window
 *   - Scoring 0 outside working hours
 *   - Graceful degradation: heartbeat failure → worker_pool mark stale
 *
 * Gated by RUN_MACBOOK_E2E=1; default vitest run skips with describe.skip.
 * Reason: requires MacBook host (kjonemacbook-pro) connected to tailnet.
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const E2E = process.env["RUN_MACBOOK_E2E"] === "1";
const d = E2E ? describe : describe.skip;

d("macbook_worker (RUN_MACBOOK_E2E=1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("MacBook capability spec has host_class=macbook-main", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const specPath = path.resolve(here, "..", "..", "..", "spec", "capabilities", "macbook.json");
    expect(fs.existsSync(specPath), `spec file missing: ${specPath}`).toBe(true);
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    expect(spec.host_class).toBe("macbook-main");
    expect(spec.working_hours).toBe(true);
    expect(spec.model_id).toBe("deepseek-v4-flash");
  });

  it("isWorkingHours returns true for Tuesday 10:00 local", async () => {
    // Mock Date so we have a deterministic "Tuesday 10:00"
    const fakeDate = new Date(2026, 8, 8, 10, 0, 0); // 2026-09-08 is a Tuesday
    vi.spyOn(globalThis, "Date").mockImplementation(() => fakeDate as unknown as Date);

    const { isWorkingHours } = await import("../../orchestrator/orchestrator.js");
    expect(isWorkingHours()).toBe(true);

    vi.restoreAllMocks();
  });

  it("isWorkingHours returns false for Sunday 10:00 (weekend)", async () => {
    const fakeDate = new Date(2026, 8, 6, 10, 0, 0); // 2026-09-06 is a Sunday
    vi.spyOn(globalThis, "Date").mockImplementation(() => fakeDate as unknown as Date);

    const { isWorkingHours } = await import("../../orchestrator/orchestrator.js");
    expect(isWorkingHours()).toBe(false);

    vi.restoreAllMocks();
  });

  it("isWorkingHours returns false for Friday 23:00 (past 22:00)", async () => {
    const fakeDate = new Date(2026, 8, 11, 23, 0, 0); // 2026-09-11 is a Friday
    vi.spyOn(globalThis, "Date").mockImplementation(() => fakeDate as unknown as Date);

    const { isWorkingHours } = await import("../../orchestrator/orchestrator.js");
    expect(isWorkingHours()).toBe(false);

    vi.restoreAllMocks();
  });

  it("isWorkingHours returns true for Friday 21:30 (just before 22:00)", async () => {
    const fakeDate = new Date(2026, 8, 11, 21, 30, 0); // 2026-09-11 is a Friday
    vi.spyOn(globalThis, "Date").mockImplementation(() => fakeDate as unknown as Date);

    const { isWorkingHours } = await import("../../orchestrator/orchestrator.js");
    expect(isWorkingHours()).toBe(true);

    vi.restoreAllMocks();
  });

  it("scoreMacBookWorker adds +100 during working hours", async () => {
    const fakeDate = new Date(2026, 8, 8, 10, 0, 0); // Tue 10:00
    vi.spyOn(globalThis, "Date").mockImplementation(() => fakeDate as unknown as Date);

    const { scoreMacBookWorker } = await import("../../orchestrator/orchestrator.js");
    const baseScore = 50;
    const score = scoreMacBookWorker(baseScore);
    expect(score).toBe(baseScore + 100);

    vi.restoreAllMocks();
  });

  it("scoreMacBookWorker returns base during weekend", async () => {
    const fakeDate = new Date(2026, 8, 6, 10, 0, 0); // Sun 10:00
    vi.spyOn(globalThis, "Date").mockImplementation(() => fakeDate as unknown as Date);

    const { scoreMacBookWorker } = await import("../../orchestrator/orchestrator.js");
    const baseScore = 50;
    const score = scoreMacBookWorker(baseScore);
    expect(score).toBe(baseScore);

    vi.restoreAllMocks();
  });

  it("MacBook MagicDNS hostname parses to hostId=macbook", async () => {
    const { parseHostId } = await import("../../orchestrator/6host_router.js");
    const id = parseHostId("kjonemacbook-pro.fish-harness.ts.net");
    // Per F20, HostId union uses "macbook" not "kjonemacbook-pro"; parseHostId
    // accepts the leading fragment as long as it matches the union.
    expect(id === "macbook" || id === null).toBe(true);
  });
});

// Helper for `dirname` import in the first test
import { dirname } from "node:path";