import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.checkpoint import Checkpoint
from app.config import Settings
from app.http_client import ScrapeError, SourceUnavailable
from app.sync import sync_source
from tests.test_sync import Feed


async def test_batches_resume_without_rediscovery(tmp_path):
    settings = Settings(status_file=str(tmp_path / "status.json"), detail_batch_size=1)
    checkpoint = Checkpoint(settings, "FUNDA")
    repo = AsyncMock()
    repo.source_links_due_for_refresh.return_value = []
    feed = Feed(
        [
            {"external_id": "1", "url": "https://example.org/1"},
            {"external_id": "2", "url": "https://example.org/2"},
        ]
    )
    with patch("app.sync.process_listing", new_callable=AsyncMock) as process:
        counts = {"seen": 0, "processed": 0, "failed": 0}
        await sync_source(
            feed, AsyncMock(), repo, AsyncMock(), settings, counts, checkpoint=checkpoint
        )
        assert counts["pending"] == 1
        assert checkpoint.load().pending[0]["external_id"] == "2"
        # Discovery would now fail; the durable snapshot must supply the next batch.
        await sync_source(
            Feed([], ScrapeError("no rediscovery")),
            AsyncMock(),
            repo,
            AsyncMock(),
            settings,
            checkpoint=checkpoint,
        )
        assert process.await_count == 2
        assert not checkpoint.path.exists()


async def test_block_stops_source_and_preserves_unacknowledged_items(tmp_path):
    settings = Settings(status_file=str(tmp_path / "status.json"))
    checkpoint = Checkpoint(settings, "FUNDA")
    rows = [{"external_id": str(i), "url": f"https://example.org/{i}"} for i in range(3)]
    with patch("app.sync.process_listing", side_effect=[None, SourceUnavailable("blocked")]) as p:
        with pytest.raises(SourceUnavailable):
            await sync_source(
                Feed(rows), AsyncMock(), AsyncMock(), AsyncMock(), settings, checkpoint=checkpoint
            )
        assert p.await_count == 2
    assert [row["external_id"] for row in checkpoint.load().pending] == ["1", "2"]


async def test_failed_discovery_does_not_publish_snapshot(tmp_path):
    settings = Settings(status_file=str(tmp_path / "status.json"))
    checkpoint = Checkpoint(settings, "FUNDA")
    with patch("app.sync.process_listing", new_callable=AsyncMock) as process:
        with pytest.raises(ScrapeError):
            await sync_source(
                Feed([{"external_id": "1"}], ScrapeError("incomplete")),
                AsyncMock(),
                AsyncMock(),
                AsyncMock(),
                settings,
                checkpoint=checkpoint,
            )
        process.assert_not_called()
    assert not checkpoint.path.exists()


async def test_cancellation_saves_acknowledged_progress(tmp_path):
    settings = Settings(status_file=str(tmp_path / "status.json"))
    checkpoint = Checkpoint(settings, "FUNDA")
    rows = [{"external_id": str(i), "url": f"https://example.org/{i}"} for i in range(3)]
    with patch("app.sync.process_listing", side_effect=[None, asyncio.CancelledError()]):
        with pytest.raises(asyncio.CancelledError):
            await sync_source(
                Feed(rows), AsyncMock(), AsyncMock(), AsyncMock(), settings, checkpoint=checkpoint
            )
    assert [row["external_id"] for row in checkpoint.load().pending] == ["1", "2"]


async def test_missing_active_links_are_queued_for_detail_checks(tmp_path):
    settings = Settings(status_file=str(tmp_path / "status.json"))
    checkpoint = Checkpoint(settings, "FUNDA")
    repo = AsyncMock()
    repo.source_links_due_for_refresh.return_value = [
        {"external_id": "old", "url": "https://example.org/old", "purpose_raw": "SALE"}
    ]
    with patch("app.sync.process_listing", new_callable=AsyncMock):
        await sync_source(
            Feed([{"external_id": "new", "url": "https://example.org/new"}]),
            AsyncMock(),
            repo,
            AsyncMock(),
            settings,
            checkpoint=checkpoint,
        )
    assert checkpoint.load().pending[0]["external_id"] == "old"
    repo.mark_links_offline_for_source.assert_not_called()


async def test_poison_listing_does_not_hold_future_crawls_forever(tmp_path):
    settings = Settings(status_file=str(tmp_path / "status.json"))
    checkpoint = Checkpoint(settings, "FUNDA")
    repo = AsyncMock()
    repo.source_links_due_for_refresh.return_value = []
    feed = Feed([{"external_id": "bad", "url": "https://example.org/bad"}])
    with patch("app.sync.process_listing", side_effect=ScrapeError("schema changed")) as process:
        for _ in range(3):
            with pytest.raises(ScrapeError):
                await sync_source(
                    feed, AsyncMock(), repo, AsyncMock(), settings, checkpoint=checkpoint
                )
        assert process.await_count == 3
        assert checkpoint.load().pending == []
        with pytest.raises(ScrapeError, match="rejected listings"):
            await sync_source(feed, AsyncMock(), repo, AsyncMock(), settings, checkpoint=checkpoint)
    assert not checkpoint.path.exists()
    repo.mark_links_offline_for_source.assert_not_called()
