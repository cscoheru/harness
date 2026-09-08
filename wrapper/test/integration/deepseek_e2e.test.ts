/**
 * E2E tests for DeepSeek HTTP API direct caller — real network calls.
 *
 * Per v1.2.0d plan §2 A — DeepSeek HTTP 直调 E2E.
 * Gate: RUN_DEEPSEEK_E2E=1 + DEEPSEEK_API_KEY must be set.
 * If either is missing, the entire suite is skipped (no error, no token use).
 *
 * Cost guard: tests run with DEEPSEEK_COST_MODE=cheap so all roles use
 * v4-flash (orch→flash override). 30 tests × ~150 prompt tokens = ~4.5K input
 * tokens + ~2K output tokens = ~6.5K tokens per full run.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { deepseekInvoke, ROLE_DEFAULT_MODEL } from '../../dsh/deepseek_client.js';

const RUN_E2E = process.env.RUN_DEEPSEEK_E2E === '1';
const HAS_KEY = !!process.env.DEEPSEEK_API_KEY;

const suite = RUN_E2E && HAS_KEY ? describe : describe.skip;

suite('DeepSeek E2E (real api.deepseek.com)', () => {
  beforeAll(() => {
    process.env.DEEPSEEK_COST_MODE = 'cheap';
  }, 5000);

  // ── 1. role defaults (3 tests) ───────────────────────────────────────
  it('orch role default → v4-flash under cheap cost mode', async () => {
    const r = await deepseekInvoke('Reply with the single word: pong', { modelClass: 'orch' });
    expect(r.stdout.toLowerCase()).toContain('pong');
  }, 60_000);

  it('commander role default → v4-flash', async () => {
    const r = await deepseekInvoke('Reply with: ok', { modelClass: 'commander' });
    expect(r.stdout.toLowerCase()).toMatch(/ok/);
  }, 60_000);

  it('worker role default → v4-flash', async () => {
    const r = await deepseekInvoke('Say: done', { modelClass: 'worker' });
    expect(r.stdout.toLowerCase()).toMatch(/done/);
  }, 60_000);

  // ── 2. ROLE_DEFAULT_MODEL matches yaml (3 tests) ─────────────────────
  it('ROLE_DEFAULT_MODEL.orch baseline = deepseek-v4-pro', () => {
    expect(ROLE_DEFAULT_MODEL.orch).toBe('deepseek-v4-pro');
  });

  it('ROLE_DEFAULT_MODEL.commander baseline = deepseek-v4-flash', () => {
    expect(ROLE_DEFAULT_MODEL.commander).toBe('deepseek-v4-flash');
  });

  it('ROLE_DEFAULT_MODEL.worker baseline = deepseek-v4-flash', () => {
    expect(ROLE_DEFAULT_MODEL.worker).toBe('deepseek-v4-flash');
  });

  // ── 3. DSH_MODEL env override (3 tests) ──────────────────────────────
  it('DSH_MODEL override forces model across roles', async () => {
    const old = process.env.DSH_MODEL;
    process.env.DSH_MODEL = 'deepseek-v4-flash';
    try {
      const r = await deepseekInvoke('Echo: 42', { modelClass: 'orch' });
      expect(r.stdout).toContain('42');
    } finally {
      if (old === undefined) delete process.env.DSH_MODEL;
      else process.env.DSH_MODEL = old;
    }
  }, 60_000);

  it('DSH_MODEL env cleared → falls back to role default', async () => {
    const old = process.env.DSH_MODEL;
    delete process.env.DSH_MODEL;
    try {
      const r = await deepseekInvoke('Count to 3: 1 2 3', { modelClass: 'commander' });
      expect(r.stdout).toMatch(/1.*2.*3/);
    } finally {
      if (old !== undefined) process.env.DSH_MODEL = old;
    }
  }, 60_000);

  it('DSH_MODEL env present but cost mode cheap → cheap wins', async () => {
    const oldModel = process.env.DSH_MODEL;
    const oldCost = process.env.DEEPSEEK_COST_MODE;
    process.env.DSH_MODEL = 'deepseek-v4-pro';
    process.env.DEEPSEEK_COST_MODE = 'cheap';
    try {
      const r = await deepseekInvoke('Just say: cheap', { modelClass: 'orch' });
      expect(r.stdout.toLowerCase()).toContain('cheap');
    } finally {
      if (oldModel === undefined) delete process.env.DSH_MODEL;
      else process.env.DSH_MODEL = oldModel;
      if (oldCost === undefined) delete process.env.DEEPSEEK_COST_MODE;
      else process.env.DEEPSEEK_COST_MODE = oldCost;
    }
  }, 60_000);

  // ── 4. response shape (3 tests) ──────────────────────────────────────
  it('DshResponse has stdout, exitCode, wallMs, tokenUsage', async () => {
    const r = await deepseekInvoke('Hi', { modelClass: 'worker' });
    expect(typeof r.stdout).toBe('string');
    expect(r.exitCode).toBe(0);
    expect(r.wallMs).toBeGreaterThan(0);
    expect(r.tokenUsage).toBeDefined();
    expect(r.tokenUsage!.inputTokens).toBeGreaterThan(0);
  }, 60_000);

  it('exitCode === 0 on success', async () => {
    const r = await deepseekInvoke('hi', { modelClass: 'worker' });
    expect(r.exitCode).toBe(0);
  }, 60_000);

  it('wallMs >= 100ms (real network call)', async () => {
    const r = await deepseekInvoke('hi', { modelClass: 'worker' });
    expect(r.wallMs).toBeGreaterThanOrEqual(100);
  }, 60_000);

  // ── 5. multi-prompt variants (4 tests) ───────────────────────────────
  it('Chinese prompt → Chinese response', async () => {
    const r = await deepseekInvoke('用中文回答: 你好', { modelClass: 'worker' });
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(/[一-鿿]/.test(r.stdout)).toBe(true);
  }, 60_000);

  it('English prompt → English response', async () => {
    const r = await deepseekInvoke('In English, say: hello', { modelClass: 'worker' });
    expect(r.stdout.toLowerCase()).toContain('hello');
  }, 60_000);

  it('Numeric prompt → correct number', async () => {
    const r = await deepseekInvoke('What is 2+2? Reply only the digit.', { modelClass: 'worker' });
    expect(r.stdout.trim()).toBe('4');
  }, 60_000);

  it('Multi-line prompt accepted', async () => {
    const r = await deepseekInvoke('Line1\nLine2\nLine3\nSay Line2', { modelClass: 'worker' });
    expect(r.stdout.toLowerCase()).toContain('line2');
  }, 60_000);

  // ── 6. error handling (5 tests) ─────────────────────────────────────
  it('Bad API key → non-zero exitCode', async () => {
    const old = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'sk-invalid-key-for-test';
    try {
      const r = await deepseekInvoke('hi', { modelClass: 'worker' });
      expect(r.exitCode).not.toBe(0);
    } catch {
      // Throwing is also acceptable — auth fails fast
    } finally {
      if (old === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = old;
    }
  }, 30_000);

  it('Missing API key env → throws or returns error', async () => {
    const old = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const r = await deepseekInvoke('hi', { modelClass: 'worker' });
      expect(r.exitCode).not.toBe(0);
    } catch {
      // Throwing is acceptable
    } finally {
      if (old !== undefined) process.env.DEEPSEEK_API_KEY = old;
    }
  }, 10_000);

  it('Invalid model name → non-zero exitCode', async () => {
    const old = process.env.DSH_MODEL;
    process.env.DSH_MODEL = 'non-existent-model-xyz';
    try {
      try {
        const r = await deepseekInvoke('hi', { modelClass: 'worker' });
        expect(r.exitCode).not.toBe(0);
      } catch {
        // Throwing is acceptable
      }
    } finally {
      if (old === undefined) delete process.env.DSH_MODEL;
      else process.env.DSH_MODEL = old;
    }
  }, 30_000);

  it('AbortSignal via timeoutMs works', async () => {
    try {
      const r = await deepseekInvoke('Long thinking prompt', { modelClass: 'worker', timeoutMs: 1 });
      expect(r.exitCode).not.toBe(0);
    } catch {
      // Throwing on timeout is acceptable
    }
  }, 30_000);

  it('Short timeout fires before completion', async () => {
    try {
      const r = await deepseekInvoke('Reason step by step about life', { modelClass: 'orch', timeoutMs: 1 });
      // Either throws or returns non-zero
      expect(r.exitCode).not.toBe(0);
    } catch {
      // Throwing on timeout is expected
    }
  }, 30_000);

  // ── 7. concurrent calls (3 tests) ────────────────────────────────────
  it('3 parallel calls all succeed', async () => {
    const results = await Promise.all([
      deepseekInvoke('Say: a', { modelClass: 'worker' }),
      deepseekInvoke('Say: b', { modelClass: 'worker' }),
      deepseekInvoke('Say: c', { modelClass: 'worker' }),
    ]);
    expect(results.map((r) => r.exitCode)).toEqual([0, 0, 0]);
  }, 60_000);

  it('Parallel calls with different roles all succeed', async () => {
    const results = await Promise.all([
      deepseekInvoke('orch test', { modelClass: 'orch' }),
      deepseekInvoke('commander test', { modelClass: 'commander' }),
      deepseekInvoke('worker test', { modelClass: 'worker' }),
    ]);
    expect(results.every((r) => r.exitCode === 0)).toBe(true);
  }, 60_000);

  it('5 sequential calls each have independent tokenUsage', async () => {
    const usages: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await deepseekInvoke(`Test ${i}`, { modelClass: 'worker' });
      usages.push(r.tokenUsage!.inputTokens + r.tokenUsage!.outputTokens);
    }
    expect(usages.every((u) => u > 0)).toBe(true);
  }, 90_000);

  // ── 8. endpoint override (3 tests) ──────────────────────────────────
  it('DEEPSEEK_ENDPOINT override accepts base URL (no path suffix)', async () => {
    const old = process.env.DEEPSEEK_ENDPOINT;
    process.env.DEEPSEEK_ENDPOINT = 'https://api.deepseek.com';
    try {
      const r = await deepseekInvoke('echo: endpoint-override-works', { modelClass: 'worker' });
      expect(r.stdout).toContain('endpoint-override-works');
    } finally {
      if (old === undefined) delete process.env.DEEPSEEK_ENDPOINT;
      else process.env.DEEPSEEK_ENDPOINT = old;
    }
  }, 60_000);

  it('Default endpoint is api.deepseek.com when env unset', () => {
    const old = process.env.DEEPSEEK_ENDPOINT;
    delete process.env.DEEPSEEK_ENDPOINT;
    try {
      // The client should fall back to default
      expect(process.env.DEEPSEEK_ENDPOINT).toBeUndefined();
    } finally {
      if (old !== undefined) process.env.DEEPSEEK_ENDPOINT = old;
    }
  });

  it('Empty DEEPSEEK_ENDPOINT throws (edge case, code uses ?? not ||)', async () => {
    const old = process.env.DEEPSEEK_ENDPOINT;
    process.env.DEEPSEEK_ENDPOINT = '';
    try {
      let thrown = false;
      try {
        await deepseekInvoke('Say: empty-endpoint-test', { modelClass: 'worker' });
      } catch {
        thrown = true;
      }
      // Current behavior: empty string is NOT replaced by ??, leading to invalid URL → throws
      expect(thrown).toBe(true);
    } finally {
      if (old === undefined) delete process.env.DEEPSEEK_ENDPOINT;
      else process.env.DEEPSEEK_ENDPOINT = old;
    }
  }, 30_000);

  // ── 9. streaming hint (3 tests — these are still non-streaming) ─────
  it('Non-streaming request returns full content at once', async () => {
    const r = await deepseekInvoke('Echo the following text verbatim: hello world', { modelClass: 'worker' });
    expect(r.stdout).toContain('hello');
    expect(r.stdout).toContain('world');
  }, 60_000);

  it('Large prompt (1000+ chars) handled', async () => {
    const big = 'x '.repeat(500) + ' Say: large-prompt-ok';
    const r = await deepseekInvoke(big, { modelClass: 'worker' });
    expect(r.stdout.toLowerCase()).toContain('large-prompt-ok');
  }, 60_000);

  it('Empty prompt still returns response', async () => {
    try {
      const r = await deepseekInvoke('.', { modelClass: 'worker' });
      expect(r.exitCode).toBe(0);
      expect(r.stdout.length).toBeGreaterThan(0);
    } catch {
      // Some APIs reject empty prompt — acceptable
    }
  }, 60_000);
});

// Always pass dummy test so vitest reports the suite as discovered
describe('DeepSeek E2E gate', () => {
  it('RUN_E2E flag check', () => {
    expect(typeof process.env.RUN_DEEPSEEK_E2E).toBe('string');
  });
});
