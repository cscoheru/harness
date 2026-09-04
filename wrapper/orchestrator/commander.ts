/**
 * Commander layer — single-workflow orchestration (v1.2.0a REAL).
 *
 * Responsibilities (real implementation):
 *   - planStep(task): call WorkflowPack.plan() to get a PlanPlan (DAG of PlanSteps)
 *   - dispatchStep(taskId, stepName): record the dispatch intent + select a
 *     stub worker (real worker pool integration deferred to v1.2.0b)
 *   - aggregateResults(taskId): collect all step results into a final
 *     OrchestrationResult (returns partial result with failed_steps on AggregateError)
 *   - health(): real probe of commander-side state (plan count + step count)
 *
 * v1.2.0a scope:
 *   - Real WorkflowPack.plan() integration
 *   - In-memory step tracker (per-task_id)
 *   - Stub worker dispatch (returns synthetic dispatch record; v1.2.0b wires
 *     worker_pool.register/heartbeat/drain)
 *
 * v1.2.0b will replace dispatchStep() stub with real worker pool integration.
 *
 * Calls v1.0 runtime kernel via HTTP/FFI — see v1.0-runtime-integration-roadmap.md §5.
 *
 * @file wrapper/orchestrator/commander.ts
 */

import type {
  OrchestrationResult,
  PlanPlan,
  PlanStep,
  Task,
  TaskStatus,
} from "./types.js";
import { AggregateError } from "./types.js";
import * as workflowPack from "./workflow_pack.js";
import {
  getDefaultWorkerPool,
  NoActiveWorkerError,
} from "./worker_pool.js";

// ─── Config ────────────────────────────────────────────────────────────────────

const _RUNTIME_URL =
  process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:8000";

// ─── In-memory step tracker ────────────────────────────────────────────────────

/**
 * Per-task step tracker. Keyed by task_id; value is the list of dispatched
 * PlanSteps with status / worker_id / result / error fields updated as the
 * task progresses. Production deployments would back this with SQLite via
 * the v1.0 kernel (deferred to v1.2.0b worker_pool.ts).
 */
const _stepTracker = new Map<string, PlanStep[]>();

function trackSteps(taskId: string, steps: readonly PlanStep[]): void {
  _stepTracker.set(taskId, [...steps]);
}

function getSteps(taskId: string): PlanStep[] | undefined {
  return _stepTracker.get(taskId);
}

function updateStep(taskId: string, stepName: string, patch: Partial<PlanStep>): boolean {
  const steps = _stepTracker.get(taskId);
  if (!steps) return false;
  const idx = steps.findIndex((s) => s.name === stepName);
  if (idx < 0) return false;
  steps[idx] = { ...steps[idx], ...patch };
  return true;
}

// ─── Commander ────────────────────────────────────────────────────────────────

/**
 * Plan a task into an ordered step DAG.
 *
 * v1.2.0a REAL: delegates to WorkflowPack.plan(task), which calls dsh with the
 * commander profile (model = deepseek-v4-flash) to generate a JSON step DAG.
 * Falls back to a 1-step heuristic plan if dsh is unreachable or output is
 * unparseable (see workflow_pack.ts).
 */
export async function planStep(task: Task): Promise<PlanPlan> {
  console.log(`[commander] planStep(${task.task_id}) workflow_pack="${task.workflow_pack}"`);
  const planPlan = await workflowPack.plan(task);
  trackSteps(task.task_id, planPlan.steps);
  console.log(`[commander] planStep(${task.task_id}) — ${planPlan.steps.length} step(s), source=${planPlan.plan_metadata['source'] ?? "unknown"}`);
  return planPlan;
}

/**
 * Dispatch a planned step to a worker process.
 *
 * v1.2.0b REAL: calls worker_pool.dispatch(taskId) to claim an active
 * worker from the per-host SQLite registry (per ADR 0007 + ADR 0009
 * single-host WAL). The returned worker_id is written back into the
 * in-memory PlanStep tracker so aggregateResults() can correlate
 * per-step state.
 *
 * v1.2.0b hygiene (per §4.10.6):
 *   - NO synthetic stub-worker-... IDs in the production path. If no
 *     active worker is available, NoActiveWorkerError is thrown so the
 *     caller (orchestrator.dispatch) decides retry policy.
 *
 * Returns: { step, status: "dispatched", worker_id, dispatched_at }
 */
export async function dispatchStep(
  taskId: string,
  stepName: string,
): Promise<{ step: string; status: TaskStatus; worker_id: string; dispatched_at: string }> {
  const steps = getSteps(taskId);
  const step = steps?.find((s) => s.name === stepName);

  // Claim a worker via WorkerPool (per ADR 0007 round-robin dispatch).
  // If step.worker_id was set upstream (e.g. by orchestrator override),
  // use that; otherwise ask the pool.
  let workerId: string;
  try {
    if (step?.worker_id) {
      workerId = step.worker_id;
    } else {
      const poolResult = await getDefaultWorkerPool().dispatch(taskId);
      workerId = poolResult.worker_id;
    }
  } catch (err) {
    if (err instanceof NoActiveWorkerError) {
      // Surface as AggregateError-shaped failure so the upstream
      // orchestrator sees a step-level error and can retry / backoff.
      throw new AggregateError(
        taskId,
        [stepName],
        null,
        `dispatchStep(${stepName}): no active worker available — ` +
          `register() + heartbeat() must succeed before dispatch.`,
      );
    }
    throw err;
  }

  const dispatchedAt = new Date().toISOString();
  updateStep(taskId, stepName, {
    status: "dispatched",
    worker_id: workerId,
    started_at: dispatchedAt,
  });

  console.log(`[commander] dispatchStep(${taskId}, ${stepName}) — dispatched to ${workerId}`);

  return {
    step: stepName,
    status: "dispatched",
    worker_id: workerId,
    dispatched_at: dispatchedAt,
  };
}

