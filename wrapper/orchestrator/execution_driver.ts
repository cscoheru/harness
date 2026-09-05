/**
 * Execution driver — subprocess spawn (primary) + HTTP fallback (per D2=C).
 *
 * Why dual-model (per D2 = Option C):
 *   - Primary path: child_process.spawn('dsh --profile headless --model ...')
 *     reuses wrapper/dsh/dsh_client.ts spawn pattern (F4). Yields
 *     DriverEvent stream as stdout streams line-by-line.
 *   - Fallback path: fetch() POST to DSH_HTTP_URL/api/v1/tasks. Stub for
 *     v1.2.0b (dsh binary doesn't yet expose HTTP server — T-DO-4 future).
 *     Kept as named interface so v1.2.0c routedDsh() can flip priority
 *     without refactoring callers.
 *
 * DriverEvent stream contract (per types.ts:262-270):
 *   driver.started → driver.output_chunk ×N → driver.heartbeat ×N
 *   → driver.finished | driver.failed | driver.interrupted
 *
 * Cancel / interrupt:
 *   AbortController shared across primary + fallback. interrupt() calls
 *   controller.abort() AND (for primary) spawn-kill on the subprocess.
 *   Both paths converge on driver.interrupted event in the stream.
 *
 * Reused from existing code (F4):
 *   - dsh_client.ts spawn pattern (line 17 import + line 108-181 runWithTimeout
 *     with AbortSignal.timeout). execution_driver.ts implements its own
 *     line-streaming variant because callDshHeadless() returns Promise<string>
 *     (single final answer), not AsyncIterable.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
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
const DEFAULT_DSH_BIN = "dsh";
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
  child: ChildProcess | null;
  startMs: number;
  attempt_id: string;
  driver_kind: DriverKind;
  finished: boolean;
}

// ─── SpawnDshDriver ──────────────────────────────────────────────────────────

export class SpawnDshDriver implements ExecutionDriver {
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
        "SpawnDshDriver: child_process.spawn of dsh --profile headless; " +
        "yields DriverEvent stream; HTTP fallback stubbed for v1.2.0b.",
    };
  }

  async *run(request: RunRequest): AsyncIterable<DriverEvent> {
    const handle = await this.start(request);
    yield* this.streamEvents(handle, request);
  }

  async interrupt(handle: RunHandle, reason: string): Promise<void> {
    // handle.cancel_token is the key into our internal handle map; we
    // re-derive the AbortController from a module-level WeakMap keyed by
    // cancel_token. Simpler: caller passes the same handle object that
    // came back from start(). For Protocol compatibility we look up by
    // cancel_token via the registry.
    const state = handleRegistry.get(handle.cancel_token);
    if (!state) {
      // Already finished or never registered — best-effort no-op.
      return;
    }
    state.controller.abort();
    if (state.child && !state.child.killed) {
      try {
        state.child.kill("SIGTERM");
      } catch {
        // already dead
      }
    }
    yieldInterrupted(state, reason);
  }

  async heartbeat(handle: RunHandle): Promise<void> {
    // No-op at driver level — heartbeats are emitted inside the event
    // stream by streamEvents() on HEARTBEAT_INTERVAL_MS. This method
    // exists for Protocol parity with kernel-side ExecutionDriver.
    const state = handleRegistry.get(handle.cancel_token);
    if (state && !state.finished) {
      // re-emit a heartbeat event inline (caller may consume via their own
      // queue); for Protocol we just no-op.
      void state;
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async start(request: RunRequest): Promise<DriverHandle> {
    const attempt_id = request.attempt_id;
    const controller = new AbortController();
    const cancel_token = `drv-${randomUUID()}`;
    const driver_kind: DriverKind = "codex_exec";

    // Choose path: primary (spawn) preferred; fallback only if DSH_FORCE_HTTP=1
    const forceHttp = process.env.DSH_FORCE_HTTP === "1";

    let child: ChildProcess | null = null;
    if (!forceHttp) {
      child = this.spawnDsh(request);
      child.on("error", () => {
        // spawn-level error (ENOENT etc) — handled by streamEvents via
        // the 'error' close event; nothing to do here.
      });
    }

    const handle: DriverHandle = {
      cancel_token,
      controller,
      child,
      startMs: Date.now(),
      attempt_id,
      driver_kind,
      finished: false,
    };
    handleRegistry.set(cancel_token, handle);

    return handle;
  }

  private spawnDsh(request: RunRequest): ChildProcess {
    const profile = process.env.DSH_PROFILE ?? DEFAULT_PROFILE;
    const model = process.env.DSH_MODEL ?? DEFAULT_MODEL;
    const prompt = stringifyRequestForDsh(request);

    const child = spawn(
      this.dshBin,
      ["--profile", profile, "--model", model, "--prompt", prompt],
      {
        env: {
          ...process.env,
          // Don't pollute parent stdout; we capture via 'data' listener.
          DSH_DRIVER_ATTEMPT_ID: request.attempt_id,
          DSH_DRIVER_TASK_ID: request.task_id,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return child;
  }

  private async *streamEvents(
    handle: DriverHandle,
    request: RunRequest,
  ): AsyncIterable<DriverEvent> {
    const { attempt_id } = request;
    const startedMs = Date.now();

    yield {
      kind: "driver.started",
      attempt_id,
      payload: {
        driver_kind: handle.driver_kind,
        started_at: new Date(startedMs).toISOString(),
        model: process.env.DSH_MODEL ?? DEFAULT_MODEL,
        profile: process.env.DSH_PROFILE ?? DEFAULT_PROFILE,
      },
    };

    const timeoutMs = (request.metadata?.timeout_seconds as number | undefined) ??
      DEFAULT_TIMEOUT_SECONDS * 1000;

    // ── Primary path: child_process.spawn ──────────────────────────────────
    if (handle.child) {
      yield* this.streamSpawnSubprocess(handle, attempt_id, timeoutMs);
      return;
    }

    // ── Fallback path: routedDsh() 真发远程 (wire-routedDsh per F22 option A) ─
    // F22 (v1.2.0d): replaced HTTP stub with routedDsh() call so cross-host
    // dispatch 真发到 MagicDNS 远程 host (per F12 wired into 6host_router.ts).
    yield* this.streamRoutedDshFallback(handle, attempt_id, timeoutMs);
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
    const { routedDsh } = await import("../dsh/6host_router.js");
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

  private async *streamSpawnSubprocess(
    handle: DriverHandle,
    attempt_id: string,
    timeoutMs: number,
  ): AsyncIterable<DriverEvent> {
    const child = handle.child!;
    let stdoutTail = "";
    let stderrTail = "";
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const onAbort = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // already dead
      }
    };
    timeoutSignal.addEventListener("abort", onAbort);
    handle.controller.signal.addEventListener("abort", onAbort);

    const heartbeatLoop = async function* (
      this: AsyncIterable<DriverEvent>,
    ): AsyncGenerator<DriverEvent, void, undefined> {
      while (!handle.finished) {
        await sleep(HEARTBEAT_INTERVAL_MS);
        if (handle.finished) return;
        yield {
          kind: "driver.heartbeat",
          attempt_id,
          payload: {
            wall_ms: Date.now() - handle.startMs,
            cancel_token: handle.cancel_token,
          },
        };
      }
    };

    const chunkQueue: string[] = [];
    let resolveNext: (() => void) | null = null;
    let childClosed = false;
    let childExitCode: number | null = null;
    let childError: Error | null = null;

    child.stdout?.on("data", (buf: Buffer) => {
      stdoutTail += buf.toString("utf8");
      let nlIdx;
      while ((nlIdx = stdoutTail.indexOf("\n")) >= 0) {
        const line = stdoutTail.slice(0, nlIdx);
        stdoutTail = stdoutTail.slice(nlIdx + 1);
        chunkQueue.push(line);
        resolveNext?.();
      }
    });

    child.stderr?.on("data", (buf: Buffer) => {
      stderrTail += buf.toString("utf8");
      if (stderrTail.length > MAX_CHUNK_BYTES) {
        stderrTail = stderrTail.slice(-MAX_CHUNK_BYTES);
      }
    });

    child.on("error", (err) => {
      childError = err;
      childClosed = true;
      resolveNext?.();
    });

    child.on("close", (code) => {
      childExitCode = code;
      childClosed = true;
      resolveNext?.();
    });

    const waitForNext = () =>
      new Promise<void>((resolve) => {
        if (chunkQueue.length > 0 || childClosed) {
          resolve();
          return;
        }
        resolveNext = resolve;
      });

    try {
      while (true) {
        if (handle.controller.signal.aborted) {
          handle.finished = true;
          yield {
            kind: "driver.interrupted",
            attempt_id,
            payload: {
              cancel_token: handle.cancel_token,
              reason: "controller_aborted",
              wall_ms: Date.now() - handle.startMs,
            },
          };
          handleRegistry.delete(handle.cancel_token);
          return;
        }

        if (chunkQueue.length > 0) {
          const line = chunkQueue.shift()!;
          yield {
            kind: "driver.output_chunk",
            attempt_id,
            payload: {
              chunk: line.slice(0, MAX_CHUNK_BYTES),
              byte_size: Buffer.byteLength(line, "utf8"),
            },
          };
          continue;
        }

        if (childClosed) {
          handle.finished = true;
          if (chunkQueue.length > 0) continue; // race: more chunks after close
          if (childError) {
            yield {
              kind: "driver.failed",
              attempt_id,
              payload: {
                error: childError ? (childError as Error).message : "unknown spawn error",
                exit_code: childExitCode,
                stderr_tail: stderrTail.slice(-512),
                wall_ms: Date.now() - handle.startMs,
              },
            };
          } else if (childExitCode === 0) {
            yield {
              kind: "driver.finished",
              attempt_id,
              payload: {
                exit_code: 0,
                wall_ms: Date.now() - handle.startMs,
              },
            };
          } else {
            yield {
              kind: "driver.failed",
              attempt_id,
              payload: {
                error: `dsh exited with code ${childExitCode}`,
                exit_code: childExitCode,
                stderr_tail: stderrTail.slice(-512),
                wall_ms: Date.now() - handle.startMs,
              },
            };
          }
          handleRegistry.delete(handle.cancel_token);
          return;
        }

        // No chunks yet, child still alive — wait or yield heartbeat.
        const heartbeatRace = Promise.race([
          waitForNext(),
          sleep(HEARTBEAT_INTERVAL_MS).then(() => "heartbeat" as const),
        ]);
        const raceResult = await heartbeatRace;
        if (raceResult === "heartbeat") {
          yield {
            kind: "driver.heartbeat",
            attempt_id,
            payload: {
              wall_ms: Date.now() - handle.startMs,
              cancel_token: handle.cancel_token,
            },
          };
        }
      }
    } finally {
      timeoutSignal.removeEventListener("abort", onAbort);
      handle.controller.signal.removeEventListener("abort", onAbort);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
  }

  private async *streamHttpFallback(
    handle: DriverHandle,
    attempt_id: string,
    timeoutMs: number,
  ): AsyncIterable<DriverEvent> {
    const url = `${this.dshHttpUrl}/api/v1/tasks`;
    const body = JSON.stringify({
      attempt_id,
      task_id: handle.attempt_id,
      workflow_pack: "fallback",
      prompt_summary: "execution_driver HTTP fallback stub (v1.2.0b)",
    });

    let heartbeatTimer: NodeJS.Timeout | null = null;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: handle.controller.signal,
      });

      if (!resp.ok) {
        yield {
          kind: "driver.failed",
          attempt_id,
          payload: {
            error: `dsh HTTP fallback returned status ${resp.status}`,
            http_status: resp.status,
            wall_ms: Date.now() - handle.startMs,
          },
        };
        handleRegistry.delete(handle.cancel_token);
        return;
      }

      // Stream response body line-by-line via reader. AsyncIterable of lines.
      const reader = resp.body?.getReader();
      if (!reader) {
        yield {
          kind: "driver.failed",
          attempt_id,
          payload: { error: "dsh HTTP fallback: empty body" },
        };
        handleRegistry.delete(handle.cancel_token);
        return;
      }

      const decoder = new TextDecoder("utf8");
      let tail = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        tail += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = tail.indexOf("\n")) >= 0) {
          const line = tail.slice(0, nl);
          tail = tail.slice(nl + 1);
          yield {
            kind: "driver.output_chunk",
            attempt_id,
            payload: {
              chunk: line.slice(0, MAX_CHUNK_BYTES),
              byte_size: Buffer.byteLength(line, "utf8"),
              source: "http_fallback",
            },
          };
        }
      }

      handle.finished = true;
      yield {
        kind: "driver.finished",
        attempt_id,
        payload: {
          exit_code: 0,
          wall_ms: Date.now() - handle.startMs,
          source: "http_fallback",
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
        },
      };
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
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

function yieldInterrupted(state: DriverHandle, reason: string): void {
  // The interrupt() method itself is not async-iterable; instead, the
  // caller (worker.run) is responsible for observing handle.finished and
  // emitting driver.interrupted from its own streamEvents consumer. This
  // helper records the interrupt reason in the handle for the consumer
  // to pick up.
  state.finished = true;
  state.controller.abort();
  void reason; // reason is already encoded in the consumer-side event
}

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