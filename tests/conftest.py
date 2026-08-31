"""Shared pytest fixtures for the v1.0 integration test suite.

Every fixture here builds on ``harness.runtime._db.make_db()`` (the v1.0
canonical DB factory) — tests do not re-parse the schema. Artifacts
go to a per-test temporary root so the real on-disk store is never
touched.
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
import uuid
from pathlib import Path

import pytest

from harness.runtime._db import claim, make_db, ClaimRejected


@pytest.fixture
def conn() -> sqlite3.Connection:
    """Fresh SQLite connection per test with full kernel schema applied.

    make_db() asserts FK=ON immediately after schema apply (defense in
    depth against v0.9-A P0-9C regression), so tests start from a
    known-good state.
    """
    c = make_db()
    yield c
    try:
        c.close()
    except sqlite3.Error:
        pass


@pytest.fixture
def artifact_root(tmp_path: Path) -> Path:
    """Per-test temp root for RealArtifactStore.

    tmp_path is pytest's function-scoped temp dir; RealArtifactStore will
    create ``{root}/{blob_id}.bin`` files inside.
    """
    root = tmp_path / "artifacts"
    root.mkdir(parents=True, exist_ok=True)
    return root


@pytest.fixture
def upload_root(tmp_path: Path) -> Path:
    """Per-test temp root for any blob uploads.

    Currently unused by the suite but provided as a stable seam for
    future tests (T-QA-3 benchmark, T-QA-5 stress) that may need to
    seed raw blobs.
    """
    root = tmp_path / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


@pytest.fixture
def attempt(conn: sqlite3.Connection):
    """Yield (task_id, attempt_id, lease_token, fence_version) with a real claim row.

    Uses ``harness.runtime._db.claim()`` which atomically advances the
    task fence and inserts a properly-fenced ``task_attempts`` row
    (satisfies the trg_attempt_fence_insert and FK constraints both
    context_snapshots and gateway tests depend on).
    """
    from harness.runtime._db import seed_task
    task_id = seed_task(conn)
    attempt_id, fence = claim(conn, task_id, worker_id="w-test")
    lease_row = conn.execute(
        "SELECT lease_token FROM task_attempts WHERE attempt_id=?",
        (attempt_id,),
    ).fetchone()
    yield task_id, attempt_id, lease_row["lease_token"], fence


@pytest.fixture
def attempt_factory(conn: sqlite3.Connection):
    """Same as ``attempt`` but parametrized — yield a callable for multi-attempt tests."""
    from harness.runtime._db import seed_task

    def _make(worker_id: str = "w-test") -> tuple[str, str, str, int]:
        task_id = seed_task(conn)
        attempt_id, fence = claim(conn, task_id, worker_id=worker_id)
        lease_row = conn.execute(
            "SELECT lease_token FROM task_attempts WHERE attempt_id=?",
            (attempt_id,),
        ).fetchone()
        return task_id, attempt_id, lease_row["lease_token"], fence

    return _make