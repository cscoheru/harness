/**
 * heartbeat_sender.ts — worker self-registration loop (3-host deploy NEW).
 *
 * Edge worker containers register themselves into the orchestrator's
 * worker_pool by POSTing /api/v1/worker/heartbeat on an interval. The first
 * beat carries host + capabilities_json (register path on the receiving
 * side); subsequent beats carry the returned worker_id.
 *
 * Gated by WORKER_HEARTBEAT_URL — only worker compose files set it. Profiles
 * that don't set it (newvps orch/commander/frontend) never start a sender, so
 * this module is inert on the orchestrator side.
 *
 * A lost beat is harmless: a restarting worker just re-registers and gets a
 * fresh worker_id (its stale row is reaped by the pool). Failures are logged
 * and retried on the next tick — the loop never throws.
 *
 * @file wrapper/orchestrator/heartbeat_sender.ts
 */

import { capability } from './worker.js';

export interface HeartbeatSenderOpts {
  /** Base URL of the orchestrator wrapper, e.g. http://newvps.fish-harness.ts.net:4000 */
  target: string;
  /** Host identifier this worker registers under (WORKER_HOST env). */
  host: string;
  /** Beat interval in ms (unused by sendOneBeat; kept for logging symmetry). */
  intervalMs: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Send a single heartbeat beat. Returns the worker_id to use for subsequent
 * beats (captured from the register response on the first call).
 */
export function sendOneBeat(
  opts: HeartbeatSenderOpts,
  workerId?: string,
): Promise<string | undefined> {
  const caps = capability();
  const body: Record<string, unknown> = {
    host: opts.host,
    capabilities_json: JSON.stringify(caps),
  };
  if (workerId) body['worker_id'] = workerId;

  const doFetch = opts.fetchImpl ?? fetch;
  return doFetch(`${opts.target}/api/v1/worker/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`heartbeat HTTP ${res.status}`);
    const data = (await res.json()) as { worker_id?: string };
    return data.worker_id ?? workerId;
  });
}

/**
 * Start the sender loop when WORKER_HEARTBEAT_URL is set. No-op otherwise,
 * so importing this from server.ts is safe for every wrapper profile.
 */
export function startWorkerHeartbeatSender(): void {
  const target = process.env['WORKER_HEARTBEAT_URL'];
  if (!target) return;
  const host = process.env['WORKER_HOST'] ?? 'wrapper-localhost';
  const intervalMs = Number(process.env['WORKER_HEARTBEAT_INTERVAL_MS'] ?? 10_000);

  let workerId: string | undefined;
  const opts: HeartbeatSenderOpts = { target, host, intervalMs };

  // eslint-disable-next-line no-console
  console.log(`[heartbeat_sender] → ${target} host=${host} every ${intervalMs}ms`);
  void sendOneBeat(opts)
    .then((id) => { workerId = id; })
    .catch((e) => console.error(`[heartbeat_sender] initial beat failed: ${String(e)}`));

  const timer = setInterval(() => {
    void sendOneBeat(opts, workerId)
      .then((id) => { workerId = id; })
      .catch(() => {/* retried on next tick */});
  }, intervalMs);
  // Don't hold the event loop open just for heartbeats.
  timer.unref?.();
}
