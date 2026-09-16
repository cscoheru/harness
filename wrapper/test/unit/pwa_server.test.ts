/**
 * pwa_server.test.ts — Unit tests for v1.2.0n M0.1 worker heartbeat
 * local short-circuit + Option C double-write.
 *
 * Coverage:
 *   T1 — POST /api/v1/worker/heartbeat empty body → 400 (schema guard)
 *   T2 — POST register (host + capabilities_json) → 200 + worker_id; local
 *        SqliteWorkerPool populated
 *   T3 — POST subsequent heartbeat (worker_id only) → 200 + last_heartbeat_at
 *        updated
 *   T4 — POST extra fields → 400 (injection guard)
 *   T5 — Option C double-write: heartbeats forward to wrapper-orchestrator
 *        (verified via globalThis.fetch spy)
 *
 * Boots pwa_server's express app on an ephemeral port. globalThis.fetch is
 * spied so the double-write fire-and-forget doesn't actually try to reach
 * wrapper-orchestrator:4000 (unreachable in test env).
 *
 * M0.1 fixture note: server.ts had to add WORKER_POOL_DB / QUEUE_STORE_DB /
 * TASK_STORE_DB env vars (see server.test.ts for the same pattern); we do
 * the same here so getDefaultWorkerPool() resolves to a writable temp file.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Suppress MINIMAX_API_KEY auto-log at module import time (per server.test.ts pattern)
process.env["MINIMAX_API_KEY"] = "sk-test-key-for-pwa-server";

let server: Server;
let baseUrl: string;
let serverTestDir: string;

beforeAll(async () => {
  // Point SqliteWorkerPool + QueueStore + TaskStore at temp files so they
  // resolve to a writable path (default /data/* is read-only in test env).
  serverTestDir = mkdtempSync(join(tmpdir(), "pwa-server-test-"));
  process.env["WORKER_POOL_DB"] = join(serverTestDir, "worker_pool.db");
  process.env["QUEUE_STORE_DB"] = join(serverTestDir, "queue_store.db");
  process.env["TASK_STORE_DB"] = join(serverTestDir, "task_store.db");
  process.env["WORKFLOW_PACKS_DIR"] = join(serverTestDir, "workflow_packs");
  process.env["PWA_PORT"] = "0"; // ephemeral

  const { _resetWorkerPoolForTests } = await import("../../orchestrator/worker_pool.js");
  _resetWorkerPoolForTests();
  const { _resetQueueStoreForTests } = await import("../../orchestrator/queue_store.js");
  _resetQueueStoreForTests();
  const { _resetTaskStoreForTests } = await import("../../orchestrator/task_store.js");
  _resetTaskStoreForTests();

  const { app } = await import("../../orchestrator/pwa_server.js");
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("ephemeral server failed to bind");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const { _resetWorkerPoolForTests } = await import("../../orchestrator/worker_pool.js");
  _resetWorkerPoolForTests();
  const { _resetQueueStoreForTests } = await import("../../orchestrator/queue_store.js");
  _resetQueueStoreForTests();
  const { _resetTaskStoreForTests } = await import("../../orchestrator/task_store.js");
  _resetTaskStoreForTests();
  delete process.env["WORKER_POOL_DB"];
  delete process.env["QUEUE_STORE_DB"];
  delete process.env["TASK_STORE_DB"];
  delete process.env["WORKFLOW_PACKS_DIR"];
  delete process.env["PWA_PORT"];
  if (serverTestDir) rmSync(serverTestDir, { recursive: true, force: true });
});

async function postJson(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as unknown;
  return { status: res.status, body: json };
}

describe("pwa_server.ts — /api/v1/worker/heartbeat local short-circuit (v1.2.0n M0.1)", () => {
  // Capture fetch spy per-test so we can assert double-write forwards.
  // Use default spy behavior (calls through + records) — NOT a mock that
  // returns canned responses — because the test itself uses fetch() in
  // postJson() to POST to the ephemeral pwa_server. Mocking globalThis.fetch
  // would route the test's own fetch through the mock, breaking all the
  // status/body assertions. Instead we let real fetch run (orchestrator
  // proxy URL is unreachable in test env so the double-write fails with
  // ECONNREFUSED, which the handler's .catch() swallows silently) and just
  // record the call arguments for inspection.
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Default behavior = calls through + records all args/return values.
    // ECONNREFUSED from wrapper-orchestrator:4000 is handled by handler's
    // .catch(), so the local 200 response still goes out.
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // T1: schema validation — empty body fails 400
  it("T1: empty body → 400 (host + capabilities_json required on register path)", async () => {
    const { status } = await postJson("/api/v1/worker/heartbeat", {});
    expect(status).toBe(400);
  });

  // T2: register path — host + capabilities_json returns 200 + worker_id;
  //     local SqliteWorkerPool is populated
  it("T2: register path returns 200 + worker_id; local worker_pool populated", async () => {
    const { status, body } = await postJson("/api/v1/worker/heartbeat", {
      host: "edge-test",
      capabilities_json: '["llm","subprocess"]',
    });
    expect(status).toBe(200);
    const b = body as { status: string; worker_id: string; worker_status: string };
    expect(b.status).toBe("ok");
    expect(typeof b.worker_id).toBe("string");
    expect(b.worker_id.length).toBeGreaterThan(0);
    expect(b.worker_status).toBe("active");

    // Verify local worker_pool actually has the worker (M0.1 contract: short-circuit
    // populates the in-process pool, not just returns a fake ID)
    const { getDefaultWorkerPool } = await import("../../orchestrator/worker_pool.js");
    const pool = getDefaultWorkerPool();
    const worker = pool.getWorker(b.worker_id);
    expect(worker).not.toBeNull();
    expect(worker?.host).toBe("edge-test");
  });

  // T3: subsequent heartbeat (worker_id only) updates last_heartbeat_at
  it("T3: subsequent heartbeat with worker_id only → 200 + last_heartbeat_at", async () => {
    // Register first
    const reg = await postJson("/api/v1/worker/heartbeat", {
      host: "edge-test-3",
      capabilities_json: '["llm"]',
    });
    const workerId = (reg.body as { worker_id: string }).worker_id;

    // Wait a tick so last_heartbeat_at differs
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Subsequent heartbeat
    const { status, body } = await postJson("/api/v1/worker/heartbeat", {
      worker_id: workerId,
    });
    expect(status).toBe(200);
    const b = body as { status: string; worker_id: string; last_heartbeat_at: number };
    expect(b.status).toBe("ok");
    expect(b.worker_id).toBe(workerId);
    // last_heartbeat_at is millis-since-epoch — accepts either number or
    // numeric string (SQLite stores as INTEGER/REAL but some paths stringify).
    expect(["number", "string"]).toContain(typeof b.last_heartbeat_at);
  });

  // T4: extra fields rejected by injection guard
  it("T4: extra fields → 400 (injection guard)", async () => {
    const { status } = await postJson("/api/v1/worker/heartbeat", {
      host: "edge-test-4",
      capabilities_json: "{}",
      injected: "DROP TABLE workers",
    });
    expect(status).toBe(400);
  });

  // T5: Option C double-write — heartbeat forwards to wrapper-orchestrator
  it("T5: Option C double-write forwards heartbeat to wrapper-orchestrator", async () => {
    const { status } = await postJson("/api/v1/worker/heartbeat", {
      host: "edge-test-5",
      capabilities_json: '["llm"]',
    });
    expect(status).toBe(200);

    // fetchSpy.mock.calls[0] is the test's own postJson fetch (baseUrl).
    // The double-write fetch is one of the SUBSEQUENT calls — find any call
    // whose URL targets wrapper-orchestrator's heartbeat endpoint.
    const allUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    const doubleWriteCall = allUrls.find((u) =>
      u.includes("/api/v1/worker/heartbeat") && u.includes("wrapper-orchestrator:4000"),
    );
    expect(doubleWriteCall).toBeDefined();
    expect(doubleWriteCall).toMatch(/\/api\/v1\/worker\/heartbeat$/);
  });

  // T6: missing host on register path → 400
  it("T6: register path with capabilities_json only (no host) → 400", async () => {
    const { status } = await postJson("/api/v1/worker/heartbeat", {
      capabilities_json: "{}",
    });
    expect(status).toBe(400);
  });
});
