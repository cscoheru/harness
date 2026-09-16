/**
 * T-V1.2.0K-2: kernel HTTP daemon integration test (real FastAPI subprocess).
 *
 * Per ADR 0012 Decision b — spawn Python uvicorn server in subprocess,
 * hit 5 routes via fetch, verify SSE stream + JSON shapes.
 *
 * Coverage (6 tests):
 *   T1 — GET /api/orch/healthz returns {status: ok, version: 1.2.0k, ...}
 *   T2 — POST /api/orch/invoke returns SSE stream with driver.handle + driver.finished
 *   T3 — POST /api/orch/invoke captures driver.handle FIRST (L48 pattern)
 *   T4 — GET /api/orch/list returns non-empty after T2
 *   T5 — GET /api/orch/status/{task_id} returns task snapshot post-invoke
 *   T6 — POST /api/orch/cancel/{task_id} → 404 for unknown task_id
 *
 * Pattern: subprocess spawns kernel server on port 4002 (avoid clash with
 * local 4001 dev). afterEach kills subprocess. Uses native fetch (Node 18+).
 *
 * @file wrapper/test/integration/kernel_http_e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const KERNEL_PORT = 4002;
const KERNEL_BASE = `http://localhost:${KERNEL_PORT}`;
const SERVER_STARTUP_TIMEOUT_MS = 5000;

let serverProcess: ChildProcess | null = null;
let serverReady = false;

async function waitForServerReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${KERNEL_BASE}/api/orch/healthz`);
      if (res.ok) {
        const body = (await res.json()) as { status: string };
        if (body.status === "ok") return;
      }
    } catch {
      // not ready yet
    }
    await sleep(200);
  }
  throw new Error(`kernel server failed to start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  // Spawn kernel HTTP daemon on port 4002 from project root
  serverProcess = spawn(
    "python3",
    ["-m", "harness", "server", "--port", String(KERNEL_PORT)],
    {
      cwd: "/Users/kjonekong/projects/fish-harness",
      env: { ...process.env, PYTHONPATH: "/Users/kjonekong/projects/fish-harness" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  serverProcess.on("error", (err) => {
    console.error("[kernel-http-e2e] subprocess error:", err);
  });
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    console.error("[kernel-http-e2e] stderr:", chunk.toString());
  });
  await waitForServerReady(SERVER_STARTUP_TIMEOUT_MS);
  serverReady = true;
});

afterAll(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (serverProcess && serverProcess.exitCode === null) {
          serverProcess.kill("SIGKILL");
        }
        resolve();
      }, 3000);
      serverProcess!.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  serverProcess = null;
  serverReady = false;
});

function uniqueTaskId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

interface SseEvent {
  event: string;
  data: string;
}

async function readSseStream(res: Response): Promise<SseEvent[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const events: SseEvent[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // Parse SSE blocks (event: X\ndata: Y\n\n)
    let sepIdx: number;
    while ((sepIdx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, sepIdx);
      buf = buf.slice(sepIdx + 2);
      let event = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6).trim();
      }
      if (event) events.push({ event, data });
    }
  }
  return events;
}

// ─── T1: healthz ────────────────────────────────────────────────────────
describe("T1: GET /api/orch/healthz", () => {
  it("returns {status: ok, version: 1.2.0k, kernel_pid, active_tasks}", async () => {
    expect(serverReady).toBe(true);
    const res = await fetch(`${KERNEL_BASE}/api/orch/healthz`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["status"]).toBe("ok");
    expect(body["version"]).toBe("1.2.0k.3");
    expect(typeof body["kernel_pid"]).toBe("number");
    expect(typeof body["active_tasks"]).toBe("number");
  });
});

// ─── T2: invoke SSE stream ──────────────────────────────────────────────
describe("T2: POST /api/orch/invoke SSE stream", () => {
  it("returns SSE with driver.handle + driver.started + driver.finished events", async () => {
    const taskId = uniqueTaskId("t2-invoke");
    const res = await fetch(`${KERNEL_BASE}/api/orch/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        workflow_pack: "web_research",
        workflow_version: "1.0.0",
        capability_profile: { driver_kind: "codex_exec" },
        lease_token: "lease-t2",
        fence_version: 1,
        prompt: "hello world",
        model_class: "worker",
        host_id: "e2e-host",
        // M0.3 fix: v1.2.0k.3 P0 tenant isolation — InvokeRequest schema
        // requires tenant_id (harness/runtime/orch_http.py:64). Without
        // it, Pydantic returns 422 and invoke fails before SSE stream starts.
        tenant_id: "e2e-tenant",
      }),
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await readSseStream(res);
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain("driver.handle");
    expect(eventNames).toContain("driver.started");
    expect(eventNames).toContain("driver.finished");
  });
});

// ─── T3: driver.handle is FIRST event (L48 pattern) ────────────────────
describe("T3: driver.handle is FIRST event (L48 hidden_handle_pattern)", () => {
  it("yields driver.handle as events[0]", async () => {
    const taskId = uniqueTaskId("t3-handle-first");
    const res = await fetch(`${KERNEL_BASE}/api/orch/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        workflow_pack: "web_research",
        workflow_version: "1.0.0",
        capability_profile: { driver_kind: "codex_exec" },
        lease_token: "lease-t3",
        fence_version: 1,
        prompt: "test L48",
        model_class: "worker",
        host_id: "e2e-host",
        tenant_id: "e2e-tenant",
      }),
    });
    const events = await readSseStream(res);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.event).toBe("driver.handle");
    const handlePayload = JSON.parse(events[0]!.data) as {
      payload: { handle: { driver_kind: string; attempt_id: string; cancel_token: string } };
    };
    expect(handlePayload.payload.handle.driver_kind).toBe("codex_exec");
    expect(handlePayload.payload.handle.attempt_id).toMatch(/^atp-/);
    expect(handlePayload.payload.handle.cancel_token).toMatch(/^drv-/);
  });
});

// ─── T4: list returns active tasks ──────────────────────────────────────
describe("T4: GET /api/orch/list", () => {
  it("returns non-empty array after invoke", async () => {
    // First invoke to ensure at least 1 task
    const taskId = uniqueTaskId("t4-list");
    await fetch(`${KERNEL_BASE}/api/orch/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        workflow_pack: "web_research",
        workflow_version: "1.0.0",
        capability_profile: { driver_kind: "codex_exec" },
        lease_token: "lease-t4",
        fence_version: 1,
        prompt: "test list",
        model_class: "worker",
        host_id: "e2e-host",
        tenant_id: "e2e-tenant",
      }),
    });
    // Wait briefly for task to be recorded
    await sleep(200);
    // M0.3 fix: v1.2.0k.3 P0 tenant isolation — /api/orch/list requires
    // X-Tenant-ID header (harness/server.py:191-196). Without it the kernel
    // returns 400 to refuse cross-tenant leakage.
    const res = await fetch(`${KERNEL_BASE}/api/orch/list`, {
      headers: { "X-Tenant-ID": "e2e-tenant" },
    });
    expect(res.ok).toBe(true);
    const tasks = (await res.json()) as Array<{ task_id: string; status: string }>;
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks.some((t) => t.task_id === taskId)).toBe(true);
  });
});

// ─── T5: status returns task snapshot ───────────────────────────────────
describe("T5: GET /api/orch/status/{task_id}", () => {
  it("returns completed status after invoke", async () => {
    const taskId = uniqueTaskId("t5-status");
    await fetch(`${KERNEL_BASE}/api/orch/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        workflow_pack: "web_research",
        workflow_version: "1.0.0",
        capability_profile: { driver_kind: "codex_exec" },
        lease_token: "lease-t5",
        fence_version: 1,
        prompt: "test status",
        model_class: "worker",
        host_id: "e2e-host",
        tenant_id: "e2e-tenant",
      }),
    });
    await sleep(200);
    const res = await fetch(`${KERNEL_BASE}/api/orch/status/${encodeURIComponent(taskId)}`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["task_id"]).toBe(taskId);
    expect(body["status"]).toBe("completed");
    expect(typeof body["attempt_id"]).toBe("string");
    expect(typeof body["cancel_token"]).toBe("string");
  });
});

// ─── T6: cancel returns 404 for unknown task ───────────────────────────
describe("T6: POST /api/orch/cancel/{task_id}", () => {
  it("returns 404 for unknown task_id", async () => {
    const unknownTaskId = `nonexistent-${Date.now()}`;
    const res = await fetch(`${KERNEL_BASE}/api/orch/cancel/${encodeURIComponent(unknownTaskId)}`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toContain("not found");
  });
});
