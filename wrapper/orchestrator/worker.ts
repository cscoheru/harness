/**
 * Worker layer — low-cost batch execution stub.
 *
 * Responsibilities (skeleton):
 *   - Receive a step from commander
 *   - Execute the step using an ExecutionDriver (Codex SDK / exec / etc.)
 *   - Report results back to runtime kernel
 *
 * NOT implemented in M0c (skeleton only):
 *   - Real dsh / codex exec invocation (M1+)
 *   - Result blob upload to ArtifactStore (M1+)
 *   - Heartbeat / cancel handling (M1+)
 *
 * Calls v1.0 runtime kernel via HTTP/FFI — see v1.0-runtime-integration-roadmap.md §5.
 */

import type {
  DriverCapabilities,
  DriverEvent,
  RunHandle,
  RunRequest,
  TaskStatus,
} from "./types.js";

// ─── Config ────────────────────────────────────────────────────────────────────

const _RUNTIME_URL =
  process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:8000";

// ─── Worker ────────────────────────────────────────────────────────────────────

/**
 * Return the driver capabilities for this worker.
 * TODO(M1): Load from spec/capabilities/worker.json (class: "worker" / tier: "low-cost-batch").
 */
export function capability(): DriverCapabilities {
  console.log("[worker] capability() — stub");
  // TODO(M1): Load from spec/capabilities/worker.json
  return {
    driver_kind: "codex_exec",
    evidence_uri: "",
    max_concurrent_attempts: 1,
    supports_streaming: false,
    supports_interrupt: false,
    supports_heartbeat: false,
    supports_tool_gateway: false,
    notes: "stub — real driver deferred to M1+",
  };
}

/**
 * Execute a step.
 * TODO(M1): Run ExecutionDriver.run() via dsh or subprocess.
 */
export async function run(
  _request: RunRequest,
): Promise<AsyncIterable<DriverEvent>> {
  console.log("[worker] run() — stub returning empty async iterable");
  // TODO(M1): Replace with real ExecutionDriver.run() call
  async function* stub(): AsyncIterable<DriverEvent> {
    // empty — real impl streams DriverEvent chunks
  }
  return stub();
}

/**
 * Interrupt a running step.
 * TODO(M1): Call ExecutionDriver.interrupt().
 */
export async function interrupt(
  _handle: RunHandle,
  _reason: string,
): Promise<void> {
  console.log(`[worker] interrupt() — stub`);
  // TODO(M1): Propagate interrupt to active ExecutionDriver
}

/**
 * Send a heartbeat to the runtime kernel.
 * TODO(M1): Update worker heartbeat via WorkerPool.heartbeat().
 */
export async function heartbeat(_handle: RunHandle): Promise<void> {
  console.log("[worker] heartbeat() — stub");
  // TODO(M1): Call WorkerPool.heartbeat() via HTTP/FFI
}

/**
 * Health check — probes the v1.0 runtime kernel HTTP facade.
 * TODO(M1): Replace stub with real HTTP GET /health call.
 */
export async function health(): Promise<{ status: "ok" | "error"; version: string }> {
  console.log("[worker] health() — stub returning ok");
  // TODO(M1): Replace with:
  //   const res = await fetch(`${RUNTIME_URL}/health`);
  //   return res.json();
  return { status: "ok", version: "0.0.0-stub" };
}

/**
 * Register this worker with the runtime kernel.
 * TODO(M1): Call WorkerPool.register() via HTTP/FFI.
 */
export async function register(
  host: string,
  _capabilities_json: string,
): Promise<string> {
  console.log(`[worker] register(${host}) — stub returning stub-id`);
  // TODO(M1): Call WorkerPool.register() via HTTP/FFI
  return `stub-worker-${host}`;
}

/**
 * Drain this worker — stop accepting new steps.
 * TODO(M1): Call WorkerPool.drain() via HTTP/FFI.
 */
export async function drain(_workerId: string): Promise<string> {
  console.log(`[worker] drain() — stub`);
  // TODO(M1): Call WorkerPool.drain() via HTTP/FFI
  return "drained";
}

/**
 * Get the status of a task.
 * TODO(M1): Query runtime kernel for task status.
 */
export async function getTaskStatus(_taskId: string): Promise<TaskStatus> {
  console.log(`[worker] getTaskStatus() — stub returning pending`);
  // TODO(M1): Query via runtime kernel
  return "pending";
}
