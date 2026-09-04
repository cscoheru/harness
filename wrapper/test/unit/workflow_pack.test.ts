/**
 * T-V1.2.0A-WORKFLOW-PACK: workflow_pack unit tests (v1.2.0a NEW).
 *
 * Coverage:
 *   - loadManifest(): reads workflow_packs/<name>.json; falls back to
 *     synthetic default when file is missing
 *   - plan(): heuristic fallback when dsh is unreachable; manifest fields
 *     surfaced via plan_metadata; PlanStep enriched with status etc.
 *   - build(): returns a WorkflowPack-shaped object with cached manifest
 *
 * Mocks dsh via vi.mock to keep tests deterministic without DEEPSEEK_API_KEY.
 *
 * @file wrapper/test/unit/workflow_pack.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import * as workflowPack from '../../orchestrator/workflow_pack.js';
import type { PackManifest, PlanPlan, Task } from '../../orchestrator/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: `wp-${Math.random().toString(36).slice(2, 10)}`,
    status: 'pending',
    workflow_pack: 'default',
    workflow_version: '1.0.0',
    input_blob_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result_blob_id: null,
    ...({ metadata: { prompt: 'workflow pack unit test' } } as unknown as Partial<Task>),
    ...overrides,
  } as Task;
}

describe('workflow_pack (v1.2.0a)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── loadManifest() ──────────────────────────────────────────────────────

  describe('loadManifest()', () => {
    it('loads default.json from workflow_packs/', () => {
      const m = workflowPack.loadManifest('default');
      expect(m.name).toBe('default');
      expect(m.version).toBe('1.0.0');
      expect(Array.isArray(m.required_capabilities)).toBe(true);
    });

    it('returns synthetic manifest for unknown pack names', () => {
      const m = workflowPack.loadManifest('does-not-exist-xyz');
      expect(m.name).toBe('does-not-exist-xyz');
      expect(m.required_capabilities.length).toBeGreaterThan(0);
    });

    it('synthetic manifest is a valid PackManifest shape', () => {
      const m = workflowPack.loadManifest('synthetic-shape-check');
      expect(typeof m.name).toBe('string');
      expect(typeof m.version).toBe('string');
      expect(typeof m.description).toBe('string');
      expect(Array.isArray(m.required_capabilities)).toBe(true);
      expect(Array.isArray(m.optional_capabilities)).toBe(true);
      expect(typeof m.input_schema_ref).toBe('string');
      expect(typeof m.output_kind).toBe('string');
    });
  });

  // ── plan() ──────────────────────────────────────────────────────────────

  describe('plan()', () => {
    it('returns PlanPlan with at least 1 step + plan_metadata', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      expect(plan).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.plan_metadata).toBeDefined();
    });

    it('uses heuristic fallback when dsh is unreachable', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      expect(plan.plan_metadata['source']).toBe('heuristic');
    });

    it('heuristic 1-step plan has step name based on pack', async () => {
      const task = makeTask({ workflow_pack: 'research' });
      const plan = await workflowPack.plan(task);
      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0]!.name).toBe('execute-research');
    });

    it('heuristic step uses manifest.required_capabilities[0]', async () => {
      const task = makeTask({ workflow_pack: 'default' });
      const plan = await workflowPack.plan(task);
      expect(plan.steps[0]!.capability).toBe('read_local'); // from default.json
    });

    it('PlanStep inherits PackStep fields (name / capability / depends_on / timeout_seconds)', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      const step = plan.steps[0]!;
      expect(typeof step.name).toBe('string');
      expect(typeof step.capability).toBe('string');
      expect(Array.isArray(step.depends_on)).toBe(true);
      expect(typeof step.timeout_seconds).toBe('number');
    });

    it('plan_metadata surfaces manifest_version', async () => {
      const task = makeTask();
      const plan = await workflowPack.plan(task);
      expect(plan.plan_metadata['manifest_version']).toBe('1.0.0');
    });
  });

  // ── build() ─────────────────────────────────────────────────────────────

  describe('build()', () => {
    it('returns a WorkflowPack-shaped object with manifest() + plan()', () => {
      const pack = workflowPack.build('default');
      expect(typeof pack.manifest).toBe('function');
      expect(typeof pack.plan).toBe('function');
    });

    it('manifest() returns a valid PackManifest', () => {
      const pack = workflowPack.build('default');
      const m: PackManifest = pack.manifest();
      expect(m.name).toBe('default');
      expect(typeof m.version).toBe('string');
    });

    it('plan() delegates to the module-level plan() function', async () => {
      const pack = workflowPack.build('default');
      const task = makeTask();
      const plan: PlanPlan = await pack.plan(task);
      expect(plan.steps.length).toBeGreaterThan(0);
    });
  });
});