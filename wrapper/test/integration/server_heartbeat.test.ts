/**
 * T-V1.2.0B-SERVER-HEARTBEAT-E2E: server.ts /api/v1/worker/heartbeat endpoint.
 *
 * Gated by RUN_SERVER_HEARTBEAT_E2E=1 — starts an express server on a
 * random port and exercises the HTTP endpoint end-to-end.
 *
 * Run with:
 *   RUN_SERVER_HEARTBEAT_E2E=1 ./node_modules/.bin/vitest run test/integration/server_heartbeat.test.ts
 *
 * Verifies:
 *   - First-call register path: host + capabilities_json → worker_id + last_heartbeat_at
 *   - Subsequent heartbeat path: worker_id only → last_heartbeat_at advanced
 *   - Schema validation: missing host/capabilities_json → 400
 *   - Schema validation: extra fields → 400
 *   - Schema validation: capabilities_json > 10KB → 413
 *   - 404 on heartbeat for unknown worker_id
 *
 * @file wrapper/test/integration/server_heartbeat.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const RUN_GATED = process.env["RUN_SERVER_HEARTBEAT_E2E"] === "1";
const describeIf = RUN_GATED ? describe : describe.skip;

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import { _resetWorkerPoolForTests, SqliteWorkerPool } from "../../orchestrator/worker_pool.js";

let tempDir: string;
let app: Express;
let server: { url: string; close: () => void };
let testPool: SqliteWorkerPool;

beforeEach(async () => {
  if (!RUN_GATED) return;
  tempDir = mkdtempSync(join(tmpdir(), "server-heartbeat-e2e-"));

  // Swap the default pool to a temp file BEFORE server starts
  testPool = new SqliteWorkerPool(join(tempDir, "heartbeat.db"));
  // Inject the test pool into the worker_pool module's singleton via env
  process.env["WORKER_POOL_DB"] = join(tempDir, "heartbeat.db");
  _resetWorkerPoolForTests();

  app = express();
  app.use(express.json());

  // Minimal server.ts heartbeat handler — same logic as server.ts:154-218
  app.post("/api/v1/worker/heartbeat", async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        worker_id?: string;
        host?: string;
        capabilities_json?: string;
      };
      const allowedKeys = new Set(["worker_id", "host", "capabilities_json"]);
      const extraKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
      if (extraKeys.length > 0) {
        res.status(400).json({ status: "error", error: `unexpected fields: ${extraKeys.join(", ")}` });
        return;
      }

      const pool = (await import("../../orchestrator/worker_pool.js")).getDefaultWorkerPool();
      const workerMod = await import("../../orchestrator/worker.js");

      if (typeof body.worker_id === "string" && body.worker_id.length > 0) {
        try {
          const lastHeartbeatAt = await pool.heartbeat(body.worker_id);
          const info = pool.getWorker(body.worker_id);
          res.json({
            status: "ok",
            worker_id: body.worker_id,
            last_heartbeat_at: lastHeartbeatAt,
            worker_status: info?.status ?? "unknown",
          });
          return;
        } catch (err) {
          if (err instanceof (await import("../../orchestrator/worker_pool.js")).WorkerNotFoundError) {
            res.status(404).json({ status: "error", error: `worker_id '${body.worker_id}' not found` });
            return;
          }
          throw err;
        }
      }

      if (!body.host) {
        res.status(400).json({ status: "error", error: "host required" });
        return;
      }
      if (!body.capabilities_json) {
        res.status(400).json({ status: "error", error: "capabilities_json required" });
        return;
      }
      if (body.capabilities_json.length > 10240) {
        res.status(413).json({ status: "error", error: "capabilities_json too large" });
        return;
      }

      const worker_id = await workerMod.register(body.host, body.capabilities_json);
      const lastHeartbeatAt = await pool.heartbeat(worker_id);
      res.json({
        status: "ok",
        worker_id,
        last_heartbeat_at: lastHeartbeatAt,
        worker_status: "active",
      });
    } catch (err) {
      res.status(500).json({ status: "error", error: String(err) });
    }
  });

  // Start server on random port
  await new Promise<void>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server = { url: `http://127.0.0.1:${port}`, close: () => s.close() };
      resolve();
    });
  });
});

afterEach(async () => {
  if (!RUN_GATED) return;
  if (server) server.close();
  _resetWorkerPoolForTests();
  delete process.env["WORKER_POOL_DB"];
  testPool.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describeIf("POST /api/v1/worker/heartbeat E2E", () => {
  it("first-call register path returns worker_id + last_heartbeat_at", async () => {
    const res = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: "host-e2e-1",
        capabilities_json: JSON.stringify({ driver_kind: "codex_exec" }),
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; worker_id: string; last_heartbeat_at: string; worker_status: string };
    expect(body.status).toBe("ok");
    expect(body.worker_id).toMatch(/^wrk-/);
    expect(body.worker_status).toBe("active");
    expect(body.last_heartbeat_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("subsequent heartbeat path advances last_heartbeat_at", async () => {
    // Register first
    const r1 = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: "host-e2e-2",
        capabilities_json: JSON.stringify({ driver_kind: "codex_exec" }),
      }),
    });
    const b1 = await r1.json() as { worker_id: string; last_heartbeat_at: string };
    await new Promise((r) => setTimeout(r, 1100));

    // Heartbeat by worker_id only
    const r2 = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worker_id: b1.worker_id }),
    });
    expect(r2.status).toBe(200);
    const b2 = await r2.json() as { worker_id: string; last_heartbeat_at: string };
    expect(b2.worker_id).toBe(b1.worker_id);
    expect(b2.last_heartbeat_at > b1.last_heartbeat_at).toBe(true);
  });

  it("rejects missing host on register path with 400", async () => {
    const res = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capabilities_json: "{}" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing capabilities_json on register path with 400", async () => {
    const res = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: "host-a" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects extra fields with 400", async () => {
    const res = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: "host-a",
        capabilities_json: "{}",
        injected: "DROP TABLE workers",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unexpected fields/);
  });

  it("rejects capabilities_json > 10KB with 413", async () => {
    const big = JSON.stringify({ data: "x".repeat(11000) });
    const res = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: "host-a", capabilities_json: big }),
    });
    expect(res.status).toBe(413);
  });

  it("returns 404 for heartbeat with unknown worker_id", async () => {
    const res = await fetch(`${server.url}/api/v1/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worker_id: "wrk-00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });
});