/**
 * server.ts — Wrapper orchestration API (v1.1.1 NEW).
 *
 * Integration entry point for the 8-endpoint wrapper API:
 *   GET  /health                          → orchestrator.health()
 *   POST /api/v1/tasks                    → orchestrator.dispatch()
 *   GET  /api/v1/status/:task_id          → orchestrator.getTaskStatus()
 *   GET  /api/v1/status/test              → inline {status:"ok",test:true,ts}
 *   POST /api/v1/worker/heartbeat         → stub {status:"ok"} (worker.ts M1+ skeleton)
 *   POST /api/v1/push/subscribe           → webpush.sendPush()
 *   POST /api/stt/transcribe              → stt.transcribe()
 *   GET  *                                → SPA fallback (PWA shell)
 *
 * Differs from pwa_server.ts:
 *   - pwa_server.ts serves /api/pwa/* + PWA static + SPA fallback (existing M1c)
 *   - server.ts serves /api/v1/* orchestration endpoints (v1.1.1 NEW)
 *
 * Module-level __dirname via import.meta.url — independent of process.cwd(),
 * so it works in both src (wrapper/) and build (wrapper/build/) layouts,
 * regardless of working_dir in compose deployment.
 *
 * Port: WRAPPER_PORT env var (default 3000).
 * Start: node build/server.js (post-Commit 3 deploy cutover).
 */

import express from 'express';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import * as orchestrator from './orchestrator/orchestrator.js';
import * as webpush from './orchestrator/webpush_gateway.js';
// stt_worker.ts is dynamically imported in the /api/stt/transcribe handler
// because its module-level WHISPER_MODEL_PATH check would otherwise crash the
// wrapper at startup whenever WHISPER_MODEL_PATH is not set (unit/integration
// tests run without a real whisper.cpp binary on the host).
import type { SttRequest, SttResult } from './orchestrator/stt_worker.js';
import type { HealthResponse } from './orchestrator/types.js';
import type { PushSubscription, PushPayload, PushResult } from './orchestrator/webpush_gateway.js';

// ---------------------------------------------------------------------------
// Module-level __dirname (resolved via import.meta.url; independent of cwd)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WRAPPER_PORT = process.env['WRAPPER_PORT'] ?? '3000';

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

export const app = express();
app.use(express.json({ limit: '10mb' }));

// GET /health — orchestrator kernel probe (with dsh fallback)
app.get('/health', async (_req, res) => {
  try {
    const h: HealthResponse = await orchestrator.health();
    res.json(h);
  } catch (err) {
    res.status(500).json({ status: 'error', version: 'unknown', error: String(err) });
  }
});

// POST /api/v1/tasks — accept task, dispatch through orchestrator
app.post('/api/v1/tasks', async (req, res) => {
  try {
    const body = req.body as { prompt?: unknown; workflowPack?: unknown };
    if (!body || typeof body.prompt !== 'string' || body.prompt.length === 0) {
      res.status(400).json({ status: 'error', error: 'prompt required (string)' });
      return;
    }
    const taskId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const task = {
      task_id: taskId,
      status: 'pending' as const,
      workflow_pack: typeof body.workflowPack === 'string' ? body.workflowPack : 'orch',
      workflow_version: '1.0.0',
      input_blob_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result_blob_id: null,
      metadata: { prompt: body.prompt },
    };
    const result = await orchestrator.dispatch(task);
    res.json({
      task_id: result.task_id,
      status: result.status,
      output: result.output,
      error: result.error,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// GET /api/v1/status/test — inline connectivity check
// MUST be registered BEFORE /api/v1/status/:task_id so the literal "test"
// segment does not get captured as a task_id (Express matches routes in
// registration order).
app.get('/api/v1/status/test', (_req, res) => {
  res.json({ status: 'ok', test: true, ts: new Date().toISOString() });
});

// GET /api/v1/status/:task_id — query task status (in-memory store + kernel fallback)
app.get('/api/v1/status/:task_id', async (req, res) => {
  try {
    const taskId = req.params['task_id'];
    if (!taskId) {
      res.status(400).json({ status: 'error', error: 'task_id required' });
      return;
    }
    const status = await orchestrator.getTaskStatus(taskId);
    if (status.error === 'task not found') {
      res.status(404).json(status);
      return;
    }
    res.json(status);
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// POST /api/v1/worker/heartbeat — stub (worker.ts M1+ skeleton; v1.2.0+ real impl)
app.post('/api/v1/worker/heartbeat', (_req, res) => {
  res.json({ status: 'ok', heartbeat: true });
});

// POST /api/v1/push/subscribe — single-subscription web push delivery
app.post('/api/v1/push/subscribe', async (req, res) => {
  try {
    const body = req.body as { subscription?: PushSubscription; payload?: PushPayload };
    if (!body || !body.subscription || !body.payload) {
      res.status(400).json({ status: 'error', error: 'subscription + payload required' });
      return;
    }
    const result: PushResult = await webpush.sendPush(body.subscription, body.payload);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// POST /api/stt/transcribe — STT worker (whisper.cpp + /dev/shm)
// stt module is dynamically imported to defer its WHISPER_MODEL_PATH check
// until the handler is actually invoked (wrapper stays bootable without whisper).
app.post('/api/stt/transcribe', async (req, res) => {
  try {
    const request = req.body as SttRequest;
    if (!request || !request.audioStream) {
      res.status(400).json({ status: 'error', error: 'audioStream required' });
      return;
    }
    const sttModule = await import('./orchestrator/stt_worker.js');
    const result: SttResult = await sttModule.transcribe(request);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// GET * SPA fallback (PWA shell) — registered as catch-all middleware (not
// app.get('*'), which path-to-regexp v8 rejects in Express 5).
app.use((_req, res) => {
  res.type('html').send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>fish-harness wrapper</title></head>'
    + '<body><div id="root"></div><script>/* PWA bundle injected in M2+ */</script></body></html>',
  );
});

// ---------------------------------------------------------------------------
// Listener (started only when run as main entry, not when imported by tests)
// ---------------------------------------------------------------------------

/** True when this file is the entry invoked by `node build/server.js`. */
const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(__filename);

if (isMain) {
  const port = parseInt(WRAPPER_PORT, 10);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[wrapper/server] listening on :${port}`);
  });
}

export { WRAPPER_PORT };