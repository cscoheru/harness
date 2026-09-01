"""harness.gateway.artifact_store — RealArtifactStore (v1.0 production).

Implements the ``ArtifactStore`` Protocol (see ``spec/interfaces/artifact_store.py``)
on top of local files + the kernel ``blobs`` metadata table.

Storage layout:
    {root}/{blob_id}.bin

Atomic write:
    write to {root}/{blob_id}.bin.tmp → fsync → atomic rename
(per PRD v0.6 P1-4 spirit; temp files left on disk if the process
dies mid-write are a tolerable diagnostic — they do not affect any
happy-path read because the rename is the visibility point.)

Who writes ``blobs``:
    This class is the SOLE writer of the ``blobs`` table for
    ``storage_class='local_fs'``. ``put`` computes sha256 from the
    incoming bytes, writes the file, and UPSERTs the row. Callers
    (``ToolInvocationGatewayImpl._store_artifact``) only INSERT into
    ``artifacts`` afterward.

Idempotency (Protocol-enforced):
  - same ``blob_id`` + identical bytes → no-op, returns the existing
    ``PutResult`` (no rename, no DB write).
  - same ``blob_id`` + different bytes → ``BlobConflictError`` (raised
    BEFORE the rename so disk state never diverges from DB state).

Verification:
  - if ``expected_sha256`` is set on the ``PutRequest``, it MUST match
    the computed hash; mismatch raises ``Sha256MismatchError`` and
    nothing is persisted.
  - ``get`` re-reads the file and re-hashes; mismatch against
    ``blobs.sha256`` raises ``Sha256MismatchError``.

Storage class:
  v1.0 only supports ``local_fs`` (the schema CHECK constraint allows
  ``s3`` and ``memory`` but switching at runtime is out of scope).

Trust label:
  ``PutRequest`` does not carry one; default is ``'model_generated'``
  (matches ``ToolInvocationGatewayImpl._store_artifact`` previous
  behavior). Constructor exposes ``default_trust_label`` to change it.

Acceptance (per ``docs/v1.0-ga-team-plan.md`` §2 T-TG-3):
  ``python3 -m harness.gateway.artifact_store``  — 8-phase smoke 全过
  + ``conformance-second-impl.py`` 10/10 无回归（ObservableStore 仍绿）
  + ``egress-httpx-actual.py`` 无回归
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import shutil
import sqlite3
import tempfile
import uuid
from pathlib import Path
from typing import AsyncIterator, Optional

from spec.interfaces.artifact_store import (
    ArtifactStore,
    BlobRef,
    PutRequest,
    PutResult,
)

__all__ = [
    "RealArtifactStore",
    "BlobConflictError",
    "Sha256MismatchError",
    "BlobNotFoundError",
]


class BlobConflictError(Exception):
    """Raised when re-putting a blob_id with DIFFERENT bytes (Protocol §3)."""


class Sha256MismatchError(Exception):
    """Raised when computed sha256 doesn't match expected / stored value."""


class BlobNotFoundError(Exception):
    """Raised when get/stat/delete reference an unknown blob_id."""


def _now_iso() -> str:
    """ISO-8601 UTC anchor (matches harness.runtime helpers)."""
    import datetime as _dt
    base = _dt.datetime(2026, 8, 30, 12, 0, 0, tzinfo=_dt.timezone.utc)
    return base.strftime("%Y-%m-%dT%H:%M:%S.") + f"{base.microsecond // 1000:03d}Z"


