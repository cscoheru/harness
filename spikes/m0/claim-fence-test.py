"""Spike: claim-fence-test.py (v0.8 — closes Codex v0.7 P0-2 regressions)

File: spikes/m0/claim-fence-test.py
Version: v0.8

Verifies:
  I1   attempt.fence_version == task.fence_version at insert (strict equality)
  I2   at most one active attempt per task
  I3b  no attempt INSERT against terminal task (succeeded/canceled/abandoned)
  race double-worker concurrent claim: only one wins

Regression coverage from Codex v0.7 §3 P0-2 反例:
  - terminal-claim:    task status=succeeded → claim must reject
  - oversized-fence:   attempt.fence_version > task.fence_version → trigger rejects
  - concurrent double-worker: only one INSERT succeeds
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import threading
import time
import uuid

from _helpers import ClaimRejected, claim, make_db, release_attempt, seed_task


def assert_claim_rejected(task_id: str, worker_id: str, label: str) -> None:
    """Asserts claim() raises ClaimRejected."""
    conn = make_db()
    # Caller has already inserted the task; we just call claim.
    conn.execute(
        "INSERT OR IGNORE INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status) "
        "VALUES (?, 't1', 'web_research', '1.0.0', 'pending')",
        (task_id,),
    )
    conn.commit()
    try:
        try:
            claim(conn, task_id, worker_id)
        except ClaimRejected as e:
            print(f"OK: {label} → rejected: {e}")
            return
        raise AssertionError(f"{label} should have raised ClaimRejected")
    finally:
        pass


def main() -> int:
    # === Case 1: 10 sequential claims, fence strictly monotonic ===
    conn = make_db()
    task_id = seed_task(conn)
    fences: list[int] = []
    for i in range(10):
        attempt_id, fence = claim(conn, task_id, worker_id=f"w{i}")
        fences.append(fence)
        release_attempt(conn, attempt_id)

    for i in range(1, len(fences)):
        assert fences[i] == fences[i - 1] + 1, (
            f"fence not strictly monotonic +1: {fences[i-1]} -> {fences[i]}"
        )
    print(f"OK: 10 sequential claims, fences {fences[0]}..{fences[-1]} each +1")
    assert fences == list(range(1, 11))

    # === Case 2 (P0-2 反例 terminal-claim): terminal task claim must reject ===
    terminal_task = seed_task(conn)
    # Manually push task to terminal
    conn.execute(
        "UPDATE tasks SET status='succeeded', terminal_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
        "  terminal_reason='ok' WHERE task_id=?",
        (terminal_task,),
    )
    conn.commit()
    try:
        claim(conn, terminal_task, "w-term")
    except ClaimRejected as e:
        print(f"OK: terminal-claim rejected → {e}")
    else:
        raise AssertionError("terminal-claim should have raised ClaimRejected")

    # === Case 3 (P0-2 反例 oversized-fence): attempt fence != task fence must reject ===
    # v0.9.2 fix: MUST register a valid worker first so I15 does NOT intercept.
    # Otherwise the rejection comes from I15 (worker_id NULL), not fence trigger.
    # The fence trigger fires only when fence_version != task.fence_version at
    # the SQL layer (independent of I15 / I16 / I17 paths).
    oversized_task = seed_task(conn)
    # Register a valid worker BEFORE attempting fence-violating INSERT.
    from _helpers import register_worker
    w_fence = register_worker(conn, host="h-fence", worker_id="w-fence-test")
    # Manually bump task fence to 5
    conn.execute("UPDATE tasks SET fence_version = 5 WHERE task_id=?", (oversized_task,))
    conn.commit()
    cur = conn.execute("SELECT fence_version FROM tasks WHERE task_id=?", (oversized_task,))
    assert cur.fetchone()["fence_version"] == 5
    # Try to insert attempt with fence=999 (way > task fence) AND valid worker_id
    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, 'att-bad', 999, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
            (oversized_task, w_fence, "lease-bad", "2099-01-01T00:00:00Z"),
        )
    except sqlite3.IntegrityError as e:
        err_msg = str(e)
        # MUST be fence trigger, NOT I15
        assert "fence_version must EQUAL" in err_msg, (
            f"P0-2 fence spike: error must mention fence_version; got: {err_msg}"
        )
        assert "I15" not in err_msg, (
            f"P0-2 fence spike: I15 intercepted before fence trigger — test invalid; got: {err_msg}"
        )
        print(f"OK: oversized-fence rejected by trg_attempt_fence_insert → {err_msg}")
    else:
        raise AssertionError("oversized-fence should have raised IntegrityError")

    # And: attempt fence LESS than task fence must also reject (still by fence trigger)
    try:
        conn.execute(
            "INSERT INTO task_attempts "
            "(task_id, attempt_id, fence_version, worker_id, status, "
            " lease_token, lease_expires_at, status_version, driver_kind) "
            "VALUES (?, 'att-low', 4, ?, 'claimed', ?, ?, 0, 'codex_sdk')",
            (oversized_task, w_fence, "lease-low", "2099-01-01T00:00:00Z"),
        )
    except sqlite3.IntegrityError as e:
        err_msg = str(e)
        assert "fence_version must EQUAL" in err_msg, (
            f"P0-2 undersized-fence error must mention fence_version; got: {err_msg}"
        )
        assert "I15" not in err_msg, (
            f"P0-2 undersized-fence: I15 intercepted before fence trigger; got: {err_msg}"
        )
        print(f"OK: undersized-fence rejected by trg_attempt_fence_insert → {err_msg}")
    else:
        raise AssertionError("undersized-fence should have raised IntegrityError")

    # === Case 4 (race): two workers claim the same task concurrently ===
    # Use a shared on-disk DB so threads contend on the same file.
    race_task_id = f"task-race-{uuid.uuid4().hex[:8]}"
    race_path = _shared_db(race_task_id)
    barrier = threading.Barrier(2)
    results: list[tuple[str, str | None, str | None]] = []
    lock = threading.Lock()
    barrier.reset()
    t1 = threading.Thread(target=_race_claim, args=(race_path, race_task_id, "w-a", barrier, results, lock))
    t2 = threading.Thread(target=_race_claim, args=(race_path, race_task_id, "w-b", barrier, results, lock))
    t1.start(); t2.start()
    t1.join(timeout=10); t2.join(timeout=10)
    successes = [r for r in results if r[1] is not None]
    failures = [r for r in results if r[1] is None]
    assert len(successes) == 1, (
        f"race: expected exactly one successful claim, got {len(successes)}: {results}"
    )
    assert len(failures) == 1, (
        f"race: expected exactly one rejection, got {len(failures)}: {results}"
    )
    print(f"OK: concurrent double-worker claim → 1 success ({successes[0][1]}) + 1 rejection")

    return 0


def _shared_db(task_id: str | None = None) -> str:
    import tempfile, os as _os2
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    _os2.close(fd)
    import sqlite3 as _sql
    c = _sql.connect(path)
    c.row_factory = _sql.Row
    schema_path = _os2.path.join(_os2.path.dirname(_os2.path.abspath(__file__)),
                                  "..", "..", "spec", "kernel-schema.sql")
    with open(schema_path, "r") as f:
        c.executescript(f.read())
    if task_id:
        c.execute(
            "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, status) "
            "VALUES (?, 't1', 'web_research', '1.0.0', 'pending')",
            (task_id,),
        )
        c.commit()
    c.close()
    return path


def _race_claim(path: str, task_id: str, worker_id: str,
                barrier: threading.Barrier,
                results: list, lock: threading.Lock) -> None:
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        barrier.wait(timeout=5)
        try:
            attempt_id, fence = claim(conn, task_id, worker_id)
            with lock:
                results.append((worker_id, attempt_id, str(fence)))
        except ClaimRejected as e:
            with lock:
                results.append((worker_id, None, str(e)))
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())