// T-M1c-BE-1: orchestrator + kernel + dsh integration test
// M1c 阶段 — mock kernel server + 真 dsh_client (env-inject DEEPSEEK_API_KEY)
// 验证: dispatch → completed → status 查询 闭环
// Only run when DEEPSEEK_API_KEY is set; skip gracefully otherwise.
// Run with: DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" npm run test:integration
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';

const HAS_API_KEY = typeof process.env['DEEPSEEK_API_KEY'] === 'string' && process.env['DEEPSEEK_API_KEY'].length > 0;

// ─── Mock kernel HTTP server ────────────────────────────────────────────────────

/** In-memory task store for the mock kernel */
const mockTasks = new Map<string, MockTask>();

interface MockTask {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  trace_id: string;
}

function startMockKernel(port: number): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', version: '1.0.0-mock', runtime: 'mock' }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/orch/invoke') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { prompt, model_class } = JSON.parse(body);
            const taskId = `mock-task-${Date.now()}`;
            mockTasks.set(taskId, {
              task_id: taskId,
              status: 'pending',
              trace_id: `trace-${taskId}`,
            });
            setTimeout(() => {
              const task = mockTasks.get(taskId);
              if (task) { task.status = 'running'; }
            }, 100);
            res.writeHead(200);
            res.end(JSON.stringify({ task_id: taskId, status: 'pending', trace_id: `trace-${taskId}` }));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalid body' }));
          }
        });
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/api/orch/status/')) {
        const taskId = req.url.replace('/api/orch/status/', '');
        const task = mockTasks.get(decodeURIComponent(taskId));
        if (!task) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'not found' }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify(task));
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    });

    server.listen(port, () => {
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
}

// ─── Integration test ──────────────────────────────────────────────────────────

// Conditionally run — skip when DEEPSEEK_API_KEY is absent
const describeIntegration = HAS_API_KEY ? describe : describe.skip;

describeIntegration('orch_kernel integration (mock kernel + real dsh)', () => {
  let mockKernel: { server: http.Server; baseUrl: string };
  const MOCK_PORT = 18080;

  beforeAll(async () => {
    // Start mock kernel before tests
    mockKernel = await startMockKernel(MOCK_PORT);
    // Point wrapper at mock kernel
    process.env['HARNESS_RUNTIME_URL'] = mockKernel.baseUrl;
  }, 30_000);

  afterAll(async () => {
    // Shutdown mock kernel
    await new Promise<void>((resolve) => mockKernel.server.close(() => resolve()));
  });

  it('health returns 200 from kernel', async () => {
    const { health } = await import('../../orchestrator/orchestrator.js');
    const result = await health();
    expect(result.status).toBe('ok');
    expect(result.version).toBeTruthy();
  });

  it('dispatch creates a task and returns task_id', async () => {
    // Dynamic import to pick up env changes
    const { createTask, dispatch } = await import('../../orchestrator/orchestrator.js');

    const task = createTask({ prompt: '调研 TypeScript 5 新特性', workflowPack: 'orch' });
    expect(task.task_id).toBeTruthy();
    expect(task.status).toBe('pending');

    // Dispatch — may take 60-120s with real dsh; use extended timeout
    const result = await dispatch(task);
    expect(result.task_id).toBeTruthy();
    expect(['pending', 'running', 'completed', 'failed']).toContain(result.status);
  });

  it('getTaskStatus returns correct status after dispatch', async () => {
    const { createTask, dispatch, getTaskStatus } = await import('../../orchestrator/orchestrator.js');

    const task = createTask({ prompt: '测试状态查询', workflowPack: 'worker' });
    const result = await dispatch(task);

    // Poll until resolved or timeout
    const status = await pollUntilDone(getTaskStatus, result.task_id, 120_000);
    expect(['completed', 'failed']).toContain(status.status);
  });

  it('dispatch → status polling → result closed loop', async () => {
    const { createTask, dispatch, getTaskStatus } = await import('../../orchestrator/orchestrator.js');

    const task = createTask({ prompt: '用一句话概括: TypeScript 的类型系统', workflowPack: 'worker' });
    const result = await dispatch(task);
    expect(result.task_id).toBeTruthy();

    const finalStatus = await pollUntilDone(getTaskStatus, result.task_id, 120_000);
    expect(finalStatus.status).toBe('completed');
    expect(finalStatus.result).toBeTruthy();
  }, 180_000);
});

// ─── Poll helper ───────────────────────────────────────────────────────────────

async function pollUntilDone(
  getStatus: (taskId: string) => Promise<{ status: string; result?: string; error?: string }>,
  taskId: string,
  timeoutMs: number,
): Promise<{ status: string; result?: string; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getStatus(taskId);
    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }
    await sleep(2000);
  }
  throw new Error(`pollUntilDone timed out for task ${taskId} after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
