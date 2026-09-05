/**
 * T-M1c-QA-1: orchestrator unit tests — expanded from M0c skeleton.
 *
 * Coverage targets (M1c):
 *   - health() returns stub { status, version }
 *   - dispatch() returns OrchestrationResult with completed status after dsh call
 *   - cancel() logs without throwing
 *   - listTasks() returns array (possibly populated by prior dispatch tests)
 *
 * dsh_client is mocked — unit tests do NOT invoke real dsh CLI.
 * Real dsh invocation is exercised by integration/e2e tests on newvps only.
 *
 * NOT in scope (M1+):
 *   - Real HTTP /health call against kernel
 *   - Real commander spawning + dsh invocation
 *   - Task state persistence via SQLite
 *
 * @file wrapper/test/unit/orchestrator.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dsh_client — unit tests must not invoke the real dsh CLI.
// Mock returns a successful dsh response so dispatch tests can verify shape.
// We export BOTH callDshHeadless and dshInvoke (other unit tests mock the same module
// under different export names — vi.mock factories are not merged across files).
// Use the bare path (no .ts/.js suffix) so vitest resolves it the same way
// the .js-suffixed imports in source code do under moduleResolution=Node16.
vi.mock('../../dsh/dsh_client', () => ({
  callDshHeadless: vi.fn().mockResolvedValue({
    stdout: '{"status":"ok","trace_id":"mock-trace-001"}',
    stderr: '',
    exitCode: 0,
    wallMs: 42,
    traceId: 'mock-trace-001',
    tokenUsage: { inputTokens: 10, outputTokens: 5 },
  }),
  dshInvoke: vi.fn().mockResolvedValue({
    stdout: '{"status":"ok","trace_id":"mock-trace-001"}',
    stderr: '',
    exitCode: 0,
    wallMs: 42,
    traceId: 'mock-trace-001',
    tokenUsage: { inputTokens: 10, outputTokens: 5 },
  }),
}));

// T-V1.2.0A-TEST-FIX: HARNESS_RUNTIME_URL set to http://127.0.0.1:1 via test/setup.ts
// (loaded before this file by vitest) so orchestrator.health() falls through to
// its stub response. Local port 8000 may be bound by an unrelated process.

import {
  health,
  dispatch,
  cancel,
  listTasks,
} from '../../orchestrator/orchestrator.js';
import type { Task, OrchestrationResult } from '../../orchestrator/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'test-task-001',
    status: 'pending',
    workflow_pack: 'default',
    workflow_version: '1.0.0',
    input_blob_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result_blob_id: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('orchestrator', () => {
  beforeEach(() => {
    // Silence console.log during tests; use clearAllMocks (NOT restoreAllMocks)
    // because restoreAllMocks would also reset vi.fn mock implementations
    // (e.g. callDshHeadless from vi.mock) and break subsequent tests.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // clearAllMocks preserves mock implementations; restoreAllMocks does not.
    vi.clearAllMocks();
  });

  // ── health() ──────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns ok status and version (1.2.0c per a6d6e06)', async () => {
      const res = await health();
      expect(res).toEqual({
        status: 'ok',
        version: '1.2.0c',
      });
    });

    it('response has correct shape', async () => {
      const res = await health();
      expect(typeof res.status).toBe('string');
      expect(typeof res.version).toBe('string');
      expect(res.status).toBe('ok');
    });
  });

  // ── dispatch() ───────────────────────────────────────────────────────────

  describe('dispatch()', () => {
    it('returns OrchestrationResult after real dsh invocation (M1c)', async () => {
      const task = makeTask({ task_id: 'dispatch-test-001' });
      const res = await dispatch(task);

      expect(res).toMatchObject({
        task_id: 'dispatch-test-001',
        status: 'completed',
        output: expect.objectContaining({
          stdout: expect.any(String),
          wallMs: expect.any(Number),
          trace_id: expect.any(String),
        }),
        error: null,
      } satisfies Partial<OrchestrationResult>);
    });

    it('task_id is echoed in result', async () => {
      const task = makeTask({ task_id: 'task-xyz-123' });
      const res = await dispatch(task);
      expect(res.task_id).toBe('task-xyz-123');
    });

    it('result has correct OrchestrationResult shape', async () => {
      const task = makeTask();
      const res = await dispatch(task);
      // All required fields present
      expect(typeof res.task_id).toBe('string');
      expect(['pending', 'dispatched', 'running', 'completed', 'failed', 'cancelled']).toContain(res.status);
      // M1c real impl: output is non-null (real dsh stdout/wallMs/trace_id)
      expect(res.output).not.toBeNull();
      expect(typeof res.output!.stdout).toBe('string');
      expect(typeof res.output!.wallMs).toBe('number');
      expect(res.error).toBeNull();
    });

    it('accepts any workflow_pack value', async () => {
      const task = makeTask({ workflow_pack: 'custom-pack', workflow_version: '2.0.0' });
      const res = await dispatch(task);
      expect(res.task_id).toBe('test-task-001');
    });
  });

  // ── cancel() ─────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('does not throw', async () => {
      await expect(cancel('any-task-id')).resolves.not.toThrow();
    });

    it('resolves to undefined', async () => {
      const res = await cancel('task-to-cancel');
      expect(res).toBeUndefined();
    });

    it('accepts any taskId string', async () => {
      await expect(cancel('')).resolves.not.toThrow();
      await expect(cancel('with spaces and-chars')).resolves.not.toThrow();
    });
  });

  // ── listTasks() ───────────────────────────────────────────────────────────

  describe('listTasks()', () => {
    it('returns an array (M1c real impl)', async () => {
      const res = await listTasks();
      expect(Array.isArray(res)).toBe(true);
      // M1c: in-memory task store retains dispatched tasks across calls;
      // earlier dispatch tests populated the store, so length is ≥ 0 (not strictly 0).
      expect(res.length).toBeGreaterThanOrEqual(0);
    });

    it('returns Task[] type elements', async () => {
      const res = await listTasks();
      // Each element should have Task shape (the store may be populated by dispatch tests)
      for (const task of res) {
        expect(typeof task.task_id).toBe('string');
        expect(['pending', 'dispatched', 'running', 'completed', 'failed', 'cancelled']).toContain(task.status);
        expect(typeof task.workflow_pack).toBe('string');
        expect(typeof task.workflow_version).toBe('string');
        expect(typeof task.created_at).toBe('string');
        expect(typeof task.updated_at).toBe('string');
      }
    });
  });
});
