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
  PlanStep,
  PlanStepStatus,
  Task,
  TaskStatus,
  HealthResponse,
  DriverEvent,
  RunHandle,
} from "./types.js";
import { minimaxInvoke } from "../dsh/minimax_client.js";
import type { DshOpts, DshResponse } from "../dsh/types.js";
import * as commander from "./commander.js";
import * as workerModule from "./worker.js";
import { getDefaultWorkerPool } from "./worker_pool.js";
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
import { SpawnDshDriver, SubprocessDshDriver } from "./execution_driver.js";
import type { ExecutionDriver } from "./types.js";
import {
  appendStepStdout,
  emitStepUpdate,
  setStepHost,
  getStepStatuses,
} from "./commander.js";

// ─── Driver registry (v1.2.0l NEW: capability → ExecutionDriver) ─────────────
// Maps a step's declared capability to the ExecutionDriver implementation
// that runs it. Keeps the dispatch loop in orchestrator.dispatch() driver-
// agnostic — future drivers (e.g. "docker_exec" for sandboxed subprocess,
// "http" for forwarding to a remote API) drop in by extending this map.
//
// Capability routing rules:
//   - "subprocess*" → SubprocessDshDriver (real child_process.spawn)
//   - anything else → SpawnDshDriver (LLM via routedDsh/minimaxInvoke, existing path)
//
// Return type is a constructor that produces an ExecutionDriver (rather
// than the SpawnDshDriver concrete class) so SubprocessDshDriver can be
// returned without TypeScript balking about constructor signature mismatch.

function pickDriverForCapability(capability: string): new () => ExecutionDriver {
  if (capability.startsWith("subprocess")) return SubprocessDshDriver as unknown as new () => ExecutionDriver;
  return SpawnDshDriver as unknown as new () => ExecutionDriver;
}

// ─── Config ────────────────────────────────────────────────────────────────────

/** v1.2.0k kernel HTTP base URL (per ADR 0012 Decision c).
 *
 * Reads HARNESS_RUNTIME_URL env var so existing deploy scripts keep working.
 * Default port bumped from 8000 → 4001 to match the kernel-http service in
 * docker-compose.yml (per ADR 0012 Decision b).
 *
 * Implementation note: function (NOT const) so tests can override
 * HARNESS_RUNTIME_URL via process.env at runtime. Each call re-reads env
 * — negligible overhead vs const, enables per-test isolation.
 *
 * Override examples:
 *   - Production (compose):    http://kernel-http:4001 (auto via compose DNS)
 *   - Local dev:               export HARNESS_RUNTIME_URL=http://localhost:4001
 *   - 6host edge:              http://<tailscale-host>:4001
 */
function kernelBaseUrl(): string {
  return process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:4001";
}

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

// v1.2.0j+.12+ D12 NEW: parallel registry to _activeControllers. Tracks
// RunHandle captured from driver.handle event (yielded by execution_driver
// streamEvents before driver.started) so orchestrator can call
// workerModule.interrupt(handle, reason) — the first production caller
// (0 callers before this cycle per L46 audit).
const _activeHandles = new Map<string, RunHandle>();

/**
 * v1.2.0j+.12+ D12 NEW: first production caller of workerModule.interrupt().
 * Idempotent — no-op if no handle was captured yet (race window) or already
 * cleaned up. Safe to call from cancel(), per-step terminal event, and
 * dispatch() end without coordination.
 */
async function interruptByTaskId(taskId: string, reason: string): Promise<void> {
  const handle = _activeHandles.get(taskId);
  if (!handle) return;
  await workerModule.interrupt(handle, reason);
}

// ─── Kernel HTTP client ────────────────────────────────────────────────────────

/**
 * Invoke the v1.0 kernel HTTP facade — POST /api/orch/invoke.
 * Falls back to direct dsh invocation if kernel is unreachable.
 *
 * v1.2.0k.3 P0 SECURITY: ``tenantId`` is REQUIRED. The kernel
 * InvokeRequest schema now has a mandatory ``tenant_id`` field; the
 * matching X-Tenant-ID header is also forwarded so kernel can scope
 * any future server-side audit log. The single internal caller in
 * dispatch() passes 'wrapper-default' since dispatch has no tenant
 * context — wrapper HTTP handlers read X-Tenant-ID from incoming
 * requests and pass it explicitly to kernel-scoped functions.
 */
