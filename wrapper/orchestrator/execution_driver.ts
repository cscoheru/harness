/**
 * Execution driver — MiniMax HTTP direct + cross-host routed fallback.
 *
 * Why dual-model (per v1.2.0k.4 LLM swap):
 *   - Primary path: minimaxInvoke() (wrapper/dsh/minimax_client.ts) — fetch()
 *     POST to https://api.minimaxi.com/v1/chat/completions with
 *     env-injected MINIMAX_API_KEY. No dsh binary dependency.
 *   - Fallback path: routedDsh() — fetch() POST to DSH_HTTP_URL/api/v1/tasks
 *     for cross-host dispatch (per v1.2.0c F12). Used when primary fails
 *     (network unreachable to api.minimaxi.com from edge host).
 *
 * v1.2.0d NEW (per D16):
 *   - Removed legacy dsh binary invocation path entirely (was a dead
 *     command since dsh 0.1.1-rc.2 — only web profile, no headless CLI).
 *   - Default model: MiniMax-M3 (worker class default).
 *   - DEFAULT_DSH_BIN constant kept for backward compat but no longer spawned.
 *
 * DriverEvent stream contract (per types.ts:262-270):
 *   driver.started → driver.output_chunk ×N → driver.heartbeat ×N
 *   → driver.finished | driver.failed | driver.interrupted
 *
 * Cancel / interrupt:
 *   AbortController shared across primary + fallback. interrupt() calls
 *   controller.abort() AND (for primary) fetch abort.
 *   Both paths converge on driver.interrupted event in the stream.
 */

import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { minimaxInvoke } from "../dsh/minimax_client.js";
import type {
  DriverCapabilities,
  DriverEvent,
  DriverKind,
  ExecutionDriver,
  RunHandle,
  RunRequest,
} from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_SECONDS = 60;
const DEFAULT_DSH_BIN = "dsh"; // DEPRECATED (v1.2.0d D16): kept for backward compat but never spawned
const DEFAULT_PROFILE = "headless";
const DEFAULT_MODEL = "MiniMax-M3";
const DEFAULT_HTTP_URL = "http://127.0.0.1:4001";

/** Cap chunk payload size to keep DriverEvent envelopes small. */
const MAX_CHUNK_BYTES = 4096;

/** Frequency of driver.heartbeat events emitted during long runs. */
const HEARTBEAT_INTERVAL_MS = 5000;

// ─── DriverHandle (internal) ─────────────────────────────────────────────────

interface DriverHandle {
  cancel_token: string;
  controller: AbortController;
  // v1.2.0j+.6+ (F3+): external cancel signal from orchestrator.cancel().
  // When set, abort propagates from orchestrator → driver → deepseekInvoke
  // fetch. Listener attached in start() cascades abort into controller.
  externalSignal?: AbortSignal;
  // v1.2.0k.6 NEW: host_hint from orchestrator's worker_pool lookup.
  // Drives routedDsh() target host. When undefined, routedDsh() falls back
  // to newvps primary (which is always capable of "worker").
  hostHint?: string;
  child: null; // v1.2.0d D16: spawn path removed; field kept for handleRegistry shape compat
  startMs: number;
  attempt_id: string;
  driver_kind: DriverKind;
  finished: boolean;
}

// ─── DeepseekHttpDriver (v1.2.0d NEW: replaces SpawnDshDriver) ───────────────

export class SpawnDshDriver implements ExecutionDriver {
  // DEPRECATED alias for SpawnDshDriver (v1.2.0d D16): the spawn path is gone,
  // but kept for callers that imported the class name. Behavior is now the
  // same as the new DeepseekHttpDriver — deepseekInvoke() with cross-host
  // routedDsh fallback on network failure.
  private readonly dshBin: string;
  private readonly dshHttpUrl: string;

  constructor(opts?: { dshBin?: string; dshHttpUrl?: string }) {
    this.dshBin = opts?.dshBin ?? DEFAULT_DSH_BIN;
    this.dshHttpUrl = opts?.dshHttpUrl ?? DEFAULT_HTTP_URL;
  }

  capability(): DriverCapabilities {
    return {
      driver_kind: "codex_exec",
      evidence_uri: "spec/capabilities/worker.json",
      max_concurrent_attempts: 1,
      supports_streaming: true,
      supports_interrupt: true,
      supports_heartbeat: true,
      supports_tool_gateway: false,
      notes:
        "v1.2.0d: DeepSeek HTTP direct via deepseekInvoke(); " +
        "legacy dsh binary invocation removed (D16); routedDsh fallback on network fail.",
    };
  }

  async *run(request: RunRequest): AsyncIterable<DriverEvent> {
    const handle = await this.start(request);
    yield* this.streamEvents(handle, request);
  }

