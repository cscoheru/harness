/**
 * T-V1.2.0L-QA-3: SSE status stream endpoint tests (v1.2.0l NEW).
 *
 * Validates the new GET /api/v1/status/:task_id/stream endpoint:
 *   - Returns text/event-stream Content-Type
 *   - Initial `snapshot` event with current step statuses
 *   - `step_update` events emitted on commander EventEmitter
 *   - `task_completed` event closes the stream
 *
 * Strategy (mirrors server.test.ts pattern):
 *   - Set WORKER_POOL_DB + QUEUE_STORE_DB to temp paths so SqliteWorkerPool
 *     can initialize without permission errors
 *   - Delete MINIMAX_API_KEY to force heuristic plan path (no real dsh call)
 *   - Use `vi.spyOn` on real orchestrator.getTaskStatus + commander._getStepEventEmitter
 *     (vitest shares module instances across the test graph)
 *   - Use native `node:http.request()` for SSE because undici's fetch
 *     aggressively terminates idle streaming responses
 *
 * @file test/unit/sse_status_stream.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createServer, type Server, request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

// Force the orchestrator to take the heuristic plan path (no real dsh call).
// Mirrors server.test.ts L39 (which deletes DEEPSEEK_API_KEY for the same reason).
delete process.env["MINIMAX_API_KEY"];
delete process.env["DEEPSEEK_API_KEY"];

// Real modules — we spy on individual exports
import * as orchestrator from "../../orchestrator/orchestrator.js";
import * as commanderModule from "../../orchestrator/commander.js";

import { app } from "../../server.js";

// Test-controlled EventEmitter shared with the SSE handler
const testEmitter = new EventEmitter();
testEmitter.setMaxListeners(50);

/**
 * Open an HTTP GET on the SSE endpoint and return a promise that resolves
 * with the first chunk of body data that matches `matcher`, OR resolves
 * with whatever has arrived after `timeoutMs`.
 *
 * Native http.request is used because undici's fetch aggressively
 * terminates idle streaming responses — it doesn't handle SSE's
 * lack of Content-Length and produces spurious "other side closed"
 * errors when the connection stays open but no data arrives.
 */
function getSseChunk(taskId: string, matcher: (chunk: string) => boolean, timeoutMs: number): Promise<{
  statusCode: number;
  contentType: string;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: `/api/v1/status/${taskId}/stream`,
        method: "GET",
      },
      (res) => {
        let body = "";
        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            req.destroy();
            resolve({ statusCode: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body });
          }
        }, timeoutMs);

        res.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
          if (!resolved && matcher(body)) {
            resolved = true;
            clearTimeout(timer);
            req.destroy();
            resolve({ statusCode: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body });
          }
        });

        res.on("end", () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve({ statusCode: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body });
          }
        });

        res.on("error", () => {
          /* ignore late errors after we've resolved */
        });
      },
    );
    req.on("error", (err) => reject(err));
    req.end();
  });
}

let server: Server;
let port: number;
let testDir: string;

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});

  // Point SqliteWorkerPool at a temp file (mirrors server.test.ts L53-55)
  testDir = mkdtempSync(join(tmpdir(), "sse-test-"));
  process.env["WORKER_POOL_DB"] = join(testDir, "worker_pool.db");
  process.env["QUEUE_STORE_DB"] = join(testDir, "queue_store.db");

  // Reset pool/store to pick up new env (mirrors server.test.ts L56-59)
  const { _resetWorkerPoolForTests } = await import("../../orchestrator/worker_pool.js");
  _resetWorkerPoolForTests();
  const { _resetQueueStoreForTests } = await import("../../orchestrator/queue_store.js");
  _resetQueueStoreForTests();

  // Spy on the exports server.ts reads via static namespace imports.
  // Vitest shares module instances across the test graph, so server.ts
  // sees the same spied functions.
  vi.spyOn(orchestrator, "getTaskStatus").mockResolvedValue({
    task_id: "test-task",
    status: "running",
    steps: [
      {
        name: "spawn-workers",
        capability: "subprocess_worker",
        status: "running",
        worker_id: "wrk-x",
        host: "edge1.ts.net",
        started_at: "2026-09-15T10:00:00Z",
        finished_at: null,
        stdout: "partial stdout",
        error: null,
        wallMs: 1234,
      },
    ],
    hosts: ["edge1.ts.net"],
  });
  vi.spyOn(commanderModule, "_getStepEventEmitter").mockReturnValue(testEmitter);

  // Boot ephemeral HTTP server (mirrors server.test.ts L62-65)
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  port = (server.address() as AddressInfo).port;

  testEmitter.removeAllListeners();
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    server.close(() => resolve());
  });
  testEmitter.removeAllListeners();
  if (testDir) rmSync(testDir, { recursive: true, force: true });
  delete process.env["WORKER_POOL_DB"];
  delete process.env["QUEUE_STORE_DB"];
  vi.restoreAllMocks();
});

describe("GET /api/v1/status/:task_id/stream (v1.2.0l NEW SSE)", () => {
  it("returns text/event-stream Content-Type with status 200", async () => {
    const { statusCode, contentType } = await getSseChunk(
      "test-task-1",
      () => true,
      1500,
    );
    expect(statusCode).toBe(200);
    expect(contentType).toMatch(/text\/event-stream/);
  });

  it("emits an initial snapshot event with current step statuses", async () => {
    // Match on the full event block so we capture the data line before
    // req.destroy() cuts the connection.
    const { body } = await getSseChunk(
      "test-task-2",
      (b) => /event: snapshot\ndata: \{[^]*\}\n\n/.test(b),
      2000,
    );
    expect(body).toMatch(/event: snapshot/);
    expect(body).toMatch(/spawn-workers/);
    expect(body).toMatch(/edge1\.ts\.net/);
  });

  it("forwards step_update events from the commander EventEmitter", async () => {
    setTimeout(() => {
      testEmitter.emit("task:test-task-3", {
        step: "spawn-workers",
        kind: "step_update",
        status: "completed",
        host: "edge1.ts.net",
        ts: new Date().toISOString(),
      });
    }, 30);

    // Match on the full event block so we capture the data line before
    // req.destroy() cuts the connection.
    const { body } = await getSseChunk(
      "test-task-3",
      (b) => /event: step_update\ndata: \{[^]*\}\n\n/.test(b),
      2000,
    );
    expect(body).toMatch(/event: step_update/);
    expect(body).toMatch(/spawn-workers/);
  });

  it("closes stream on task_completed event", async () => {
    setTimeout(() => {
      testEmitter.emit("task:test-task-4", {
        step: "",
        kind: "task_completed",
        status: "completed",
        wallMs: 5000,
        ts: new Date().toISOString(),
      });
    }, 30);

    // Match on the full event block (event + data lines + terminating \n\n)
    // so we capture the payload before req.destroy() cuts the connection.
    const { body } = await getSseChunk(
      "test-task-4",
      (b) => /event: task_completed\ndata: \{[^]*\}\n\n/.test(b),
      2000,
    );
    expect(body).toMatch(/event: task_completed/);
    expect(body).toMatch(/"status":"completed"/);
  });

  it("returns 400 when task_id param is missing", async () => {
    const code = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, path: "/api/v1/status//stream", method: "GET" },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect([400, 404]).toContain(code);
  });
});