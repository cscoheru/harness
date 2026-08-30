"""Spike: context-event-schema-test.py (v0.9.2 — closes Codex v0.9 P0-M2-1 + P1-3)

File: spikes/m0/context-event-schema-test.py
Version: v0.9.2

Validates the JSON Schema meta-schema for `context.snapshot`, exercises
canonical instances, AND asserts that every `context_snapshots` INSERT
emits exactly one `task_events` row whose `payload_json` is a valid
Draft 2020-12 instance of the same schema (not a hand-written fixture).

Part C adds worker event emission: register + heartbeat + drain lifecycle
produces 3 valid worker.* events.

Codex v0.9 P0-M2-1 finding: previous Part B extracted only `snapshot_id`
and validated a hand-written fixture — actual DB payload was missing
`task_id` and `attempt_id`. v0.9.2: trg_snapshot_event_emit now emits
both fields, and this spike validates the actual payload from the DB.
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import sqlite3
import sys
import uuid

from _helpers import (
    MODEL_GENERATED,
    TRUSTED_USER_INPUT,
    claim,
    connect_with_fk,
    insert_snapshot,
    make_db,
    seed_blob,
    seed_task,
)

SCHEMA_PATH = _os.path.normpath(_os.path.join(
    _os.path.dirname(_os.path.abspath(__file__)),
    "..", "..", "spec", "events", "context.snapshot.json",
))


def main() -> int:
    # === Part A: meta-schema + instance validation ===
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)

    # Meta-schema check: schema document itself must be a valid Draft 2020-12 schema.
    from jsonschema import Draft202012Validator
    # Draft202012Validator.check_schema() raises SchemaError on invalid schema;
    # absence of exception means schema is valid.
    Draft202012Validator.check_schema(schema)
    print("OK: context.snapshot.json is a valid Draft 2020-12 schema (meta-validation)")

    validator = Draft202012Validator(schema)

    # Empty instance must FAIL (6 required properties).
    errs = list(validator.iter_errors({}))
    assert len(errs) == 6, f"empty instance should fail with 6 errors; got {len(errs)}"
    print(f"OK: empty instance rejected (6 required-property errors)")

    # Canonical valid instance must PASS.
    good = {
        "snapshot_id": "snap-x",
        "task_id": "task-x",
        "attempt_id": "att-x",
        "level": "L2",
        "token_count": 100,
        "trust_label": "trusted_user_input",
        "raw_blob_id": None,
        "distilled_blob_id": None,
        "parent_snapshot_id": None,
        "created_at": "2026-08-30T00:00:00Z",
    }
    errs = list(validator.iter_errors(good))
    assert errs == [], f"valid instance should pass; got {errs}"
    print("OK: canonical valid instance accepted")

    # Bad level must FAIL.
    bad_level = dict(good); bad_level["level"] = "L9"
    errs = list(validator.iter_errors(bad_level))
    assert any("is not one of" in e.message for e in errs), f"bad level should fail; got {[e.message for e in errs]}"
    print("OK: invalid level rejected by JSON Schema enum")

    # Negative token_count must FAIL.
    bad_tokens = dict(good); bad_tokens["token_count"] = -1
    errs = list(validator.iter_errors(bad_tokens))
    assert any(-1 <= e.validator_value < 0 or "minimum" in e.message.lower() or "negative" in str(e).lower() for e in errs), (
        f"negative token_count should fail; got {[e.message for e in errs]}"
    )
    # More reliable: check the failed path
    assert any(list(e.absolute_path) == ["token_count"] for e in errs), (
        f"token_count path should be flagged; got paths {[list(e.absolute_path) for e in errs]}"
    )
    print("OK: negative token_count rejected by JSON Schema minimum=0")

    # Bad trust_label must FAIL.
    bad_label = dict(good); bad_label["trust_label"] = "rogue"
    errs = list(validator.iter_errors(bad_label))
    assert any("is not one of" in e.message for e in errs), (
        f"bad trust_label should fail; got {[e.message for e in errs]}"
    )
    print("OK: invalid trust_label rejected by JSON Schema enum")

    # === Part B: INSERT → task_events emission + payload schema validation ===
    conn = make_db()
    task_id = seed_task(conn, context_budget_tokens=500)
    attempt_id, _ = claim(conn, task_id, "w-evt-spike")
    blob = seed_blob(conn, trust_label=TRUSTED_USER_INPUT)

    # Insert one snapshot at each level; assert exactly one event row per INSERT.
    snap_l1 = insert_snapshot(conn, task_id, attempt_id, "L1",
                              token_count=10, trust_label=TRUSTED_USER_INPUT,
                              raw_blob_id=blob)
    snap_l2 = insert_snapshot(conn, task_id, attempt_id, "L2",
                              token_count=20, trust_label=TRUSTED_USER_INPUT,
                              parent_snapshot_id=snap_l1, distilled_blob_id=blob)
    snap_l3 = insert_snapshot(conn, task_id, attempt_id, "L3",
                              token_count=30, trust_label=MODEL_GENERATED,
                              parent_snapshot_id=snap_l2, distilled_blob_id=blob)

    rows = conn.execute(
        "SELECT event_id, task_id AS evt_task_id, attempt_id AS evt_attempt_id, "
        "       event_type, payload_json FROM task_events "
        "WHERE task_id=? AND event_type='context.snapshot' ORDER BY recorded_at",
        (task_id,),
    ).fetchall()
    assert len(rows) == 3, f"expected 3 context.snapshot events; got {len(rows)}"

    # v0.9.2 P0-M2-1: validate the ACTUAL payload_json from task_events against
    # the schema. The schema requires task_id + attempt_id; v0.9.1 emitted
    # payload was missing both.
    emitted_payloads = []
    for row in rows:
        payload = json.loads(row["payload_json"])
        emitted_payloads.append(payload)
        # event_id should be deterministic from snapshot_id
        assert row["event_id"] == f"evt-{payload['snapshot_id']}", (
            f"event_id should be 'evt-<snapshot_id>'; got {row['event_id']}"
        )
        # P0-M2-1: task_id and attempt_id MUST be present in payload
        assert "task_id" in payload, (
            f"payload missing task_id (Codex v0.9 P0-M2-1); got: {payload}"
        )
        assert "attempt_id" in payload, (
            f"payload missing attempt_id (Codex v0.9 P0-M2-1); got: {payload}"
        )
        assert payload["task_id"] == task_id, (
            f"payload task_id mismatch: {payload['task_id']} != {task_id}"
        )
        assert payload["attempt_id"] == attempt_id, (
            f"payload attempt_id mismatch: {payload['attempt_id']} != {attempt_id}"
        )
        # The columns stored in task_events must match payload values
        assert row["evt_task_id"] == task_id, (
            f"task_events.task_id column mismatch with payload"
        )
        assert row["evt_attempt_id"] == attempt_id, (
            f"task_events.attempt_id column mismatch with payload"
        )
        # CRITICAL: validate payload against the same schema (no hand-written fixture)
        errs = list(validator.iter_errors(payload))
        assert errs == [], (
            f"actual DB payload failed schema validation (P0-M2-1 regression): "
            f"{[(list(e.absolute_path), e.message) for e in errs]}"
        )
    print(f"OK: Part B — 3 snapshot INSERTs → 3 task_events rows; each payload validates against own schema (task_id + attempt_id present)")

    # Verify the JSON Schema command from Codex v0.9-A prompt actually works:
    # use a VALID instance (not {}) — Codex's command used {} which always fails.
    valid_for_check = {
        "snapshot_id": "x", "task_id": "y", "attempt_id": "z",
        "level": "L1", "token_count": 10, "trust_label": "trusted_user_input",
    }
    errs = list(validator.iter_errors(valid_for_check))
    assert errs == [], f"minimal valid instance should pass; got {errs}"
    print("OK: minimal valid instance accepted (closes Codex P1-3 'command output FAIL')")

    # === Part C: worker event schemas + lifecycle emission ===
    # Closes Codex v0.9 P1-2: worker event schemas existed but no emission evidence.
    WORKER_SCHEMAS_DIR = _os.path.normpath(_os.path.join(
        _os.path.dirname(_os.path.abspath(__file__)),
        "..", "..", "spec", "events",
    ))
    worker_schema_files = [
        "worker.dispatched.json",
        "worker.heartbeat.json",
        "worker.drained.json",
    ]
    worker_validators = {}
    for fn in worker_schema_files:
        with open(_os.path.join(WORKER_SCHEMAS_DIR, fn), "r", encoding="utf-8") as f:
            wschema = json.load(f)
        Draft202012Validator.check_schema(wschema)
        worker_validators[fn] = Draft202012Validator(wschema)
    print(f"OK: 3 worker.* event schemas meta-valid (Draft 2020-12)")

    # Run a real worker lifecycle and validate emitted payloads
    from _helpers import register_worker, heartbeat_worker, drain_worker
    wid = register_worker(conn, host="h-evt-spike", worker_id="w-evt-lifecycle")
    heartbeat_worker(conn, wid, offset_seconds=15)
    drain_worker(conn, wid)

    wevents = conn.execute(
        "SELECT event_type, payload_json FROM task_events "
        "WHERE event_type LIKE 'worker.%' "
        "  AND json_extract(payload_json, '$.worker_id') = ? "
        "ORDER BY recorded_at",
        (wid,),
    ).fetchall()
    assert len(wevents) == 3, (
        f"expected 3 worker.* events (dispatched + heartbeat + drained) for {wid}; got {len(wevents)}: "
        f"{[(r['event_type'], json.loads(r['payload_json']).get('worker_id')) for r in wevents]}"
    )

    by_type = {}
    for r in wevents:
        payload = json.loads(r["payload_json"])
        by_type.setdefault(r["event_type"], []).append(payload)
        # Map event_type to schema file
        schema_file = f"{r['event_type'].replace('.', '/').replace('/', '.', 1)}"
        # Actually: worker.dispatched → worker.dispatched.json
        schema_file = r["event_type"] + ".json"
        assert schema_file in worker_validators, f"no schema for {r['event_type']}"
        errs = list(worker_validators[schema_file].iter_errors(payload))
        assert errs == [], (
            f"worker event payload failed schema validation: "
            f"{[(list(e.absolute_path), e.message) for e in errs]} for payload: {payload}"
        )
    assert "worker.dispatched" in by_type, f"missing worker.dispatched: {list(by_type)}"
    assert "worker.heartbeat" in by_type, f"missing worker.heartbeat: {list(by_type)}"
    assert "worker.drained" in by_type, f"missing worker.drained: {list(by_type)}"
    # And the dispatched payload must reference our worker_id
    assert by_type["worker.dispatched"][0]["worker_id"] == wid, (
        f"dispatched event worker_id mismatch: {by_type['worker.dispatched'][0]}"
    )
    print(f"OK: Part C — worker lifecycle (register + heartbeat + drain) emitted 3 valid worker.* events")

    return 0


if __name__ == "__main__":
    sys.exit(main())