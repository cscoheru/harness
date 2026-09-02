/**
 * dsh_real.test.ts — M1c integration test: real dsh CLI calls.
 *
 * Requires DEEPSEEK_API_KEY env var (NOT hardcoded).
 * Runs all three profile tiers (orch / commander / worker) once each.
 *
 * M1c verification criteria:
 *   - exit code 0 for all three tiers
 *   - stdout non-empty
 *   - wall time recorded
 *   - trace_id / token usage extracted when present
 *
 * @file wrapper/test/integration/dsh_real.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Guards — skip if DEEPSEEK_API_KEY not set
// ---------------------------------------------------------------------------

const API_KEY = process.env.DEEPSEEK_API_KEY;

const SKIP_REASON = !API_KEY
  ? 'DEEPSEEK_API_KEY not set (env-inject only; set in shell before running)'
  : undefined;

// ---------------------------------------------------------------------------
// Test tasks per tier (A-class per PRD-v1.1 §3 H-1)
// ---------------------------------------------------------------------------

/** orch A-class task: research (BE-1 equivalent). */
const ORCH_TASK = 'What is 2+2? Answer in one number.';

/** commander A-class task: code change (TG-1 equivalent). */
const COMMANDER_TASK = 'Write a hello world function in TypeScript named greet that returns "Hello, World!"';

/** worker A-class task: summary (DO-1 equivalent). */
const WORKER_TASK = 'Summarize this text in 20 words or fewer: The quick brown fox jumps over the lazy dog near the riverbank.';

// ---------------------------------------------------------------------------
// Shared test suite
// ---------------------------------------------------------------------------