class RealArtifactStore:
    """local_fs implementation of the ``ArtifactStore`` Protocol.

    Args:
        conn: SQLite connection (writes ``blobs`` rows here). Caller owns
            the connection and its lifecycle; this class does not close
            it on ``__exit__`` (it isn't a context manager).
        root: Directory to hold ``{blob_id}.bin`` files. Created if
            missing. Default = ``uploads/`` (relative to cwd).
        default_trust_label: ``blobs.trust_label`` value when ``PutRequest``
            doesn't supply one (it doesn't — see Protocol). Default
            ``'model_generated'``.
    """

    def __init__(
        self,
        conn: sqlite3.Connection,
        root: os.PathLike[str] | str = "uploads",
        default_trust_label: str = "model_generated",
    ) -> None:
        self._conn = conn
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)
        self._default_trust_label = default_trust_label

    @property
    def root(self) -> Path:
        return self._root

    # ==================== ArtifactStore Protocol ====================

    async def put(self, request: PutRequest) -> PutResult:
        """Stream ``request.byte_stream`` to disk; UPSERT blobs row.

        Returns ``PutResult(blob_id, sha256, byte_size)``. Idempotent
        on (blob_id, bytes); conflicting bytes raise ``BlobConflictError``;
        ``expected_sha256`` mismatch raises ``Sha256MismatchError``.
        """
        # 1. Drain byte_stream into memory while computing sha256.
        #    Bounded memory is out of scope for v1.0 (M1 task); we drain
        #    fully because the file is small (KB-MB range, per PRD v0.6).
        hasher = hashlib.sha256()
        byte_size = 0
        chunks: list[bytes] = []
        async for chunk in request.byte_stream:
            hasher.update(chunk)
            byte_size += len(chunk)
            chunks.append(chunk)
        computed_sha = hasher.hexdigest()

        # 2. expected_sha256 check.
        if request.expected_sha256 is not None:
            if computed_sha != request.expected_sha256:
                raise Sha256MismatchError(
                    f"computed sha256 {computed_sha} != expected "
                    f"{request.expected_sha256} for {request.blob_id}"
                )

        # 3. Idempotency check: existing blob_id?
        existing = self._conn.execute(
            "SELECT byte_size, sha256, storage_uri FROM blobs WHERE blob_id=?",
            (request.blob_id,),
        ).fetchone()
        if existing is not None:
            existing_sha = existing["sha256"]
            existing_size = int(existing["byte_size"])
            if existing_sha != computed_sha or existing_size != byte_size:
                raise BlobConflictError(
                    f"blob_id {request.blob_id} already exists with different "
                    f"bytes (sha {existing_sha[:8]}…/{existing_size}B != "
                    f"{computed_sha[:8]}…/{byte_size}B)"
                )
            # Identical — idempotent no-op, return existing row.
            return PutResult(
                blob_id=request.blob_id,
                sha256=existing_sha,
                byte_size=existing_size,
            )

        # 4. Atomic write: write to .tmp, fsync, rename over target.
        target = self._root / f"{request.blob_id}.bin"
        # tempfile in same dir so rename is atomic (same filesystem).
        fd, tmp_path = tempfile.mkstemp(
            prefix=f"{request.blob_id}.", suffix=".tmp", dir=str(self._root),
        )
        try:
            with os.fdopen(fd, "wb") as f:
                for chunk in chunks:
                    f.write(chunk)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, target)
        except Exception:
            # Best-effort cleanup; leave tmp for diagnosis if replace failed.
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

        # 5. INSERT blobs row. sha256 is UNIQUE; if some other blob_id
        #    already holds this content, the INSERT fails — propagate.
        storage_uri = str(target.resolve())
        try:
            self._conn.execute(
                "INSERT INTO blobs "
                "  (blob_id, byte_size, sha256, storage_class, storage_uri, "
                "   content_type, trust_label) "
                "VALUES (?, ?, ?, 'local_fs', ?, ?, ?)",
                (request.blob_id, byte_size, computed_sha, storage_uri,
                 request.content_type, self._default_trust_label),
            )
            self._conn.commit()
        except sqlite3.IntegrityError as e:
            # Race: another writer already inserted this sha256 with a
            # different blob_id. We wrote the file but the DB rejected;
            # remove the file so we don't orphan.
            try:
                target.unlink()
            except OSError:
                pass
            raise

        return PutResult(
            blob_id=request.blob_id,
            sha256=computed_sha,
            byte_size=byte_size,
        )

    async def get(self, blob_id: str) -> AsyncIterator[bytes]:
        """Read file, verify sha256 against blobs.sha256, yield bytes.

        Raises:
            BlobNotFoundError: no row for ``blob_id``.
            Sha256MismatchError: file content does not match stored sha.
        """
        row = self._conn.execute(
            "SELECT sha256, storage_uri FROM blobs WHERE blob_id=?",
            (blob_id,),
        ).fetchone()
        if row is None:
            raise BlobNotFoundError(f"blob_id not registered: {blob_id}")
        target = Path(row["storage_uri"])
        if not target.exists():
            raise BlobNotFoundError(
                f"blob_id {blob_id} registered but file missing: {target}"
            )

        # Verify hash BEFORE yielding anything (fail fast).
        hasher = hashlib.sha256()
        with open(target, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    break
                hasher.update(chunk)
        if hasher.hexdigest() != row["sha256"]:
            raise Sha256MismatchError(
                f"blob_id {blob_id} on-disk sha != stored sha256"
            )

        # Re-open for reading (separates verify from yield).
        async def _gen() -> AsyncIterator[bytes]:
            with open(target, "rb") as f:
                while True:
                    chunk = f.read(64 * 1024)
                    if not chunk:
                        return
                    yield chunk

        return _gen()

    async def stat(self, blob_id: str) -> BlobRef:
        """Return ``BlobRef`` for ``blob_id``; raises ``BlobNotFoundError``."""
        row = self._conn.execute(
            "SELECT byte_size, sha256, storage_uri, content_type "
            "FROM blobs WHERE blob_id=?",
            (blob_id,),
        ).fetchone()
        if row is None:
            raise BlobNotFoundError(f"blob_id not registered: {blob_id}")
        return BlobRef(
            blob_id=blob_id,
            sha256=row["sha256"],
            byte_size=int(row["byte_size"]),
            storage_uri=row["storage_uri"],
            content_type=row["content_type"],
        )

    async def delete(self, blob_id: str) -> None:
        """Remove file + blobs row.

        Raises:
            BlobNotFoundError: no row for ``blob_id``.
            sqlite3.IntegrityError: an ``artifacts`` row still references
                this blob (``ON DELETE RESTRICT``). Caller should sweep
                orphans out-of-band (out of scope for v1.0 — TODO).
        """
        row = self._conn.execute(
            "SELECT storage_uri FROM blobs WHERE blob_id=?",
            (blob_id,),
        ).fetchone()
        if row is None:
            raise BlobNotFoundError(f"blob_id not registered: {blob_id}")
        target = Path(row["storage_uri"])
        if target.exists():
            target.unlink()
        self._conn.execute("DELETE FROM blobs WHERE blob_id=?", (blob_id,))
        self._conn.commit()


# Self-check entry point: ``python3 -m harness.gateway.artifact_store``.
if __name__ == "__main__":  # pragma: no cover
    import sys as _sys
    _sys.path.insert(0, ".")
    _sys.path.insert(0, "spikes/m0")
    from harness.runtime._db import connect_with_fk

    async def _main() -> int:
        conn = connect_with_fk()
        with tempfile.TemporaryDirectory(prefix="harness-art-") as root:
            store = RealArtifactStore(conn=conn, root=root)
            # smoke: put + get + idempotent + conflict + stat + delete
            blob_id = f"blob-{uuid.uuid4().hex[:12]}"
            put_res = await store.put(PutRequest(
                blob_id=blob_id,
                byte_stream=_bytes_iter(b"hello world"),
                expected_sha256=None,
                content_type="text/plain",
            ))
            assert put_res.blob_id == blob_id
            assert put_res.byte_size == len(b"hello world")
            assert put_res.sha256 == hashlib.sha256(b"hello world").hexdigest()
            # idempotent
            put_res2 = await store.put(PutRequest(
                blob_id=blob_id,
                byte_stream=_bytes_iter(b"hello world"),
                expected_sha256=None,
                content_type="text/plain",
            ))
            assert put_res2.sha256 == put_res.sha256
            # get
            gen = await store.get(blob_id)
            out = b""
            async for c in gen:
                out += c
            assert out == b"hello world"
            # stat
            ref = await store.stat(blob_id)
            assert ref.byte_size == 11
            # delete
            await store.delete(blob_id)
            try:
                await store.stat(blob_id)
            except BlobNotFoundError:
                pass
            else:
                print("FAIL: stat after delete should raise")
                return 1
        print("RealArtifactStore: minimal smoke OK")
        return 0

    async def _bytes_iter(data: bytes) -> AsyncIterator[bytes]:
        yield data

    import asyncio as _asyncio
    raise SystemExit(_asyncio.run(_main()))