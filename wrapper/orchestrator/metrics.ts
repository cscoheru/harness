/**
 * Metrics — Prometheus exporter for fish-harness wrapper (v1.2.0d NEW).
 *
 * Why prom-client (per D9 + F25):
 *   - Standard Prometheus client for Node.js — no exotic dependency
 *   - /metrics endpoint exposes 4 key counters/gauges:
 *     - active_task_count (gauge): currently in-flight tasks per host
 *     - queue_depth (gauge): pending tasks waiting in SQLite overflow queue
 *     - memory_used (gauge): wrapper process RSS in MB
 *     - worker_count (gauge): active workers in pool
 *
 * Tailscale ACL (per F28):
 *   - /metrics endpoint binds Tailscale IP only (100.64.0.0/8 tailnet range)
 *   - NOT exposed to public internet
 *   - Prometheus server reaches this endpoint via MagicDNS hostname
 *
 * Deployment note (per plan §5.3):
 *   - 7 scrape jobs (newvps + 5 edge + macbook) configured in
 *     deploy/monitoring/prometheus.yml
 *   - 3 alert rules: memory > 80% / queue_depth > 100 / worker_offline > 5min
 *   - runbook escalation per deploy/monitoring/runbook.md
 */

import { collectDefaultMetrics, Gauge, Registry } from "prom-client";

// v1.2.0e.1 NEW (per D2 + F42): wire workerCount gauge to worker_pool.
// ONE-WAY import — metrics.ts → worker_pool.ts — keeps worker_pool.ts free
// of metrics.ts (no circular dep). worker_pool.ts already has countActive().
import { getDefaultWorkerPool } from "./worker_pool.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Process-wide Prometheus registry. */
const REGISTRY = new Registry();

/** Collect default Node.js process metrics (CPU, event loop lag, etc). */
collectDefaultMetrics({ register: REGISTRY });

// ─── Metric definitions ──────────────────────────────────────────────────────

/** Currently in-flight tasks (per-host gauge). */
export const activeTaskCount = new Gauge({
  name: "active_task_count",
  help: "Number of tasks currently being processed by this wrapper instance",
  registers: [REGISTRY],
});

/** Pending tasks in SQLite overflow queue (per-host gauge). */
export const queueDepth = new Gauge({
  name: "queue_depth",
  help: "Number of tasks waiting in SQLite overflow queue (pending status)",
  registers: [REGISTRY],
});

/** Wrapper process RSS memory in MB (per-host gauge). */
export const memoryUsed = new Gauge({
  name: "memory_used_mb",
  help: "Wrapper process RSS memory in megabytes (sampled every 15s)",
  registers: [REGISTRY],
});

/** Active workers in worker_pool (per-host gauge). */
export const workerCount = new Gauge({
  name: "worker_count",
  help: "Number of active workers registered in the worker pool",
  registers: [REGISTRY],
});

// ─── Sampling ────────────────────────────────────────────────────────────────

let _samplingTimer: NodeJS.Timeout | null = null;

/**
 * Start periodic sampling of process metrics (memory_used every 15s).
 * Call once at server startup. Idempotent — multiple calls are no-ops.
 */
export function startMetricsSampling(): void {
  if (_samplingTimer !== null) return;

  const SAMPLE_INTERVAL_MS = 15000;
  const sample = () => {
    const rss = process.memoryUsage().rss;
    memoryUsed.set(Math.round(rss / (1024 * 1024)));
    // v1.2.0e.1 NEW (per D2 + F42): wire workerCount gauge to live pool.
    // Previously this gauge was declared but never set — Prometheus's
    // worker_offline alert would fire forever. countActive() returns the
    // number of rows with status='active' (after host dedup from D1).
    workerCount.set(getDefaultWorkerPool().countActive());
  };
  sample();
  _samplingTimer = setInterval(sample, SAMPLE_INTERVAL_MS);
}

/** Stop the sampling timer (for graceful shutdown). */
export function stopMetricsSampling(): void {
  if (_samplingTimer !== null) {
    clearInterval(_samplingTimer);
    _samplingTimer = null;
  }
}

// ─── Prometheus text format ──────────────────────────────────────────────────

/**
 * Render the Prometheus text exposition format for the /metrics endpoint.
 * Returns the metrics payload as a UTF-8 string.
 */
export async function renderMetrics(): Promise<string> {
  return REGISTRY.metrics();
}

// ─── Module-level singleton export ───────────────────────────────────────────

/** Direct access to the Prometheus registry (for testing). */
export function getMetricsRegistry(): Registry {
  return REGISTRY;
}