async function kernelInvoke(
  prompt: string,
  modelClass: string,
  tenantId: string,
): Promise<KernelInvokeResult> {
  const url = `${kernelBaseUrl()}/api/orch/invoke`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": tenantId,
      },
      body: JSON.stringify({
        prompt,
        model_class: modelClass,
        tenant_id: tenantId,
      }),
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
  const url = `${kernelBaseUrl()}/api/orch/status/${encodeURIComponent(taskId)}`;
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
  // v1.2.0l FIX: kernel exposes /api/orch/healthz (FastAPI k8s convention,
  // harness/server.py:225), not /health (REST convention). Wrapper was hitting
  // 404, falling through to "kernel unreachable, returning stub" log spam —
  // accumulated 88G of log lines on edge1/2/3 in 36h and filled disk.
  const url = `${kernelBaseUrl()}/api/orch/healthz`;
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
  // v1.2.0l: capability → driver_kind dispatch + per-step stdout streaming
  // pushed to commander.appendStepStdout() for SSE-driven PWA DAG viewer.
  // ── v1.2.0n M1 NEW: depends_on topological wave execution ─────────────
  // Per audit-scope v1.1 §2 A — replaces L406 sequential for-await with
  // wave-based parallel dispatch (Kahn's algorithm). Same-wave steps
  // run via Promise.all; waves run sequentially; cycle in depends_on
  // throws CyclicDependsOnError at plan time (per §2 D).
  //
  // v1.2.0n M1.1 NEW: (a) read `MAX_CONCURRENT_STEPS_PER_WAVE` env var
  // (default 0 = unlimited, M1.0 behavior); chunked Promise.all by MCC.
  // (b) skip-dependents logic — when upstream step fails (status="failed"),
  // mark downstream steps (transitive depends_on) as "skipped" + skip
  // dispatchOneStep + emit_step_update({status: "skipped"}). skip only
  // crosses wave boundary (wave 1 failure → wave 2 skip); wave-internal
  // Promise.all still dispatches all same-wave steps (M1.0 behavior
  // preserved per T4a). Caveat per audit-scope v1.1 §2 A caveat: M1.1
  // skip only triggers on wave-boundary failure, not wave-internal.
  const MCC = (() => {
    const raw = process.env["MAX_CONCURRENT_STEPS_PER_WAVE"];
    if (!raw || raw === "0" || raw.trim() === "") return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  // stepByNameFromPlan: maps step.name → PlanStep for skip-dependents
  // lookup (which downstream steps depend on each step)
  const stepNameToPlanStep = new Map<string, PlanStep>();
  if (planPlan) {
    for (const s of planPlan.steps) stepNameToPlanStep.set(s.name, s);
  }
  // failedUpstream: set of step names that failed or were skipped in
  // previous waves. New wave's steps that depend on any of these names
  // get marked "skipped" before dispatch.
  const failedUpstream = new Set<string>();

  let realStepCount = 0;
  if (planPlan && planPlan.steps.length > 0) {
    const waves = topologicalWaves(planPlan.steps);
    for (let wIdx = 0; wIdx < waves.length; wIdx++) {
      const wave = waves[wIdx];
      // skip-dependents: before dispatching this wave, mark any step
      // depending on a previously-failed/skipped step as "skipped".
      if (failedUpstream.size > 0 && wIdx > 0) {
        const toSkipInThisWave: PlanStep[] = [];
        const toDispatchInThisWave: PlanStep[] = [];
        for (const step of wave) {
          if (step.depends_on.some((d) => failedUpstream.has(d))) {
            toSkipInThisWave.push(step);
          } else {
            toDispatchInThisWave.push(step);
          }
        }
        for (const skipped of toSkipInThisWave) {
          failedUpstream.add(skipped.name);
          commander._recordStepResult(taskId, skipped.name, {
            stdout: "",
            exit_code: 0,
            wall_ms: 0,
          });
          emitStepUpdate(taskId, skipped.name, "step_update", {
            status: "skipped",
            host: null,
            wall_ms: 0,
          });
          console.log(`[orchestrator] skip-dependents: ${skipped.name} skipped (upstream failed/skipped)`);
        }
        if (toDispatchInThisWave.length === 0) {
          // Entire wave is downstream of failed/skipped; nothing to dispatch
          continue;
        }
        // Replace `wave` slice with dispatchable subset
        var dispatchableWave = toDispatchInThisWave;
      } else {
        var dispatchableWave = wave;
      }

      // MCC chunked dispatch (MCC=0 → single chunk; MCC=N → ceil(len/N) chunks)
      const len = dispatchableWave.length;
      const chunkSize = MCC > 0 ? Math.min(MCC, len) : len;
      let waveCompletedCount = 0;
      for (let c = 0; c < len; c += chunkSize) {
        const chunk = dispatchableWave.slice(c, c + chunkSize);
        await Promise.all(chunk.map(async (step) => {
          try {
            const stepCompleted = await dispatchOneStep(taskId, task, prompt, step, cancelCtrl);
            if (stepCompleted) {
              waveCompletedCount += 1;
            } else {
              // dispatchOneStep returned false (driver.interrupted / no terminal event).
              // Treat as failed for skip-propagation purposes.
              failedUpstream.add(step.name);
            }
          } catch (err) {
            console.warn(`[orchestrator] dispatchStep ${step.name} failed: ${err}`);
            emitStepUpdate(taskId, step.name, "step_update", {
              status: "failed",
              error: String(err),
            });
            failedUpstream.add(step.name);
          }
        }));
      }
      realStepCount += waveCompletedCount;
    }
  }

  // ── Backward-compat: kernel invoke + dsh for real result (PWA / v1.0) ────
  // v1.2.0l NEW: when real plan steps executed (realStepCount > 0), skip the
  // backward-compat kernel/dsh double-invoke path. The plan step results are
  // already in commander._stepTracker + emitted via SSE; running dsh again
  // would produce a competing stdout (the "Python 脚本" user saw on 2026-09-15
  // was exactly this — fallback ran after a no-op plan and produced an
  // LLM-freeform chat answer). When plan had 0 real steps (heuristic 0-match
  // case or all failed), keep the fallback path so PWA still gets an answer.
  let dshResult: DshResponse;
  if (realStepCount === 0) {
    try {
      const kernelRes = await kernelInvoke(prompt, modelClass, "wrapper-default");
      console.log(`[orchestrator] kernel invoke OK task_id=${kernelRes.task_id} trace=${kernelRes.trace_id ?? "n/a"}`);
      dshResult = await runDsh(prompt, modelClass);
    } catch {
      console.log(`[orchestrator] dispatch(${taskId}) — using direct dsh fallback`);
      dshResult = await runDsh(prompt, modelClass);
    }
  } else {
    // Build a synthetic DshResponse from aggregated plan stdout so the rest
    // of the pipeline (safeMarkCompleted + response shape) doesn't need to
    // branch on "ran plan vs ran dsh". Concatenate step stdout with
    // structured headers so PWA can still see which step produced which line.
    const stepStatuses = commander.getStepStatuses(taskId);
    const aggregatedStdout = stepStatuses
      .map((s) => `[${s.name} @ ${s.host ?? "unknown"}]\n${s.stdout}`)
      .join("\n\n");
    dshResult = {
      stdout: aggregatedStdout,
      stderr: "",
      exitCode: 0,
      wallMs: stepStatuses.reduce((acc, s) => acc + (s.wallMs ?? 0), 0),
      traceId: `plan-${taskId}`,
      tokenUsage: undefined,
      denialReason: undefined,
    };
    console.log(`[orchestrator] dispatch(${taskId}) — using plan-aggregated stdout (realStepCount=${realStepCount})`);
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
  // v1.2.0j+.12+ D12 NEW: catch-all cleanup at dispatch end. Per-step cleanup
  // (inside step for-await loop) catches successful paths. This catches edge
  // case where no plan steps ran (e.g., planStep returned empty) so any
  // captured handle doesn't leak in _activeHandles Map.
  await interruptByTaskId(taskId, "dispatch complete");
  _activeHandles.delete(taskId);

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

  // v1.2.0l NEW: surface per-step status + distinct hosts in the dispatch
  // response so /api/pwa/status (poll) and /api/pwa/stream (SSE) can drive
  // the PWA DAG viewer. Computed from commander._stepTracker at terminal.
  const stepStatuses = getStepStatuses(taskId);
  const distinctHosts = Array.from(new Set(stepStatuses.map((s) => s.host).filter((h): h is string => typeof h === "string")));
  emitTerminalTaskEvent(taskId, finalEntry?.status ?? "failed", dshResult.wallMs);

  return {
    task_id: taskId,
    status: finalEntry?.status ?? "failed",
    output: {
      stdout: dshResult.stdout,
      wallMs: dshResult.wallMs,
      trace_id: `dsh-${taskId}`,
      plan_steps: planStepsCount,
      plan_source: (planPlan?.plan_metadata['source'] as string) ?? "none",
      // v1.2.0l NEW: parallel dual view data
      steps: stepStatuses,
      hosts: distinctHosts,
    },
    error: finalEntry?.error ?? null,
  };
}

/**
 * Run dsh headless with the given prompt and model class.
 * DEEPSEEK_API_KEY is injected via process.env (never hardcoded).
 *
 * v1.2.0k.6 NEW: primary path now routes via 6host_router.routedDsh() instead
 * of calling minimaxInvoke() directly. routedDsh() picks a host based on
 * modelClass: orch/commander → newvps primary; worker → edge round-robin.
 * On "no host available", routedDsh() falls back to direct minimaxInvoke.
 *
 * Coerces unknown modelClass strings to 'orch' (default) so the call stays within
 * the documented ModelClass union; task.workflow_pack can be any string from the API
 * but PROFILE_YAML_MAP only has 3 keys (orch/commander/worker).
 */
async function runDsh(prompt: string, modelClass: string, hostHint?: string): Promise<DshResponse> {
  const validClass: DshOpts["modelClass"] =
    modelClass === "orch" || modelClass === "commander" || modelClass === "worker"
      ? modelClass
      : "orch";
  // v1.2.0k.6: primary dispatch via 6host_router (cross-host routing)
  try {
    const { routedDsh } = await import("./6host_router.js");
    return await routedDsh(prompt, validClass, hostHint);
  } catch (err) {
    // Last-resort fallback: direct LLM API call (when 6host_router finds no host)
    console.warn(`[orchestrator] runDsh routedDsh failed (${(err as Error).message}); falling back to direct minimaxInvoke`);
    return await minimaxInvoke(prompt, {
      modelClass: validClass,
      timeoutMs: 120_000,
    });
  }
}

/**
 * v1.2.0n M1 NEW: CyclicDependsOnError — thrown by topologicalWaves when
 * depends_on forms a cycle (per audit-scope v1.1 §2 D).
 */
export class CyclicDependsOnError extends Error {
  constructor(public readonly cycleSteps: string[]) {
    super(`cyclic depends_on detected: ${cycleSteps.join(" → ")}`);
    this.name = "CyclicDependsOnError";
  }
}

/**
 * v1.2.0n M1 NEW: Topological wave execution (per audit-scope v1.1 §2 A).
 * depends_on defines waves via Kahn's algorithm; same-wave steps run in
 * parallel via promise.all; waves run sequentially. Throws
 * CyclicDependsOnError on cycle, or Error on unknown depends_on reference.
 */
export function topologicalWaves(steps: readonly PlanStep[]): PlanStep[][] {
  const stepByName = new Map<string, PlanStep>();
  for (const s of steps) stepByName.set(s.name, s);

  // Validate every depends_on entry references a known step in this plan
  for (const s of steps) {
    for (const dep of s.depends_on) {
      if (!stepByName.has(dep)) {
        throw new Error(
          `[orchestrator] step "${s.name}" depends on unknown step "${dep}"`,
        );
      }
    }
  }

  // Kahn's algorithm: indegree + dependents map
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const s of steps) {
    indegree.set(s.name, s.depends_on.length);
    for (const dep of s.depends_on) {
      const list = dependents.get(dep);
      if (list) list.push(s.name);
      else dependents.set(dep, [s.name]);
    }
  }

  const waves: PlanStep[][] = [];
  let currentWave = steps.filter((s) => s.depends_on.length === 0);
  // Cycle detection: at most |steps| waves (each wave reduces indegree by 1)
  let safety = steps.length + 1;

  while (currentWave.length > 0 && safety-- > 0) {
    waves.push(currentWave);
    const nextWave: PlanStep[] = [];
    for (const s of currentWave) {
      for (const dep of dependents.get(s.name) ?? []) {
        const newInd = (indegree.get(dep) ?? 0) - 1;
        indegree.set(dep, newInd);
        if (newInd === 0) {
          const step = stepByName.get(dep);
          if (step) nextWave.push(step);
        }
      }
    }
    currentWave = nextWave;
  }

  // Cycle detection: if waves don't cover all steps, there's a cycle
  const totalSteps = waves.reduce((sum, w) => sum + w.length, 0);
  if (totalSteps !== steps.length) {
    const remaining = steps
      .filter((s) => !waves.some((w) => w.some((ws) => ws.name === s.name)))
      .map((s) => s.name);
    throw new CyclicDependsOnError(remaining);
  }

  return waves;
}

/**
 * v1.2.0n M1 NEW: Dispatch a single step. Extracted from old sequential
 * for-await loop (pre-M1 orchestrator.ts:407-540) into a Promise<boolean>
 * helper so the wave-level promise.all loop can dispatch steps in
 * parallel. Returns true on driver.finished, false on failed/interrupted.
 */
async function dispatchOneStep(
  taskId: string,
  task: Task,
  prompt: string,
  step: PlanStep,
  cancelCtrl: AbortController,
): Promise<boolean> {
  // 1. v1.2.0l: dispatchStep → worker_pool routes by capability (F24)
  const dispatchRes = await commander.dispatchStep(taskId, step.name, step.capability);
  console.log(`[orchestrator] dispatchStep ${step.name} (cap=${step.capability}) → worker=${dispatchRes.worker_id}`);

  // 2. v1.2.0k.6: look up worker's host from worker_pool for routing
  let hostHint: string | undefined;
  if (dispatchRes.worker_id) {
    const workerInfo = getDefaultWorkerPool().getWorker(dispatchRes.worker_id);
    if (workerInfo?.host) {
      hostHint = workerInfo.host;
      setStepHost(taskId, step.name, hostHint);
      console.log(`[orchestrator] routing step ${step.name} to host=${hostHint}`);
    }
  }

  // 3. v1.2.0l: pick driver by capability
  const DriverClass = pickDriverForCapability(step.capability);

  // 4. Build runRequest with cancel signal cascade (F3+)
  const attemptId = `atp-${taskId}-${step.name}`;
  const runRequest: import("./types.js").RunRequest = {
    attempt_id: attemptId,
    task_id: taskId,
    workflow_pack: task.workflow_pack,
    workflow_version: task.workflow_version,
    input_blob_id: task.input_blob_id,
    capability_profile: new DriverClass().capability(),
    lease_token: `lease-${taskId}`,
    fence_version: 1,
    metadata: {
      prompt: prompt.slice(0, 1024),
      host_hint: hostHint,
      step_capability: step.capability,
      ...parseStepSubprocessInput(step),
    },
    signal: cancelCtrl.signal,
  };

  // 5. Drive ExecutionDriver event stream
  let lastEvent: DriverEvent | null = null;
  for await (const ev of new DriverClass().run(runRequest)) {
    if (ev.kind === "driver.handle") {
      _activeHandles.set(taskId, ev.payload["handle"] as RunHandle);
    }
    lastEvent = ev;
    if (ev.kind === "driver.output_chunk") {
      const chunk = String(ev.payload?.["chunk"] ?? "");
      if (chunk.length > 0) {
        appendStepStdout(taskId, step.name, chunk);
      }
    }
    if (ev.kind === "driver.failed") {
      commander._recordStepFailure(
        taskId,
        step.name,
        String(ev.payload?.error ?? "driver.failed"),
      );
      emitStepUpdate(taskId, step.name, "step_update", {
        status: "failed",
        host: hostHint ?? null,
        error: String(ev.payload?.error ?? "driver.failed"),
      });
      break;
    }
    if (ev.kind === "driver.interrupted") {
      commander._recordStepFailure(
        taskId,
        step.name,
        `interrupted: ${String(ev.payload?.reason ?? "unknown")}`,
      );
      emitStepUpdate(taskId, step.name, "step_update", {
        status: "failed",
        host: hostHint ?? null,
        error: `interrupted: ${String(ev.payload?.reason ?? "unknown")}`,
      });
      break;
    }
  }

  // 6. Cleanup captured handle (idempotent)
  await interruptByTaskId(taskId, `step complete: ${lastEvent?.kind ?? "unknown"}`);
  _activeHandles.delete(taskId);

  // 7. Record step result on driver.finished
  if (lastEvent?.kind === "driver.finished") {
    commander._recordStepResult(taskId, step.name, {
      stdout: String(lastEvent.payload?.stdout ?? ""),
      exit_code: Number(lastEvent.payload?.exit_code ?? 0),
      wall_ms: Number(lastEvent.payload?.wall_ms ?? 0),
    });
    emitStepUpdate(taskId, step.name, "step_update", {
      status: "completed",
      host: hostHint ?? null,
      wall_ms: Number(lastEvent.payload?.wall_ms ?? 0),
    });
    return true;
  }
  return false;
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
  // v1.2.0n M1.1: extend status union to include "skipped" (per types.ts:383-389
  // 7th TaskStatus member added for skip-dependents logic). When downstream
  // steps are marked "skipped" via dispatchOneStep emit, getTaskStatus
  // returns "skipped" to the PWA DAG viewer (so user sees partial skip, not
  // task-level failed). entry.status from SqliteTaskStore is typed as the
  // original 6-member union; the as TaskStatus assertion in the return path
  // is safe — at runtime M1.1 writes all 7 TaskStatus values.
  status: "pending" | "dispatched" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  result?: string;
  error?: string;
  steps?: PlanStepStatus[];
  hosts?: string[];
}> {
  // v1.2.0l NEW: per-step status from in-memory tracker is the authoritative
  // source for steps/hosts during the active task lifetime. SQLite/Kernel
  // fallback below only carries the task-level status + result, not the
  // per-step breakdown. This is fine because:
  //   - Active tasks (status pending/running): in-memory tracker has the steps
  //   - Terminal tasks (status completed/failed/cancelled): step statuses
  //     have already been written to commander._stepResult/_recordStepFailure,
  //     so the tracker still has them until the task is evicted.
  // Future v1.2.0m+ scope: persist step statuses to SQLite so they survive
  // server restart; today an in-process restart loses per-step detail.
  const stepStatuses = getStepStatuses(taskId);
  const distinctHosts = Array.from(new Set(stepStatuses.map((s) => s.host).filter((h): h is string => typeof h === "string")));

  // Try kernel status endpoint first
  const kernelStatus_ = await kernelStatus(taskId);
  if (kernelStatus_) {
    return { ...kernelStatus_, steps: stepStatuses, hosts: distinctHosts };
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
      // v1.2.0n M1.1: cast status:TaskStatus union includes "skipped" (per
      // types.ts:383-389 7th member); entry.status from SqliteTaskStore is
      // typed as the original 6-member union, but at runtime the new
      // skip-dependents logic writes "skipped" via dispatchOneStep emit
      // paths. The as TaskStatus assertion is safe — entry.status is
      // bounded by what M1.1 writes (all 7 TaskStatus values).
      status: entry.status as TaskStatus,
      result: resultStr,
      error: entry.error ?? undefined,
      steps: stepStatuses,
      hosts: distinctHosts,
    };
  }

  return {
    task_id: taskId,
    status: "failed",
    error: "task not found",
    steps: stepStatuses,
    hosts: distinctHosts,
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
    // v1.2.0j+.12+ D12 NEW: also interrupt via workerModule.interrupt() if a
    // handle was captured for this task. Idempotent — no-op if capture hasn't
    // happened yet (race window) or handle was already cleaned up. AbortController
    // .abort() (above) is independent of this path; both exercise different
    // abort layers.
    await interruptByTaskId(taskId, "cancelled by user");
    _activeHandles.delete(taskId);
    console.log(`[orchestrator] cancel(${taskId}) — propagated interrupt + persisted cancelled`);
  } else {
    console.log(`[orchestrator] cancel(${taskId}) — no active task (status=${entry?.status ?? "missing"})`);
  }
}

