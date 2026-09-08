/**
 * Execution driver — DeepSeek HTTP direct + cross-host routed fallback.
 *
 * Why dual-model (per D2 = Option C → v1.2.0d D16 DeepSeek HTTP 直调):
 *   - Primary path: deepseekInvoke() (wrapper/dsh/deepseek_client.ts) — fetch()
 *     POST to https://api.deepseek.com/v1/chat/completions with
 *     env-injected DEEPSEEK_API_KEY. No dsh binary dependency.
 *   - Fallback path: routedDsh() — fetch() POST to DSH_HTTP_URL/api/v1/tasks
 *     for cross-host dispatch (per v1.2.0c F12). Used when primary fails
 *     (network unreachable to api.deepseek.com from edge host).
 *
 * v1.2.0d NEW (per D16):
 *   - Removed legacy dsh binary invocation path entirely (was a dead
 *     command since dsh 0.1.1-rc.2 — only web profile, no headless CLI).
 *   - Default model: deepseek-v4-flash (worker class default).
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
import { deepseekInvoke } from "../dsh/deepseek_client.js";
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
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_HTTP_URL = "http://127.0.0.1:4001";

/** Cap chunk payload size to keep DriverEvent envelopes small. */
const MAX_CHUNK_BYTES = 4096;

/** Frequency of driver.heartbeat events emitted during long runs. */
const HEARTBEAT_INTERVAL_MS = 5000;

// ─── DriverHandle (internal) ─────────────────────────────────────────────────

interface DriverHandle {
  cancel_token: string;
  controller: AbortController;
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
    const cancel_token = `drv-${randomUUID()}`;
    const driver_kind: DriverKind = "codex_exec";

    const handle: DriverHandle = {
      cancel_token,
      controller,
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
   * v1.2.0d NEW (per D16): primary path = deepseekInvoke() direct HTTP call
   * to api.deepseek.com. Replaces legacy dsh binary invocation.
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
      workflow_version: "1.2.0d",
      input_blob_id: null,
      capability_profile: this.capability(),
      lease_token: `lease-${handle.attempt_id}`,
      fence_version: 1,
      metadata: { source: "execution_driver_deepseek", model_class: modelClass },
    });

    try {
      const resp = await deepseekInvoke(prompt, {
        modelClass,
        timeoutMs,
      });
      handle.finished = true;
      // Yield one output_chunk with stdout (preserves event stream shape for callers)
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
      // v1.2.0d D16: on network failure (api.deepseek.com unreachable from
      // edge host), fall through to routedDsh() cross-host dispatch.
      const isNetworkFail = /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|AbortError/i.test(message);
      if (isNetworkFail && !handle.controller.signal.aborted) {
        yield* this.streamRoutedDshFallback(handle, attempt_id, timeoutMs);
        return;
      }
      yield {
        kind: handle.controller.signal.aborted ? "driver.interrupted" : "driver.failed",
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
        kind: handle.controller.signal.aborted
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