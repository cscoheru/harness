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
// v1.2.0i NEW per G8.1 (P1, hygiene): module-scope _senderTimer so SIGTERM
// handler can clearInterval. Previously `const timer = setInterval(...)` was
// a local variable inaccessible from outside the function — no clean exit
// path existed. Now stopWorkerHeartbeatSender() is the proper exit path
// (called from server.ts G8.1 SIGTERM handler).
let _senderTimer: NodeJS.Timeout | null = null;

/** Stop the heartbeat sender timer (called from SIGTERM graceful shutdown). */
export function stopWorkerHeartbeatSender(): void {
  if (_senderTimer !== null) {
    clearInterval(_senderTimer);
    _senderTimer = null;
  }
}

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

  // v1.2.0i CHANGE per G8.1: assign to module-scope `_senderTimer` so
  // stopWorkerHeartbeatSender() can clearInterval during graceful shutdown.
  _senderTimer = setInterval(() => {
    void sendOneBeat(opts, workerId)
      .then((id) => { workerId = id; })
      .catch(() => {/* retried on next tick */});
  }, intervalMs);
  // v1.2.0e.1 L7 (per memory fish-harness-v1.2.0e.1-puerhk-restart-loop-emergency.md):
  //   Intentionally KEEP this timer ref'd. Earlier versions called
  //   `timer.unref?.()` here — but in bind-mount + network_mode=host deploys,
  //   `app.listen()`'s TCP listener does NOT reliably hold the Node event
  //   loop open on its own; the heartbeat initial POST returns and the loop
  //   empties, Node exits cleanly with code 0, and docker
  //   `restart: unless-stopped` immediately restarts (~60s cycle, infinite
  //   restart loop, daemon pressure). KEEP TIMER REF'D so the heartbeat
  //   interval holds the loop open alongside app.listen. Confirmed fix on
  //   puer-hk 2026-09-09: daemon events 30+/5min → 0 after patch. The
  //   proper exit path is now stopWorkerHeartbeatSender() called from the
  //   G8.1 SIGTERM handler in server.ts.
}
