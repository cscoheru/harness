/**
 * Orchestrator — real connection to v1.0 kernel HTTP API + dsh invoke.
 *
 * Responsibilities (M1c):
 *   - Parse user intent / task description
 *   - Dispatch to v1.0 kernel via POST /api/orch/invoke
 *   - Call deepseek_client.deepseekInvoke() (env-inject DEEPSEEK_API_KEY)
 *   - Track task lifecycle (pending → running → completed/failed)
 *   - Query kernel via GET /api/orch/status/{task_id}
 *
 * Calls v1.0 runtime kernel via HTTP/FFI — see v1.0-runtime-integration-roadmap.md §5.
 * Does NOT lock to a specific model. Uses modelClass from DshOpts.
 * Does NOT hardcode DEEPSEEK_API_KEY — injected via process.env.
 *
 * v1.2.0c (per D6 + F14): adds isWorkingHours() and scoreMacBookWorker()
 * to bias worker selection toward MacBook during owner working hours
 * (Mon-Fri 09:00-22:00 local time).
 */

import type {
  OrchestrationResult,
  PlanPlan,
  Task,
  HealthResponse,
  DriverEvent,
} from "./types.js";
import { deepseekInvoke } from "../dsh/deepseek_client.js";
import type { DshOpts, DshResponse } from "../dsh/types.js";
import * as commander from "./commander.js";
import * as workerModule from "./worker.js";
import { getDefaultQueueStore } from "./queue_store.js";
import {
  getDefaultTaskStore,
  safeMarkCompleted,
  safeMarkFailed,
} from "./task_store.js";
import {
  activeTaskCount,
  queueDepth,
  workerCount,
  startMetricsSampling,
} from "./metrics.js";

// ─── Config ────────────────────────────────────────────────────────────────────

/** v1.0 runtime kernel HTTP base URL */
const KERNEL_URL =
  process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:8000";

// ─── F3: Active task cancellation registry ──────────────────────────────────
// Per-task AbortController for in-flight cancel signals. Pairs with
// execution_driver.handleRegistry (driver-level interrupt) — the orchestrator
// registry is at a higher level (per-task) and signals cancel via
// controller.abort() + persist `cancelled` status to SQLite.
//
// F3 partial closure (per R10): full workerModule.run() integration requires
// refactoring run() to expose RunHandle; deferred to v1.2.0j+.6+ (F3+).
const _activeControllers = new Map<string, AbortController>();

function getOrCreateController(taskId: string): AbortController {
  let ctrl = _activeControllers.get(taskId);
  if (!ctrl) {
    ctrl = new AbortController();
    _activeControllers.set(taskId, ctrl);
  }
  return ctrl;
}

// ─── Kernel HTTP client ────────────────────────────────────────────────────────

/**
 * Invoke the v1.0 kernel HTTP facade — POST /api/orch/invoke.
 * Falls back to direct dsh invocation if kernel is unreachable.
 */
async function kernelInvoke(
  prompt: string,
  modelClass: string,
): Promise<KernelInvokeResult> {
  const url = `${KERNEL_URL}/api/orch/invoke`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model_class: modelClass }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error");
      throw new Error(`kernel ${res.status}: ${text}`);
    }
    const data = await res.json() as KernelInvokeResult;
    return data;
  } catch (err) {
    // Kernel unreachable — fall through to direct dsh invocation
    console.warn(`[orchestrator] kernel ${url} unreachable: ${err}; falling back to direct dsh`);
    throw err;
  }
}

interface KernelInvokeResult {
  task_id: string;
  status: string;
  trace_id?: string;
}

/**
 * Query the v1.0 kernel HTTP facade — GET /api/orch/status/{task_id}.
 */
