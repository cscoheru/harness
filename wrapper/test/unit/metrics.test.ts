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

import { describe, it, expect, afterEach } from "vitest";
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

afterEach(() => {
  stopMetricsSampling();
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
});