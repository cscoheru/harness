/**
 * T-M1c-QA-1: dsh_client unit tests — expanded coverage for dsh_client.ts.
 *
 * M0c skeleton (dsh_client.test.ts) is a mock test — this file adds
 * real unit coverage for:
 *   - DshOpts interface validation
 *   - DshResponse shape validation
 *   - callDshHeadless stub returns correct shape
 *   - callDshHttp throws not-implemented
 *   - Type guard / edge cases
 *
 * Real dsh CLI calls are in dsh_real.test.ts (integration).
 *
 * @file wrapper/test/unit/dsh_client.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callDshHeadless, callDshHttp } from '../../dsh/dsh_client.js';
import type { DshOpts, DshResponse } from '../../dsh/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDshResponse(obj: unknown): obj is DshResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.stdout === 'string' &&
    typeof o.stderr === 'string' &&
    typeof o.exitCode === 'number' &&
    typeof o.wallMs === 'number'
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('dsh_client unit', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── DshOpts defaults ──────────────────────────────────────────────────────

  describe('DshOpts defaults', () => {
    it('accepts undefined opts (uses defaults)', async () => {
      // callDshHeadless with no opts should use timeoutMs=120_000
      // It will fail to spawn dsh (no real dsh in unit test env)
      // but the returned object should have correct shape
      const result = await callDshHeadless('test prompt');
      expect(isDshResponse(result)).toBe(true);
      expect(result.wallMs).toBeGreaterThanOrEqual(0);
    });

    it('accepts empty object opts', async () => {
      const result = await callDshHeadless('hello', {});
      expect(isDshResponse(result)).toBe(true);
    });

    it('accepts modelClass values', async () => {
      const modelClasses: DshOpts['modelClass'][] = ['orch', 'commander', 'worker'];
      for (const mc of modelClasses) {
        const result = await callDshHeadless('test', { modelClass: mc });
        expect(isDshResponse(result)).toBe(true);
      }
    });

    it('accepts custom timeoutMs', async () => {
      const result = await callDshHeadless('test', { timeoutMs: 5000 });
      expect(isDshResponse(result)).toBe(true);
    });

    it('accepts extraArgs', async () => {
      const result = await callDshHeadless('test', { extraArgs: ['--verbose'] });
      expect(isDshResponse(result)).toBe(true);
    });

    it('accepts apiKey (env-inject placeholder)', async () => {
      const result = await callDshHeadless('test', { apiKey: 'sk-test-placeholder' });
      expect(isDshResponse(result)).toBe(true);
    });
  });

  // ── DshResponse shape ─────────────────────────────────────────────────────

  describe('DshResponse shape', () => {
    it('all required fields are strings or numbers', async () => {
      const result = await callDshHeadless('test prompt');
      expect(isDshResponse(result)).toBe(true);
    });

    it('wallMs is non-negative', async () => {
      const result = await callDshHeadless('test');
      expect(result.wallMs).toBeGreaterThanOrEqual(0);
    });

    it('exitCode is integer', async () => {
      const result = await callDshHeadless('test');
      expect(Number.isInteger(result.exitCode)).toBe(true);
    });

    it('stdout and stderr are strings', async () => {
      const result = await callDshHeadless('test');
      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');
    });
  });

  // ── callDshHttp throws ────────────────────────────────────────────────────

  describe('callDshHttp()', () => {
    it('throws not implemented', async () => {
      await expect(callDshHttp('test')).rejects.toThrow('not implemented');
    });

    it('throws with opts passed', async () => {
      await expect(
        callDshHttp('test', { modelClass: 'orch', timeoutMs: 5000 })
      ).rejects.toThrow('not implemented');
    });
  });

  // ── Type guard ────────────────────────────────────────────────────────────

  describe('isDshResponse (type guard)', () => {
    it('returns true for valid DshResponse', async () => {
      const result = await callDshHeadless('test');
      expect(isDshResponse(result)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isDshResponse(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isDshResponse(undefined)).toBe(false);
    });

    it('returns false for number', () => {
      expect(isDshResponse(42)).toBe(false);
    });

    it('returns false for object missing exitCode', () => {
      expect(isDshResponse({ stdout: 'ok', stderr: '', wallMs: 0 })).toBe(false);
    });

    it('returns false for object missing wallMs', () => {
      expect(isDshResponse({ stdout: 'ok', stderr: '', exitCode: 0 })).toBe(false);
    });
  });
});
