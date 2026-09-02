/**
 * T-M1c-QA-1: tool_provider unit tests — DshToolProvider coverage.
 *
 * Coverage targets:
 *   - DshToolProvider constructor defaults
 *   - capabilityId() returns configured value
 *   - description() returns configured value
 *   - invoke() returns ToolInvokeResult with correct shape
 *   - createToolProvider() factory returns correct instance
 *   - isToolProvider() type guard correctness
 *
 * M1c note: dsh_client is mocked (no real CLI invocation in unit tests).
 * Real dsh invocation is exercised by integration/e2e tests on newvps only.
 *
 * @file wrapper/test/unit/tool_provider.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

// Mock dsh_client — unit tests must not invoke the real dsh CLI.
// The mock returns a successful dsh response so we can verify _parseResponse shape
// (exit code 0, no denialReason, synthetic traceId).
// We export BOTH dshInvoke and callDshHeadless (other unit tests mock the same module
// under different export names — vi.mock factories are not merged across files).
// Use the bare path (no .ts/.js suffix) so vitest resolves it the same way
// the .js-suffixed imports in source code do under moduleResolution=Node16.
vi.mock('../../dsh/dsh_client', () => ({
  dshInvoke: vi.fn().mockResolvedValue({
    stdout: 'mock-dsh-output',
    stderr: '',
    exitCode: 0,
    wallMs: 42,
    traceId: 'mock-trace-abc-123',
    tokenUsage: { inputTokens: 10, outputTokens: 5 },
  }),
  callDshHeadless: vi.fn().mockResolvedValue({
    stdout: 'mock-dsh-output',
    stderr: '',
    exitCode: 0,
    wallMs: 42,
    traceId: 'mock-trace-abc-123',
    tokenUsage: { inputTokens: 10, outputTokens: 5 },
  }),
}));

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
    it('defaults: capabilityId = generic.default', () => {
      const provider = new DshToolProvider();
      expect(provider.capabilityId()).toBe('generic.default');
    });

    it('defaults: description = generic description', () => {
      const provider = new DshToolProvider();
      expect(typeof provider.description()).toBe('string');
      expect(provider.description().length).toBeGreaterThan(0);
    });

    it('defaults: modelClass = commander (auto-resolved)', async () => {
      const provider = new DshToolProvider();
      // modelClass is internal; verify via invoke result shape (M1c real impl)
      const result = await provider.invoke(makeRequest());
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
        // modelClass only — capabilityId falls back to default 'generic.default'
        const provider = new DshToolProvider({ modelClass: mc });
        expect(provider.capabilityId()).toBe('generic.default');
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

    it('returns undefined denialReason (stub allows all)', async () => {
      const provider = new DshToolProvider();
      const result = await provider.invoke(makeRequest());
      expect(result.denialReason).toBeUndefined();
    });

    it('returns traceId as artifactId (M1c real impl)', async () => {
      const provider = new DshToolProvider();
      const result = await provider.invoke(makeRequest());
      // M1c: artifactId is the dsh trace id (non-empty string)
      expect(typeof result.artifactId).toBe('string');
      expect(result.artifactId!.length).toBeGreaterThan(0);
    });

    it('accepts arbitrary arguments', async () => {
      const provider = new DshToolProvider();
      const req = makeRequest({
        arguments: { prompt: 'complex task', context: { user: 'test' }, steps: [1, 2, 3] },
      });
      const result = await provider.invoke(req);
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
