"""Spike: worker-events-emit-test.py (v0.9.4 — closes Codex v0.9.3 P1-2)

File: spikes/m0/worker-events-emit-test.py
Version: v0.9.4

Worker event emission closed-loop test (v0.9.4 split semantics):
  - 4 worker.* event schemas meta-valid (Draft 2020-12)
  - Real register/heartbeat/drain lifecycle produces 3 emitted events
  - Real task claim produces worker.dispatched event (the true dispatch event)
  - Each event payload validates against its own JSON schema
  - Worker.* lifecycle events NOT scoped to any task (task_id NULL in task_events);
    worker.dispatched IS task-scoped (task_id set)

v0.9.3 finding (P1-2): the v0.9.2-era "worker.dispatched" event was actually
the registration event (payload = worker_id+host+capabilities_json+status).
v0.9.4 split: registration → worker.registered; real task→worker assignment →
worker.dispatched with task_id+worker_id+attempt_id+strategy+dispatched_at.

Cases:
  Case 1: register worker → exactly 1 worker.registered event
  Case 2: heartbeat advances last_heartbeat_at → exactly 1 worker.heartbeat event
  Case 3: drain transitions active → draining → exactly 1 worker.drained event
  Case 4: full lifecycle (register + heartbeat + drain) → 3 events in order
  Case 5: each lifecycle payload validates against its own JSON schema (no fixture)
  Case 6: worker-scoped lifecycle events have task_id NULL
  Case 7: claim(task) → exactly 1 worker.dispatched event with task_id+worker_id+attempt_id+strategy
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import sys

from jsonschema import Draft202012Validator

from _helpers import (
    claim, drain_worker, heartbeat_worker, make_db, register_worker, seed_task,
)

WORKER_SCHEMAS_DIR = _os.path.normpath(_os.path.join(
    _os.path.dirname(_os.path.abspath(__file__)),
    "..", "..", "spec", "events",
))

WORKER_SCHEMA_FILES = (
    "worker.registered.json",
    "worker.dispatched.json",
    "worker.heartbeat.json",
    "worker.drained.json",
)


def _load_schema(filename):
    path = _os.path.join(WORKER_SCHEMAS_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    # === Setup: meta-validate 4 worker.* schemas ===
    validators = {}
    for fn in WORKER_SCHEMA_FILES:
        schema = _load_schema(fn)
        Draft202012Validator.check_schema(schema)
        validators[fn] = Draft202012Validator(schema)
    print(f"OK: {len(WORKER_SCHEMA_FILES)} worker.* schemas meta-valid (Draft 2020-12)")

    # === Case 1: register → worker.registered ===
    conn = make_db()
    wid = register_worker(conn, host="h-evt-spike", worker_id="w-emit-1")

    registered = conn.execute(
        "SELECT payload_json FROM task_events "
        "WHERE event_type='worker.registered' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (wid,),
    ).fetchall()
    assert len(registered) == 1, (
        f"Case 1: expected 1 worker.registered; got {len(registered)}"
    )
    payload = json.loads(registered[0]["payload_json"])
    errs = list(validators["worker.registered.json"].iter_errors(payload))
    assert errs == [], f"Case 1: registered payload failed schema: {errs}"
    assert payload["worker_id"] == wid
    assert payload["host"] == "h-evt-spike"
    assert payload["status"] == "active"
    assert "registered_at" in payload
    print(f"OK: Case 1 register → 1 worker.registered event with valid payload")

    # v0.9.4 split check: pure worker lifecycle must NOT emit worker.dispatched
    dispatched_on_register = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events "
        "WHERE event_type='worker.dispatched' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (wid,),
    ).fetchone()["n"]
    assert dispatched_on_register == 0, (
        f"Case 1b: pure worker registration should NOT emit worker.dispatched "
        f"(v0.9.4 split); got {dispatched_on_register}"
    )
    print(f"OK: Case 1b register does NOT emit worker.dispatched (split semantics)")

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
    assert types == ["worker.registered", "worker.heartbeat", "worker.drained"], (
        f"Case 4: lifecycle event order wrong; got {types}"
    )
    print(f"OK: Case 4 lifecycle ordering: registered → heartbeat → drained")

    # === Case 5: worker-scoped events have NULL task_id ===
    rows = conn.execute(
        "SELECT event_type, task_id FROM task_events "
        "WHERE event_type LIKE 'worker.%' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (wid,),
    ).fetchall()
    for r in rows:
        assert r["task_id"] is None, (
            f"Case 5: worker lifecycle event task_id should be NULL; got {r}"
        )
    print(f"OK: Case 5 worker.* lifecycle events have NULL task_id (worker-scoped)")

    # === Case 6: worker.dispatched emitted on real task claim ===
    conn2 = make_db()
    w2 = register_worker(conn2, host="h-evt-spike", worker_id="w-emit-2")
    task_id = seed_task(conn2)
    attempt_id, _ = claim(conn2, task_id, w2)

    dispatched = conn2.execute(
        "SELECT payload_json, task_id FROM task_events "
        "WHERE event_type='worker.dispatched' "
        "  AND json_extract(payload_json, '$.worker_id') = ?",
        (w2,),
    ).fetchall()
    assert len(dispatched) == 1, (
        f"Case 6: expected 1 worker.dispatched on claim; got {len(dispatched)}"
    )
    assert dispatched[0]["task_id"] == task_id, (
        f"Case 6: task_events.task_id should be {task_id}; got {dispatched[0]['task_id']}"
    )
    payload = json.loads(dispatched[0]["payload_json"])
    errs = list(validators["worker.dispatched.json"].iter_errors(payload))
    assert errs == [], f"Case 6: dispatched payload failed schema: {errs}"
    assert payload["task_id"] == task_id
    assert payload["worker_id"] == w2
    assert payload["attempt_id"] == attempt_id
    assert payload["strategy"] in ("capability_match", "worker_takeover")
    assert "dispatched_at" in payload
    print(f"OK: Case 6 claim → 1 worker.dispatched event (task_id+worker_id+attempt_id+strategy+dispatched_at)")

    print(f"\nOK: worker-events-emit-test.py v0.9.4 — 6 cases 全绿 (P1-2 split closed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
