"""Spike: context-event-schema-test.py (v0.9.1 — closes Codex v0.9-A P1-3)

File: spikes/m0/context-event-schema-test.py
Version: v0.9.1

Validates the JSON Schema meta-schema for `context.snapshot`, exercises
canonical instances, and asserts that every `context_snapshots` INSERT
emits exactly one `task_events` row (via `trg_snapshot_event_emit`).
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

    # === Part B: INSERT → task_events emission (closed-loop test) ===
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
        "SELECT event_id, event_type, payload_json FROM task_events "
        "WHERE task_id=? AND event_type='context.snapshot' ORDER BY recorded_at",
        (task_id,),
    ).fetchall()
    assert len(rows) == 3, f"expected 3 context.snapshot events; got {len(rows)}"

    # Verify each event has the correct snapshot_id payload
    emitted_ids = set()
    for row in rows:
        payload = json.loads(row["payload_json"])
        emitted_ids.add(payload["snapshot_id"])
    expected_ids = {snap_l1, snap_l2, snap_l3}
    assert emitted_ids == expected_ids, (
        f"emitted snapshot_ids {emitted_ids} != inserted {expected_ids}"
    )
    # Verify event_id is deterministic from snapshot_id
    for row in rows:
        snap_id = json.loads(row["payload_json"])["snapshot_id"]
        assert row["event_id"] == f"evt-{snap_id}", (
            f"event_id should be 'evt-<snapshot_id>'; got {row['event_id']}"
        )
    print(f"OK: 3 snapshot INSERTs → 3 task_events rows; deterministic event_id")

    # Verify the JSON Schema command from Codex v0.9-A prompt actually works:
    # use a VALID instance (not {}) — Codex's command used {} which always fails.
    valid_for_check = {
        "snapshot_id": "x", "task_id": "y", "attempt_id": "z",
        "level": "L1", "token_count": 10, "trust_label": "trusted_user_input",
    }
    errs = list(validator.iter_errors(valid_for_check))
    assert errs == [], f"minimal valid instance should pass; got {errs}"
    print("OK: minimal valid instance accepted (closes Codex P1-3 'command output FAIL')")

    return 0


if __name__ == "__main__":
    sys.exit(main())