/**
 * Commander layer — single-workflow orchestration stub.
 *
 * Responsibilities (skeleton):
 *   - Receive a task payload from orchestrator
 *   - Plan the step DAG using a WorkflowPack
 *   - Dispatch steps to worker processes
 *   - Aggregate step results
 *
 * NOT implemented in M0c (skeleton only):
 *   - Real dsh invocation (M1+)
 *   - Step planning via WorkflowPack (M1+)
 *   - Worker dispatch and result aggregation (M1+)
 *
 * Calls v1.0 runtime kernel via HTTP/FFI — see v1.0-runtime-integration-roadmap.md §5.
 */

import type {
  OrchestrationResult,
  PackPlan,
  Task,
  TaskStatus,
} from "./types.js";

// ─── Config ────────────────────────────────────────────────────────────────────

const _RUNTIME_URL =
  process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:8000";

// ─── Commander ────────────────────────────────────────────────────────────────

/**
 * Plan a task into an ordered step DAG.
 * TODO(M1): Load WorkflowPack by task.workflow_pack, call pack.plan().
 */
export async function planStep(
  _task: Task,
): Promise<PackPlan> {
  console.log("[commander] planStep() — stub returning empty plan");
  // TODO(M1): Replace with real WorkflowPack.plan() call via runtime kernel
  return { steps: [] };
}

/**
 * Dispatch a planned step to a worker process.
 * TODO(M1): Select worker by capability matching, spawn subprocess.
 */
export async function dispatchStep(
  _taskId: string,
  _stepName: string,
): Promise<{ step: string; status: TaskStatus }> {
  console.log(`[commander] dispatchStep(${_taskId}, ${_stepName}) — stub`);
  // TODO(M1): Select eligible worker from WorkerPool, invoke via HTTP/FFI
  return { step: _stepName, status: "pending" };
}

/**
 * Aggregate step results into a final orchestration result.
 * TODO(M1): Collect all step outputs, assemble OrchestrationResult.
 */
export async function aggregateResults(
  taskId: string,
): Promise<OrchestrationResult> {
  console.log(`[commander] aggregateResults(${taskId}) — stub`);
  // TODO(M1): Query all step results via runtime kernel
  return {
    task_id: taskId,
    status: "pending",
    output: null,
    error: null,
  };
}

/**
 * Health check — probes the v1.0 runtime kernel HTTP facade.
 * TODO(M1): Replace stub with real HTTP GET /health call.
 */
export async function health(): Promise<{ status: "ok" | "error"; version: string }> {
  console.log("[commander] health() — stub returning ok");
  // TODO(M1): Replace with:
  //   const res = await fetch(`${RUNTIME_URL}/health`);
  //   return res.json();
  return { status: "ok", version: "0.0.0-stub" };
}
