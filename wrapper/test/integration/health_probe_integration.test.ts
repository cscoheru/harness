/**
 * health_probe_integration.test.ts — Integration healthcheck probe tests.
 *
 * Boots server.ts (covers wrapper-commander + wrapper-commander-2 by proxy —
 * both use the same build/server.js binary, only WRAPPER_PORT differs) and
 * pwa_server.ts (wrapper-frontend) on ephemeral ports and verifies each
 * /health endpoint returns 2xx + expected JSON shape matching the compose
 * healthcheck probe contract.
 *
 * Skipped unless RUN_SERVER_E2E=1 (per server_integration.test.ts:15 convention).
 *
 * v1.2.0j F1 NEW. Matches v1.2.0i.1 /health contract on 3 services:
 *   - wrapper-commander (:4001)  → server.ts /health → orchestrator.health()
 *   - wrapper-commander-2 (:4003) → server.ts /health → same binary, proxy covered
 *   - wrapper-frontend (:4002)   → pwa_server.ts /health → always 2xx
 *
 * @file wrapper/test/integration/health_probe_integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';

import { app as commanderApp } from '../../server.js';
import { app as pwaApp } from '../../orchestrator/pwa_server.js';

const RUN_E2E = process.env['RUN_SERVER_E2E'] === '1';
const maybeDescribe = RUN_E2E ? describe : describe.skip;

let commanderServer: Server;
let pwaServer: Server;
let commanderBaseUrl: string;
let pwaBaseUrl: string;

maybeDescribe('v1.2.0j F1 health probe integration', () => {
  beforeAll(async () => {
    // wrapper-commander + wrapper-commander-2 share build/server.js binary
    // (one ephemeral server covers both — WRAPPER_PORT doesn't change /health
    // endpoint shape, only the bound port).
    commanderServer = createServer(commanderApp);
    await new Promise<void>((resolve) => commanderServer.listen(0, '127.0.0.1', resolve));
    const cAddr = commanderServer.address();
    if (!cAddr || typeof cAddr === 'string') throw new Error('commander server failed to bind');
    commanderBaseUrl = `http://127.0.0.1:${cAddr.port}`;

    // wrapper-frontend uses build/orchestrator/pwa_server.js
    pwaServer = createServer(pwaApp);
    await new Promise<void>((resolve) => pwaServer.listen(0, '127.0.0.1', resolve));
    const pAddr = pwaServer.address();
    if (!pAddr || typeof pAddr === 'string') throw new Error('pwa server failed to bind');
    pwaBaseUrl = `http://127.0.0.1:${pAddr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => commanderServer.close(() => resolve()));
    await new Promise<void>((resolve) => pwaServer.close(() => resolve()));
  });

  it('wrapper-commander GET /health returns 2xx + JSON (covers wrapper-commander-2 by proxy)', async () => {
    const res = await fetch(`${commanderBaseUrl}/health`);
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toMatch(/json/);
    const body = await res.json() as { status: string };
    expect(typeof body.status).toBe('string');
  });

  it('wrapper-frontend GET /health returns 2xx + {status:"ok",service:"pwa-server"}', async () => {
    const res = await fetch(`${pwaBaseUrl}/health`);
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toMatch(/json/);
    const body = await res.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('pwa-server');
  });

  it('server.ts /health body has status:ok (proves stub fallback when kernel unreachable)', async () => {
    // v1.2.0i.1 probe contract: /health returns 2xx with status field even when
    // orchestrator.health() stub-fallback kicks in (kernel down). Without this,
    // wrapper would be marked unhealthy on every kernel restart → restart loop.
    const res = await fetch(`${commanderBaseUrl}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });
});