/**
 * pwa_server.ts — Express PWA dispatch server.
 *
 * Serves static files from wrapper/orchestrator/static/ and exposes:
 *   POST /api/pwa/dispatch   — receive PWA form → dispatch task
 *   GET  /api/pwa/status/:task_id — poll task status
 *   GET  /health             — liveness probe
 *
 * Does NOT hardcode DEEPSEEK_API_KEY — injected via process.env at runtime.
 * Does NOT lock to a specific model — uses class field from DispatchRequest.
 */

import express, { type Request, type Response, type NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createTask, dispatch, getTaskStatus } from "./orchestrator.js";
import type { DispatchRequest, DispatchResponse, StatusResponse } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, "static");
const PORT = parseInt(process.env["PWA_PORT"] ?? "3000", 10);

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`[pwa_server] listening on http://localhost:${PORT}`);
  console.log(`[pwa_server] static files: ${STATIC_DIR}`);
  console.log(`[pwa_server] kernel URL: ${process.env["HARNESS_RUNTIME_URL"] ?? "http://localhost:8000"}`);
});

export { app };
