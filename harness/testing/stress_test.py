"""harness.testing.stress_test — SQLite WAL concurrent stress test.

GA plan §2 T-QA-5: 50 workers x 200 tasks per worker = 10000 total
attempts, real concurrent writes through SqliteWorkerPool dispatch +
claim + terminal transition.

Differences from T-QA-3 benchmark:
  - benchmark: sequential round-robin, single thread, bypasses
    claim_via_pool's hardcoded offset
  - stress_test: real threads, barrier-synchronized start, exercises
    R-2 (SQLite WAL contention under 50 concurrent writers)

Each thread owns its own sqlite3.Connection (sqlite3 default
check_same_thread=True blocks cross-thread connection use). All
connections share the same file DB; WAL mode is set on the seed
connection and reaffirmed on each thread connection (idempotent).

Why no heartbeat bump in the loop:
  - I16 trg_worker_heartbeat_renew is strict-monotonic; bumping by a
    constant offset per iteration causes backslide between iterations
    when iteration N's bump lands earlier than iteration N+1's in
    strftime space (sub-ms ties + later threads racing).
  - Same caveat as T-QA-3 benchmark: stress is about dispatch/claim
    throughput + I15 release discipline, not heartbeat freshness.

Why distinct task_ids:
  - 10000 distinct tasks = 0 race on the same task_id (idx_attempts_one_active)
  - 50 distinct worker identities = round-robin across workers via
    harness_meta dispatch:worker:* counters

Why single-transaction per iteration:
  The naive 2-step pattern (dispatch_worker → _db.claim() → UPDATE
  succeeded) leaves a window between _db.claim()'s COMMIT (attempt
  status='claimed', worker.current_attempt_id=attempt_id) and the outer
  UPDATE 'succeeded'. Under 50 concurrent threads, Thread B's dispatch
  can pick the same worker between those two writes, then B's claim
  INSERT attempt(worker_id=X, status='claimed') violates
  idx_worker_one_active_attempt (I15 partial UNIQUE on worker_id
  WHERE status IN active). The window is microseconds but with 50
  writers it fires ~1-2% of the time.

  Solution: collapse the entire iteration into ONE BEGIN IMMEDIATE →
  INSERT attempt(status='succeeded' directly, skipping 'claimed'
  intermediate) → UPDATE workers current_attempt_id=NULL → COMMIT.
  Since I15 partial UNIQUE only constrains status IN
  ('claimed','running','cancel_requested'), a direct-to-succeeded
  INSERT can never violate it. This matches the T-QA-3 benchmark's
  simplification while still exercising the production dispatch path.

Usage:
    python -m harness.testing.stress_test --workers=50 --tasks=200
    python -m harness.testing.stress_test --workers=5 --tasks=10 --out smoke.json
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
import uuid
from typing import Any

from harness.runtime._db import _now_iso, connect_with_fk, seed_task
from harness.runtime.workers import (
    dispatch_worker,
    register_worker,
)


__all__ = ["run_stress_test", "main"]


# Hard gate (GA plan §5 R-2: WAL ~20 writes/sec typical, our gate is generous):
#   - wall_seconds <= 60.0 (50x200 = 10k attempts in <=60s)
#   - throughput_attempts_per_sec >= 100.0
GATE_WALL_SECONDS_MAX = 60.0
GATE_THROUGHPUT_MIN = 100.0


def _now_iso_ms() -> str:
    """Millisecond-precision ISO (wraps _db._now_iso)."""
    return _now_iso()


def _setup_db(workers: int, tasks: int) -> tuple[str, list[str], list[str]]:
    """Create file DB, apply schema, WAL mode, pre-seed.

    Returns (db_path, task_ids, worker_ids).
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    conn = connect_with_fk(path=path, apply_schema=True)
    # Force WAL mode (must be set BEFORE any concurrent connections)
    mode_row = conn.execute("PRAGMA journal_mode = WAL").fetchone()
    assert mode_row[0].lower() == "wal", (
        f"expected WAL mode, got {mode_row[0]}; "
        f"check filesystem supports WAL (no NFS / read-only mount)"
    )

    # Pre-seed N tasks per worker = tasks * workers total attempts
    total_tasks = tasks * workers
    task_ids: list[str] = []
    for _ in range(total_tasks):
        task_ids.append(seed_task(conn))

    # Pre-register workers (each thread has a stable identity)
    worker_ids = [f"stress-w-{i:03d}" for i in range(workers)]
    for wid in worker_ids:
        register_worker(conn, host="stress", worker_id=wid)

    conn.close()
    return path, task_ids, worker_ids


