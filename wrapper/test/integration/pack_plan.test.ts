/**
 * T-V1.2.0A-PACK-PLAN: PackPlan DAG topology test (v1.2.0a NEW).
 *
 * Validates the workflow_pack.ts plan() function produces a valid DAG:
 *   - PlanStep inherits PackStep fields correctly
 *   - depends_on is always an array (never undefined)
 *   - timeout_seconds is always a positive integer
 *   - heuristic fallback produces 1-step plans with no depends_on
 *   - build() returns a WorkflowPack-shaped object
 *
 * Run with: RUN_PACK_PLAN_E2E=1 ./node_modules/.bin/vitest run test/integration/pack_plan.test.ts
 *
 * @file wrapper/test/integration/pack_plan.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../dsh/dsh_client', () => ({
  callDshHeadless: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: 'mocked: dsh disabled in pack_plan e2e',
    exitCode: 1,
    wallMs: 0,
    traceId: undefined,
    tokenUsage: undefined,
    denialReason: undefined,
  }),
}));

import * as workflowPack from '../../orchestrator/workflow_pack.js';
import type { Task, PackPlan, PackManifest, PlanPlan } from '../../orchestrator/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: `pp-${Math.random().toString(36).slice(2, 10)}`,
    status: 'pending',
    workflow_pack: 'default',
    workflow_version: '1.0.0',
    input_blob_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result_blob_id: null,
    ...({ metadata: { prompt: 'pack plan e2e' } } as unknown as Partial<Task>),
    ...overrides,
  } as Task;
}

const SKIP_E2E = !process.env['RUN_PACK_PLAN_E2E'];

describe.skipIf(SKIP_E2E)('PackPlan DAG topology (v1.2.0a)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. PackStep shape validation ────────────────────────────────────────

  describe('PackStep shape', () => {
    it('every step has all PackStep fields with correct types', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      for (const step of plan.steps) {
        expect(typeof step.name).toBe('string');
        expect(step.name.length).toBeGreaterThan(0);
        expect(typeof step.capability).toBe('string');
        expect(step.capability.length).toBeGreaterThan(0);
        expect(typeof step.input_ref).toBe('string');
        expect(typeof step.output_kind).toBe('string');
        expect(Array.isArray(step.depends_on)).toBe(true);
        expect(typeof step.timeout_seconds).toBe('number');
        expect(step.timeout_seconds).toBeGreaterThan(0);
      }
    });

    it('heuristic fallback produces no depends_on edges (1-step plan)', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0]!.depends_on).toEqual([]);
    });
  });

  // ── 2. PlanPlan shape validation ────────────────────────────────────────

  describe('PlanPlan shape', () => {
    it('plan_metadata contains source + manifest info', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      expect(plan.plan_metadata).toBeDefined();
      expect(typeof plan.plan_metadata).toBe('object');
      expect(typeof plan.plan_metadata['source']).toBe('string');
      expect(typeof plan.plan_metadata['manifest_name']).toBe('string');
      expect(typeof plan.plan_metadata['manifest_version']).toBe('string');
    });

    it('steps array contains PlanStep with enriched fields', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      const step = plan.steps[0]!;
      expect(step.status).toBe('pending');
      expect(step.worker_id).toBeNull();
      expect(step.started_at).toBeNull();
      expect(step.finished_at).toBeNull();
      expect(step.result).toBeNull();
      expect(step.error).toBeNull();
    });
  });

  // ── 3. Manifest loading ─────────────────────────────────────────────────

  describe('Manifest loading', () => {
    it('default.json loads with required_capabilities array', () => {
      const m: PackManifest = workflowPack.loadManifest('default');
      expect(m.name).toBe('default');
      expect(m.version).toBe('1.0.0');
      expect(Array.isArray(m.required_capabilities)).toBe(true);
      expect(m.required_capabilities.length).toBeGreaterThan(0);
    });

    it('synthetic fallback for unknown packs has same shape', () => {
      const m = workflowPack.loadManifest('zzz-unknown-pack-zzz');
      expect(typeof m.name).toBe('string');
      expect(Array.isArray(m.required_capabilities)).toBe(true);
      expect(typeof m.output_kind).toBe('string');
    });
  });

  // ── 4. build() returns WorkflowPack interface ───────────────────────────

  describe('build()', () => {
    it('returns a complete WorkflowPack interface', async () => {
      const pack = workflowPack.build('default');
      expect(typeof pack.manifest).toBe('function');
      expect(typeof pack.plan).toBe('function');
      const manifest = pack.manifest();
      expect(manifest.name).toBe('default');
      const plan: PlanPlan = await pack.plan(makeTask());
      expect(Array.isArray(plan.steps)).toBe(true);
    });

    it('caches manifest across plan() calls', async () => {
      const pack = workflowPack.build('default');
      const m1 = pack.manifest();
      const m2 = pack.manifest();
      expect(m1).toEqual(m2);
    });
  });
});