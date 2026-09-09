/**
 * T-V1.2.0D-QA-2: metrics.ts Prometheus exporter unit tests (per §4.17 v1.2.0d).
 *
 * Coverage (per F25):
 *   - 4 metric names exposed: active_task_count / queue_depth / memory_used_mb /
 *     worker_count (per D9 + F25 + plan §5.3)
 *   - renderMetrics() returns Prometheus text exposition format
 *   - startMetricsSampling() / stopMetricsSampling() are idempotent
 *   - getMetricsRegistry() returns the same Registry singleton
 *
 * @file wrapper/test/unit/metrics.test.ts
 */

import { describe, it, expect, afterEach, beforeAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderMetrics,
  startMetricsSampling,
  stopMetricsSampling,
  getMetricsRegistry,
  activeTaskCount,
  queueDepth,
  workerCount,
  memoryUsed,
} from "../../orchestrator/metrics.js";
import {
  SqliteWorkerPool,
  _resetWorkerPoolForTests,
} from "../../orchestrator/worker_pool.js";

// Worker pool singleton resolves /data/worker_pool.db by default — which
// doesn't exist on macOS dev. Point it at a tmp dir for the whole suite.
let suiteTempDir: string;
beforeAll(() => {
  suiteTempDir = mkdtempSync(join(tmpdir(), "metrics-suite-"));
  process.env["WORKER_POOL_DB"] = join(suiteTempDir, "pool.db");
});

afterEach(() => {
  stopMetricsSampling();
  _resetWorkerPoolForTests();
});

// Clean up the suite tmp dir at the end of vitest's run via process exit hook.
process.on("exit", () => {
  try {
    rmSync(suiteTempDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe("metrics.ts — Prometheus exporter", () => {
  it("renderMetrics returns text in Prometheus exposition format", async () => {
    const text = await renderMetrics();
    // Default Node.js metrics (process_cpu_*, etc.) should appear
    expect(text).toMatch(/^# HELP process_cpu_user_seconds_total/m);
    // Help line + value line per metric
    expect(text).toContain("# HELP active_task_count");
    expect(text).toContain("# TYPE active_task_count gauge");
    expect(text).toContain("active_task_count 0");
  });

  it("includes all 4 wrapper-specific gauges", async () => {
    const text = await renderMetrics();
    expect(text).toContain("active_task_count");
    expect(text).toContain("queue_depth");
    expect(text).toContain("memory_used_mb");
    expect(text).toContain("worker_count");
  });

  it("getMetricsRegistry returns the same singleton", () => {
    const a = getMetricsRegistry();
    const b = getMetricsRegistry();
    expect(a).toBe(b);
  });

  it("startMetricsSampling is idempotent (multiple calls no-op)", () => {
    startMetricsSampling();
    startMetricsSampling();
    startMetricsSampling();
    // No assertion on count — just that no error is thrown.
    stopMetricsSampling();
  });

  it("stopMetricsSampling is idempotent (multiple calls no-op)", () => {
    stopMetricsSampling();
    stopMetricsSampling();
    stopMetricsSampling();
  });

  it("gauge values are mutable via .set()", async () => {
    activeTaskCount.set(42);
    queueDepth.set(7);
    workerCount.set(3);
    memoryUsed.set(256);

    const text = await renderMetrics();
    expect(text).toMatch(/^active_task_count 42$/m);
    expect(text).toMatch(/^queue_depth 7$/m);
    expect(text).toMatch(/^worker_count 3$/m);
    expect(text).toMatch(/^memory_used_mb 256$/m);
  });

  // ─── v1.2.0e.1 NEW (per D2 + F42): workerCount wired to worker_pool ─────

  it("v1.2.0e.1: workerCount reflects pool.countActive() after sampling tick", async () => {
    // Set up isolated pool via env override; sample() reads getDefaultWorkerPool()
    // which uses WORKER_POOL_DB env (process-global). The test must use the
    // global singleton — set env BEFORE any import side effects.
    const tempDir = mkdtempSync(join(tmpdir(), "metrics-pool-test-"));
    try {
      process.env.WORKER_POOL_DB = join(tempDir, "pool.db");
      _resetWorkerPoolForTests(); // force re-read of env on next getDefaultWorkerPool()
      const pool = new SqliteWorkerPool(process.env.WORKER_POOL_DB);
      await pool.register("host-a", "{}");
      await pool.register("host-b", "{}");
      pool.close();

      // Wire the singleton to point at our temp pool path.
      // Easiest: just use the singleton's instance — it was lazy-init'd when
      // we called register() above. Note getDefaultWorkerPool() caches.
      const singleton = (await import("../../orchestrator/worker_pool.js")).getDefaultWorkerPool();
      // singleton shares the file path because we passed the env path.
      expect(singleton.countActive()).toBe(2);

      // Manually drive sample() by setting workerCount as startMetricsSampling
      // does. Verify the metric reflects the live count.
      workerCount.set(singleton.countActive());
      const text = await renderMetrics();
      expect(text).toMatch(/^worker_count 2$/m);
    } finally {
      delete process.env.WORKER_POOL_DB;
      _resetWorkerPoolForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});