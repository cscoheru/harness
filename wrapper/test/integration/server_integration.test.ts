/**
 * server_integration.test.ts — Integration HTTP tests for server.ts endpoints.
 *
 * Boots the express app on an ephemeral port and hits each endpoint over real
 * HTTP. Skipped unless RUN_SERVER_E2E=1.
 *
 * @file wrapper/test/integration/server_integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { app } from '../../server.js';

const RUN_E2E = process.env['RUN_SERVER_E2E'] === '1';
const maybeDescribe = RUN_E2E ? describe : describe.skip;

let server: Server;
let baseUrl: string;
let serverTestDir: string;

maybeDescribe('server.ts — HTTP integration', () => {
  beforeAll(async () => {
    // v1.2.0j+.9+ NEW: set TASK_STORE_DB to a temp path so the new
    // cancel + list routes (orchestrator.cancel() + orchestrator.listTasks())
    // can instantiate SqliteTaskStore without trying to create /data/...
    // (which is the production path but not writable on macOS dev env).
    // Mirrors the WORKER_POOL_DB / QUEUE_STORE_DB temp-path pattern used
    // by server.test.ts for the same reason.
    serverTestDir = mkdtempSync(join(tmpdir(), 'server-integration-test-'));
    process.env['TASK_STORE_DB'] = join(serverTestDir, 'task_store.db');
    process.env['WORKER_POOL_DB'] = join(serverTestDir, 'worker_pool.db');
    process.env['QUEUE_STORE_DB'] = join(serverTestDir, 'queue_store.db');
    const { _resetWorkerPoolForTests } = await import('../../orchestrator/worker_pool.js');
    _resetWorkerPoolForTests();
    const { _resetQueueStoreForTests } = await import('../../orchestrator/queue_store.js');
    _resetQueueStoreForTests();
    const { _resetTaskStoreForTests } = await import('../../orchestrator/task_store.js');
    _resetTaskStoreForTests();

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('ephemeral server failed to bind');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { _resetWorkerPoolForTests } = await import('../../orchestrator/worker_pool.js');
    _resetWorkerPoolForTests();
    const { _resetQueueStoreForTests } = await import('../../orchestrator/queue_store.js');
    _resetQueueStoreForTests();
    const { _resetTaskStoreForTests } = await import('../../orchestrator/task_store.js');
    _resetTaskStoreForTests();
    delete process.env['TASK_STORE_DB'];
    delete process.env['WORKER_POOL_DB'];
    delete process.env['QUEUE_STORE_DB'];
    if (serverTestDir) rmSync(serverTestDir, { recursive: true, force: true });
  });

  it('GET /health returns JSON', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get('content-type')).toMatch(/json/);
    const body = await res.json() as { status: string };
    expect(typeof body.status).toBe('string');
  });

  it('GET /api/v1/status/test returns ok=true', async () => {
    const res = await fetch(`${baseUrl}/api/v1/status/test`);
    const body = await res.json() as { status: string; test: boolean };
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.test).toBe(true);
  });

  it('POST /api/v1/worker/heartbeat returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/v1/worker/heartbeat`, { method: 'POST' });
    const body = await res.json() as { status: string; heartbeat: boolean };
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.heartbeat).toBe(true);
  });

  it('GET /* returns HTML shell (SPA fallback)', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/html/);
  });

  it('POST /api/v1/tasks validates prompt field', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/push/subscribe validates subscription field', async () => {
    const res = await fetch(`${baseUrl}/api/v1/push/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/stt/transcribe validates audioStream field', async () => {
    const res = await fetch(`${baseUrl}/api/stt/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // v1.2.0j+.9+ NEW per §6 forward scope (d): wire orchestrator.cancel() to HTTP.
  // Cancel of unknown task_id is idempotent — orchestrator.cancel() resolves
  // without throwing when the task is missing (orchestrator.ts:521-523).
  it('POST /api/v1/tasks/:task_id/cancel returns 200 for unknown task (idempotent)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tasks/never-existed-${Date.now()}/cancel`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task_id: string; status: string };
    expect(body.status).toBe('cancelled');
    expect(body.task_id).toMatch(/^never-existed-/);
  });

  // v1.2.0j+.9+ NEW per §6 forward scope (d): wire orchestrator.listTasks() to HTTP.
  // Empty store returns {tasks: []}.
  it('GET /api/v1/tasks returns {tasks: []} for empty store', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tasks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: unknown[] };
    expect(Array.isArray(body.tasks)).toBe(true);
  });
});