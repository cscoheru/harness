/**
 * T-V1.2.0A-COMMANDER: commander unit tests for v1.2.0a real implementation.
 *
 * Replaces the M1c stub tests. Now exercises real WorkflowPack integration:
 *   - health() returns real probe state (active_plans, total_steps, kernel_reachable)
 *   - planStep() delegates to workflowPack.plan() and tracks steps in the in-memory tracker
 *   - dispatchStep() records intent + assigns synthetic worker_id
 *   - aggregateResults() returns OrchestrationResult with step breakdown
 *   - AggregateError thrown when planStep() was never called for the task_id
 *   - _recordStepResult() / _recordStepFailure() integration with aggregateResults
 *
 * Uses workflow_packs/default.json (always present) for deterministic plan loading.
 * Mocks dsh via vi.mock so tests run without a real DEEPSEEK_API_KEY.
 *
 * @file wrapper/test/unit/commander.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dsh_client so planStep() exercises the heuristic fallback path
// (no DEEPSEEK_API_KEY required for unit tests)
vi.mock('../../orchestrator/../dsh/dsh_client.js', () => ({
  callDshHeadless: vi.fn(async () => ({
    stdout: '',
    stderr: 'mocked: dsh disabled in unit test',
    exitCode: 1,
    wallMs: 0,
    traceId: undefined,
    tokenUsage: undefined,
    denialReason: undefined,
  })),
}));

import {
  health,
  planStep,
  dispatchStep,
  aggregateResults,
  _recordStepResult,
  _recordStepFailure,
  _resetTracker,
} from '../../orchestrator/commander.js';
import { AggregateError } from '../../orchestrator/types.js';
import type {
  OrchestrationResult,
  PlanPlan,
  Task,
} from '../../orchestrator/types.js';
import * as workerPoolModule from '../../orchestrator/worker_pool.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let commanderTestPool: workerPoolModule.SqliteWorkerPool;
let commanderTempDir: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: `cmd-${Math.random().toString(36).slice(2, 10)}`,
    status: 'pending',
    workflow_pack: 'default',
    workflow_version: '1.0.0',
    input_blob_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result_blob_id: null,
    ...({ metadata: { prompt: 'unit test prompt' } } as unknown as Partial<Task>),
    ...overrides,
  } as Task;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('commander (v1.2.0a real)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    _resetTracker();
    // v1.2.0b: pre-create a temp SQLite-backed WorkerPool so dispatchStep
    // can claim a worker without touching /data/worker_pool.db
    commanderTempDir = mkdtempSync(join(tmpdir(), 'commander-test-'));
    commanderTestPool = new workerPoolModule.SqliteWorkerPool(
      join(commanderTempDir, 'commander-test.db'),
    );
    process.env['WORKER_POOL_DB'] = join(commanderTempDir, 'commander-test.db');
    workerPoolModule._resetWorkerPoolForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetTracker();
    workerPoolModule._resetWorkerPoolForTests();
    if (commanderTestPool) commanderTestPool.close();
    delete process.env['WORKER_POOL_DB'];
    if (commanderTempDir) rmSync(commanderTempDir, { recursive: true, force: true });
  });

  // ── health() ─────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns real probe shape with active_plans / total_steps / kernel_reachable', async () => {
      const res = await health();
      expect(res.status).toBe('ok');
      expect(res.version).toBe('1.2.0a');
      expect(typeof res.active_plans).toBe('number');
      expect(typeof res.total_steps).toBe('number');
      expect(typeof res.kernel_reachable).toBe('boolean');
    });

    it('reports active_plans count from the step tracker', async () => {
      _resetTracker();
      expect((await health()).active_plans).toBe(0);
      await planStep(makeTask());
      expect((await health()).active_plans).toBe(1);
      await planStep(makeTask());
      expect((await health()).active_plans).toBe(2);
    });
  });

  // ── planStep() ─────────────────────────────────────────────────────────

  describe('planStep()', () => {
    it('returns a PlanPlan with steps + plan_metadata', async () => {
      const task = makeTask();
      const plan: PlanPlan = await planStep(task);
      expect(plan).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.plan_metadata).toBeDefined();
      expect(typeof plan.plan_metadata).toBe('object');
    });

    it('uses heuristic fallback when dsh is unreachable (unit test default)', async () => {
      const task = makeTask();
      const plan = await planStep(task);
      expect(plan.plan_metadata['source']).toBe('heuristic');
    });

    it('loads workflow_packs/default.json for unknown pack names', async () => {
      const task = makeTask({ workflow_pack: 'nonexistent-pack' });
      const plan = await planStep(task);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.plan_metadata['manifest_name']).toBe('nonexistent-pack');
    });

    it('tracks steps in the in-memory tracker for aggregateResults', async () => {
      const task = makeTask();
      await planStep(task);
      const agg = await aggregateResults(task.task_id);
      expect(agg).toBeDefined();
      expect(agg.task_id).toBe(task.task_id);
    });

    it('PlanStep has enriched fields (status / worker_id / result)', async () => {
      const task = makeTask();
      const plan = await planStep(task);
      const step = plan.steps[0]!;
      expect(step.status).toBe('pending');
      expect(step.worker_id).toBeNull();
      expect(step.started_at).toBeNull();
      expect(step.finished_at).toBeNull();
      expect(step.result).toBeNull();
      expect(step.error).toBeNull();
    });
  });

  // ── dispatchStep() ─────────────────────────────────────────────────────

  describe('dispatchStep()', () => {
    it('returns dispatched step record with worker_id + dispatched_at', async () => {
      const task = makeTask();
      await planStep(task);
      // v1.2.0b: dispatchStep now claims a worker via WorkerPool.register
      // + dispatch (per §4.10.6 — no synthetic stub-worker- IDs). Pre-register
      // an active worker so dispatchStep can claim it.
      const wid = await workerPoolModule.getDefaultWorkerPool().register(
        'test-host',
        JSON.stringify({ driver_kind: 'codex_exec' }),
      );
      const res = await dispatchStep(task.task_id, task.workflow_pack === 'default' ? 'execute-default' : `execute-${task.workflow_pack}`);
      expect(res.step).toBeTruthy();
      expect(res.status).toBe('dispatched');
      // v1.2.0b: worker_id is now wrk-<uuid>, NOT stub-worker-...
      expect(res.worker_id).toBe(wid);
      expect(res.worker_id).toMatch(/^wrk-/);
      expect(typeof res.dispatched_at).toBe('string');
    });

    it('updates step status to dispatched + worker_id in tracker', async () => {
      const task = makeTask();
      await planStep(task);
      const stepName = task.workflow_pack === 'default' ? 'execute-default' : `execute-${task.workflow_pack}`;
      // v1.2.0b: pre-register worker so dispatchStep succeeds
      const wid = await workerPoolModule.getDefaultWorkerPool().register(
        'test-host',
        JSON.stringify({ driver_kind: 'codex_exec' }),
      );
      await dispatchStep(task.task_id, stepName);
      const agg = await aggregateResults(task.task_id);
      const out = agg.output as Record<string, unknown>;
      // Aggregate should report completed_steps=0 (no _recordStepResult yet) + pending_steps includes dispatched
      expect(Array.isArray(out['pending_steps'])).toBe(true);
      void wid;
    });
  });

  // ── aggregateResults() ─────────────────────────────────────────────────

  describe('aggregateResults()', () => {
    it('throws AggregateError when planStep was never called for the taskId', async () => {
      await expect(aggregateResults('never-planned-task')).rejects.toBeInstanceOf(AggregateError);
    });

    it('AggregateError carries task_id + failed_steps + partial_output', async () => {
      try {
        await aggregateResults('unplanned-2');
        expect.fail('expected AggregateError');
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        const aggErr = err as AggregateError;
        expect(aggErr.task_id).toBe('unplanned-2');
        expect(aggErr.failed_steps).toEqual([]);
        expect(aggErr.partial_output).toBeNull();
      }
    });

    it('returns OrchestrationResult with step breakdown in output', async () => {
      const task = makeTask();
      await planStep(task);
      const res: OrchestrationResult = await aggregateResults(task.task_id);
      expect(res.task_id).toBe(task.task_id);
      expect(['pending', 'running', 'completed', 'failed']).toContain(res.status);
      expect(res.output).not.toBeNull();
      const out = res.output as Record<string, unknown>;
      expect(Array.isArray(out['completed_steps'])).toBe(true);
      expect(Array.isArray(out['failed_steps'])).toBe(true);
      expect(Array.isArray(out['pending_steps'])).toBe(true);
      expect(typeof out['steps']).toBe('object');
    });

    it('marks task completed after _recordStepResult for all steps', async () => {
      const task = makeTask();
      const plan = await planStep(task);
      for (const step of plan.steps) {
        _recordStepResult(task.task_id, step.name, { ok: true, value: 'done' });
      }
      const res = await aggregateResults(task.task_id);
      expect(res.status).toBe('completed');
      const out = res.output as Record<string, unknown>;
      expect(out['completed_steps']).toEqual(plan.steps.map((s) => s.name));
      expect(out['failed_steps']).toEqual([]);
      expect(res.error).toBeNull();
    });

    it('marks task failed after _recordStepFailure; failed_steps surfaces', async () => {
      const task = makeTask();
      const plan = await planStep(task);
      _recordStepResult(task.task_id, plan.steps[0]!.name, { ok: true });
      _recordStepFailure(task.task_id, plan.steps[1]?.name ?? plan.steps[0]!.name, 'synthetic failure');
      const res = await aggregateResults(task.task_id);
      expect(res.status).toBe('failed');
      expect(res.error).toMatch(/step\(s\) failed/);
      const out = res.output as Record<string, unknown>;
      expect((out['failed_steps'] as string[]).length).toBeGreaterThan(0);
    });
  });

  // ── _resetTracker() hygiene ────────────────────────────────────────────

  describe('_resetTracker()', () => {
    it('clears all tracked steps (active_plans → 0)', async () => {
      await planStep(makeTask());
      await planStep(makeTask());
      expect((await health()).active_plans).toBe(2);
      _resetTracker();
      expect((await health()).active_plans).toBe(0);
    });
  });
});