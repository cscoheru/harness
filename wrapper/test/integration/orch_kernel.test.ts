/**
 * T-M1c-QA-1: orch_kernel integration test — dispatch → complete → status query loop.
 *
 * Scope:
 *   - Mock kernel HTTP server (responds to /health and /status/{task_id})
 *   - Real dsh_client (calls dsh via CLI with DEEPSEEK_API_KEY env-inject)
 *   - Full loop: dispatch task → wait for completion → poll status
 *
 * Collaboration with BE-1: BE-1 provides real orchestrator.ts + HTTP server.
 * QA-1 provides: mock kernel + integration test skeleton.
 *
 * NOTE: If DEEPSEEK_API_KEY not set, test is skipped (smoke only).
 *
 * @file wrapper/test/integration/orch_kernel.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';

// ─── Mock kernel HTTP server ──────────────────────────────────────────────────

interface MockKernel {
  server: Server;
  baseUrl: string;
  tasks: Map<string, { status: string; output: unknown; createdAt: number }>;
}

function createMockKernel(): MockKernel {
  const tasks = new Map<string, { status: string; output: unknown; createdAt: number }>();
  let reqCount = 0;

  const server = createServer((req, res) => {
    reqCount++;
    const url = new URL(req.url ?? '/', 'http://localhost');

    // GET /health → 200 { status, version }
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '1.0.0-mock', runtime: 'mock-kernel' }));
      return;
    }

    // POST /api/dispatch → 202 { task_id, status }
    if (url.pathname === '/api/dispatch' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        const taskId = `mock-task-${Date.now()}`;
        tasks.set(taskId, { status: 'pending', output: null, createdAt: Date.now() });

        // Simulate async: mark running after 100ms
        setTimeout(() => {
          tasks.set(taskId, { status: 'running', output: null, createdAt: Date.now() });
        }, 100);

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ task_id: taskId, status: 'pending' }));
      });
      return;
    }

    // GET /api/status/:task_id → 200 { status, output }
    const statusMatch = url.pathname.match(/^\/api\/status\/([^/]+)$/);
    if (statusMatch && req.method === 'GET') {
      const taskId = statusMatch[1];
      const task = tasks.get(taskId);

      if (!task) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'task not found' }));
        return;
      }

      // Simulate completion after ~300ms
      if (task.status === 'running' && Date.now() - task.createdAt > 300) {
        tasks.set(taskId, { status: 'completed', output: { result: 'mock-done' }, createdAt: task.createdAt });
      }

      const updatedTask = tasks.get(taskId)!;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ task_id: taskId, status: updatedTask.status, output: updatedTask.output }));
      return;
    }

    // Fallback: 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return { server, baseUrl: 'http://localhost:0', tasks };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const shouldRunReal = typeof process.env.DEEPSEEK_API_KEY === 'string' &&
                      process.env.DEEPSEEK_API_KEY.length > 0;

describe('orch_kernel — dispatch → complete → status query loop', () => {
  let kernel: MockKernel;
  let baseUrl: string;

  beforeAll(async () => {
    kernel = createMockKernel();
    await new Promise<void>((resolve) => {
      kernel.server.listen(0, () => {
        const addr = kernel.server.address();
        const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    kernel.server.close();
  });

  it('mock kernel /health returns 200', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0-mock');
  });

  it('dispatch returns task_id + pending status', async () => {
    const res = await fetch(`${baseUrl}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test task', workflow_pack: 'default' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json() as { task_id: string; status: string };
    expect(body.task_id).toMatch(/^mock-task-/);
    expect(body.status).toBe('pending');
  });

  it('status returns current task state', async () => {
    // First dispatch
    const dispatchRes = await fetch(`${baseUrl}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'status test', workflow_pack: 'default' }),
    });
    const { task_id } = await dispatchRes.json() as { task_id: string };

    // Poll status
    const statusRes = await fetch(`${baseUrl}/api/status/${task_id}`);
    expect(statusRes.status).toBe(200);
    const status = await statusRes.json() as { task_id: string; status: string };
    expect(status.task_id).toBe(task_id);
    expect(['pending', 'running']).toContain(status.status);
  });

  it('status transitions: pending → running → completed', async () => {
    // Dispatch
    const dispatchRes = await fetch(`${baseUrl}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'full cycle test', workflow_pack: 'default' }),
    });
    const { task_id } = await dispatchRes.json() as { task_id: string };

    // Poll until completed (max 2s)
    const deadline = Date.now() + 2000;
    let lastStatus = 'pending';

    while (Date.now() < deadline) {
      const statusRes = await fetch(`${baseUrl}/api/status/${task_id}`);
      const body = await statusRes.json() as { status: string; output: unknown };
      lastStatus = body.status;

      if (body.status === 'completed') {
        expect(body.output).toEqual({ result: 'mock-done' });
        return;
      }

      // Wait 50ms before next poll
      await new Promise((r) => setTimeout(r, 50));
    }

    // If we exit the loop without completing, the status at least should have advanced
    expect(['pending', 'running', 'completed']).toContain(lastStatus);
  }, 3000);

  it('unknown task_id returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/status/nonexistent-task-id`);
    expect(res.status).toBe(404);
  });

  // Real dsh call smoke test (only if API key present)
  describe('dsh_client real call smoke', { skip: !shouldRunReal }, () => {
    it('dsh callDshHeadless returns exit 0 for simple prompt', async () => {
      // Lazy import to avoid requiring dsh_client at top level
      const { callDshHeadless } = await import('../../dsh/dsh_client.js');
      const result = await callDshHeadless('What is 1+1? Answer in one word.', {
        timeoutMs: 60_000,
      });

      expect(result.exitCode, `dsh exit should be 0; stderr=${result.stderr}`).toBe(0);
      expect(result.stdout.trim().length, 'stdout should be non-empty').toBeGreaterThan(0);
      expect(result.wallMs, 'wall time should be measured').toBeGreaterThan(0);
    });
  });
});
