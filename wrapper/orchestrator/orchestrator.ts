/**
 * Orchestrator layer — top-level orchestration stub.
 *
 * Responsibilities (skeleton):
 *   - Parse user intent / task description
 *   - Decide which commander to dispatch to (capability routing)
 *   - Spawn commander process with task payload
 *   - Monitor commander lifecycle / health
 *
 * NOT implemented in M0c (skeleton only):
 *   - Real dsh invocation (M1+)
 *   - Commander process pool management (M1+)
 *   - Task state persistence (M1+)
 *
 * Calls v1.0 runtime kernel via HTTP/FFI — see v1.0-runtime-integration-roadmap.md §5.
 */

import type {
  OrchestrationResult,
  Task,
  HealthResponse,
} from "./types.js";

// ─── Config ────────────────────────────────────────────────────────────────────

const _RUNTIME_URL =
  process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:8000";

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Health check — probes the v1.0 runtime kernel HTTP facade.
 * TODO(M1): Replace stub with real HTTP GET /health call.
 */
export async function health(): Promise<HealthResponse> {
  console.log("[orchestrator] health() — stub returning ok");
  // TODO(M1): Replace with:
  //   const res = await fetch(`${RUNTIME_URL}/health`);
  //   return res.json() as Promise<HealthResponse>;
  return { status: "ok", version: "0.0.0-stub" };
}

/**
 * Accept a user task, route to the appropriate commander, and track lifecycle.
 * TODO(M1): Real commander spawning + result aggregation.
 */
export async function dispatch(
  _task: Task,
): Promise<OrchestrationResult> {
  console.log("[orchestrator] dispatch() — stub");
  // TODO(M1): Route by task.workflow_pack / required_capabilities
  // TODO(M1): Spawn commander process (dsh or subprocess)
  // TODO(M1): Collect commander result + map to OrchestrationResult
  return {
    task_id: _task.task_id,
    status: "pending",
    output: null,
    error: null,
  };
}

/**
 * Cancel a running orchestration.
 * TODO(M1): Propagate cancel signal to active commander + workers.
 */
export async function cancel(taskId: string): Promise<void> {
  console.log(`[orchestrator] cancel(${taskId}) — stub`);
  // TODO(M1): Send cancel to active commander process
}

/**
 * List active orchestrations.
 * TODO(M1): Query active commander processes + task state.
 */
export async function listTasks(): Promise<Task[]> {
  console.log("[orchestrator] listTasks() — stub returning empty");
  // TODO(M1): Query SQLite tasks table via runtime kernel
  return [];
}
