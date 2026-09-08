/**
 * heartbeat_sender unit tests.
 *
 * Covers the worker self-registration contract added for the 3-host deploy:
 * first beat registers (no worker_id in body, captures returned id),
 * subsequent beats carry the worker_id, and non-2xx responses throw so the
 * loop retries on the next tick.
 */
import { describe, it, expect, vi } from 'vitest';
import { sendOneBeat } from '../../orchestrator/heartbeat_sender.js';

vi.mock('../../orchestrator/worker.js', () => ({
  capability: () => ({ driver_kind: 'dsh_exec', max_concurrent_attempts: 2 }),
}));

function mockFetch(status: number, body: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('sendOneBeat', () => {
  const opts = {
    target: 'http://newvps.fish-harness.ts.net:4000',
    host: 'edge1.fish-harness.ts.net',
    intervalMs: 10_000,
  };

  it('first beat registers: no worker_id in body, captures returned id', async () => {
    const f = mockFetch(200, { worker_id: 'w-abc', status: 'ok' });
    const id = await sendOneBeat({ ...opts, fetchImpl: f });
    expect(id).toBe('w-abc');
    const call = (f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe(`${opts.target}/api/v1/worker/heartbeat`);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body['worker_id']).toBeUndefined();
    expect(body['host']).toBe(opts.host);
    expect(typeof body['capabilities_json']).toBe('string');
  });

  it('subsequent beats carry the previously captured worker_id', async () => {
    const f = mockFetch(200, { worker_id: 'w-abc', status: 'ok' });
    await sendOneBeat({ ...opts, fetchImpl: f }, 'w-abc');
    const call = (f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse(String((call as [string, RequestInit])[1].body)) as Record<string, unknown>;
    expect(body['worker_id']).toBe('w-abc');
  });

  it('keeps the old worker_id when the response omits it', async () => {
    const f = mockFetch(200, { status: 'ok' });
    const id = await sendOneBeat({ ...opts, fetchImpl: f }, 'w-keep');
    expect(id).toBe('w-keep');
  });

  it('non-2xx throws so the loop retries next tick', async () => {
    const f = mockFetch(500, {});
    await expect(sendOneBeat({ ...opts, fetchImpl: f }, 'w-abc')).rejects.toThrow('heartbeat HTTP 500');
  });
});
