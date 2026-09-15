/**
 * pwa_server.ts — Express PWA dispatch server.
 *
 * Serves static files from wrapper/orchestrator/static/ and exposes:
 *   POST /api/pwa/dispatch   — receive PWA form → dispatch task
 *   GET  /api/pwa/status/:task_id — poll task status
 *   GET  /health             — liveness probe
 *   ALL  /api/v1/*           — reverse proxy to wrapper-orch (port 4000)
 *
 * Why /api/v1/* proxy: harness.3strategy.cc routes through Tailscale Funnel
 * to wrapper-frontend (:4002). The PWA's JS hits relative paths
 * /api/v1/tasks + /api/v1/status/:id/stream which only exist on
 * wrapper-orch (:4000). Without this proxy, EventSource 404s into the
 * SPA fallback (returns index.html) → DAG renders empty.
 *
 * Does NOT hardcode DEEPSEEK_API_KEY — injected via process.env at runtime.
 * Does NOT lock to a specific model — uses class field from DispatchRequest.
 */

import express, { type Request, type Response, type NextFunction } from "express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import { createTask, dispatch, getTaskStatus } from "./orchestrator.js";
import type { DispatchRequest, DispatchResponse, StatusResponse } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const STATIC_DIR = path.join(__dirname, "static");
const PORT = parseInt(process.env["PWA_PORT"] ?? "3000", 10);

// ─── /api/v1/* reverse proxy target ──────────────────────────────────────────
// Default to the standard wrapper-orchestrator port in the newvps compose
// network. Override via env to point at any other reachable wrapper host.
// PWA hits /api/v1/{tasks,status/:id,status/:id/stream,...} — proxy the whole
// prefix verbatim so server.ts (the canonical endpoint owner) handles them.
const ORCH_PROXY_URL = (process.env["PWA_ORCH_PROXY_URL"] ?? "http://wrapper-orchestrator:4000").replace(/\/$/, "");

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());

// ─── /api/v1/* reverse proxy → wrapper-orchestrator ─────────────────────────
// Native fetch proxy (no extra dep). Streams SSE correctly via
// getReader() passthrough. Strips PWA_PORT-specific Origin so wrapper-orch
// doesn't see cross-origin from PWA and reject.
//
// Implementation note: the prefix is rewritten verbatim — PWA's
// /api/v1/tasks → wrapper-orch's /api/v1/tasks (server.ts:175 line). We
// preserve method + headers (minus hop-by-hop) + body so SSE long-polls
// stream through unmodified.
app.all("/api/v1/*path", async (req: Request, res: Response) => {
  const targetUrl = `${ORCH_PROXY_URL}${req.originalUrl}`;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") {
      // hop-by-hop per RFC 7230 §6.1; also strip Origin/Host so wrapper-orch
      // trusts the request as internal rather than treating it cross-origin
      if (
        k.toLowerCase() === "host" ||
        k.toLowerCase() === "connection" ||
        k.toLowerCase() === "origin" ||
        k.toLowerCase() === "content-length"
      ) {
        continue;
      }
      headers[k] = v;
    }
  }
  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });
    res.status(upstream.status);
    upstream.headers.forEach((v, k) => {
      // hop-by-hop response headers we must not forward
      if (
        k.toLowerCase() !== "connection" &&
        k.toLowerCase() !== "transfer-encoding" &&
        k.toLowerCase() !== "content-encoding"
      ) {
        res.setHeader(k, v);
      }
    });
    if (!upstream.body) {
      res.end();
      return;
    }
    const reader = upstream.body.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      return pump();
    };
    await pump();
  } catch (err) {
    console.error(`[pwa_server] proxy → ${targetUrl} failed: ${err}`);
    res.status(502).json({ error: "upstream unreachable", detail: String(err) });
  }
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/** GET /health — liveness probe */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "pwa-server" });
});

/**
 * POST /api/pwa/dispatch
 * Accepts a PWA dispatch request, creates a task, and dispatches it.
 */
app.post("/api/pwa/dispatch", async (req: Request, res: Response) => {
  const body = req.body as DispatchRequest;

  if (!body.prompt || typeof body.prompt !== "string" || body.prompt.trim() === "") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const task = createTask({
    prompt: body.prompt.trim(),
    workflowPack: body.class ?? body.workflowPack ?? "orch",
  });

  try {
    // Fire-and-forget dispatch; respond immediately with task_id
    const result = await dispatch(task);

    const response: DispatchResponse = {
      task_id: result.task_id,
      status: result.status,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error(`[pwa_server] dispatch error: ${err}`);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "dispatch failed", detail: message });
  }
});

/**
 * GET /api/pwa/status/:task_id
 * Returns the current status of a task.
 */
app.get("/api/pwa/status/:task_id", async (req: Request, res: Response) => {
  const task_id = req.params.task_id as string;

  if (!task_id) {
    res.status(400).json({ error: "task_id is required" });
    return;
  }

  try {
    const status = await getTaskStatus(task_id);

    if (status.status === "failed" && status.error === "task not found") {
      res.status(404).json({ error: "task not found" });
      return;
    }

    const response: StatusResponse = {
      task_id: status.task_id,
      status: status.status,
      result: status.result,
      error: status.error,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error(`[pwa_server] status error for ${task_id}: ${err}`);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "status query failed", detail: message });
  }
});

// ─── Static file serving ───────────────────────────────────────────────────────

app.use(express.static(STATIC_DIR));

// SPA fallback: serve index.html for non-asset routes
// path-to-regexp v8 requires named parameter after *
app.get("*path", (_req: Request, res: Response) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

// ─── Error handler ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[pwa_server] unhandled error: ${err}`);
  res.status(500).json({ error: "internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

/** True when this file is the entry invoked by `node build/orchestrator/pwa_server.js`. */
const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(__filename);

if (isMain) {
  const server = app.listen(PORT, () => {
    console.log(`[pwa_server] listening on http://localhost:${PORT}`);
    console.log(`[pwa_server] static files: ${STATIC_DIR}`);
    console.log(`[pwa_server] kernel URL: ${process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:8000"}`);
  });
  // v1.2.0j+.1 NEW per D2: port G8.1 SIGTERM handler from wrapper/server.ts:388-447.
  // Minimal scope: server.close() only (no metrics/reap/heartbeat/DB subsystems in pwa_server).
  registerShutdown(server);
}

/**
 * Register SIGTERM/SIGINT handlers that gracefully drain the pwa_server.
 *
 * v1.2.0j+.1 NEW: ports the G8.1 pattern from wrapper/server.ts:388-447 to
 * pwa_server.ts. Minimal port — only `server.close()` applies here; the
 * metrics/reap/heartbeat/DB-close steps in server.ts are N/A because
 * pwa_server.ts owns no timers, no DB handles, no heartbeat sender.
 *
 * Idempotent via `shuttingDown` guard — second signal returns early.
 *
 * @param server - http.Server instance returned from app.listen()
 */
export function registerShutdown(server: import("http").Server): void {
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[pwa_server] received ${signal}, draining...`);

    // Stop accepting new connections; wait for in-flight requests to finish.
    // This is the only relevant drain step for pwa_server.ts (no metrics/
    // reap/heartbeat/DB subsystems to tear down — orchestrator.ts owns
    // those, and is a separate process via compose multi-container deploy).
    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } catch (err) {
      console.warn(`[pwa_server] server.close failed: ${String(err)}`);
    }

    console.log(`[pwa_server] shutdown complete, exiting`);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export { app };
