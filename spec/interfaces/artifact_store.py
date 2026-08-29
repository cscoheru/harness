"""ArtifactStore — durable bytes for blobs/artifacts.

File: spec/interfaces/artifact_store.py
Version: v0.7
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Optional, Protocol, runtime_checkable


@dataclass(frozen=True)
class BlobRef:
    blob_id: str
    sha256: str
    byte_size: int
    storage_uri: str
    content_type: Optional[str]


@dataclass(frozen=True)
class PutRequest:
    blob_id: str
    byte_stream: AsyncIterator[bytes]
    expected_sha256: Optional[str]  # if set, server MUST verify
    content_type: Optional[str]


@dataclass(frozen=True)
class PutResult:
    blob_id: str
    sha256: str
    byte_size: int


@runtime_checkable
class ArtifactStore(Protocol):
    """Stores blob bytes. M1 uses local_fs; S3 may be added later.

    Properties:
      - get() MUST verify sha256 on read and raise on mismatch.
      - put() MUST be idempotent at the blob_id level: re-putting the same
        blob_id with identical bytes is a no-op (returns existing record).
      - put() with different bytes for an existing blob_id MUST raise.
    """

    async def put(self, request: PutRequest) -> PutResult: ...

    async def get(self, blob_id: str) -> AsyncIterator[bytes]: ...

    async def stat(self, blob_id: str) -> BlobRef: ...

    async def delete(self, blob_id: str) -> None: ...