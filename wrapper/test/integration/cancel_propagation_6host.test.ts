/**
 * T-V1.2.0J+.9-QA-1: 6host cancel propagation HTTP integration test.
 *
 * Coverage (per §6 forward scope item (d) of v1.2.0j+.6+ closure, deferred to
 * post-F3+): validates the new HTTP cancel + list routes added in v1.2.0j+.9+.
 *
 * Tested chain (via HTTP, no full dispatch flow):
 *   HTTP POST /api/v1/tasks/:task_id/cancel
 *     → orchestrator.cancel() (orchestrator.ts:509)
 *     → store.markCancelled(taskId)              [SQLite persist]
 *     → _activeControllers.get(taskId).abort()   [in-memory AbortController]
 *
 * Verification approach:
 *   - Manually populate SqliteTaskStore with a "running" task entry, then
 *     POST cancel via HTTP. Verify the HTTP route returns 200, the SQLite
 *     row transitions to 'cancelled', and listTasks() returns it.
 *   - This bypasses the dispatch() dsh-fallback path (orchestrator.ts:358-370),
 *     which is OUT OF SCOPE for this cycle — that race (cancel writes
 *     'cancelled', then dispatch's runDsh + markCompleted overwrites) is a
 *     known production behavior already covered by orchestrator_cancel_signal.test.ts
 *     (which mocks the dsh path). Our HTTP test focuses on the route layer.
 *
 * Out of scope (deferred to future cycles):
 *   - Full F3+ chain via HTTP dispatch (requires fixing the dsh-fallback race)
 *   - This test would call POST /api/v1/tasks and wait for it to abort mid-flight
 *
 * Mock patterns reused (per L41 + existing test patterns):
 *   - mkdtempSync + process.env[*_DB] + _reset*ForTests() for SQLite temp DBs
 *   - createServer(app) on ephemeral port for HTTP-level E2E
 *
 * @file wrapper/test/integration/cancel_propagation_6host.test.ts
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Suppress DEEPSEEK_API_KEY auto-log at module import time
process.env['DEEPSEEK_API_KEY'] = 'sk-test-key-for-cancel-6host';

// Mock deepseek_client so the dsh-fallback path in dispatch() doesn't try to
// hit the real network. Returns a successful response (won't be hit in these
// tests since we bypass dispatch, but kept as defensive mock).
vi.mock('../../dsh/deepseek_client.js', () => ({
  deepseekInvoke: vi.fn(async () => ({
    stdout: 'ok',
    stderr: '',
    exitCode: 0,
    wallMs: 100,
    traceId: undefined,
    tokenUsage: undefined,
    denialReason: undefined,
  })),
}));

import { app } from '../../server.js';
import * as taskStoreModule from '../../orchestrator/task_store.js';
import * as queueStoreModule from '../../orchestrator/queue_store.js';
import * as workerPoolModule from '../../orchestrator/worker_pool.js';

const shouldRun = process.env['RUN_CANCEL_6HOST'] === '1';

interface BootedWrapper {
  server: Server;
  baseUrl: string;
  port: number;
  dbs: { task: string; queue: string; worker: string };
}

async function bootWrapper(port: number, tempDir: string): Promise<BootedWrapper> {
  const dbs = {
    task: join(tempDir, `task-${port}.db`),
    queue: join(tempDir, `queue-${port}.db`),
    worker: join(tempDir, `worker-${port}.db`),
  };
  process.env['TASK_STORE_DB'] = dbs.task;
  process.env['QUEUE_STORE_DB'] = dbs.queue;
  process.env['WORKER_POOL_DB'] = dbs.worker;
  taskStoreModule._resetTaskStoreForTests();
  queueStoreModule._resetQueueStoreForTests();
  workerPoolModule._resetWorkerPoolForTests();

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error(`ephemeral server failed to bind on port ${port}`);
  }
  return { server, baseUrl: `http://127.0.0.1:${addr.port}`, port, dbs };
}

async function closeAll(wrappers: BootedWrapper[]): Promise<void> {
  await Promise.all(
    wrappers.map(
      ({ server }) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  wrappers.length = 0;
}

/** Create a "running" task entry directly in the SqliteTaskStore. */
function makeRunningTask(taskId: string): void {
  const store = taskStoreModule.getDefaultTaskStore();
  const now = Date.now();
  store.setTask({
    taskId,
    prompt: `cancel-6host-${taskId}`,
    modelClass: 'orch',
    status: 'pending',
    resultJson: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  });
  store.markRunning(taskId);
}

/** Read current status of a task from the SQLite store. */
function readStatus(taskId: string): string | undefined {
  const store = taskStoreModule.getDefaultTaskStore();
  return store.getTask(taskId)?.status;
}

