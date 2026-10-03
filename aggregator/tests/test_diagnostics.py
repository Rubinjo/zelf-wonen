import json
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.adapters import DetailPayload
from app.adapters.funda import FundaAdapter
from app.config import Settings
from app.diagnostics import check_sources
from app.http_client import ScrapeError
from app.status import record_status, source_retry_at


@pytest.mark.parametrize("image", [b"\xff\xd8\xffphoto", b"<html>blocked</html>"])
async def test_cooldown_clears_only_after_detail_and_image_validate(tmp_path, image):
    path = str(tmp_path / "status.json")
    settings = Settings(enabled_sources="FUNDA", status_file=path)
    counts = {"seen": 0, "processed": 0, "failed": 0}
    for source in ("FUNDA", "KAMERNET"):
        record_status(path, source, counts=counts, error="challenge", cooldown_seconds=3600)
    before = json.loads((tmp_path / "status.json").read_text())
    summary = {"external_id": "12345678", "url": "https://www.funda.nl/detail/koop/12345678/"}

    async def discover(client):
        yield summary

    adapter = FundaAdapter(settings)
    adapter.discover = discover
    adapter.fetch_detail = AsyncMock(return_value=DetailPayload(summary["url"], "text/html", ""))
    adapter.parse_detail = Mock(
        return_value={
            **summary,
            "street": "Teststraat",
            "city": "Utrecht",
            "price_raw": 450000,
            "images": [{"url": "https://cloud.funda.nl/photo.jpg"}],
        }
    )
    registry = Mock()
    registry.enabled.return_value = [adapter]
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.fetch_bytes.return_value = image
    with (
        patch("app.diagnostics.AdapterRegistry.default", return_value=registry),
        patch("app.diagnostics.ScraperClient", return_value=client),
    ):
        if image.startswith(b"\xff\xd8\xff"):
            await check_sources(settings, check_images=True, reset_cooldown=True)
            assert source_retry_at(path, "FUNDA") is None
            before["FUNDA"]["next_retry_at"] = None
        else:
            with pytest.raises(ScrapeError, match="FUNDA"):
                await check_sources(settings, check_images=True, reset_cooldown=True)
    assert json.loads((tmp_path / "status.json").read_text()) == before
    client.fetch_bytes.assert_awaited_once()