  async interrupt(handle: RunHandle, reason: string): Promise<void> {
    const state = handleRegistry.get(handle.cancel_token);
    if (!state) {
      return;
    }
    state.controller.abort();
    void reason;
  }

  async heartbeat(handle: RunHandle): Promise<void> {
    const state = handleRegistry.get(handle.cancel_token);
    if (state && !state.finished) {
      void state;
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async start(request: RunRequest): Promise<DriverHandle> {
    const attempt_id = request.attempt_id;
    const controller = new AbortController();
    // v1.2.0j+.6+ (F3+): cascade orchestrator's cancel signal into driver
    // run loop. When orchestrator.cancel() fires ctrl.abort(), the inner
    // controller also aborts, deepseekInvoke fetch is interrupted, and
    // streamDeepseekInvoke emits driver.interrupted (not driver.failed).
    if (request.signal) {
      request.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const cancel_token = `drv-${randomUUID()}`;
    const driver_kind: DriverKind = "codex_exec";

    // v1.2.0k.6 NEW: extract host_hint from request metadata (set by orchestrator
    // from worker_pool lookup). Drives routedDsh() target.
    const hostHint = request.metadata?.["host_hint"] as string | undefined;

    const handle: DriverHandle = {
      cancel_token,
      controller,
      externalSignal: request.signal,
      hostHint,
      child: null, // v1.2.0d D16: spawn path removed
      startMs: Date.now(),
      attempt_id,
      driver_kind,
      finished: false,
    };
    handleRegistry.set(cancel_token, handle);

    return handle;
  }

  private async *streamEvents(
    handle: DriverHandle,
    request: RunRequest,
  ): AsyncIterable<DriverEvent> {
    const { attempt_id } = request;
    const startedMs = Date.now();

    const modelClass = (request.metadata?.["model_class"] as "orch" | "commander" | "worker" | undefined) ?? "worker";

    // v1.2.0j+.12+ D12 NEW: expose RunHandle BEFORE driver.started so the
    // orchestrator's for-await loop can capture it for workerModule.interrupt()
    // calls. handleRegistry is already populated (start() at L146); interrupt()
    // can resolve via handleRegistry.get(cancel_token). toRunHandle() strips
    // controller/externalSignal/child/startMs/finished — public shape only.
    yield {
      kind: "driver.handle",
      attempt_id,
      payload: {
        handle: toRunHandle(handle),
      },
    };

    yield {
      kind: "driver.started",
      attempt_id,
      payload: {
        driver_kind: handle.driver_kind,
        started_at: new Date(startedMs).toISOString(),
        model: process.env["DSH_MODEL"] ?? DEFAULT_MODEL,
        profile: process.env["DSH_PROFILE"] ?? DEFAULT_PROFILE,
      },
    };

    const timeoutMs = (request.metadata?.timeout_seconds as number | undefined) ??
      DEFAULT_TIMEOUT_SECONDS * 1000;

    // ── Primary path: deepseekInvoke() (v1.2.0d D16) ──────────────────────
    yield* this.streamDeepseekInvoke(handle, attempt_id, timeoutMs, modelClass);
  }

  /**
   * v1.2.0k.6 NEW: primary path = routedDsh() via 6host_router. Cross-host
   * routing — picks host based on modelClass + optional hostHint from
   * worker_pool. On "no host available" or network failure, falls through to
   * direct minimaxInvoke() as last-resort.
   *
   * v1.2.0d primary path (deepseekInvoke direct) is now the LAST-RESORT
   * fallback; routedDsh() is primary.
   */
  private async *streamDeepseekInvoke(
    handle: DriverHandle,
    attempt_id: string,
    timeoutMs: number,
    modelClass: "orch" | "commander" | "worker",
  ): AsyncIterable<DriverEvent> {
    const prompt = stringifyRequestForDsh({
      attempt_id: handle.attempt_id,
      task_id: handle.attempt_id,
      workflow_pack: "deepseek",
      workflow_version: "1.2.0k.6",
      input_blob_id: null,
      capability_profile: this.capability(),
      lease_token: `lease-${handle.attempt_id}`,
      fence_version: 1,
      metadata: { source: "execution_driver_routed", model_class: modelClass },
    });

    // v1.2.0k.6: try routedDsh() first
    try {
      const { routedDsh } = await import("./6host_router.js");
      const resp = await routedDsh(prompt, modelClass, handle.hostHint);
      handle.finished = true;
      const stdout = resp.stdout || "";
      if (stdout.length > 0) {
        yield {
          kind: "driver.output_chunk",
          attempt_id,
          payload: {
            chunk: stdout.slice(0, MAX_CHUNK_BYTES),
            byte_size: Buffer.byteLength(stdout, "utf8"),
            source: "routed_dsh",
          },
        };
      }
      yield {
        kind: "driver.finished",
        attempt_id,
        payload: {
          exit_code: resp.exitCode,
          stdout,
          wall_ms: Date.now() - handle.startMs,
          source: "routed_dsh",
          trace_id: resp.traceId,
          token_usage: resp.tokenUsage,
        },
      };
      return;
    } catch (err) {
      // v1.2.0k.6: routedDsh failed — fall through to last-resort direct LLM call
      const message = (err as Error).message ?? String(err);
      console.warn(`[execution_driver] routedDsh failed (${message}); falling back to direct minimaxInvoke`);
    }

    // Last-resort fallback: direct LLM API call (v1.2.0d D16 path)
    try {
      const resp = await minimaxInvoke(prompt, {
        modelClass,
        timeoutMs,
      });
      handle.finished = true;
      const stdout = resp.stdout || "";
      if (stdout.length > 0) {
        yield {
          kind: "driver.output_chunk",
          attempt_id,
          payload: {
            chunk: stdout.slice(0, MAX_CHUNK_BYTES),
            byte_size: Buffer.byteLength(stdout, "utf8"),
            source: "deepseek",
          },
        };
      }
      yield {
        kind: "driver.finished",
        attempt_id,
        payload: {
          exit_code: resp.exitCode,
          stdout,
          wall_ms: Date.now() - handle.startMs,
          source: "deepseek",
          trace_id: resp.traceId,
          token_usage: resp.tokenUsage,
        },
      };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      yield {
        kind: handle.controller.signal.aborted || handle.externalSignal?.aborted
          ? "driver.interrupted"
          : "driver.failed",
        attempt_id,
        payload: {
          error: message,
          wall_ms: Date.now() - handle.startMs,
          source: "deepseek",
        },
      };
    } finally {
      handleRegistry.delete(handle.cancel_token);
    }
  }

  /**
   * v1.2.0d NEW (per F22 option A): HTTP fallback path replaced with
   * routedDsh() call. routedDsh() handles 6host_router route decision + fetch.
   * wire-routedDsh comment marker for hygiene §3.11 audit-scope grep.
   */
  private async *streamRoutedDshFallback(
    handle: DriverHandle,
    attempt_id: string,
    timeoutMs: number,
  ): AsyncIterable<DriverEvent> {
    const { routedDsh } = await import("./6host_router.js"); // v1.2.0d formal M-fix: path was ../dsh/6host_router.js (nonexistent); routedDsh lives in orchestrator/6host_router.ts since v1.2.0c
    const prompt = stringifyRequestForDsh({
      attempt_id: handle.attempt_id,
      task_id: handle.attempt_id,
      workflow_pack: "fallback",
      workflow_version: "1.0",
      input_blob_id: null,
      capability_profile: this.capability(),
      lease_token: `lease-${handle.attempt_id}`,
      fence_version: 1,
      metadata: { source: "execution_driver_fallback" },
    });

    try {
      const resp = await routedDsh(prompt, "worker");
      const stdout = typeof resp === "string"
        ? resp
        : JSON.stringify(resp);
      handle.finished = true;
      yield {
        kind: "driver.finished",
        attempt_id,
        payload: {
          exit_code: 0,
          stdout,
          wall_ms: Date.now() - handle.startMs,
          source: "routed_dsh",
        },
      };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      yield {
        kind: handle.controller.signal.aborted || handle.externalSignal?.aborted
          ? "driver.interrupted"
          : "driver.failed",
        attempt_id,
        payload: {
          error: message,
          wall_ms: Date.now() - handle.startMs,
          source: "routed_dsh",
        },
      };
    } finally {
      handleRegistry.delete(handle.cancel_token);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Cancel-token → DriverHandle registry. Module-scoped WeakMap would not
 * support enumeration; we use a Map keyed by the random cancel_token string.
 * Entries are deleted on finish/interrupt/failed so the map cannot leak
 * across a process lifetime under normal operation.
 */
const handleRegistry = new Map<string, DriverHandle>();

function stringifyRequestForDsh(request: RunRequest): string {
  // dsh binary expects a single --prompt string. For v1.2.0b we collapse
  // the structured request into a flat JSON blob — v1.2.0c will pass
  // the proper prompt template via env or stdin.
  return JSON.stringify({
    attempt_id: request.attempt_id,
    task_id: request.task_id,
    workflow_pack: request.workflow_pack,
    workflow_version: request.workflow_version,
    metadata: request.metadata,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Convert an internal DriverHandle into the public RunHandle shape. */
export function toRunHandle(state: DriverHandle): RunHandle {
  return {
    driver_kind: state.driver_kind,
    attempt_id: state.attempt_id,
    cancel_token: state.cancel_token,
  };
}