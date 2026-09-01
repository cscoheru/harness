"""harness.runtime.event_sink — SqliteEventSink (EventSink Protocol impl).

Implements the v0.7 ``EventSink`` Protocol (see
``spec/interfaces/event_sink.py``).

Write side:
  The four ``worker.*`` events (registered / dispatched / heartbeat /
  drained) are emitted into ``task_events`` by SQLite triggers
  (``spec/kernel-schema.sql``: ``trg_worker_*_event_emit`` series). They
  fire automatically on the corresponding ``workers`` INSERT / UPDATE
  statements issued by ``harness.runtime.workers``.

Read side:
  ``SqliteEventSink`` provides the ``emit(envelope)`` surface for
  upstream dispatchers (gateway event loop, future T-TG-* hooks) to
  acknowledge an envelope as it flows through the sink. The audit sink
  is non-fatal: every ``emit()`` returns ``accepted=True`` because the
  trigger has already persisted the event before this is called.

For v1.0, only ``SinkKind.AUDIT`` is wired. ``METRICS`` /
``EXTERNAL_WEBHOOK`` / ``NOTIFICATION`` sinks are out of scope (T-TG-* /
T-QA-*).

Acceptance (per ``docs/v1.0-ga-team-plan.md`` §2 T-BE-3):
  ``python3 spikes/m0/worker-events-emit-test.py`` — 6 cases 全绿 (P1-2 split closed)
  ``python3 spikes/m0/conformance-second-impl.py`` — 10/10 Protocols 全绿
"""
from __future__ import annotations

import sqlite3

from spec.interfaces.event_sink import (
    EventEnvelope,
    EventSink,
    SinkKind,
    SinkResult,
)

__all__ = ["SqliteEventSink"]


class SqliteEventSink:
    """Audit sink over the kernel's ``task_events`` table.

    The actual ``task_events`` writes are performed by SQLite triggers;
    this class only surfaces the EventSink Protocol so drivers /
    dispatchers can iterate emitted events through the standard
    ``kind()`` + ``emit(envelope)`` surface.
    """

    def __init__(
        self,
        conn: sqlite3.Connection,
        sink_kind: SinkKind = SinkKind.AUDIT,
    ) -> None:
        self._conn = conn
        self._sink_kind = sink_kind
        self._seq: int = 0  # per-sink monotonic source_sequence

    def kind(self) -> SinkKind:
        """Return the sink kind. v1.0 only ships AUDIT."""
        return self._sink_kind

    async def emit(self, envelope: EventEnvelope) -> SinkResult:
        """Acknowledge an envelope.

        Idempotency is enforced by the trigger-side INSERT (the trigger
        fires once per source mutation; ``emit()`` here is the post-write
        observer hook). ``source_event_id`` / ``dedupe_key`` are surfaced
        by the envelope as-is; the sink does not re-deduplicate.

        Returns:
            ``SinkResult(accepted=True, sink_sequence=N, error=None)``.
            The audit sink never fails — the trigger has already persisted
            the row before this is invoked, and rejection here would mean
            a malformed kernel state that the caller cannot recover from.
        """
        self._seq += 1
        return SinkResult(
            sink_kind=self._sink_kind,
            accepted=True,
            sink_sequence=self._seq,
            error=None,
        )