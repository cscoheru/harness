/**
 * T-V1.2.0J+.6-QA-1: F3+ signal integration tests for execution_driver.
 *
 * Coverage (per §3.1 of v1.2.0j+.6+ plan):
 *   - pre-aborted request.signal yields driver.interrupted (not driver.failed)
 *   - no signal yields driver.failed on error (backward compat)
 *   - signal abort mid-run yields driver.interrupted
 *
 * Uses vi.spyOn on deepseekInvoke to avoid real network calls. The driver
 * stream iterates events until it yields the terminal kind (driver.finished,
 * driver.failed, or driver.interrupted), then we assert on the last event.
 *
 * @file test/unit/execution_driver_signal.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpawnDshDriver } from '../../orchestrator/execution_driver.js';
import type { RunRequest, DriverEvent, DriverCapabilities } from '../../orchestrator/types.js';
import * as deepseekModule from '../../dsh/deepseek_client.js';

function makeRequest(signal?: AbortSignal): RunRequest {
  const capability: DriverCapabilities = {
    driver_kind: 'codex_exec',
    evidence_uri: 'spec/capabilities/worker.json',
    max_concurrent_attempts: 1,
    supports_streaming: true,
    supports_interrupt: true,
    supports_heartbeat: true,
    supports_tool_gateway: false,
  };
  return {
    attempt_id: `atp-signal-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    task_id: `task-signal-test-${Math.random().toString(36).slice(2, 9)}`,
    workflow_pack: 'test',
    workflow_version: '1.2.0j+.6',
    input_blob_id: null,
    capability_profile: capability,
    lease_token: `lease-signal-test-${Date.now()}`,
    fence_version: 1,
    metadata: {},
    signal,
  };
}

describe('SpawnDshDriver — F3+ signal integration', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pre-aborted signal yields driver.interrupted (not driver.failed)', async () => {
    // v1.2.0j+.6+ F3+: when request.signal is already aborted before run(),
    // the driver stream must emit driver.interrupted, not driver.failed.
    const ctrl = new AbortController();
    ctrl.abort(); // abort BEFORE run() is called
    const req = makeRequest(ctrl.signal);

    // Mock deepseekInvoke to reject with a network error
    const spy = vi.spyOn(deepseekModule, 'deepseekInvoke').mockRejectedValue(
      new Error('mocked network fail'),
    );

    const driver = new SpawnDshDriver({ dshHttpUrl: 'http://localhost:9999' });
    const events: DriverEvent[] = [];
    for await (const ev of driver.run(req)) {
      events.push(ev);
    }

    // Critical assertion: external abort before run() must produce
    // driver.interrupted, not driver.failed.
    const last = events[events.length - 1];
    expect(last).toBeDefined();
    expect(last!.kind).toBe('driver.interrupted');
    expect(spy).toHaveBeenCalled();
  });

  it('no signal yields driver.failed on error (backward compat)', async () => {
    // v1.2.0j+.6+ F3+: backward compat — when no signal is provided,
    // error path still emits driver.failed (existing behavior).
    const req = makeRequest(undefined);

    vi.spyOn(deepseekModule, 'deepseekInvoke').mockRejectedValue(
      new Error('mocked network fail'),
    );

    const driver = new SpawnDshDriver({ dshHttpUrl: 'http://localhost:9999' });
    const events: DriverEvent[] = [];
    for await (const ev of driver.run(req)) {
      events.push(ev);
    }

    const last = events[events.length - 1];
    expect(last).toBeDefined();
    expect(last!.kind).toBe('driver.failed');
  });

  it('signal abort mid-run yields driver.interrupted', async () => {
    // v1.2.0j+.6+ F3+: cascading abort — when orchestrator.cancel() fires
    // ctrl.abort() while deepseekInvoke is in flight, the fetch is aborted
    // and the driver emits driver.interrupted.
    const ctrl = new AbortController();
    const req = makeRequest(ctrl.signal);

    vi.spyOn(deepseekModule, 'deepseekInvoke').mockImplementation(
      async () => {
        // Simulate cancel() firing during the in-flight fetch
        setTimeout(() => ctrl.abort(), 10);
        // Wait for the abort to settle + a margin
        await new Promise((r) => setTimeout(r, 50));
        // Throw an AbortError-like error (the deepseekInvoke fetch wrapper
        // would throw this when the underlying AbortController fires)
        throw new DOMException('The user aborted the request.', 'AbortError');
      },
    );

    const driver = new SpawnDshDriver({ dshHttpUrl: 'http://localhost:9999' });
    const events: DriverEvent[] = [];
    for await (const ev of driver.run(req)) {
      events.push(ev);
    }

    const last = events[events.length - 1];
    expect(last).toBeDefined();
    expect(last!.kind).toBe('driver.interrupted');
  });
});
