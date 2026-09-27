from unittest.mock import AsyncMock, patch

import pytest

from app.adapters import DetailPayload
from app.adapters.funda import FundaAdapter
from app.config import Settings
from app.http_client import ScrapeError
from app.sync import process_listing, sync_source
from tests.test_funda import FUNDA_HTML


class Feed(FundaAdapter):
    def __init__(self, summaries, error=None):
        super().__init__()
        self.summaries = summaries
        self.error = error

    async def discover(self, client):
        for summary in self.summaries:
            yield summary
        if self.error:
            raise self.error


@pytest.mark.parametrize(
    "summaries,error",
    [
        ([], None),
        ([{"external_id": "1"}], ScrapeError("truncated")),
    ],
)
async def test_incomplete_discovery_never_expires(summaries, error):
    repo = AsyncMock()
    with patch("app.sync.process_listing", new_callable=AsyncMock):
        with pytest.raises(ScrapeError):
            await sync_source(
                Feed(summaries, error),
                AsyncMock(),
                repo,
                AsyncMock(),
                Settings(expire_missing=True),
            )
    repo.mark_links_offline_for_source.assert_not_called()


async def test_listing_failure_blocks_expiry():
    repo = AsyncMock()
    with patch("app.sync.process_listing", side_effect=ScrapeError("blocked")):
        with pytest.raises(ScrapeError):
            await sync_source(
                Feed([{"external_id": "1"}]),
                AsyncMock(),
                repo,
                AsyncMock(),
                Settings(expire_missing=True),
            )
    repo.mark_links_offline_for_source.assert_not_called()


@pytest.mark.parametrize("expire", [True, False])
async def test_successful_discovery_expiry_is_opt_in(expire):
    repo = AsyncMock()
    repo.mark_links_offline_for_source.return_value = []
    with patch("app.sync.process_listing", new_callable=AsyncMock):
        assert (
            await sync_source(
                Feed([{"external_id": "1"}]),
                AsyncMock(),
                repo,
                AsyncMock(),
                Settings(expire_missing=expire),
            )
            == 1
        )
    assert repo.mark_links_offline_for_source.await_count == int(expire)


async def test_existing_listing_always_refreshes_and_preserves_master():
    adapter = FundaAdapter()
    adapter.fetch_detail = AsyncMock(
        return_value=DetailPayload("https://example.org", "text/html", FUNDA_HTML)
    )
    repo = AsyncMock()
    repo.find_platform_link.return_value = {"listing_id": "existing"}
    repo.count_images.return_value = 1
    await process_listing(
        adapter,
        AsyncMock(),
        repo,
        AsyncMock(),
        Settings(),
        {
            "external_id": "1",
            "url": "https://example.org",
            "purpose_raw": "buy",
        },
    )
    adapter.fetch_detail.assert_awaited_once()
    assert repo.update_master_summary.call_args.args[0] == "existing"
    repo.find_master_by_keys.assert_not_called()


async def test_challenge_like_detail_cannot_create_a_listing():
    adapter = FundaAdapter()
    adapter.fetch_detail = AsyncMock(
        return_value=DetailPayload(
            "https://example.org", "text/html", "<html>Access required</html>"
        )
    )
    repo = AsyncMock()
    repo.find_platform_link.return_value = None
    with pytest.raises(ScrapeError):
        await process_listing(
            adapter,
            AsyncMock(),
            repo,
            AsyncMock(),
            Settings(),
            {
                "external_id": "1",
                "url": "https://example.org",
                "purpose_raw": "buy",
            },
        )
    repo.create_master.assert_not_called()


async def test_missing_postcode_uses_source_identity_not_street():
    adapter = FundaAdapter()
    adapter.fetch_detail = AsyncMock(
        return_value=DetailPayload(
            "https://example.org",
            "text/html",
            FUNDA_HTML.replace('"postalCode": "1012AB",', ""),
        )
    )
    repo = AsyncMock()
    repo.find_platform_link.return_value = None
    repo.find_master_by_keys.return_value = None
    repo.create_master.return_value = "new"
    with patch("app.sync._download_images", new_callable=AsyncMock):
        await process_listing(
            adapter,
            AsyncMock(),
            repo,
            AsyncMock(),
            Settings(),
            {
                "external_id": "123",
                "url": "https://example.org",
                "purpose_raw": "buy",
            },
        )
    repo.find_master_by_keys.assert_awaited_once_with(None, None)
    assert repo.create_master.call_args.kwargs["dedup_key"] == "source:FUNDA:123"