async function kernelStatus(taskId: string): Promise<KernelStatusResult | null> {
  const url = `${KERNEL_URL}/api/orch/status/${encodeURIComponent(taskId)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error");
      throw new Error(`kernel status ${res.status}: ${text}`);
    }
    return await res.json() as KernelStatusResult;
  } catch (err) {
    console.warn(`[orchestrator] kernel status ${url} unreachable: ${err}`);
    return null;
  }
}

interface KernelStatusResult {
  task_id: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  trace_id?: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * v1.2.0c (per D6 + F14): Working-hours window for MacBook scoring.
 * Returns true Monday-Friday 09:00-22:00 local time.
 * Exported so tests can mock Date and verify the boundary conditions.
 */
export function isWorkingHours(date: Date = new Date()): boolean {
  const day = date.getDay();   // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = date.getHours(); // 0-23 local time
  if (day === 0 || day === 6) return false; // weekend
  return hour >= 9 && hour < 22;            // 09:00 ≤ hour < 22:00
}

/**
 * v1.2.0c (per D6 + F14): Score a MacBook worker. Adds +100 during working
 * hours (Mon-Fri 09:00-22:00). Returns baseScore unchanged otherwise.
 * Used by orchestrator dispatch scoring to bias worker selection.
 */
export function scoreMacBookWorker(baseScore: number, date: Date = new Date()): number {
  if (isWorkingHours(date)) {
    return baseScore + 100;
  }
  return baseScore;
}

/**
 * Health check — probes the v1.0 runtime kernel HTTP facade.
 * Returns real kernel response if reachable; stub otherwise.
 */
export async function health(): Promise<HealthResponse> {
  const url = `${KERNEL_URL}/health`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as HealthResponse;
      return data;
    }
  } catch {
    // fall through to stub
  }
  console.log("[orchestrator] health() — kernel unreachable, returning stub");
  return { status: "ok", version: "1.2.0c" };
}

/**
 * v1.2.0d (per D8 + F26): queue backpressure at dispatch entry.
 * Returns a failed OrchestrationResult if the queue is saturated; otherwise null.
 * Server.ts wraps this to emit 429 + Retry-After header (per F26).
 */
function tryEnqueueOrThrottle(
  taskId: string,
  payload: Record<string, unknown>,
): OrchestrationResult | null {
  const queueStore = getDefaultQueueStore();
  const result = queueStore.enqueue(taskId, payload);
  if (result.status === "throttled") {
    console.warn(
      `[orchestrator] dispatch(${taskId}) — throttled, retry_after=${result.retry_after}s`,
    );
    return {
      task_id: taskId,
      status: "failed",
      output: {
        stdout: "",
        wallMs: 0,
        trace_id: `queue-throttled-${taskId}`,
        queue_location: `/api/v1/status/${taskId}`,
        retry_after_seconds: result.retry_after,
      },
      error: `queue saturated, retry after ${result.retry_after}s`,
    };
  }
  return null;
}

/**
 * v1.2.0d (per F26): reclaim path — after task completes, pull pending tasks
 * back from SQLite overflow queue into the in-memory hot path.
 */
function reclaimAndUpdateMetrics(): number {
  const queueStore = getDefaultQueueStore();
  const reclaimed = queueStore.reclaim();
  if (reclaimed > 0) {
    console.log(`[orchestrator] reclaimed ${reclaimed} pending task(s) from SQLite`);
  }
  // F25: update Prometheus gauges after each dispatch
  activeTaskCount.set(queueStore.inFlightCount());
  queueDepth.set(queueStore.pendingCount());
  return reclaimed;
}

/**
 * Accept a user task, route to the appropriate commander, and track lifecycle.
 *
 * M1c: Invokes kernel POST /api/orch/invoke; falls back to direct dsh if kernel unreachable.
 * v1.2.0a: Inserts commander.planStep + dispatchStep + aggregateResults as the
 *   primary dispatch path. The kernel + dsh direct call remains as a
 *   parallel async fire + fallback for backward compatibility with the
 *   v1.1.1 PWA shell (which expects a real dsh stdout in the response).
 * v1.2.0d (per D8 + F26): adds queue backpressure check at entry + reclaim path at exit
 *   (per F26 429 Retry-After + 202 Accepted Location semantics).
 */
export async function dispatch(
  task: Task,
): Promise<OrchestrationResult> {
  const taskId = task.task_id;
  const prompt = extractPrompt(task);
  const modelClass = task.workflow_pack ?? "orch";

  console.log(`[orchestrator] dispatch(${taskId}) — modelClass=${modelClass}, prompt=${prompt.slice(0, 60)}…`);

  // ── v1.2.0d F26: queue backpressure at entry ──────────────────────────────
  const throttleResult = tryEnqueueOrThrottle(taskId, {
    prompt: prompt.slice(0, 1024),
    modelClass,
  });
  if (throttleResult) {
    reclaimAndUpdateMetrics();
    return throttleResult;
  }

  // ── v1.2.0d F25: start metrics sampling (idempotent) + update gauges ──────
  startMetricsSampling();
  activeTaskCount.set(getDefaultQueueStore().inFlightCount());
  queueDepth.set(getDefaultQueueStore().pendingCount());

  // ── v1.2.0j+.10+ NEW (D8 race fix): cancelled-guard at dispatch() entry.
  // If the task is already in a terminal 'cancelled' state (orchestrator.cancel()
  // ran before this dispatch reached this line, or while it was awaiting the
  // F26 throttle check above), return early WITHOUT overwriting the cancelled
  // status. Without this guard, the L275 setTask + L290 markRunning below
  // would clobber the cancelled status before the dsh-fallback safeMarkCompleted
  // guard at L373-386 ever gets a chance to run.
  const store = getDefaultTaskStore();
  const existing = store.getTask(taskId);
  if (existing?.status === "cancelled") {
    console.log(`[orchestrator] dispatch(${taskId}) — early-return (prior cancelled status preserved)`);
    _activeControllers.delete(taskId);
    reclaimAndUpdateMetrics();
    return {
      task_id: taskId,
      status: "cancelled",
    } as OrchestrationResult;
  }
  const now = Date.now();
  store.setTask({
    taskId,
    prompt,
    modelClass,
    status: "pending",
    resultJson: null,
    error: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  // ── F3: register cancellation controller (paired with execution_driver) ────
  const cancelCtrl = getOrCreateController(taskId);

  // ── v1.2.0a: Plan via commander ───────────────────────────────────────────
  store.markRunning(taskId);

  let planPlan: PlanPlan | null = null;
  try {
    planPlan = await commander.planStep(task);
    console.log(`[orchestrator] commander.planStep OK ${planPlan.steps.length} step(s)`);
  } catch (err) {
    console.warn(`[orchestrator] commander.planStep failed: ${err}; continuing without plan`);
  }

  // ── v1.2.0a: Dispatch each planned step (stub worker; v1.2.0b real) ──────
  if (planPlan && planPlan.steps.length > 0) {
    for (const step of planPlan.steps) {
      try {
        const dispatchRes = await commander.dispatchStep(taskId, step.name);
        console.log(`[orchestrator] dispatchStep ${step.name} → worker=${dispatchRes.worker_id}`);

        // v1.2.0b: actually run the step on the claimed worker via
        // ExecutionDriver. Worker.run() yields a DriverEvent stream; we
        // consume it inline to drive the in-memory step tracker state
        // (running → completed/failed) so aggregateResults() below sees
        // the correct per-step status.
        const attemptId = `atp-${taskId}-${step.name}`;
        const runRequest = {
          attempt_id: attemptId,
          task_id: taskId,
          workflow_pack: task.workflow_pack,
          workflow_version: task.workflow_version,
          input_blob_id: task.input_blob_id,
          capability_profile: workerModule.capability(),
          lease_token: `lease-${taskId}`,
          fence_version: 1,
          metadata: { prompt: prompt.slice(0, 1024) },
          // v1.2.0j+.6+ (F3+): cascade cancel signal into driver run loop.
          // When orchestrator.cancel() calls cancelCtrl.abort(), this signal
          // fires, execution_driver.start() adopts it via addEventListener,
          // and the in-flight deepseekInvoke fetch is interrupted.
          signal: cancelCtrl.signal,
        };
        let lastEvent: DriverEvent | null = null;
        for await (const ev of workerModule.run(runRequest)) {
          lastEvent = ev;
          if (ev.kind === "driver.failed") {
            commander._recordStepFailure(
              taskId,
              step.name,
              String(ev.payload?.error ?? "driver.failed"),
            );
            break;
          }
          if (ev.kind === "driver.interrupted") {
            commander._recordStepFailure(
              taskId,
              step.name,
              `interrupted: ${String(ev.payload?.reason ?? "unknown")}`,
            );
            break;
          }
        }
        if (lastEvent?.kind === "driver.finished") {
          commander._recordStepResult(taskId, step.name, {
            stdout: String(lastEvent.payload?.stdout ?? ""),
            exit_code: Number(lastEvent.payload?.exit_code ?? 0),
            wall_ms: Number(lastEvent.payload?.wall_ms ?? 0),
          });
        }
      } catch (err) {
        console.warn(`[orchestrator] dispatchStep ${step.name} failed: ${err}`);
      }
    }
  }

  // ── Backward-compat: kernel invoke + dsh for real result (PWA / v1.0) ────
  let dshResult: DshResponse;
  try {
    // Attempt kernel HTTP invoke (async fire for v1.0 compat)
    const kernelRes = await kernelInvoke(prompt, modelClass);
    console.log(`[orchestrator] kernel invoke OK task_id=${kernelRes.task_id} trace=${kernelRes.trace_id ?? "n/a"}`);
    // Also run dsh synchronously to return a real result to PWA
    dshResult = await runDsh(prompt, modelClass);
  } catch {
    // Kernel unreachable — invoke dsh directly
    console.log(`[orchestrator] dispatch(${taskId}) — using direct dsh fallback`);
    dshResult = await runDsh(prompt, modelClass);
  }

  // Update task state based on dsh result — F2 persistence via SQLite store.
  // v1.2.0j+.10+ NEW (D8 race fix): use cancelled-aware safe* helpers so a
  // concurrent orchestrator.cancel() that ran during the kernelInvoke/runDsh
  // await window is honoured. Without this guard, the dsh-fallback path would
  // overwrite a 'cancelled' SQLite status with 'completed'/'failed'.
  const resultJson = JSON.stringify({
    stdout: dshResult.stdout,
    exitCode: dshResult.exitCode,
    stderr: dshResult.stderr,
    wallMs: dshResult.wallMs,
  });
  const writeOk = dshResult.exitCode === 0
    ? safeMarkCompleted(store, taskId, resultJson)
    : safeMarkFailed(store, taskId, dshResult.stderr || `dsh exit ${dshResult.exitCode}`);
  if (writeOk) {
    if (dshResult.exitCode === 0) {
      console.log(`[orchestrator] dispatch(${taskId}) — completed wallMs=${dshResult.wallMs}`);
    } else {
      console.warn(`[orchestrator] dispatch(${taskId}) — failed exit=${dshResult.exitCode} stderr=${dshResult.stderr}`);
    }
  } else {
    const prior = store.getTask(taskId)?.status ?? "unknown";
    console.log(`[orchestrator] dispatch(${taskId}) — terminal write skipped (honoured prior status=${prior})`);
  }
  _activeControllers.delete(taskId);

  // Read final status for return payload
  const finalEntry = store.getTask(taskId);

  // ── v1.2.0a: Aggregate via commander ─────────────────────────────────────
  let planStepsCount = planPlan?.steps.length ?? 0;
  // v1.2.0j+.11+ NEW (D11 log noise fix): when the task was cancelled
  // mid-step, _recordStepFailure writes 'interrupted: user cancel' to
  // the in-memory step tracker (commander.ts:244-250), so aggregateResults
  // surfaces cancelled-induced step failures as failed_steps. These are
  // NOT real failures — they are an expected side-effect of the cancel
  // signal propagating through the plan. Suppress the WARN noise by
  // checking finalEntry.status (post-dsh-fallback snapshot) before
  // logging. cancel → cancelled propagates: layer-1 entry guard (L281)
  // OR cancelled-aware safeMarkCompleted (L404) ensures finalEntry.status
  // is 'cancelled' at L419 in the cancel-race window.
  const isCancelled = finalEntry?.status === "cancelled";
  try {
    const agg = await commander.aggregateResults(taskId);
    if (agg.output && typeof agg.output === 'object') {
      const out = agg.output as Record<string, unknown>;
      const failed = Array.isArray(out['failed_steps']) ? (out['failed_steps'] as readonly unknown[]).length : 0;
      if (failed > 0 && isCancelled) {
        // Expected: cancel interrupted in-flight step(s). Info-level only —
        // not a real plan execution failure.
        console.log(`[orchestrator] aggregateResults: ${failed} plan step(s) marked failed by cancel (expected, not a real failure)`);
      } else if (failed > 0) {
        console.warn(`[orchestrator] aggregateResults: ${failed} plan step(s) failed (synthetic stub; v1.2.0b real)`);
      }
    }
  } catch (err) {
    if (isCancelled) {
      // AggregateError (no steps tracked) is also expected during cancel —
      // planStep may not have been called before cancel fired.
      console.log(`[orchestrator] commander.aggregateResults skipped during cancel: ${err}`);
    } else {
      console.warn(`[orchestrator] commander.aggregateResults failed: ${err}`);
    }
  }

  // ── v1.2.0d F26: reclaim SQLite pending → in-memory hot path ──────────────
  reclaimAndUpdateMetrics();

  return {
    task_id: taskId,
    status: finalEntry?.status ?? "failed",
    output: {
      stdout: dshResult.stdout,
      wallMs: dshResult.wallMs,
      trace_id: `dsh-${taskId}`,
      plan_steps: planStepsCount,
      plan_source: (planPlan?.plan_metadata['source'] as string) ?? "none",
    },
    error: finalEntry?.error ?? null,
  };
}

/**
 * Run dsh headless with the given prompt and model class.
 * DEEPSEEK_API_KEY is injected via process.env (never hardcoded).
 *
 * Coerces unknown modelClass strings to 'orch' (default) so the call stays within
 * the documented ModelClass union; task.workflow_pack can be any string from the API
 * but PROFILE_YAML_MAP only has 3 keys (orch/commander/worker).
 */
async function runDsh(prompt: string, modelClass: string): Promise<DshResponse> {
  const validClass: DshOpts["modelClass"] =
    modelClass === "orch" || modelClass === "commander" || modelClass === "worker"
      ? modelClass
      : "orch";
  const opts: DshOpts = {
    modelClass: validClass,
    timeoutMs: 120_000,
  };
  return await deepseekInvoke(prompt, opts);
}

/**
 * Extract a displayable prompt string from a Task.
 */
function extractPrompt(task: Task): string {
  // Task.input_blob_id points to an input blob; for PWA form, prompt is in metadata
  const meta = (task as unknown as Record<string, unknown>)["metadata"] as Record<string, unknown> | undefined;
  if (meta?.prompt && typeof meta.prompt === "string") {
    return meta.prompt;
  }
  // Fallback: use task_id as a synthetic prompt for PWA demo
  return `task:${task.task_id}`;
}

/**
 * Get the current status of a task.
 * Queries kernel HTTP facade; falls back to in-memory store.
 */
export async function getTaskStatus(taskId: string): Promise<{
  task_id: string;
  status: "pending" | "dispatched" | "running" | "completed" | "failed" | "cancelled";
  result?: string;
  error?: string;
}> {
  // Try kernel status endpoint first
  const kernelStatus_ = await kernelStatus(taskId);
  if (kernelStatus_) {
    return kernelStatus_;
  }

  // Fall back to SQLite-backed task store (F2 — survives process restart)
  const entry = getDefaultTaskStore().getTask(taskId);
  if (entry) {
    let resultStr: string | undefined;
    if (entry.resultJson) {
      try {
        const parsed = JSON.parse(entry.resultJson) as Record<string, unknown>;
        resultStr = typeof parsed["stdout"] === "string" ? parsed["stdout"] : entry.resultJson;
      } catch {
        resultStr = entry.resultJson;
      }
    }
    return {
      task_id: entry.taskId,
      status: entry.status,
      result: resultStr,
      error: entry.error ?? undefined,
    };
  }

  return {
    task_id: taskId,
    status: "failed",
    error: "task not found",
  };
}

/**
 * Cancel a running orchestration.
 * F3: persists `cancelled` status to SQLite AND aborts the in-flight
 * AbortController (paired with execution_driver.interrupt pattern). The
 * AbortController triggers execution_driver's `driver.interrupted` event
 * downstream when workerModule.run() integration lands (v1.2.0j+.6+ / F3+).
 */
export async function cancel(taskId: string): Promise<void> {
  console.log(`[orchestrator] cancel(${taskId})`);
  const store = getDefaultTaskStore();
  const entry = store.getTask(taskId);
  if (entry && (entry.status === "pending" || entry.status === "running" || entry.status === "dispatched")) {
    store.markCancelled(taskId);
    const ctrl = _activeControllers.get(taskId);
    if (ctrl) {
      ctrl.abort();
      _activeControllers.delete(taskId);
    }
    console.log(`[orchestrator] cancel(${taskId}) — propagated interrupt + persisted cancelled`);
  } else {
    console.log(`[orchestrator] cancel(${taskId}) — no active task (status=${entry?.status ?? "missing"})`);
  }
}

/**
 * List all tasks (active + terminal) from the SQLite-backed task store.
 * F4: queries SQLite directly so terminal tasks (completed / failed /
 * cancelled) survive process restart. Ordered by created_at DESC (newest first).
 */
export async function listTasks(): Promise<Task[]> {
  const store = getDefaultTaskStore();
  return store.listTasks().map((entry) => ({
    task_id: entry.taskId,
    status: entry.status,
    workflow_pack: entry.modelClass,
    workflow_version: "1.0",
    input_blob_id: null,
    created_at: new Date(entry.createdAt).toISOString(),
    updated_at: new Date(entry.updatedAt).toISOString(),
    result_blob_id: null,
  }));
}

/**
 * Create a new Task object for dispatch.
 */
export function createTask(params: {
  taskId?: string;
  prompt: string;
  workflowPack?: string;
}): Task {
  const taskId = params.taskId ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  return {
    task_id: taskId,
    status: "pending",
    workflow_pack: params.workflowPack ?? "orch",
    workflow_version: "1.0",
    input_blob_id: null,
    created_at: now,
    updated_at: now,
    result_blob_id: null,
    // Attach prompt to metadata for extractPrompt()
    ...({ metadata: { prompt: params.prompt } } as unknown as Partial<Task>),
  } as Task;
}
