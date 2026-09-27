"""Image hosting: download source images into platform-controlled storage.

We never hotlink source images. Each image uses the source proxy/User-Agent pool,
is content-hashed, and is written either to S3-compatible object
storage (AWS S3 / Cloudflare R2) or to a persistent local directory on the VM. The
UI only ever references the returned ``storage_key``.
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import httpx

from .config import Settings
from .http_client import ScraperClient

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 20 * 1024 * 1024


def image_content_type(body: bytes) -> str | None:
    """Reject HTML/error pages even when a source URL ends in .jpg."""
    if body.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return "image/webp"
    if body[4:8] == b"ftyp" and body[8:12] in (b"avif", b"avis"):
        return "image/avif"
    return None


@dataclass
class StoredImage:
    storage_key: str
    source_url: str
    mime_type: str
    sha256: str
    size_bytes: int


class ImageStorage:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._s3 = None
        if settings.image_storage_mode == "s3":
            self._s3 = self._build_s3_client(settings)
        else:
            Path(settings.local_media_dir).mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _build_s3_client(settings: Settings):
        import boto3  # imported lazily so local mode never requires boto3 credentials

        return boto3.client(
            "s3",
            endpoint_url=settings.object_storage_endpoint_url,
            region_name=settings.object_storage_region,
            aws_access_key_id=settings.object_storage_access_key_id,
            aws_secret_access_key=settings.object_storage_secret_access_key,
        )

    async def download_and_store(
        self, client: ScraperClient, source_url: str, *, referer: str | None = None
    ) -> StoredImage | None:
        """Download one image and persist it. Returns ``None`` for unreadable images."""
        body = await self._download_bytes(client, source_url, referer)
        if not body:
            logger.warning("image download failed or empty: %s", source_url)
            return None

        content_type = image_content_type(body)
        if content_type is None or len(body) > MAX_IMAGE_BYTES:
            logger.warning("invalid or oversized image: %s", source_url)
            return None

        sha256 = hashlib.sha256(body).hexdigest()
        extension = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/avif": "avif",
        }[content_type]
        storage_key = f"aggregated/{sha256[:2]}/{sha256}.{extension}"

        if self._s3 is not None:
            self._s3.put_object(
                Bucket=self._settings.object_storage_bucket,
                Key=storage_key,
                Body=body,
                ContentType=content_type,
                Metadata={"sha256": sha256},
            )
        else:
            target = Path(self._settings.local_media_dir) / storage_key
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                # Publish only complete files; Caddy reads this volume concurrently.
                descriptor, temporary_name = tempfile.mkstemp(
                    dir=target.parent, prefix=".upload-"
                )
                temporary_path = Path(temporary_name)
                try:
                    with os.fdopen(descriptor, "wb") as temporary:
                        temporary.write(body)
                    temporary_path.chmod(0o644)
                    try:
                        os.link(temporary_path, target)
                    except FileExistsError:
                        pass  # Another writer stored the same content hash.
                finally:
                    temporary_path.unlink(missing_ok=True)

        return StoredImage(
            storage_key=storage_key,
            source_url=source_url,
            mime_type=content_type,
            sha256=sha256,
            size_bytes=len(body),
        )

    async def _download_bytes(
        self, client: ScraperClient, source_url: str, referer: str | None
    ) -> bytes | None:
        headers = {"User-Agent": client._user_agents.next()}  # noqa: SLF001
        if referer:
            headers["Referer"] = referer
        proxy = client._proxies.next()  # noqa: SLF001
        try:
            async with httpx.AsyncClient(
                timeout=self._settings.request_timeout_seconds,
                follow_redirects=True,
                headers=headers,
                proxy=proxy,
            ) as session:
                async with session.stream("GET", source_url) as response:
                    if response.status_code >= 400:
                        return None
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_IMAGE_BYTES:
                            return None
                    return bytes(body)
        except httpx.HTTPError:
            return None
