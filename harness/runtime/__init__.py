"""harness.runtime — production SQLite runtime for v1.0.

Submodules (T-BE-1 lift of ``spikes/m0/_helpers.py`` v0.9-B):
    _db: make_db, connect_with_fk, seed_task, claim, ClaimRejected
    workers: register_worker, heartbeat_worker, drain_worker,
             reap_stale_workers, dispatch_worker, claim_via_pool
    context: insert_snapshot, working_set_total, VALID_TRUST_LABELS

The spike-suite source-of-truth in ``spikes/m0/_helpers.py`` remains in place
and is not deleted (per GA plan §2 T-BE-1 constraint). Production classes in
T-BE-2/3/4 build on these primitives and are re-exported here for the
canonical ``from harness.runtime import …`` import path (GA plan §4 line 3
acceptance).
"""
from .worker_pool import SqliteWorkerPool  # T-BE-2
from .event_sink import SqliteEventSink  # T-BE-3
from .context_manager import SqliteContextManager  # T-BE-4

__all__ = [
    "SqliteWorkerPool",
    "SqliteEventSink",
    "SqliteContextManager",
]