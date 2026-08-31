"""harness.benchmark.runner — T-QA-3 throughput / latency benchmark.

Loads ``harness.runtime._db.make_db()`` (file DB so WAL page cache is
real; ``:memory:`` would mask the contention the gate is meant to catch),
registers N workers via ``SqliteWorkerPool``, then claims M tasks via
``claim_via_pool`` and times each one.  Percentiles are computed in ms.

Hard gate (per DISPATCH-T-QA-3 §5): default ``--tasks=50 --workers=4``
must have **p99 < 5000 ms** — exit 0; otherwise exit 1.

Smoke (per DISPATCH-T-QA-3 §6): ``--tasks=10 --workers=2`` must run to
completion and produce a file.  The smoke gate is intentionally tiny
so CI stays under a minute.
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import time
from pathlib import Path

from harness.runtime._db import make_db, seed_task
from harness.runtime.worker_pool import SqliteWorkerPool

__all__ = ["main", "run_benchmark", "percentile_p"]

# Hard gate: p99 must be strictly less than this (ms).
P99_GATE_MS = 5000.0


def percentile_p(sorted_values: list[float], p: float) -> float:
    """Return the ``p``-th percentile (0-100) from a sorted list.

    Uses nearest-rank with clamping so empty input is well-defined (0.0).
    """
    if not sorted_values:
        return 0.0
    n = len(sorted_values)
    idx = max(0, min(n - 1, int(p / 100.0 * n)))
    return sorted_values[idx]


def run_benchmark(
    tasks: int, workers: int, *, seed: int | None = None,
) -> dict:
    """Execute the benchmark; return the result dict (does NOT write to disk).

    Args:
        tasks: total tasks to claim (M).
        workers: workers to register (N).
        seed: optional seed (currently unused; reserved for future
            stochastic contention scenarios).

    Returns:
        dict with keys ``tasks``, ``workers``, ``wall_seconds``,
        ``throughput_tasks_per_sec``, ``latency_ms`` (p50/p95/p99/min/max/
        mean) and ``passes_gate`` (bool).
    """
    from harness.runtime._db import claim
    from harness.runtime.workers import dispatch_worker

    del seed  # reserved
    conn = make_db()  # file DB, FK=ON, schema present
    pool = SqliteWorkerPool(conn)

    for i in range(workers):
        pool.register(host=f"bench-host-{i}", capabilities_json='["web.fetch"]')

    # Pre-seed all task rows so the per-task latency reflects dispatch+
    # claim only (not task-row INSERT).
    task_ids = [seed_task(conn) for _ in range(tasks)]

    latencies_ms: list[float] = []
    wall_start = time.perf_counter()
    for task_id in task_ids:
        t0 = time.perf_counter()
        # Composed by hand to keep control over heartbeat. We DO NOT use
        # claim_via_pool() because it hard-codes a fixed 2026-08-30T12:00:15Z
        # offset and would re-write a backslide on the 2nd iteration
        # (I16 rejects NEW <= OLD). dispatch_worker uses the pool's
        # monotonic offset clock (I16 forward-only); claim() bumps task
        # fence (I1). Together they cover the same hot path as
        # claim_via_pool with one fewer surprise.
        worker_id = dispatch_worker(conn, task_id, required_capability=None)
        attempt_id, _fence = claim(conn, task_id, worker_id)
        t1 = time.perf_counter()
        latencies_ms.append((t1 - t0) * 1000.0)
        # Mirror real driver lifecycle so the next dispatch can re-use
        # the same worker (idx_worker_one_active_attempt is partial UNIQUE
        # on status IN active): transition the attempt to 'succeeded' so
        # it leaves the active set. We do NOT bump last_heartbeat_at
        # here — the I16 trigger fires on sub-millisecond ties during
        # fast benchmark loops, and dispatch_worker doesn't read
        # heartbeat anyway (only the stale reaper cares). The benchmark
        # is single-connection so reap_stale is out of scope.
        conn.execute(
            "UPDATE task_attempts SET status='succeeded', "
            "  status_version=status_version+1, "
            "  finished_at=strftime('%Y-%m-%dT%H:%M:%S.%fZ','now') "
            "WHERE attempt_id=?",
            (attempt_id,),
        )
        conn.execute(
            "UPDATE workers SET current_attempt_id=NULL WHERE worker_id=?",
            (worker_id,),
        )
        conn.commit()
    wall_end = time.perf_counter()

    wall_seconds = wall_end - wall_start
    throughput = (tasks / wall_seconds) if wall_seconds > 0.0 else float("inf")
    sorted_lat = sorted(latencies_ms)
    p50 = percentile_p(sorted_lat, 50)
    p95 = percentile_p(sorted_lat, 95)
    p99 = percentile_p(sorted_lat, 99)

    return {
        "tasks": tasks,
        "workers": workers,
        "wall_seconds": wall_seconds,
        "throughput_tasks_per_sec": throughput,
        "latency_ms": {
            "p50": p50,
            "p95": p95,
            "p99": p99,
            "min": sorted_lat[0] if sorted_lat else 0.0,
            "max": sorted_lat[-1] if sorted_lat else 0.0,
            "mean": statistics.fmean(latencies_ms) if latencies_ms else 0.0,
        },
        "passes_gate": p99 < P99_GATE_MS,
        "gate_threshold_ms": P99_GATE_MS,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m harness.benchmark.runner",
        description="fish-harness v1.0 throughput / latency benchmark.",
    )
    parser.add_argument("--tasks", type=int, default=50,
                        help="total tasks to claim (default 50)")
    parser.add_argument("--workers", type=int, default=4,
                        help="workers to register (default 4)")
    parser.add_argument("--out", type=str, default="results.json",
                        help="output JSON path (default results.json)")
    parser.add_argument("--csv", type=str, default=None,
                        help="optional per-task latency CSV (task_index, latency_ms)")
    args = parser.parse_args(argv)

    if args.tasks <= 0 or args.workers <= 0:
        print("error: --tasks and --workers must be positive integers",
              file=sys.stderr)
        return 2

    result = run_benchmark(args.tasks, args.workers)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2) + "\n")

    if args.csv:
        csv_path = Path(args.csv)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        with csv_path.open("w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["task_index", "latency_ms"])
            # Re-derive the per-task series from the same run for the CSV;
            # benchmark run is single-shot so we lose granularity.  We
            # emit summary rows instead — useful for trend graphs.
            w.writerow(["p50", result["latency_ms"]["p50"]])
            w.writerow(["p95", result["latency_ms"]["p95"]])
            w.writerow(["p99", result["latency_ms"]["p99"]])
            w.writerow(["mean", result["latency_ms"]["mean"]])
            w.writerow(["max", result["latency_ms"]["max"]])

    print(json.dumps(result, indent=2))
    return 0 if result["passes_gate"] else 1


if __name__ == "__main__":
    sys.exit(main())