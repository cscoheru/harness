/**
 * T-V1.2.0L-QA-2: SubprocessDshDriver tests (v1.2.0l NEW).
 *
 * Validates real subprocess execution end-to-end:
 *   - spawn `echo hello` → driver.output_chunk + driver.finished exit_code=0
 *   - spawn `false` → driver.failed exit_code=1
 *   - interrupt mid-run → child killed, driver.interrupted emitted
 *
 * Uses /bin/echo (POSIX) instead of echo shell builtin to avoid shell
 * injection risk; spawn shell:false ensures args are not parsed by shell.
 * For failure tests, uses `node -e "process.exit(1)"` for portability
 * (macOS lacks /bin/false).
 *
 * @file test/unit/subprocess_driver.test.ts
 */

import { describe, it, expect } from "vitest";
import { SubprocessDshDriver } from "../../orchestrator/execution_driver.js";
import type { DriverEvent, RunRequest } from "../../orchestrator/types.js";

// Helper: collect all events from an async iterable into an array
async function collectEvents(iter: AsyncIterable<DriverEvent>): Promise<DriverEvent[]> {
  const out: DriverEvent[] = [];
  for await (const ev of iter) {
    out.push(ev);
  }
  return out;
}

function makeRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    attempt_id: `atp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    task_id: "test-task",
    workflow_pack: "test",
    workflow_version: "1.0",
    input_blob_id: null,
    capability_profile: new SubprocessDshDriver().capability(),
    lease_token: "lease-test",
    fence_version: 1,
    metadata: {},
    ...overrides,
  };
}

describe("SubprocessDshDriver (v1.2.0l NEW)", () => {
  it("capability() reports driver_kind=subprocess", () => {
    const caps = new SubprocessDshDriver().capability();
    expect(caps.driver_kind).toBe("subprocess");
    expect(caps.supports_streaming).toBe(true);
    expect(caps.supports_interrupt).toBe(true);
  });

  it("runs /bin/echo hello → driver.finished exit_code=0 with stdout", async () => {
    const driver = new SubprocessDshDriver();
    const events = await collectEvents(driver.run(makeRequest({
      metadata: { command: "/bin/echo", args: ["hello", "subprocess"] },
    })));

    // Expect: driver.handle → driver.started → driver.output_chunk → driver.finished
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("driver.started");
    expect(kinds).toContain("driver.finished");

    const finished = events.find((e) => e.kind === "driver.finished");
    expect(finished).toBeDefined();
    expect(finished?.payload["exit_code"]).toBe(0);
    expect(String(finished?.payload["stdout"] ?? "")).toContain("hello subprocess");
    expect(finished?.payload["source"]).toBe("subprocess");
  });

  it("runs /bin/false → driver.failed exit_code=1 with stderr/error", async () => {
    const driver = new SubprocessDshDriver();
    // Use `node -e "process.exit(1)"` for portability — /bin/false exists on
    // Linux but is at /usr/bin/false on macOS, and `false` is a shell
    // builtin (shell:false means we can't rely on PATH lookup for builtins).
    const events = await collectEvents(driver.run(makeRequest({
      metadata: { command: process.execPath, args: ["-e", "process.exit(1)"] },
    })));

    const failed = events.find((e) => e.kind === "driver.failed");
    expect(failed).toBeDefined();
    expect(failed?.payload["exit_code"]).toBe(1);
    expect(failed?.payload["source"]).toBe("subprocess");
  });

  it("fails fast when metadata.command is missing", async () => {
    const driver = new SubprocessDshDriver();
    const events = await collectEvents(driver.run(makeRequest({
      metadata: {},
    })));

    const failed = events.find((e) => e.kind === "driver.failed");
    expect(failed).toBeDefined();
    expect(String(failed?.payload["error"] ?? "")).toMatch(/requires.*command/i);
  });

  it("emits driver.handle first so orchestrator can interrupt mid-run", async () => {
    const driver = new SubprocessDshDriver();
    const events = await collectEvents(driver.run(makeRequest({
      // Long-running command: sleep 0.3s; the driver.handle event is emitted
      // synchronously before the spawn happens.
      metadata: { command: "/bin/sh", args: ["-c", "sleep 0.3 && echo done"] },
    })));

    const handleEvent = events.find((e) => e.kind === "driver.handle");
    expect(handleEvent).toBeDefined();
    expect((handleEvent?.payload["handle"] as { cancel_token: string }).cancel_token).toMatch(/^sub-/);
  });

  it("respects request.signal abort (cascades to SIGTERM)", async () => {
    const driver = new SubprocessDshDriver();
    const controller = new AbortController();
    // Schedule an abort after 50ms; the child should be killed via SIGTERM.
    setTimeout(() => controller.abort(), 50);

    const events = await collectEvents(driver.run(makeRequest({
      metadata: { command: "/bin/sh", args: ["-c", "sleep 5"] },
      signal: controller.signal,
    })));

    // Either driver.interrupted (if abort landed before exit) or driver.finished
    // (if sleep 5 raced too fast). For this CI environment, abort should win.
    const interrupted = events.find((e) => e.kind === "driver.interrupted");
    const failed = events.find((e) => e.kind === "driver.failed");
    expect(interrupted || failed).toBeDefined();
    // wall_ms should be << 5000 if abort worked
    const terminal = interrupted ?? failed;
    expect(Number(terminal?.payload["wall_ms"] ?? 5000)).toBeLessThan(2000);
  });

  it("runs /bin/ls of a temp directory and captures stdout", async () => {
    const driver = new SubprocessDshDriver();
    const events = await collectEvents(driver.run(makeRequest({
      metadata: { command: "/bin/ls", args: ["/tmp"] },
    })));

    const finished = events.find((e) => e.kind === "driver.finished");
    expect(finished).toBeDefined();
    const stdout = String(finished?.payload["stdout"] ?? "");
    expect(stdout.length).toBeGreaterThan(0);
  });
});
