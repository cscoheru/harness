/**
 * dsh_client cost-mode resolver unit tests.
 *
 * Covers the DEEPSEEK_COST_MODE / DSH_MODEL precedence contract added to
 * dsh_client.ts (cost-saving: orch downgrades v4-pro → v4-flash by default).
 *
 * Precedence (highest first):
 *   1. DSH_MODEL          — direct override, wins over everything
 *   2. DEEPSEEK_COST_MODE — 'full' keeps role-patch defaults;
 *                           'cheap' (default) downgrades every class to v4-flash
 *
 * buildArgs must only inject --model when the override differs from the
 * role-patch default (commander/worker args unchanged in cheap mode).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveModelOverride, buildArgs } from '../../dsh/dsh_client.js';
import { vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveModelOverride', () => {
  it('default (no env): orch downgraded to v4-flash, commander/worker untouched', () => {
    expect(resolveModelOverride('orch')).toBe('deepseek-v4-flash');
    expect(resolveModelOverride('commander')).toBeUndefined();
    expect(resolveModelOverride('worker')).toBeUndefined();
  });

  it('DEEPSEEK_COST_MODE=cheap is explicit-equivalent to the default', () => {
    vi.stubEnv('DEEPSEEK_COST_MODE', 'cheap');
    expect(resolveModelOverride('orch')).toBe('deepseek-v4-flash');
    expect(resolveModelOverride('commander')).toBeUndefined();
    expect(resolveModelOverride('worker')).toBeUndefined();
  });

  it('DEEPSEEK_COST_MODE=full: no override anywhere (role patch yaml decides)', () => {
    vi.stubEnv('DEEPSEEK_COST_MODE', 'full');
    expect(resolveModelOverride('orch')).toBeUndefined();
    expect(resolveModelOverride('commander')).toBeUndefined();
    expect(resolveModelOverride('worker')).toBeUndefined();
  });

  it('DSH_MODEL wins for every class, even in full mode', () => {
    vi.stubEnv('DSH_MODEL', 'deepseek-v4-pro');
    vi.stubEnv('DEEPSEEK_COST_MODE', 'full');
    expect(resolveModelOverride('orch')).toBe('deepseek-v4-pro');
    expect(resolveModelOverride('commander')).toBe('deepseek-v4-pro');
    expect(resolveModelOverride('worker')).toBe('deepseek-v4-pro');
  });

  it('DSH_MODEL wins over cheap mode', () => {
    vi.stubEnv('DSH_MODEL', 'my-custom-model');
    vi.stubEnv('DEEPSEEK_COST_MODE', 'cheap');
    expect(resolveModelOverride('orch')).toBe('my-custom-model');
  });
});

describe('buildArgs cost-mode injection', () => {
  it('cheap mode (default): orch args carry --model v4-flash after both patches', () => {
    const args = buildArgs('orch', 'hello');
    const patchCount = args.filter((a) => a === '--patch').length;
    expect(patchCount).toBe(2);
    const modelIdx = args.indexOf('--model');
    expect(modelIdx).toBeGreaterThan(-1);
    expect(args[modelIdx + 1]).toBe('deepseek-v4-flash');
    // --model must come after both --patch entries (CLI override layers last)
    const lastPatchIdx = args.lastIndexOf('--patch');
    expect(modelIdx).toBeGreaterThan(lastPatchIdx);
    // prompt positional still last-ish (before extraArgs)
    expect(args).toContain('hello');
  });

  it('cheap mode (default): commander/worker args identical to pre-cost-mode shape (no --model)', () => {
    for (const cls of ['commander', 'worker'] as const) {
      const args = buildArgs(cls, 'hello');
      expect(args).not.toContain('--model');
      expect(args.filter((a) => a === '--patch').length).toBe(2);
    }
  });

  it('full mode: no --model for any class (role patch authoritative)', () => {
    vi.stubEnv('DEEPSEEK_COST_MODE', 'full');
    for (const cls of ['orch', 'commander', 'worker'] as const) {
      expect(buildArgs(cls, 'hello')).not.toContain('--model');
    }
  });

  it('DSH_MODEL override: injected verbatim for every class', () => {
    vi.stubEnv('DSH_MODEL', 'deepseek-v4-pro');
    for (const cls of ['orch', 'commander', 'worker'] as const) {
      const args = buildArgs(cls, 'hello');
      const modelIdx = args.indexOf('--model');
      expect(modelIdx).toBeGreaterThan(-1);
      expect(args[modelIdx + 1]).toBe('deepseek-v4-pro');
    }
  });
});
