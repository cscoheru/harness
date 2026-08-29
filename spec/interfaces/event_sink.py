"""EventSink — the only way to talk to the world beyond SQLite.

File: spec/interfaces/event_sink.py
Version: v0.7
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Protocol, runtime_checkable


class SinkKind(str, Enum):
    AUDIT = "audit"
    METRICS = "metrics"
    EXTERNAL_WEBHOOK = "external_webhook"
    NOTIFICATION = "notification"


@dataclass(frozen=True)
class EventEnvelope:
    """Canonical event envelope. All sinks receive this shape.

    Source attribution is required for external sinks (Q113):
      - source_event_id is the kernel's event_id.
      - source_sequence is the per-sink monotonic sequence.
      - dedupe_key is set when the same logical event was already emitted.
      - redaction_version tracks which redaction policy applied.
    """

    event_id: str
    task_id: str
    attempt_id: Optional[str]
    event_type: str
    payload: dict
    source_event_id: Optional[str]
    source_sequence: Optional[int]
    causation_id: Optional[str]
    dedupe_key: Optional[str]
    redaction_version: int
    recorded_at: str


@dataclass(frozen=True)
class SinkResult:
    sink_kind: SinkKind
    accepted: bool
    sink_sequence: Optional[int]
    error: Optional[str]


@runtime_checkable
class EventSink(Protocol):
    """A target for event envelopes.

    Properties:
      - emit() MUST be idempotent at the (sink, dedupe_key) level.
      - emit() MUST NOT mutate the envelope (sinks are read-only consumers).
      - audit sink failures MUST be surfaced (kernel halts if audit sink fails).
      - metrics sink failures are non-fatal but logged.
      - external_webhook failures MUST be retried with backoff and recorded
        in task_events.
    """

    def kind(self) -> SinkKind: ...

    async def emit(self, envelope: EventEnvelope) -> SinkResult: ...