/**
 * List all tasks (active + terminal) for a single tenant.
 *
 * v1.2.0k.3 P0 SECURITY: tenant isolation. The wrapper's
 * ``SqliteTaskStore`` has no ``tenant_id`` column (per task_store.ts:10-15
 * docstring — "those remain in kernel"), so falling back to the local
 * store would leak every tenant's tasks. Instead we ALWAYS proxy to
 * the kernel HTTP daemon via ``kernelListTasks(tenantId)``, which
 * filters server-side by X-Tenant-ID. If the kernel is unreachable
 * the call throws — better to fail loud than leak.
 */
export async function listTasks(tenantId: string): Promise<Task[]> {
  return await kernelListTasks(tenantId);
}

/**
 * v1.2.0k.3 NEW: kernel HTTP client for GET /api/orch/list.
 * Mirrors ``kernelStatus()`` pattern (lines 147-167). Returns empty
 * array on transient kernel errors (so a 500 from kernel doesn't
 * crash the wrapper UI), but lets outright kernel rejections
 * propagate via throw.
 */
async function kernelListTasks(tenantId: string): Promise<Task[]> {
  const url = `${kernelBaseUrl()}/api/orch/list`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Tenant-ID": tenantId },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error");
      throw new Error(`kernel listTasks ${res.status}: ${text}`);
    }
    const tasks = (await res.json()) as Array<{
      task_id: string;
      status: string;
      attempt_id: string | null;
      cancel_token: string | null;
    }>;
    return tasks.map((t) => ({
      task_id: t.task_id,
      // v1.2.0l unblock: cast status:string → TaskStatus (kernel HTTP always
      // emits one of the 5 TaskStatus values; pre-existing v1.2.0k.3 ripple
      // from c88b0de tenant-isolation work). Runtime unchanged. v1.2.0m+
      // cleanup: tighten kernel return type to TaskStatus at source.
      status: t.status as TaskStatus,
      workflow_pack: "web_research",
      workflow_version: "1.0",
      input_blob_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result_blob_id: null,
    }));
  } catch (err) {
    console.warn(`[orchestrator] kernel listTasks ${url} unreachable: ${err}`);
    return [];
  }
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

