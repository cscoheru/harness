/**
 * T-M1c-QA-1: orchestrator unit tests — expanded from M0c skeleton.
 *
 * Coverage targets (M1c):
 *   - health() returns stub { status, version }
 *   - dispatch() returns stub OrchestrationResult with pending status
 *   - cancel() logs without throwing
 *   - listTasks() returns empty array
 *
 * NOT in scope (M1+):
 *   - Real HTTP /health call against kernel
 *   - Real commander spawning + dsh invocation
 *   - Task state persistence via SQLite
 *
 * @file wrapper/test/unit/orchestrator.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── health() ──────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns stub ok status and version', async () => {
      const res = await health();
      expect(res).toEqual({
        status: 'ok',
        version: '0.0.0-stub',
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
    it('returns stub OrchestrationResult with pending status', async () => {
      const task = makeTask({ task_id: 'dispatch-test-001' });
      const res = await dispatch(task);

      expect(res).toMatchObject({
        task_id: 'dispatch-test-001',
        status: 'pending',
        output: null,
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
      expect(res.output).toBeNull();
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
    it('returns empty array (stub)', async () => {
      const res = await listTasks();
      expect(Array.isArray(res)).toBe(true);
      expect(res).toHaveLength(0);
    });

    it('returns Task[] type', async () => {
      const res = await listTasks();
      // Each element should have Task shape (though array is empty here)
      expect(res).toEqual([]);
    });
  });
});