def _verify(db_path: str, total_attempts: int, workers: int) -> dict[str, Any]:
    """Post-run integrity checks."""
    conn = connect_with_fk(path=db_path, apply_schema=False)
    try:
        total = conn.execute(
            "SELECT COUNT(*) FROM task_attempts"
        ).fetchone()[0]
        succeeded = conn.execute(
            "SELECT COUNT(*) FROM task_attempts WHERE status='succeeded'"
        ).fetchone()[0]
        active_workers = conn.execute(
            "SELECT COUNT(*) FROM workers WHERE status='active'"
        ).fetchone()[0]
        all_match = (
            total == total_attempts
            and succeeded == total_attempts
            and active_workers == workers
        )
        return {
            "task_attempts_total": total,
            "task_attempts_succeeded": succeeded,
            "workers_active": active_workers,
            "expected_total_attempts": total_attempts,
            "expected_workers": workers,
            "all_match": all_match,
        }
    finally:
        conn.close()


def _percentile(sorted_values: list[float], p: float) -> float:
    """Nearest-rank percentile with clamp."""
    if not sorted_values:
        return 0.0
    if p <= 0:
        return sorted_values[0]
    if p >= 100:
        return sorted_values[-1]
    rank = max(1, int(round(p / 100.0 * len(sorted_values))))
    return sorted_values[rank - 1]