describe('dsh_real (integration, real CLI)', { skip: !!SKIP_REASON }, () => {
  // ---------------------------------------------------------------------------
  // orch tier — high-reasoning cross-project
  // ---------------------------------------------------------------------------
  describe('orch profile (research task)', () => {
    it('calls dsh --profile headless --patch base --patch orch with exit 0', async () => {
      const { callDshHeadless } = await import('../../dsh/dsh_client.js');

      const result = await callDshHeadless(ORCH_TASK, {
        modelClass: 'orch',
        timeoutMs: 300_000,
      });

      // Basic sanity checks
      expect(result.exitCode, `dsh orch exit code: ${result.exitCode}\nstderr: ${result.stderr}`).toBe(0);
      expect(result.stdout.length, 'stdout must be non-empty').toBeGreaterThan(0);
      expect(result.wallMs, 'wall time must be recorded').toBeGreaterThan(0);
      expect(result.wallMs, 'orch timeout ceiling 300s').toBeLessThan(300_000);
    });

    it('orch profile resolves correct YAML files', async () => {
      const { loadProfile, BASE_PATCH_PATH, getRolePatchPath } = await import('../../dsh/profile.js');

      const profile = loadProfile('orch');
      expect(profile.modelClass).toBe('orch');
      expect(profile.patches).toHaveLength(2);
      expect(profile.patches[0]).toBe(BASE_PATCH_PATH);
      expect(profile.patches[1]).toBe(getRolePatchPath('orch'));
      expect(profile.patches[1]).toContain('profile-override-orch.yaml');
    });

    it('DshToolProvider for orch resolves modelClass correctly', async () => {
      const { DshToolProvider } = await import('../../dsh/tool_provider.js');

      const provider = new DshToolProvider({ capabilityId: 'research.ask', modelClass: 'orch' });
      expect(provider.capabilityId()).toBe('research.ask');
      const info = provider.getCapabilityInfo();
      expect(info.modelClass).toBe('orch');
      expect(info.profile.modelClass).toBe('orch');
    });
  });

  // ---------------------------------------------------------------------------
  // commander tier — mid-context single-workflow
  // ---------------------------------------------------------------------------
  describe('commander profile (code-change task)', () => {
    it('calls dsh --profile headless --patch base --patch commander with exit 0', async () => {
      const { callDshHeadless } = await import('../../dsh/dsh_client.js');

      const result = await callDshHeadless(COMMANDER_TASK, {
        modelClass: 'commander',
        timeoutMs: 180_000,
      });

      expect(result.exitCode, `dsh commander exit code: ${result.exitCode}\nstderr: ${result.stderr}`).toBe(0);
      expect(result.stdout.length, 'stdout must be non-empty').toBeGreaterThan(0);
      expect(result.wallMs, 'wall time must be recorded').toBeGreaterThan(0);
      expect(result.wallMs, 'commander timeout ceiling 180s').toBeLessThan(180_000);
    });

    it('commander profile resolves correct YAML files', async () => {
      const { loadProfile, BASE_PATCH_PATH, getRolePatchPath } = await import('../../dsh/profile.js');

      const profile = loadProfile('commander');
      expect(profile.modelClass).toBe('commander');
      expect(profile.patches).toHaveLength(2);
      expect(profile.patches[0]).toBe(BASE_PATCH_PATH);
      expect(profile.patches[1]).toBe(getRolePatchPath('commander'));
      expect(profile.patches[1]).toContain('profile-override-commander.yaml');
    });

    it('capabilityId auto-resolves to commander', async () => {
      const { resolveModelClass } = await import('../../dsh/tool_provider.js');

      expect(resolveModelClass('code.edit')).toBe('commander');
      expect(resolveModelClass('edit.file')).toBe('commander');
      expect(resolveModelClass('generic.default')).toBe('commander');
    });
  });

  // ---------------------------------------------------------------------------
  // worker tier — low-cost batch
  // ---------------------------------------------------------------------------
  describe('worker profile (summary task)', () => {
    it('calls dsh --profile headless --patch base --patch worker with exit 0', async () => {
      const { callDshHeadless } = await import('../../dsh/dsh_client.js');

      const result = await callDshHeadless(WORKER_TASK, {
        modelClass: 'worker',
        timeoutMs: 60_000,
      });

      expect(result.exitCode, `dsh worker exit code: ${result.exitCode}\nstderr: ${result.stderr}`).toBe(0);
      expect(result.stdout.length, 'stdout must be non-empty').toBeGreaterThan(0);
      expect(result.wallMs, 'wall time must be recorded').toBeGreaterThan(0);
      expect(result.wallMs, 'worker timeout ceiling 60s').toBeLessThan(60_000);
    });

    it('worker profile resolves correct YAML files', async () => {
      const { loadProfile, BASE_PATCH_PATH, getRolePatchPath } = await import('../../dsh/profile.js');

      const profile = loadProfile('worker');
      expect(profile.modelClass).toBe('worker');
      expect(profile.patches).toHaveLength(2);
      expect(profile.patches[0]).toBe(BASE_PATCH_PATH);
      expect(profile.patches[1]).toBe(getRolePatchPath('worker'));
      expect(profile.patches[1]).toContain('profile-override-worker.yaml');
    });

    it('capabilityId auto-resolves to worker', async () => {
      const { resolveModelClass } = await import('../../dsh/tool_provider.js');

      expect(resolveModelClass('summary.text')).toBe('worker');
      expect(resolveModelClass('extract.entities')).toBe('worker');
    });
  });

  // ---------------------------------------------------------------------------
  // Hygiene guards
  // ---------------------------------------------------------------------------
  describe('hygiene guards', () => {
    it('DshResponse shape matches types.ts contract', async () => {
      const { callDshHeadless } = await import('../../dsh/dsh_client.js');

      const result = await callDshHeadless('Say hello in one word.', { modelClass: 'worker', timeoutMs: 30_000 });

      // All required fields present
      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');
      expect(typeof result.exitCode).toBe('number');
      expect(typeof result.wallMs).toBe('number');

      // Optional fields when available
      if (result.traceId) expect(typeof result.traceId).toBe('string');
      if (result.tokenUsage) {
        expect(typeof result.tokenUsage.inputTokens).toBe('number');
        expect(typeof result.tokenUsage.outputTokens).toBe('number');
      }
      if (result.denialReason) expect(typeof result.denialReason).toBe('string');
    });

    it('loadAllProfiles returns all three tiers', async () => {
      const { loadAllProfiles } = await import('../../dsh/profile.js');

      const all = loadAllProfiles();
      expect(Object.keys(all)).toHaveLength(3);
      expect(all.orch.modelClass).toBe('orch');
      expect(all.commander.modelClass).toBe('commander');
      expect(all.worker.modelClass).toBe('worker');
    });

    it('createToolProviderForClass creates correct provider', async () => {
      const { createToolProviderForClass } = await import('../../dsh/tool_provider.js');

      const orch = createToolProviderForClass('orch', 'orchestrator tool');
      expect(orch.capabilityId()).toBe('generic.default');
      expect(orch.description()).toBe('orchestrator tool');

      const worker = createToolProviderForClass('worker', 'worker tool');
      expect(worker.description()).toBe('worker tool');
    });
  });
});