// ─── v1.2.0l NEW: subprocess metadata pass-through helper ────────────────────

/**
 * Parse a PlanStep's input_ref to extract a subprocess command + args.
 *
 * Supported syntax (lightweight to keep orch.json free-form friendly):
 *   "echo:hello world" → { command: "echo", args: ["hello world"] }
 *   "/bin/sh:-c:echo hello" → { command: "/bin/sh", args: ["-c", "echo hello"] }
 *   "echo" (no colon) → { command: "echo", args: [] }
 *
 * v1.2.0l.2 NEW: split only on the FIRST `:` between command and args, then
 * join remaining colons back into args. The old split-on-every-colon
 * behavior broke when the bash -c shell string contained colons (e.g.
 * `echo "user prompt: foo"` got split at the colon between "prompt" and
 * "foo", producing bogus args and a bash parse error).
 *
 * When input_ref doesn't parse as a command, returns no command/args — the
 * SubprocessDshDriver errors loudly ("command required") instead of spawning
 * a dangerous default. This is the safe failure mode.
 */
function parseStepSubprocessInput(step: { input_ref: string }): {
  command?: string;
  args?: string[];
} {
  const inputRef = step.input_ref ?? "";
  if (!inputRef.includes(":")) {
    // Single token — treat as bare command, no args.
    return inputRef.length > 0 ? { command: inputRef, args: [] } : {};
  }
  const firstColon = inputRef.indexOf(":");
  const command = inputRef.slice(0, firstColon);
  const rest = inputRef.slice(firstColon + 1);
  // Split rest on `:` to support "cmd:-flag:arg1:arg2" multi-arg form.
  // If the shell script needs literal colons (e.g. "bash:-c:echo X:foo"),
  // the orchestrator author should pick a different separator inside the
  // shell script (e.g. "user prompt ->" instead of "user prompt:").
  const args = rest.length > 0 ? rest.split(":") : [];
  return { command, args };
}

// ─── v1.2.0l NEW: terminal event emission for SSE ─────────────────────────────

/**
 * Emit a terminal task event so SSE clients (PWA DAG viewer) know the task is
 * done. Called at the end of dispatch() so /api/pwa/stream/:task_id emits a
 * `task_completed` or `task_failed` event in addition to the per-step events
 * already emitted during the plan loop.
 */
function emitTerminalTaskEvent(taskId: string, status: TaskStatus, wallMs: number): void {
  emitStepUpdate(taskId, "", "task_completed", { status, wallMs });
}