/**
 * Aggregate step results into a final orchestration result.
 *
 * v1.2.0a REAL: reads from the in-memory step tracker and assembles the
 * OrchestrationResult. If any step failed (status === "failed" with non-null
 * error), the failed steps are surfaced via failed_steps in the output and
 * the overall status is set to "failed". A partial result is still returned
 * (never throws AggregateError from this function — caller decides retry
 * policy based on output.failed_steps).
 *
 * Throws AggregateError ONLY when the task has no tracked steps at all
 * (i.e., planStep was never called for this taskId).
 */
export async function aggregateResults(
  taskId: string,
): Promise<OrchestrationResult> {
  console.log(`[commander] aggregateResults(${taskId})`);
  const steps = getSteps(taskId);

  if (!steps) {
    throw new AggregateError(
      taskId,
      [],
      null,
      `No steps tracked for task ${taskId}; planStep() must be called before aggregateResults()`,
    );
  }

  const completed = steps.filter((s) => s.status === "completed");
  const failed = steps.filter((s) => s.status === "failed");
  const running = steps.filter((s) => s.status === "running" || s.status === "dispatched" || s.status === "pending");

  // Merge all step results into a single output map
  const stepOutputs: Record<string, unknown> = {};
  for (const s of steps) {
    if (s.result !== null) {
      stepOutputs[s.name] = s.result;
    }
  }

  let overallStatus: TaskStatus;
  let error: string | null = null;
  if (failed.length === 0 && running.length === 0 && completed.length === steps.length) {
    overallStatus = "completed";
  } else if (failed.length > 0) {
    overallStatus = "failed";
    error = `${failed.length}/${steps.length} step(s) failed: ${failed.map((s) => s.name).join(", ")}`;
  } else if (running.length > 0) {
    overallStatus = "running";
  } else {
    overallStatus = "completed"; // partial: some completed, some pending but no failures
  }

  console.log(`[commander] aggregateResults(${taskId}) — status=${overallStatus} completed=${completed.length} failed=${failed.length} running=${running.length}`);

  return {
    task_id: taskId,
    status: overallStatus,
    output: {
      steps: stepOutputs,
      failed_steps: failed.map((s) => s.name),
      pending_steps: running.map((s) => s.name),
      completed_steps: completed.map((s) => s.name),
    },
    error,
  };
}

// ─── Re-exports for v1.2.0b / testing ─────────────────────────────────────────

/**
 * Mark a step as completed (used by tests + future worker integration to push
 * step results into the tracker so aggregateResults can collect them).
 */
export function _recordStepResult(
  taskId: string,
  stepName: string,
  result: Record<string, unknown>,
): boolean {
  return updateStep(taskId, stepName, {
    status: "completed",
    finished_at: new Date().toISOString(),
    result,
  });
}

/**
 * Mark a step as failed (used by tests + future worker integration).
 */
export function _recordStepFailure(taskId: string, stepName: string, error: string): boolean {
  return updateStep(taskId, stepName, {
    status: "failed",
    finished_at: new Date().toISOString(),
    error,
  });
}

/**
 * Internal test helper: snapshot of the in-memory tracker.
 * Not part of the public API.
 */
export function _trackerSnapshot(): Map<string, readonly PlanStep[]> {
  return new Map(_stepTracker);
}

/**
 * Internal test helper: clear the in-memory tracker.
 * Not part of the public API.
 */
export function _resetTracker(): void {
  _stepTracker.clear();
}

// ─── Health ───────────────────────────────────────────────────────────────────

/**
 * Health check — probes commander-side state.
 * v1.2.0a REAL: returns active plan count, step count, and a reachable
 * indicator for the v1.0 runtime kernel (non-blocking; reports "error"
 * if kernel is unreachable but does not throw).
 */
export async function health(): Promise<{
  status: "ok" | "error";
  version: string;
  active_plans: number;
  total_steps: number;
  kernel_reachable: boolean;
  error?: string;
}> {
  let kernelReachable = false;
  let kernelError: string | undefined;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`${_RUNTIME_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    kernelReachable = res.ok;
    if (!res.ok) kernelError = `kernel ${res.status}`;
  } catch (err) {
    kernelError = String(err);
  }

  let totalSteps = 0;
  for (const steps of _stepTracker.values()) {
    totalSteps += steps.length;
  }

  return {
    status: "ok",
    version: "1.2.0a",
    active_plans: _stepTracker.size,
    total_steps: totalSteps,
    kernel_reachable: kernelReachable,
    error: kernelError,
  };
}