/**
 * pwa_server_shutdown.test.ts — G8.1 SIGTERM handler unit tests for pwa_server.ts.
 *
 * v1.2.0j+.1 NEW. Mirrors wrapper/test/unit/server.test.ts:243-365 G8.1 block
 * pattern (8 it blocks for registerShutdown in server.ts). For pwa_server.ts
 * the registerShutdown is minimal (server.close + process.exit only), so 5
 * tests cover the full contract.
 *
 * Uses silent call-recording spy for process.exit (NOT throwing — matches
 * existing test pattern in wrapper/test/unit/server.test.ts). This lets us
 * observe exit(0) call without actually killing the test runner process.
 *
 * @file wrapper/test/unit/pwa_server_shutdown.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'http';

import { registerShutdown } from '../../orchestrator/pwa_server.js';

describe('v1.2.0j+.1 pwa_server.ts G8.1 registerShutdown', () => {
  let mockServer: { close: ReturnType<typeof vi.fn> };
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let sigtermListeners: Array<() => void>;
  let sigintListeners: Array<() => void>;

  beforeEach(() => {
    // Mock http.Server with a close() method that calls back immediately
    // (simulates server.close() with no in-flight connections — fast path).
    mockServer = { close: vi.fn((cb: () => void) => cb()) };

    // Silent call-recording spy — does NOT throw, so test process doesn't die
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    // Track signal listeners so we can clean up + trigger manually
    sigtermListeners = [];
    sigintListeners = [];
    const origOn = process.on.bind(process);
    vi.spyOn(process, 'on').mockImplementation((event: string, listener: any) => {
      if (event === 'SIGTERM') sigtermListeners.push(listener);
      else if (event === 'SIGINT') sigintListeners.push(listener);
      else origOn(event, listener);
      return process;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers SIGTERM and SIGINT handlers', () => {
    registerShutdown(mockServer as unknown as Server);
    expect(sigtermListeners.length).toBe(1);
    expect(sigintListeners.length).toBe(1);
  });

  it('shutdown calls server.close() and process.exit(0) on SIGTERM', async () => {
    registerShutdown(mockServer as unknown as Server);
    sigtermListeners[0]();
    // Wait for the async shutdown pipeline to complete
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('shutdown calls server.close() and process.exit(0) on SIGINT', async () => {
    registerShutdown(mockServer as unknown as Server);
    sigintListeners[0]();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('idempotent: second SIGTERM returns early without calling close twice', async () => {
    registerShutdown(mockServer as unknown as Server);
    sigtermListeners[0]();
    sigtermListeners[0]();  // second signal — should be no-op
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledTimes(1);
  });

  it('throws in server.close() does not prevent process.exit(0)', async () => {
    const throwingServer = {
      close: vi.fn((_cb: () => void) => {
        throw new Error('mock close error');
      }),
    };
    registerShutdown(throwingServer as unknown as Server);
    sigtermListeners[0]();
    await new Promise((resolve) => setImmediate(resolve));
    // close was called but threw — shutdown should still call process.exit(0)
    expect(throwingServer.close).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });
});
