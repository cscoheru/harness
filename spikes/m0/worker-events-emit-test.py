"""Spike: worker-events-emit-test.py (v0.9.2 — closes Codex v0.9-B P1-2)

File: spikes/m0/worker-events-emit-test.py
Version: v0.9.2

Worker event emission closed-loop test:
  - 3 worker.* event schemas meta-valid (Draft 2020-12)
  - Real register/heartbeat/drain lifecycle produces 3 emitted events
  - Each event payload validates against its own JSON schema
  - Worker.* events NOT scoped to any task (task_id NULL in task_events)

Cases:
  Case 1: register worker → exactly 1 worker.dispatched event
  Case 2: heartbeat advances last_heartbeat_at → exactly 1 worker.heartbeat event
  Case 3: drain transitions active → draining → exactly 1 worker.drained event
  Case 4: full lifecycle (register + heartbeat + drain) → 3 events in order
  Case 5: each event payload validates against its own JSON schema (no fixture)

Codex v0.9 P1-2 finding: worker event schemas existed but no emission evidence;
full lifecycle produced 0 worker.* events. v0.9.2: triggers emit + spike proves.
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import sys

from jsonschema import Draft202012Validator

from _helpers import drain_worker, heartbeat_worker, make_db, register_worker

WORKER_SCHEMAS_DIR = _os.path.normpath(_os.path.join(
    _os.path.dirname(_os.path.abspath(__file__)),
    "..", "..", "spec", "events",
))


def _load_schema(filename):
    path = _os.path.join(WORKER_SCHEMAS_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    # === Setup: meta-validate 3 worker.* schemas ===
    validators = {}
    for fn in ("worker.dispatched.json", "worker.heartbeat.json", "worker.drained.json"):
        schema = _load_schema(fn)
        Draft202012Validator.check_schema(schema)
        validators[fn] = Draft202012Validator(schema)
    print(f"OK: 3 worker.* schemas meta-valid (Draft 2020-12)")

    # === Case 1: register → worker.dispatched ===
    conn = make_db()
    wid = register_worker(conn, host="h-evt-spike", worker_id="w-emit-1")

    dispatched = conn.execute(
        "SELECT payload_json FROM task_events "
        "WHERE event_type='worker.dispatched' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (wid,),
    ).fetchall()
    assert len(dispatched) == 1, (
        f"Case 1: expected 1 worker.dispatched; got {len(dispatched)}"
    )
    payload = json.loads(dispatched[0]["payload_json"])
    errs = list(validators["worker.dispatched.json"].iter_errors(payload))
    assert errs == [], f"Case 1: dispatched payload failed schema: {errs}"
    assert payload["worker_id"] == wid
    assert payload["host"] == "h-evt-spike"
    assert payload["status"] == "active"
    print(f"OK: Case 1 register → 1 worker.dispatched event with valid payload")

    # === Case 2: heartbeat → worker.heartbeat ===
    heartbeat_worker(conn, wid, offset_seconds=15)

    heartbeats = conn.execute(
        "SELECT payload_json FROM task_events "
        "WHERE event_type='worker.heartbeat' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (wid,),
    ).fetchall()
    assert len(heartbeats) == 1, (
        f"Case 2: expected 1 worker.heartbeat; got {len(heartbeats)}"
    )
    payload = json.loads(heartbeats[0]["payload_json"])
    errs = list(validators["worker.heartbeat.json"].iter_errors(payload))
    assert errs == [], f"Case 2: heartbeat payload failed schema: {errs}"
    assert payload["worker_id"] == wid
    assert payload["current_attempt_id"] is None, (
        f"idle worker should have NULL current_attempt_id; got {payload}"
    )
    print(f"OK: Case 2 heartbeat → 1 worker.heartbeat event with valid payload")

    # === Case 3: drain → worker.drained ===
    drain_worker(conn, wid)

    drained = conn.execute(
        "SELECT payload_json FROM task_events "
        "WHERE event_type='worker.drained' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (wid,),
    ).fetchall()
    assert len(drained) == 1, (
        f"Case 3: expected 1 worker.drained; got {len(drained)}"
    )
    payload = json.loads(drained[0]["payload_json"])
    errs = list(validators["worker.drained.json"].iter_errors(payload))
    assert errs == [], f"Case 3: drained payload failed schema: {errs}"
    assert payload["worker_id"] == wid
    assert payload["status"] == "draining"
    print(f"OK: Case 3 drain → 1 worker.drained event with valid payload")

    # === Case 4: full lifecycle ordering ===
    events = conn.execute(
        "SELECT event_type, recorded_at FROM task_events "
        "WHERE event_type LIKE 'worker.%' "
        "  AND json_extract(payload_json, '$.worker_id') = ? "
        "ORDER BY recorded_at",
        (wid,),
    ).fetchall()
    types = [r["event_type"] for r in events]
    assert types == ["worker.dispatched", "worker.heartbeat", "worker.drained"], (
        f"Case 4: lifecycle event order wrong; got {types}"
    )
    print(f"OK: Case 4 lifecycle ordering: dispatched → heartbeat → drained")

    # === Case 5: task_id is NULL in task_events for worker-scoped events ===
    rows = conn.execute(
        "SELECT event_type, task_id FROM task_events "
        "WHERE event_type LIKE 'worker.%' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (wid,),
    ).fetchall()
    for r in rows:
        assert r["task_id"] is None, (
            f"Case 5: worker event task_id should be NULL; got {r}"
        )
    print(f"OK: Case 5 worker.* events have NULL task_id (worker-scoped, not task-scoped)")

    print(f"\nOK: worker-events-emit-test.py v0.9.2 — 5 cases 全绿 (P1-2 closed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
