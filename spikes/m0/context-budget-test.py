"""Spike: context-budget-test.py (v0.9.1 — closes Codex v0.9-A CHANGES REQUIRED)

File: spikes/m0/context-budget-test.py
Version: v0.9.1

Closes PRD-v0.9 §6 反例清单 (6 cases) PLUS Codex v0.9-A review findings:
   - P0-9C: shared file-DB + FK=ON; missing raw_blob_id rejected by FK
   - P0-9B/D/E/F: each反例 has its own真并发 case (threading.Barrier + 2 connections)
   - I11/I14 UPDATE bypass: append-only triggers (trg_snapshot_no_update / no_delete)
   - P1-1 lineage: trg_lineage_l2_needs_parent / l3_needs_parent / same_task
   - P1-3 event emission: trg_snapshot_event_emit writes task_events row
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import sqlite3
import sys
import tempfile
import threading
import uuid

from _helpers import (
    INTERNAL_SECRET,
    MODEL_GENERATED,
    TRUSTED_USER_INPUT,
    UNTRUSTED_EXTERNAL,
    claim,
    connect_with_fk,
    insert_snapshot,
    make_db,
    seed_blob,
    seed_task,
    working_set_total,
)


def assert_integrity_aborted(fn, expected_substr: str, label: str) -> None:
    """Run fn() and assert it raises sqlite3.IntegrityError / OperationalError
    whose message contains expected_substr. trigger/CHECK/FK rejections all
    surface this way.
    """
    try:
        fn()
    except sqlite3.IntegrityError as e:
        msg = str(e)
        assert expected_substr in msg, (
            f"{label}: expected rejection to mention {expected_substr!r}, got {msg!r}"
        )
        print(f"OK: {label}")
        return
    except sqlite3.OperationalError as e:
        msg = str(e)
        assert expected_substr in msg, (
            f"{label}: expected rejection to mention {expected_substr!r}, got {msg!r}"
        )
        print(f"OK: {label} (via OperationalError)")
        return
    raise AssertionError(f"{label}: expected rejection, but call succeeded")


def _make_shared_db_with_seed(task_id: str, attempt_id: str,
                              blob_id: str, budget: int | None = 100,
                              task_fence: int = 1) -> str:
    """Create a file-DB with full schema + minimal seed, FK=ON. Returns path.

    Closes Codex v0.9-A P0-9C: PRAGMA foreign_keys is per-connection; the schema
    PRAGMA in kernel-schema.sql only applies to the connection that ran it. Any
    new sqlite3.connect() to a shared DB MUST re-enable FK before testing.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    import os
    os.close(fd)
    sc = connect_with_fk(path=path, row_factory=True, apply_schema=True)
    sc.execute(
        "INSERT INTO tasks (task_id, tenant_id, workflow_pack, workflow_version, "
        "  status, context_budget_tokens, fence_version) "
        "VALUES (?, 't1', 'web_research', '1.0.0', 'pending', ?, ?)",
        (task_id, budget if budget is not None else 1000000, task_fence),
    )
    sc.execute(
        "INSERT INTO blobs (blob_id, byte_size, sha256, storage_uri, "
        "  content_type, trust_label) "
        "VALUES (?, 42, ?, 'file:///tmp/x', 'application/octet-stream', ?)",
        (blob_id, "a" * 64, TRUSTED_USER_INPUT),
    )
    # v0.9-B I15: register worker before claim so trg_attempt_active_needs_worker
    # and trg_attempt_worker_exists are satisfied.
    sc.execute(
        "INSERT INTO workers (worker_id, host, capabilities_json, status, "
        "  last_heartbeat_at) VALUES ('w-seed', 't-seed', '[]', 'active', "
        "  '2026-08-30T12:00:00.000Z')",
    )
    sc.execute(
        "INSERT INTO task_attempts (task_id, attempt_id, fence_version, worker_id, status, "
        "  driver_kind) VALUES (?, ?, ?, 'w-seed', 'claimed', 'codex_sdk')",
        (task_id, attempt_id, task_fence),
    )
    sc.commit()
    sc.close()
    return path