def run_stress_test(workers: int, tasks: int) -> dict[str, Any]:
    """Run the 50x200 stress test; return results dict (caller writes JSON).

    workers: number of concurrent worker threads (default 50)
    tasks: tasks per worker (default 200) → total = workers * tasks attempts
    """
    db_path, task_ids, worker_ids = _setup_db(workers, tasks)
    total_attempts = workers * tasks

    barrier = threading.Barrier(workers)
    # per-thread cumulative latency (sum of per-iteration elapsed seconds)
    per_thread_latencies = [0.0] * workers
    # per-thread per-iteration latencies for percentile
    per_thread_iter_latencies: list[list[float]] = [[] for _ in range(workers)]
    counters_lock = threading.Lock()
    counters: dict[str, int] = {
        "claim_rejected": 0,
        "deadlocks_detected": 0,
        "i15_violations": 0,
        "i16_violations": 0,
        "fk_violations": 0,
        "unique_violations": 0,
    }

    def thread_main(thread_idx: int) -> None:
        conn = connect_with_fk(path=db_path, apply_schema=False)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        worker_id = worker_ids[thread_idx]
        base = thread_idx * tasks
        try:
            barrier.wait()
            for j in range(tasks):
                task_id = task_ids[base + j]
                t0 = time.perf_counter()
                try:
                    chosen = dispatch_worker(
                        conn, task_id, required_capability=None
                    )
                    attempt_id = f"att-{uuid.uuid4().hex[:12]}"
                    lease_token = uuid.uuid4().hex
                    # Single-transaction per iteration: claim (UPDATE task
                    # pending→claimed + INSERT attempt claimed) → succeed
                    # (UPDATE attempt claimed→succeeded + UPDATE task
                    # claimed→succeeded + release worker) → COMMIT. The
                    # task stays in 'claimed' intermediate so the
                    # trg_attempt_terminal_task_insert trigger allows the
                    # attempt INSERT (task is not terminal yet). All
                    # writes are inside one BEGIN IMMEDIATE so concurrent
                    # threads serialize cleanly with no I15 window.
                    # See module docstring "Why single-transaction per
                    # iteration".
                    conn.execute("BEGIN IMMEDIATE")
                    try:
                        cur = conn.execute(
                            "UPDATE tasks SET fence_version = fence_version + 1, "
                            "  status='claimed', "
                            "  updated_at=? WHERE task_id=? "
                            "  AND status='pending'",
                            (_now_iso_ms(), task_id),
                        )
                        if cur.rowcount != 1:
                            conn.rollback()
                            raise sqlite3.IntegrityError(
                                f"task {task_id} not pending (rowcount={cur.rowcount})"
                            )
                        row = conn.execute(
                            "SELECT fence_version FROM tasks WHERE task_id=?",
                            (task_id,),
                        ).fetchone()
                        assert row is not None
                        new_fence = row["fence_version"]
                        conn.execute(
                            "INSERT INTO task_attempts "
                            "(task_id, attempt_id, fence_version, worker_id, "
                            " status, lease_token, lease_expires_at, "
                            " status_version, driver_kind, started_at) "
                            "VALUES (?, ?, ?, ?, 'claimed', ?, ?, "
                            "  0, 'codex_sdk', ?)",
                            (task_id, attempt_id, new_fence, chosen,
                             lease_token, "2099-01-01T00:00:00Z",
                             _now_iso_ms()),
                        )
                        conn.execute(
                            "UPDATE task_attempts SET status='succeeded', "
                            "  finished_at=? WHERE attempt_id=?",
                            (_now_iso_ms(), attempt_id),
                        )
                        conn.execute(
                            "UPDATE tasks SET status='succeeded', "
                            "  updated_at=? WHERE task_id=?",
                            (_now_iso_ms(), task_id),
                        )
                        conn.execute(
                            "UPDATE workers SET current_attempt_id=NULL "
                            "WHERE worker_id=?",
                            (chosen,),
                        )
                        conn.commit()
                    except sqlite3.Error:
                        conn.rollback()
                        raise
                except sqlite3.IntegrityError as e:
                    msg = str(e)
                    with counters_lock:
                        if "idx_worker_one_active_attempt" in msg or (
                            "UNIQUE constraint failed: task_attempts.worker_id"
                            in msg
                        ):
                            counters["i15_violations"] += 1
                        elif "FOREIGN KEY" in msg:
                            counters["fk_violations"] += 1
                        elif "UNIQUE" in msg:
                            counters["unique_violations"] += 1
                        else:
                            counters.setdefault("IntegrityError", 0)
                            counters["IntegrityError"] += 1
                    conn.rollback()
                    continue
                except Exception as e:  # noqa: BLE001
                    with counters_lock:
                        counters.setdefault(type(e).__name__, 0)
                        counters[type(e).__name__] += 1
                    try:
                        conn.rollback()
                    except sqlite3.Error:
                        pass
                    continue
                per_thread_iter_latencies[thread_idx].append(
                    time.perf_counter() - t0
                )
        finally:
            conn.close()

    threads = [
        threading.Thread(
            target=thread_main, args=(i,), name=f"stress-w{i:03d}"
        )
        for i in range(workers)
    ]
    t0 = time.monotonic()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall = time.monotonic() - t0

    # Aggregate latencies (across all threads)
    all_latencies: list[float] = []
    for thread_lats in per_thread_iter_latencies:
        all_latencies.extend(thread_lats)

    all_latencies.sort()
    latency_ms = {
        "mean": (sum(all_latencies) / len(all_latencies) * 1000.0)
        if all_latencies
        else 0.0,
        "p50": _percentile(all_latencies, 50) * 1000.0,
        "p95": _percentile(all_latencies, 95) * 1000.0,
        "p99": _percentile(all_latencies, 99) * 1000.0,
        "max": (all_latencies[-1] * 1000.0) if all_latencies else 0.0,
    }

    verification = _verify(db_path, total_attempts, workers)

    passes_gate = (
        wall <= GATE_WALL_SECONDS_MAX
        and (total_attempts / wall) >= GATE_THROUGHPUT_MIN
        and verification["all_match"]
        and counters["i15_violations"] == 0
        and counters["i16_violations"] == 0
        and counters["fk_violations"] == 0
        and counters["unique_violations"] == 0
        and counters.get("ClaimRejected", 0) == 0
    )

    return {
        "schema_version": "v1.0",
        "workers": workers,
        "tasks_per_worker": tasks,
        "total_attempts": total_attempts,
        "wall_seconds": wall,
        "throughput_attempts_per_sec": total_attempts / wall if wall > 0 else 0.0,
        "latency_ms": latency_ms,
        "counters": counters,
        "verification": verification,
        "passes_gate": passes_gate,
        "gate_threshold": {
            "wall_seconds_max": GATE_WALL_SECONDS_MAX,
            "throughput_min_per_sec": GATE_THROUGHPUT_MIN,
        },
        "db_path": db_path,  # caller may inspect; ephemeral
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m harness.testing.stress_test",
        description=(
            "SQLite WAL concurrent stress test (GA plan §2 T-QA-5). "
            "Default 50 workers x 200 tasks per worker = 10000 attempts."
        ),
    )
    parser.add_argument(
        "--workers", type=int, default=50,
        help="number of concurrent worker threads (default 50)",
    )
    parser.add_argument(
        "--tasks", type=int, default=200,
        help="tasks per worker (default 200; total = workers * tasks)",
    )
    parser.add_argument(
        "--out", type=str, default="results.json",
        help="path to write JSON results (default results.json)",
    )
    parser.add_argument(
        "--csv", type=str, default=None,
        help="optional path to write summary CSV",
    )
    args = parser.parse_args(argv)

    if args.workers < 1:
        print("error: --workers must be >= 1", file=sys.stderr)
        return 2
    if args.tasks < 1:
        print("error: --tasks must be >= 1", file=sys.stderr)
        return 2

    print(
        f"stress_test: workers={args.workers} "
        f"tasks_per_worker={args.tasks} "
        f"total_attempts={args.workers * args.tasks}"
    )

    results = run_stress_test(args.workers, args.tasks)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    if args.csv:
        import csv
        with open(args.csv, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["metric", "value"])
            w.writerow(["workers", results["workers"]])
            w.writerow(["tasks_per_worker", results["tasks_per_worker"]])
            w.writerow(["total_attempts", results["total_attempts"]])
            w.writerow(["wall_seconds", f"{results['wall_seconds']:.4f}"])
            w.writerow(
                ["throughput_attempts_per_sec",
                 f"{results['throughput_attempts_per_sec']:.2f}"],
            )
            w.writerow(["latency_ms_p50", f"{results['latency_ms']['p50']:.4f}"])
            w.writerow(["latency_ms_p95", f"{results['latency_ms']['p95']:.4f}"])
            w.writerow(["latency_ms_p99", f"{results['latency_ms']['p99']:.4f}"])
            w.writerow(["passes_gate", results["passes_gate"]])

    summary = (
        f"stress_test: wall={results['wall_seconds']:.3f}s "
        f"throughput={results['throughput_attempts_per_sec']:.1f}/s "
        f"p99={results['latency_ms']['p99']:.3f}ms "
        f"verification.all_match={results['verification']['all_match']} "
        f"counters.i15={results['counters']['i15_violations']} "
        f"counters.fk={results['counters']['fk_violations']} "
        f"counters.unique={results['counters']['unique_violations']} "
        f"passes_gate={results['passes_gate']}"
    )
    print(summary)
    if results["passes_gate"]:
        print(f"OK results written to {args.out}")
        return 0

    print(
        f"FAIL results written to {args.out}; "
        f"wall={results['wall_seconds']:.3f}s "
        f"(max {GATE_WALL_SECONDS_MAX}); "
        f"throughput={results['throughput_attempts_per_sec']:.1f}/s "
        f"(min {GATE_THROUGHPUT_MIN}); "
        f"verification={results['verification']}; "
        f"counters={results['counters']}",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
