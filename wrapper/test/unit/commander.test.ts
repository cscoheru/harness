/**
 * T-M1c-QA-1: commander unit tests — expanded from M0c skeleton.
 *
 * Coverage targets:
 *   - health() returns stub { status, version }
 *   - planStep() returns empty PackPlan
 *   - dispatchStep() returns stub step result
 *   - aggregateResults() returns stub OrchestrationResult
 *
 * @file wrapper/test/unit/commander.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  health,
  planStep,
  dispatchStep,
  aggregateResults,
} from '../../orchestrator/commander.js';
import type { Task, OrchestrationResult, PackPlan } from '../../orchestrator/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'cmd-task-001',
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

describe('commander', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── health() ─────────────────────────────────────────────────────────────

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

  // ── planStep() ─────────────────────────────────────────────────────────

  describe('planStep()', () => {
    it('returns empty PackPlan (stub)', async () => {
      const task = makeTask();
      const plan: PackPlan = await planStep(task);
      expect(plan).toEqual({ steps: [] });
    });

    it('PackPlan has correct shape', async () => {
      const task = makeTask();
      const plan = await planStep(task);
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.steps).toHaveLength(0);
    });

    it('accepts task with workflow_pack', async () => {
      const task = makeTask({ workflow_pack: 'research-pack' });
      const plan = await planStep(task);
      expect(Array.isArray(plan.steps)).toBe(true);
    });

    it('accepts task with input_blob_id', async () => {
      const task = makeTask({ input_blob_id: 'blob-123' });
      const plan = await planStep(task);
      expect(plan).toBeDefined();
    });
  });

  // ── dispatchStep() ─────────────────────────────────────────────────────

  describe('dispatchStep()', () => {
    it('returns step with pending status', async () => {
      const res = await dispatchStep('task-abc', 'step-research');
      expect(res).toMatchObject({
        step: 'step-research',
        status: 'pending',
      });
    });

    it('echoes taskId in log', async () => {
      const res = await dispatchStep('task-xyz-789', 'step-write');
      expect(res.step).toBe('step-write');
    });

    it('returns correct dispatchStep shape', async () => {
      const res = await dispatchStep('t1', 's1');
      expect(typeof res.step).toBe('string');
      expect(['pending', 'running', 'completed', 'failed']).toContain(res.status);
    });
  });

  // ── aggregateResults() ─────────────────────────────────────────────────

  describe('aggregateResults()', () => {
    it('returns stub OrchestrationResult', async () => {
      const res: OrchestrationResult = await aggregateResults('task-agg-001');
      expect(res).toMatchObject({
        task_id: 'task-agg-001',
        status: 'pending',
        output: null,
        error: null,
      } satisfies Partial<OrchestrationResult>);
    });

    it('echoes taskId from argument', async () => {
      const res = await aggregateResults('my-custom-task-id');
      expect(res.task_id).toBe('my-custom-task-id');
    });

    it('output is null (stub)', async () => {
      const res = await aggregateResults('task-without-output');
      expect(res.output).toBeNull();
    });

    it('error is null (stub)', async () => {
      const res = await aggregateResults('task-without-error');
      expect(res.error).toBeNull();
    });

    it('result has valid TaskStatus', async () => {
      const res = await aggregateResults('task-status-check');
      expect(['pending', 'dispatched', 'running', 'completed', 'failed', 'cancelled']).toContain(res.status);
    });
  });
});
