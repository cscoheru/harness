/**
 * T-M1c-QA-1: worker unit tests — expanded from M0c skeleton.
 *
 * Coverage targets:
 *   - health() returns stub { status, version }
 *   - capability() returns DriverCapabilities stub
 *   - register() returns stub worker id
 *   - drain() returns 'drained'
 *   - interrupt() resolves without throwing
 *   - heartbeat() resolves without throwing
 *   - getTaskStatus() returns 'pending' stub
 *   - run() returns empty async iterable
 *
 * @file wrapper/test/unit/worker.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  health,
  capability,
  register,
  drain,
  interrupt,
  heartbeat,
  getTaskStatus,
  run,
} from '../../orchestrator/worker.js';
import type { RunRequest, RunHandle } from '../../orchestrator/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRunRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    attempt_id: 'attempt-001',
    task_id: 'task-001',
    workflow_pack: 'default',
    workflow_version: '1.0.0',
    input_blob_id: null,
    capability_profile: {
      driver_kind: 'codex_exec',
      evidence_uri: '',
      max_concurrent_attempts: 1,
      supports_streaming: false,
      supports_interrupt: false,
      supports_heartbeat: false,
      supports_tool_gateway: false,
      notes: 'stub',
    },
    lease_token: 'lease-001',
    fence_version: 1,
    metadata: {},
    ...overrides,
  };
}

function makeRunHandle(): RunHandle {
  return {
    driver_kind: 'codex_exec',
    attempt_id: 'attempt-001',
    cancel_token: 'cancel-001',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('worker', () => {
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

  // ── capability() ─────────────────────────────────────────────────────────

  describe('capability()', () => {
    it('returns DriverCapabilities stub', () => {
      const caps = capability();
      expect(caps.driver_kind).toBe('codex_exec');
      expect(typeof caps.max_concurrent_attempts).toBe('number');
    });

    it('supports_interrupt is false (stub)', () => {
      const caps = capability();
      expect(caps.supports_interrupt).toBe(false);
    });

    it('supports_heartbeat is false (stub)', () => {
      const caps = capability();
      expect(caps.supports_heartbeat).toBe(false);
    });

    it('supports_streaming is false (stub)', () => {
      const caps = capability();
      expect(caps.supports_streaming).toBe(false);
    });

    it('notes includes stub indicator', () => {
      const caps = capability();
      expect(caps.notes).toMatch(/stub/i);
    });
  });

  // ── register() ──────────────────────────────────────────────────────────

  describe('register()', () => {
    it('returns stub worker id containing host', async () => {
      const workerId = await register('localhost:9000', '{}');
      expect(typeof workerId).toBe('string');
      expect(workerId.length).toBeGreaterThan(0);
    });

    it('worker id starts with stub prefix', async () => {
      const workerId = await register('worker-host', '{}');
      expect(workerId).toMatch(/^stub-worker-/);
    });

    it('accepts empty capabilities_json', async () => {
      const workerId = await register('any-host', '');
      expect(typeof workerId).toBe('string');
    });
  });

  // ── drain() ─────────────────────────────────────────────────────────────

  describe('drain()', () => {
    it('returns drained string', async () => {
      const res = await drain('worker-123');
      expect(res).toBe('drained');
    });

    it('accepts any workerId', async () => {
      const res = await drain('');
      expect(res).toBe('drained');
    });
  });

  // ── interrupt() ─────────────────────────────────────────────────────────

  describe('interrupt()', () => {
    it('does not throw', async () => {
      const handle = makeRunHandle();
      await expect(interrupt(handle, 'user cancelled')).resolves.not.toThrow();
    });

    it('resolves to undefined', async () => {
      const handle = makeRunHandle();
      const res = await interrupt(handle, 'timeout');
      expect(res).toBeUndefined();
    });
  });

  // ── heartbeat() ────────────────────────────────────────────────────────

  describe('heartbeat()', () => {
    it('does not throw', async () => {
      const handle = makeRunHandle();
      await expect(heartbeat(handle)).resolves.not.toThrow();
    });

    it('resolves to undefined', async () => {
      const handle = makeRunHandle();
      const res = await heartbeat(handle);
      expect(res).toBeUndefined();
    });
  });

  // ── getTaskStatus() ────────────────────────────────────────────────────

  describe('getTaskStatus()', () => {
    it('returns pending stub', async () => {
      const status = await getTaskStatus('any-task-id');
      expect(status).toBe('pending');
    });

    it('returns valid TaskStatus type', async () => {
      const status = await getTaskStatus('task-xyz');
      expect(['pending', 'dispatched', 'running', 'completed', 'failed', 'cancelled']).toContain(status);
    });

    it('accepts any taskId string', async () => {
      const status = await getTaskStatus('');
      expect(status).toBe('pending');
    });
  });

  // ── run() ─────────────────────────────────────────────────────────────

  describe('run()', () => {
    it('returns an async iterable', async () => {
      const request = makeRunRequest();
      const iterable = await run(request);
      expect(Symbol.asyncIterator in iterable).toBe(true);
    });

    it('yields no events (empty stub)', async () => {
      const request = makeRunRequest();
      const iterable = await run(request);
      const events = [];
      for await (const event of iterable) {
        events.push(event);
      }
      expect(events).toHaveLength(0);
    });

    it('accepts request with all fields', async () => {
      const fullRequest = makeRunRequest({
        input_blob_id: 'blob-full',
        metadata: { user: 'test', priority: 1 },
      });
      const iterable = await run(fullRequest);
      expect(Symbol.asyncIterator in iterable).toBe(true);
    });
  });
});