def _race_two_writes(
    shared_path: str,
    fn_a, fn_b,
    key_a: str, key_b: str,
    expected_a: str | None, expected_b: str | None,
    label: str,
    barrier_timeout: float = 5.0,
) -> tuple[dict[str, str], list[Exception]]:
    """Run fn_a and fn_b on independent sqlite3.connect(shared_path) threads.
    Both connections MUST have FK=ON (caller passes connect_with_fk path).
    Returns (results, errors).
    """
    barrier = threading.Barrier(2)
    results: dict[str, str] = {}
    errors: list[Exception] = []
    lock = threading.Lock()

    def runner(key: str, fn, expected: str | None) -> None:
        try:
            barrier.wait(timeout=barrier_timeout)
            c = connect_with_fk(path=shared_path, row_factory=True)
            try:
                outcome = fn(c)
                with lock:
                    results[key] = outcome
            finally:
                c.close()
        except Exception as e:
            with lock:
                results[key] = type(e).__name__
                errors.append(e)

    ta = threading.Thread(target=runner, args=(key_a, fn_a, expected_a))
    tb = threading.Thread(target=runner, args=(key_b, fn_b, expected_b))
    ta.start(); tb.start()
    ta.join(timeout=10); tb.join(timeout=10)
    return results, errors


def main() -> int:
    conn = make_db()

    # ==================== v0.9-A retained cases ====================
    # Case 1: happy path — 3 L2 snapshots fit under budget (with lineage)
    task_id = seed_task(conn, context_budget_tokens=100)
    attempt_id, _ = claim(conn, task_id, "w-ctx")
    blob1 = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    s1 = insert_snapshot(conn, task_id, attempt_id, "L1",
                         token_count=10, trust_label=TRUSTED_USER_INPUT,
                         raw_blob_id=blob1)
    s2 = insert_snapshot(conn, task_id, attempt_id, "L2",
                         token_count=30, trust_label=TRUSTED_USER_INPUT,
                         parent_snapshot_id=s1, distilled_blob_id=blob1)
    s3 = insert_snapshot(conn, task_id, attempt_id, "L2",
                         token_count=40, trust_label=TRUSTED_USER_INPUT,
                         parent_snapshot_id=s1, distilled_blob_id=blob1)
    s4 = insert_snapshot(conn, task_id, attempt_id, "L2",
                         token_count=20, trust_label=TRUSTED_USER_INPUT,
                         parent_snapshot_id=s1, distilled_blob_id=blob1)
    total = working_set_total(conn, task_id)
    assert total == 90, f"expected 90 tokens, got {total}"
    print(f"OK: 3 L2 snapshots fit under budget (total={total}/100)")

    # Case 2 (P0-9A): charge over budget → I11 trigger rejects
    def _over_budget():
        insert_snapshot(conn, task_id, attempt_id, "L2",
                        token_count=20, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=s1, distilled_blob_id=blob1)
    assert_integrity_aborted(_over_budget, "I11", "P0-9A I11 budget exceeded")
    total = working_set_total(conn, task_id)
    assert total == 90, f"after I11 rejection, total must remain 90; got {total}"
    print("OK: after I11 rejection, working_set total unchanged (90)")

    # Case 3: valid L3 handoff still works
    valid_handoff_blob = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    s_handoff = insert_snapshot(
        conn, task_id, attempt_id, "L3",
        token_count=10, trust_label=TRUSTED_USER_INPUT,
        parent_snapshot_id=s2, distilled_blob_id=valid_handoff_blob,
    )
    total = working_set_total(conn, task_id)
    assert total == 100, f"valid handoff bumps total to 100; got {total}"
    print(f"OK: valid L3 handoff trusted_user_input accepted (total={total})")

    # ==================== v0.9.1 真并发 cases ====================
    # Setup for并发: shared file DB with seed
    race_task = f"task-race-{uuid.uuid4().hex[:8]}"
    race_attempt = f"att-race-{uuid.uuid4().hex[:8]}"
    race_blob = f"blob-race-{uuid.uuid4().hex[:8]}"
    race_parent = f"snap-parent-{uuid.uuid4().hex[:8]}"  # seeded L1 for lineage OK
    race_path = _make_shared_db_with_seed(race_task, race_attempt, race_blob, budget=100)
    # Pre-seed an L1 parent so concurrent L2 writes have a valid lineage parent.
    seed_conn = connect_with_fk(path=race_path)
    seed_conn.execute(
        "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, level, "
        "  token_count, trust_label, raw_blob_id) "
        "VALUES (?, ?, ?, 'L1', 5, ?, ?)",
        (race_parent, race_task, race_attempt, TRUSTED_USER_INPUT, race_blob),
    )
    seed_conn.commit()
    seed_conn.close()

    # Case 10 (P0-9A 真并发): two threads each INSERT L2=60; budget=100 ⇒ 1 ok + 1 reject
    def _l2_60(c):
        insert_snapshot(c, race_task, race_attempt, "L2",
                        token_count=60, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=race_parent, distilled_blob_id=race_blob)
        return "ok"

    def _l2_60b(c):
        insert_snapshot(c, race_task, race_attempt, "L2",
                        token_count=60, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=race_parent, distilled_blob_id=race_blob)
        return "ok"

    results, errs = _race_two_writes(race_path, _l2_60, _l2_60b,
                                      "A", "B", "ok", "ok",
                                      "P0-9A 真并发")
    oks = [k for k, v in results.items() if v == "ok"]
    rejs = [k for k, v in results.items() if v == "IntegrityError"]
    assert len(oks) == 1 and len(rejs) == 1, (
        f"P0-9A race: expected 1 ok + 1 IntegrityError; got {results}"
    )
    print(f"OK: P0-9A 真并发 → 1 ok + 1 reject; results={results}")

    # Case 11 (P0-9B 真并发): one thread writes L3 trusted, other L3 untrusted_external.
    # Need fresh task + L2 parent for lineage.
    race_task_b = f"task-raceb-{uuid.uuid4().hex[:8]}"
    race_attempt_b = f"att-raceb-{uuid.uuid4().hex[:8]}"
    race_blob_b = f"blob-raceb-{uuid.uuid4().hex[:8]}"
    race_path_b = _make_shared_db_with_seed(race_task_b, race_attempt_b, race_blob_b, budget=1000)
    seed_conn = connect_with_fk(path=race_path_b)
    # Seed L1 + L2 parent for lineage OK on both threads.
    # L1 has no parent (L1 lineage requirement not enforced). L2 needs parent=L1.
    l1_id_b = f"snap-l1-{uuid.uuid4().hex[:8]}"
    l2_id_b = f"snap-l2-{uuid.uuid4().hex[:8]}"
    seed_conn.execute(
        "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, level, "
        "  token_count, trust_label, raw_blob_id, distilled_blob_id) "
        "VALUES (?, ?, ?, 'L1', 5, ?, ?, ?)",
        (l1_id_b, race_task_b, race_attempt_b,
         TRUSTED_USER_INPUT, race_blob_b, race_blob_b),
    )
    seed_conn.execute(
        "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, level, "
        "  token_count, trust_label, raw_blob_id, distilled_blob_id, parent_snapshot_id) "
        "VALUES (?, ?, ?, 'L2', 5, ?, ?, ?, ?)",
        (l2_id_b, race_task_b, race_attempt_b,
         TRUSTED_USER_INPUT, race_blob_b, race_blob_b, l1_id_b),
    )
    seed_conn.commit()
    parent_l2_id = l2_id_b
    seed_conn.close()

    def _l3_trusted(c):
        insert_snapshot(c, race_task_b, race_attempt_b, "L3",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=parent_l2_id,
                        distilled_blob_id=race_blob_b)
        return "ok"

    def _l3_poison(c):
        insert_snapshot(c, race_task_b, race_attempt_b, "L3",
                        token_count=10, trust_label=UNTRUSTED_EXTERNAL,
                        parent_snapshot_id=parent_l2_id,
                        distilled_blob_id=race_blob_b)
        return "ok"

    results, errs = _race_two_writes(race_path_b, _l3_trusted, _l3_poison,
                                      "good", "poison", "ok", "ok",
                                      "P0-9B 真并发")
    oks_b = [k for k, v in results.items() if v == "ok"]
    rejs_b = [k for k, v in results.items() if v == "IntegrityError"]
    assert len(oks_b) == 1 and len(rejs_b) == 1, (
        f"P0-9B race: expected 1 ok + 1 reject; got {results}"
    )
    assert "poison" in rejs_b, f"P0-9B race: poison thread must be rejected; got {results}"
    # Verify the rejection was for the right reason — peek at the loser thread's error
    poison_error = next((e for e in errs if "I14" in str(e) or "untrusted" in str(e).lower()), None)
    assert poison_error is not None, (
        f"P0-9B race: reject reason must mention I14; got errors={[str(e) for e in errs]}"
    )
    print(f"OK: P0-9B 真并发 → trusted ok, poison rejected by I14")

    # Case 12 (P0-9C 真并发, FK=ON): one thread writes L1 with bad raw_blob_id, other with good.
    # Must use shared DB + connect_with_fk (FK=ON).
    race_task_c = f"task-racec-{uuid.uuid4().hex[:8]}"
    race_attempt_c = f"att-racec-{uuid.uuid4().hex[:8]}"
    race_blob_c = f"blob-racec-{uuid.uuid4().hex[:8]}"
    race_path_c = _make_shared_db_with_seed(race_task_c, race_attempt_c, race_blob_c, budget=1000)

    def _l1_bad(c):
        insert_snapshot(c, race_task_c, race_attempt_c, "L1",
                        token_count=5, trust_label=TRUSTED_USER_INPUT,
                        raw_blob_id="blob-does-not-exist")
        return "ok"

    def _l1_good(c):
        insert_snapshot(c, race_task_c, race_attempt_c, "L1",
                        token_count=5, trust_label=TRUSTED_USER_INPUT,
                        raw_blob_id=race_blob_c)
        return "ok"

    results, errs = _race_two_writes(race_path_c, _l1_bad, _l1_good,
                                      "bad", "good", None, "ok",
                                      "P0-9C 真并发")
    assert results.get("good") == "ok", f"P0-9C race: good L1 must succeed; got {results}"
    assert "bad" not in results or results.get("bad") == "IntegrityError", (
        f"P0-9C race: bad L1 must reject; got {results}"
    )
    # Verify the rejection was due to FK
    fk_err = next((e for e in errs if "FOREIGN KEY" in str(e)), None)
    assert fk_err is not None, (
        f"P0-9C race: reject reason must mention FOREIGN KEY; got {[str(e) for e in errs]}"
    )
    print(f"OK: P0-9C 真并发 → good ok, bad rejected by FOREIGN KEY (FK=ON)")

    # Case 13 (P0-9D 真并发): one thread writes snapshot with NULL task_id, other valid L2
    race_task_d = f"task-raced-{uuid.uuid4().hex[:8]}"
    race_attempt_d = f"att-raced-{uuid.uuid4().hex[:8]}"
    race_blob_d = f"blob-raced-{uuid.uuid4().hex[:8]}"
    race_path_d = _make_shared_db_with_seed(race_task_d, race_attempt_d, race_blob_d, budget=1000)
    seed_conn = connect_with_fk(path=race_path_d)
    seed_conn.execute(
        "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, level, "
        "  token_count, trust_label, raw_blob_id) "
        "VALUES (?, ?, ?, 'L1', 5, ?, ?)",
        (f"snap-l1d-{uuid.uuid4().hex[:8]}", race_task_d, race_attempt_d,
         TRUSTED_USER_INPUT, race_blob_d),
    )
    seed_conn.commit()
    parent_d_row = seed_conn.execute(
        "SELECT snapshot_id FROM context_snapshots WHERE task_id=? AND level='L1' LIMIT 1",
        (race_task_d,),
    ).fetchone()
    parent_d_id = parent_d_row["snapshot_id"]
    seed_conn.close()

    def _null_task(c):
        # Attempt to INSERT a snapshot with task_id=NULL via raw SQL (bypassing helper).
        snap_id = f"snap-null-{uuid.uuid4().hex[:8]}"
        c.execute(
            "INSERT INTO context_snapshots "
            "(snapshot_id, task_id, attempt_id, level, token_count, trust_label, "
            "  parent_snapshot_id, distilled_blob_id) "
            "VALUES (?, NULL, ?, 'L2', 10, ?, ?, ?)",
            (snap_id, race_attempt_d, TRUSTED_USER_INPUT, parent_d_id, race_blob_d),
        )
        c.commit()
        return "ok"

    def _valid_l2(c):
        insert_snapshot(c, race_task_d, race_attempt_d, "L2",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=parent_d_id, distilled_blob_id=race_blob_d)
        return "ok"

    results, errs = _race_two_writes(race_path_d, _null_task, _valid_l2,
                                      "null", "good", None, "ok",
                                      "P0-9D 真并发")
    assert results.get("good") == "ok", f"P0-9D race: good L2 must succeed; got {results}"
    assert "null" not in results or results.get("null") == "IntegrityError", (
        f"P0-9D race: null task_id must reject; got {results}"
    )
    null_err = next((e for e in errs if "NOT NULL" in str(e) and "task_id" in str(e)), None)
    assert null_err is not None, (
        f"P0-9D race: reject reason must mention NOT NULL task_id; got {[str(e) for e in errs]}"
    )
    print(f"OK: P0-9D 真并发 → good ok, NULL task_id rejected by NOT NULL")

    # Case 14 (P0-9E 真并发): negative token_count rejected by CHECK
    race_task_e = f"task-racee-{uuid.uuid4().hex[:8]}"
    race_attempt_e = f"att-racee-{uuid.uuid4().hex[:8]}"
    race_blob_e = f"blob-racee-{uuid.uuid4().hex[:8]}"
    race_path_e = _make_shared_db_with_seed(race_task_e, race_attempt_e, race_blob_e, budget=1000)
    seed_conn = connect_with_fk(path=race_path_e)
    seed_conn.execute(
        "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, level, "
        "  token_count, trust_label, raw_blob_id) "
        "VALUES (?, ?, ?, 'L1', 5, ?, ?)",
        (f"snap-l1e-{uuid.uuid4().hex[:8]}", race_task_e, race_attempt_e,
         TRUSTED_USER_INPUT, race_blob_e),
    )
    seed_conn.commit()
    parent_e_row = seed_conn.execute(
        "SELECT snapshot_id FROM context_snapshots WHERE task_id=? AND level='L1' LIMIT 1",
        (race_task_e,),
    ).fetchone()
    parent_e_id = parent_e_row["snapshot_id"]
    seed_conn.close()

    def _neg_tokens(c):
        insert_snapshot(c, race_task_e, race_attempt_e, "L2",
                        token_count=-1, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=parent_e_id, distilled_blob_id=race_blob_e)
        return "ok"

    def _pos_tokens(c):
        insert_snapshot(c, race_task_e, race_attempt_e, "L2",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=parent_e_id, distilled_blob_id=race_blob_e)
        return "ok"

    results, errs = _race_two_writes(race_path_e, _neg_tokens, _pos_tokens,
                                      "neg", "pos", None, "ok",
                                      "P0-9E 真并发")
    assert results.get("pos") == "ok", f"P0-9E race: positive L2 must succeed; got {results}"
    assert "neg" not in results or results.get("neg") == "IntegrityError", (
        f"P0-9E race: negative token_count must reject; got {results}"
    )
    neg_err = next((e for e in errs if "CHECK" in str(e) and "token_count" in str(e)), None)
    assert neg_err is not None, (
        f"P0-9E race: reject reason must mention CHECK token_count; got {[str(e) for e in errs]}"
    )
    print(f"OK: P0-9E 真并发 → positive ok, negative rejected by CHECK")

    # Case 15 (P0-9F 真并发): invalid level rejected by CHECK enum
    race_task_f = f"task-racef-{uuid.uuid4().hex[:8]}"
    race_attempt_f = f"att-racef-{uuid.uuid4().hex[:8]}"
    race_blob_f = f"blob-racef-{uuid.uuid4().hex[:8]}"
    race_path_f = _make_shared_db_with_seed(race_task_f, race_attempt_f, race_blob_f, budget=1000)
    seed_conn = connect_with_fk(path=race_path_f)
    seed_conn.execute(
        "INSERT INTO context_snapshots (snapshot_id, task_id, attempt_id, level, "
        "  token_count, trust_label, raw_blob_id) "
        "VALUES (?, ?, ?, 'L1', 5, ?, ?)",
        (f"snap-l1f-{uuid.uuid4().hex[:8]}", race_task_f, race_attempt_f,
         TRUSTED_USER_INPUT, race_blob_f),
    )
    seed_conn.commit()
    parent_f_row = seed_conn.execute(
        "SELECT snapshot_id FROM context_snapshots WHERE task_id=? AND level='L1' LIMIT 1",
        (race_task_f,),
    ).fetchone()
    parent_f_id = parent_f_row["snapshot_id"]
    seed_conn.close()

    def _bad_level(c):
        snap_id = f"snap-l9-{uuid.uuid4().hex[:8]}"
        c.execute(
            "INSERT INTO context_snapshots "
            "(snapshot_id, task_id, attempt_id, level, token_count, trust_label, "
            "  parent_snapshot_id, distilled_blob_id) "
            "VALUES (?, ?, ?, ?, 10, ?, ?, ?)",
            (snap_id, race_task_f, race_attempt_f, "L9", TRUSTED_USER_INPUT,
             parent_f_id, race_blob_f),
        )
        c.commit()
        return "ok"

    def _good_l2(c):
        insert_snapshot(c, race_task_f, race_attempt_f, "L2",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=parent_f_id, distilled_blob_id=race_blob_f)
        return "ok"

    results, errs = _race_two_writes(race_path_f, _bad_level, _good_l2,
                                      "bad", "good", None, "ok",
                                      "P0-9F 真并发")
    assert results.get("good") == "ok", f"P0-9F race: good L2 must succeed; got {results}"
    assert "bad" not in results or results.get("bad") == "IntegrityError", (
        f"P0-9F race: invalid level must reject; got {results}"
    )
    level_err = next((e for e in errs if "CHECK" in str(e) and "level" in str(e)), None)
    assert level_err is not None, (
        f"P0-9F race: reject reason must mention CHECK level; got {[str(e) for e in errs]}"
    )
    print(f"OK: P0-9F 真并发 → good ok, bad level rejected by CHECK enum")

    # ==================== v0.9.1 NEW: lineage + append-only + event emission ====================

    # Case 16 (P1-1 lineage): L2 without parent_snapshot_id → rejected
    task_lin1 = seed_task(conn, context_budget_tokens=100)
    attempt_lin1, _ = claim(conn, task_lin1, "w-lin1")
    blob_lin1 = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    def _l2_no_parent():
        insert_snapshot(conn, task_lin1, attempt_lin1, "L2",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=None, distilled_blob_id=blob_lin1)
    assert_integrity_aborted(_l2_no_parent, "lineage", "P1-1 L2 must have parent (lineage)")
    print("OK: P1-1 lineage L2-no-parent rejected")

    # Case 17 (P1-1 lineage): L3 without parent_snapshot_id → rejected
    blob_lin2 = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    # First create a valid L1 + L2 chain so the L3 test has a context
    s_lin1 = insert_snapshot(conn, task_lin1, attempt_lin1, "L1",
                             token_count=5, trust_label=TRUSTED_USER_INPUT,
                             raw_blob_id=blob_lin1)
    s_lin2 = insert_snapshot(conn, task_lin1, attempt_lin1, "L2",
                             token_count=5, trust_label=TRUSTED_USER_INPUT,
                             parent_snapshot_id=s_lin1, distilled_blob_id=blob_lin1)
    def _l3_no_parent():
        insert_snapshot(conn, task_lin1, attempt_lin1, "L3",
                        token_count=5, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=None, distilled_blob_id=blob_lin2)
    assert_integrity_aborted(_l3_no_parent, "lineage", "P1-1 L3 must have parent (lineage)")
    print("OK: P1-1 lineage L3-no-parent rejected")

    # Case 18 (P1-1 lineage): cross-task parent → rejected
    task_lin3 = seed_task(conn, context_budget_tokens=100)
    attempt_lin3, _ = claim(conn, task_lin3, "w-lin3")
    blob_lin3 = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    # Try to use s_lin1 (from task_lin1) as parent of a snapshot in task_lin3
    def _cross_task_parent():
        insert_snapshot(conn, task_lin3, attempt_lin3, "L2",
                        token_count=10, trust_label=TRUSTED_USER_INPUT,
                        parent_snapshot_id=s_lin1, distilled_blob_id=blob_lin3)
    assert_integrity_aborted(_cross_task_parent, "lineage",
                              "P1-1 cross-task parent rejected")
    print("OK: P1-1 cross-task parent rejected")

    # Case 19 (P0-M2-1 append-only UPDATE): UPDATE token_count to overflow → rejected
    task_upd = seed_task(conn, context_budget_tokens=100)
    attempt_upd, _ = claim(conn, task_upd, "w-upd")
    blob_upd = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    s_upd_l1 = insert_snapshot(conn, task_upd, attempt_upd, "L1",
                               token_count=5, trust_label=TRUSTED_USER_INPUT,
                               raw_blob_id=blob_upd)
    s_upd_l2 = insert_snapshot(conn, task_upd, attempt_upd, "L2",
                               token_count=50, trust_label=TRUSTED_USER_INPUT,
                               parent_snapshot_id=s_upd_l1, distilled_blob_id=blob_upd)
    def _update_overflow():
        conn.execute(
            "UPDATE context_snapshots SET token_count=200 WHERE snapshot_id=?",
            (s_upd_l2,),
        )
        conn.commit()
    assert_integrity_aborted(_update_overflow, "append-only",
                              "P0-M2-1 UPDATE rejected (I11 bypass closed)")
    # Verify token_count unchanged
    row = conn.execute(
        "SELECT token_count FROM context_snapshots WHERE snapshot_id=?", (s_upd_l2,)
    ).fetchone()
    assert row["token_count"] == 50, f"after UPDATE reject, token_count must remain 50; got {row['token_count']}"
    print(f"OK: P0-M2-1 UPDATE rejected; token_count unchanged (={row['token_count']})")

    # Case 20 (P0-M2-1 append-only UPDATE to L3 untrusted): rejected
    task_upd2 = seed_task(conn, context_budget_tokens=200)
    attempt_upd2, _ = claim(conn, task_upd2, "w-upd2")
    blob_upd2 = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    s_upd2_l1 = insert_snapshot(conn, task_upd2, attempt_upd2, "L1",
                                token_count=5, trust_label=TRUSTED_USER_INPUT,
                                raw_blob_id=blob_upd2)
    s_upd2_l2 = insert_snapshot(conn, task_upd2, attempt_upd2, "L2",
                                token_count=10, trust_label=TRUSTED_USER_INPUT,
                                parent_snapshot_id=s_upd2_l1, distilled_blob_id=blob_upd2)
    s_upd2_l3 = insert_snapshot(conn, task_upd2, attempt_upd2, "L3",
                                token_count=10, trust_label=TRUSTED_USER_INPUT,
                                parent_snapshot_id=s_upd2_l2, distilled_blob_id=blob_upd2)
    def _update_to_untrusted():
        conn.execute(
            "UPDATE context_snapshots SET level='L3', trust_label='untrusted_external' "
            "WHERE snapshot_id=?",
            (s_upd2_l3,),
        )
        conn.commit()
    assert_integrity_aborted(_update_to_untrusted, "append-only",
                              "P0-M2-1 UPDATE to untrusted rejected (I14 bypass closed)")
    row = conn.execute(
        "SELECT level, trust_label FROM context_snapshots WHERE snapshot_id=?",
        (s_upd2_l3,),
    ).fetchone()
    assert row["level"] == "L3" and row["trust_label"] == TRUSTED_USER_INPUT, (
        f"after UPDATE reject, row must remain unchanged; got {dict(row)}"
    )
    print(f"OK: P0-M2-1 UPDATE→untrusted rejected; row unchanged")

    # Case 21 (P0-M2-1 append-only DELETE): rejected
    def _delete_snapshot():
        conn.execute(
            "DELETE FROM context_snapshots WHERE snapshot_id=?", (s_upd_l2,)
        )
        conn.commit()
    assert_integrity_aborted(_delete_snapshot, "append-only",
                              "P0-M2-1 DELETE rejected")
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM context_snapshots WHERE snapshot_id=?",
        (s_upd_l2,),
    ).fetchone()
    assert row["c"] == 1, f"after DELETE reject, snapshot must remain; got {row['c']}"
    print("OK: P0-M2-1 DELETE rejected; row preserved")

    # Case 22 (P1-3 event emission): every snapshot INSERT emits a task_events row
    task_evt = seed_task(conn, context_budget_tokens=500)
    attempt_evt, _ = claim(conn, task_evt, "w-evt")
    blob_evt = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    s_evt_l1 = insert_snapshot(conn, task_evt, attempt_evt, "L1",
                               token_count=10, trust_label=TRUSTED_USER_INPUT,
                               raw_blob_id=blob_evt)
    s_evt_l2 = insert_snapshot(conn, task_evt, attempt_evt, "L2",
                               token_count=20, trust_label=TRUSTED_USER_INPUT,
                               parent_snapshot_id=s_evt_l1, distilled_blob_id=blob_evt)
    s_evt_l3 = insert_snapshot(conn, task_evt, attempt_evt, "L3",
                               token_count=30, trust_label=MODEL_GENERATED,
                               parent_snapshot_id=s_evt_l2, distilled_blob_id=blob_evt)
    rows = conn.execute(
        "SELECT event_type, payload_json FROM task_events "
        "WHERE task_id=? AND event_type='context.snapshot' ORDER BY recorded_at",
        (task_evt,),
    ).fetchall()
    assert len(rows) == 3, f"expected 3 context.snapshot events; got {len(rows)}"
    # Verify payload structure
    import json as _json
    for row in rows:
        payload = _json.loads(row["payload_json"])
        assert "snapshot_id" in payload
        assert "level" in payload
        assert "token_count" in payload
        assert "trust_label" in payload
    print(f"OK: P1-3 event emission — 3 snapshot INSERTs emitted 3 task_events rows")

    # ==================== budget=NULL happy path ====================
    # Case 23: budget=NULL means unlimited (I11 does NOT fire)
    task_unlim = seed_task(conn, context_budget_tokens=None)
    attempt_unlim, _ = claim(conn, task_unlim, "w-unlim")
    parent_blob_u = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)
    s_unlim_l1 = insert_snapshot(conn, task_unlim, attempt_unlim, "L1",
                                 token_count=10, trust_label=TRUSTED_USER_INPUT,
                                 raw_blob_id=parent_blob_u)
    insert_snapshot(conn, task_unlim, attempt_unlim, "L2",
                    token_count=5000, trust_label=TRUSTED_USER_INPUT,
                    parent_snapshot_id=s_unlim_l1, distilled_blob_id=parent_blob_u)
    total_u = working_set_total(conn, task_unlim)
    assert total_u == 5000, (
        f"with budget=NULL, I11 must NOT fire; expected total=5000, got {total_u}"
    )
    print(f"OK: NULL budget means unlimited (no I11 fire); total={total_u}")

    return 0


if __name__ == "__main__":
    sys.exit(main())