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

import { app } from '../../server.js';

const RUN_E2E = process.env['RUN_SERVER_E2E'] === '1';
const maybeDescribe = RUN_E2E ? describe : describe.skip;

let server: Server;
let baseUrl: string;

maybeDescribe('server.ts — HTTP integration', () => {
  beforeAll(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('ephemeral server failed to bind');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
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
});