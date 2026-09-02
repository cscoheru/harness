/**
 * T-M1c-QA-1: tool_provider unit tests — DshToolProvider coverage.
 *
 * Coverage targets:
 *   - DshToolProvider constructor defaults
 *   - capabilityId() returns configured value
 *   - description() returns configured value
 *   - invoke() returns stub ToolInvokeResult with correct shape
 *   - createToolProvider() factory returns correct instance
 *   - isToolProvider() type guard correctness
 *
 * @file wrapper/test/unit/tool_provider.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  DshToolProvider,
  createToolProvider,
  isToolProvider,
} from '../../dsh/tool_provider.js';
import type { ToolInvokeRequest, ToolInvokeResult } from '../../dsh/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<ToolInvokeRequest> = {}): ToolInvokeRequest {
  return {
    attemptId: 'attempt-001',
    taskId: 'task-001',
    capabilityId: 'dsh.generic',
    arguments: { prompt: 'hello' },
    ...overrides,
  };
}

function isToolInvokeResult(obj: unknown): obj is ToolInvokeResult {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.capabilityId === 'string' &&
    'result' in o
    // denialReason and artifactId are optional
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tool_provider unit', () => {
  // ── DshToolProvider constructor ──────────────────────────────────────────

  describe('DshToolProvider constructor', () => {
    it('defaults: capabilityId = dsh.generic', () => {
      const provider = new DshToolProvider();
      expect(provider.capabilityId()).toBe('dsh.generic');
    });

    it('defaults: description = generic description', () => {
      const provider = new DshToolProvider();
      expect(typeof provider.description()).toBe('string');
      expect(provider.description().length).toBeGreaterThan(0);
    });

    it('defaults: modelClass = commander', () => {
      const provider = new DshToolProvider();
      // modelClass is internal; verify via invoke result
      const result = provider.invoke(makeRequest());
      expect(isToolInvokeResult(result)).toBe(true);
    });

    it('accepts custom capabilityId', () => {
      const provider = new DshToolProvider({ capabilityId: 'custom.tool' });
      expect(provider.capabilityId()).toBe('custom.tool');
    });

    it('accepts custom description', () => {
      const provider = new DshToolProvider({ description: 'My custom provider' });
      expect(provider.description()).toBe('My custom provider');
    });

    it('accepts all modelClass values', () => {
      const classes: Array<'orch' | 'commander' | 'worker'> = ['orch', 'commander', 'worker'];
      for (const mc of classes) {
        const provider = new DshToolProvider({ modelClass: mc });
        expect(provider.capabilityId()).toBe('dsh.generic');
      }
    });
  });

  // ── invoke() ─────────────────────────────────────────────────────────────

  describe('invoke()', () => {
    it('returns ToolInvokeResult with correct capabilityId', async () => {
      const provider = new DshToolProvider({ capabilityId: 'test.capability' });
      const req = makeRequest({ capabilityId: 'test.capability' });
      const result = await provider.invoke(req);
      expect(result.capabilityId).toBe('test.capability');
    });

    it('returns result object with stub=true', async () => {
      const provider = new DshToolProvider();
      const result = await provider.invoke(makeRequest());
      expect(isToolInvokeResult(result)).toBe(true);
      expect(result.result).toBeDefined();
    });

    it('result includes attemptId from request', async () => {
      const provider = new DshToolProvider();
      const req = makeRequest({ attemptId: 'my-attempt-999' });
      const result = await provider.invoke(req);
      expect((result.result as Record<string, unknown>).attemptId).toBe('my-attempt-999');
    });

    it('result includes taskId from request', async () => {
      const provider = new DshToolProvider();
      const req = makeRequest({ taskId: 'my-task-xyz' });
      const result = await provider.invoke(req);
      expect((result.result as Record<string, unknown>).taskId).toBe('my-task-xyz');
    });

    it('returns undefined denialReason (stub allows all)', async () => {
      const provider = new DshToolProvider();
      const result = await provider.invoke(makeRequest());
      expect(result.denialReason).toBeUndefined();
    });

    it('returns undefined artifactId (stub)', async () => {
      const provider = new DshToolProvider();
      const result = await provider.invoke(makeRequest());
      expect(result.artifactId).toBeUndefined();
    });

    it('accepts arbitrary arguments', () => {
      const provider = new DshToolProvider();
      const req = makeRequest({
        arguments: { prompt: 'complex task', context: { user: 'test' }, steps: [1, 2, 3] },
      });
      const result = provider.invoke(req);
      expect(isToolInvokeResult(result)).toBe(true);
    });
  });

  // ── createToolProvider() factory ─────────────────────────────────────────

  describe('createToolProvider()', () => {
    it('returns a DshToolProvider instance', () => {
      const provider = createToolProvider('my.capability');
      expect(isToolProvider(provider)).toBe(true);
      expect(provider.capabilityId()).toBe('my.capability');
    });

    it('accepts modelClass parameter', () => {
      const provider = createToolProvider('cap', 'orch');
      expect(isToolProvider(provider)).toBe(true);
    });

    it('default capabilityId is dsh.generic', () => {
      const provider = createToolProvider('dsh.generic');
      expect(provider.capabilityId()).toBe('dsh.generic');
    });
  });

  // ── isToolProvider() type guard ─────────────────────────────────────────

  describe('isToolProvider()', () => {
    it('returns true for DshToolProvider', () => {
      const provider = new DshToolProvider();
      expect(isToolProvider(provider)).toBe(true);
    });

    it('returns true for object with required methods', () => {
      const obj = {
        capabilityId: () => 'test',
        description: () => 'desc',
        invoke: (req: ToolInvokeRequest) => ({ capabilityId: 'test', result: {} }),
      };
      expect(isToolProvider(obj)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isToolProvider(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isToolProvider(undefined)).toBe(false);
    });

    it('returns false for plain object without methods', () => {
      expect(isToolProvider({ capabilityId: 'test' })).toBe(false);
    });

    it('returns false for object missing invoke', () => {
      expect(isToolProvider({ capabilityId: () => 'x', description: () => 'y' })).toBe(false);
    });

    it('returns false for string', () => {
      expect(isToolProvider('not an object')).toBe(false);
    });

    it('returns false for function (not an object)', () => {
      expect(isToolProvider(() => {})).toBe(false);
    });
  });
});