describe(
  'cancel propagation 6host (set RUN_CANCEL_6HOST=1 to run)',
  { skip: !shouldRun },
  () => {
    let tempDir: string;
    let wrappers: BootedWrapper[] = [];

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'cancel-6host-'));
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(async () => {
      await closeAll(wrappers);
      rmSync(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    beforeEach(async () => {
      wrappers.push(await bootWrapper(4101, tempDir));
    });

    afterEach(async () => {
      await closeAll(wrappers);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 1 — HTTP cancel of a running task transitions SQLite to cancelled
    // ─────────────────────────────────────────────────────────────────────
    it('HTTP cancel of running task transitions SQLite to cancelled', async () => {
      const { baseUrl } = wrappers[0]!;
      const taskId = `cancel-http-${Date.now()}`;
      makeRunningTask(taskId);
      expect(readStatus(taskId)).toBe('running');

      const cancelRes = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/cancel`, {
        method: 'POST',
      });
      expect(cancelRes.status).toBe(200);
      const body = (await cancelRes.json()) as { task_id: string; status: string };
      expect(body.task_id).toBe(taskId);
      expect(body.status).toBe('cancelled');

      // SQLite row reflects cancelled status
      expect(readStatus(taskId)).toBe('cancelled');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 2 — HTTP cancel of completed task is no-op (idempotent)
    // ─────────────────────────────────────────────────────────────────────
    it('HTTP cancel of completed task is no-op (does not throw)', async () => {
      const { baseUrl } = wrappers[0]!;
      const taskId = `completed-${Date.now()}`;
      const store = taskStoreModule.getDefaultTaskStore();
      const now = Date.now();
      store.setTask({
        taskId,
        prompt: 'pre-completed',
        modelClass: 'orch',
        status: 'pending',
        resultJson: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      store.markCompleted(taskId, JSON.stringify({ stdout: 'fast' }));
      expect(readStatus(taskId)).toBe('completed');

      const cancelRes = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/cancel`, {
        method: 'POST',
      });
      expect(cancelRes.status).toBe(200);
      // orchestrator.cancel() checks status and returns early for terminal states.
      // HTTP route still returns 200 + status: 'cancelled' (per handler contract).
      const body = (await cancelRes.json()) as { task_id: string; status: string };
      expect(body.status).toBe('cancelled');
      // SQLite row stays 'completed' (no overwrite since orchestrator.cancel()
      // short-circuits when status is terminal).
      expect(readStatus(taskId)).toBe('completed');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 3 — HTTP cancel of unknown task_id is idempotent
    // ─────────────────────────────────────────────────────────────────────
    it('HTTP cancel of unknown task_id is idempotent (200 OK)', async () => {
      const { baseUrl } = wrappers[0]!;
      const unknownId = `never-existed-${Date.now()}`;
      const cancelRes = await fetch(`${baseUrl}/api/v1/tasks/${unknownId}/cancel`, {
        method: 'POST',
      });
      expect(cancelRes.status).toBe(200);
      const body = (await cancelRes.json()) as { task_id: string; status: string };
      expect(body.task_id).toBe(unknownId);
      expect(body.status).toBe('cancelled');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 4 — GET /api/v1/tasks returns {tasks: [...]} including cancelled
    // ─────────────────────────────────────────────────────────────────────
    it('GET /api/v1/tasks returns cancelled task in list', async () => {
      const { baseUrl } = wrappers[0]!;
      const taskId = `list-tasks-${Date.now()}`;
      makeRunningTask(taskId);

      // Cancel via HTTP
      await fetch(`${baseUrl}/api/v1/tasks/${taskId}/cancel`, { method: 'POST' });

      // GET /api/v1/tasks → list contains cancelled task
      const listRes = await fetch(`${baseUrl}/api/v1/tasks`);
      expect(listRes.status).toBe(200);
      const body = (await listRes.json()) as {
        tasks: Array<{ task_id: string; status: string }>;
      };
      expect(Array.isArray(body.tasks)).toBe(true);
      const cancelled = body.tasks.find((t) => t.task_id === taskId);
      expect(cancelled, 'cancelled task should appear in listTasks').toBeDefined();
      expect(cancelled!.status).toBe('cancelled');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 5 — concurrent 6-host HTTP route smoke test
    //
    // Boots 6 ephemeral wrappers on ports 4101-4106 to verify the new HTTP
    // cancel + list routes work correctly across multiple ports concurrently.
    //
    // KNOWN LIMITATION: SqliteTaskStore is a process-wide singleton keyed off
    // TASK_STORE_DB env var at construction time. Multiple wrapper instances
    // booted in the same vitest worker share the same SQLite singleton, so
    // we cannot verify per-host task isolation here. This test verifies:
    //   - All 6 wrappers boot successfully on different ports (no port conflict)
    //   - All 6 wrappers respond to POST /api/v1/tasks/:task_id/cancel (200)
    //   - All 6 wrappers respond to GET /api/v1/tasks (200, returns array)
    //
    // Per-host SQLite isolation is verified by the unit tests in
    // wrapper/test/unit/orchestrator_cancel_signal.test.ts (separate process
    // per test via tempdir + reset).
    // ─────────────────────────────────────────────────────────────────────
    it('concurrent 6-host HTTP routes — cancel + list work on all 6 ports', async () => {
      // Close the single-host wrapper from beforeEach
      await closeAll(wrappers);

      // Boot 6 ephemeral wrappers on ports 4101-4106
      const fleet = await Promise.all(
        Array.from({ length: 6 }, (_, i) => bootWrapper(4101 + i, tempDir)),
      );
      wrappers.push(...fleet);

      // Each host gets a unique URL-safe taskId (no slashes)
      const taskIds = fleet.map((_, i) =>
        `host${4101 + i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      );

      // Cancel all 6 in parallel via HTTP — verifies the route is registered
      // on every port and returns 200 (idempotent for unknown task_ids)
      await Promise.all(
        fleet.map(async ({ baseUrl }, i) => {
          const taskId = taskIds[i]!;
          const cancelRes = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/cancel`, {
            method: 'POST',
          });
          expect(
            cancelRes.status,
            `host-${4101 + i} POST /cancel should return 200`,
          ).toBe(200);
        }),
      );

      // GET /api/v1/tasks on all 6 ports — verifies the route is registered
      // on every port and returns 200 with a tasks array
      await Promise.all(
        fleet.map(async ({ baseUrl }, i) => {
          const listRes = await fetch(`${baseUrl}/api/v1/tasks`);
          expect(
            listRes.status,
            `host-${4101 + i} GET /tasks should return 200`,
          ).toBe(200);
          const body = (await listRes.json()) as { tasks: unknown[] };
          expect(Array.isArray(body.tasks)).toBe(true);
        }),
      );
    });
  },
);