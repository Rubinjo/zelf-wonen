import hashlib
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.config import Settings
from app.http_client import ScraperClient
from app.storage import ImageStorage


@pytest.mark.asyncio
async def test_rehosting_uses_content_type_and_atomic_content_hash(tmp_path: Path):
    settings = Settings(local_media_dir=str(tmp_path))
    storage = ImageStorage(settings)
    body = b"\x89PNG\r\n\x1a\nexample"
    digest = hashlib.sha256(body).hexdigest()
    async with ScraperClient(settings) as client:
        with patch.object(storage, "_download_bytes", AsyncMock(return_value=body)):
            image = await storage.download_and_store(client, "https://example.com/wrong.jpg")
            assert image is not None
            assert image.storage_key == f"aggregated/{digest[:2]}/{digest}.png"
            assert image.mime_type == "image/png"
            assert (tmp_path / image.storage_key).read_bytes() == body
            again = await storage.download_and_store(client, "https://example.com/wrong.jpg")
            assert again == image
        with patch.object(
            storage, "_download_bytes", AsyncMock(return_value=b"<html>error</html>")
        ):
            assert await storage.download_and_store(client, "https://example.com/photo.jpg") is None
    assert not list(tmp_path.rglob(".upload-*"))


@pytest.mark.asyncio
async def test_image_download_uses_supported_httpx_api_and_caps_size(tmp_path: Path):
    settings = Settings(local_media_dir=str(tmp_path))
    storage = ImageStorage(settings)
    async with ScraperClient(settings) as client:
        real_client = httpx.AsyncClient
        transport = httpx.MockTransport(lambda request: httpx.Response(200, content=b"12345"))
        with patch("app.storage.httpx.AsyncClient", side_effect=lambda **kwargs: real_client(
            **kwargs, transport=transport
        )):
            url = "https://example.com/photo"
            assert await storage._download_bytes(client, url, None) == b"12345"
            with patch("app.storage.MAX_IMAGE_BYTES", 4):
                assert await storage._download_bytes(client, url, None) is None


@pytest.mark.asyncio
async def test_source_fetch_uses_supported_httpx_api():
    settings = Settings(polite_delay_seconds=0)
    async with ScraperClient(settings) as client:
        await client._client.aclose()
        client._client = httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, text="listing")
        ))
        response = await client.fetch("https://example.com/listing")
        assert response.text == "listing"
