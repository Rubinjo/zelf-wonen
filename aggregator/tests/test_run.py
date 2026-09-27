import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from app.config import Settings
from app.http_client import ScrapeError
from app.sync import run_sync


@asynccontextmanager
async def acquired(*args):
    yield True


async def test_failure_attempts_both_sources_and_persists_results(tmp_path):
    pool = AsyncMock()
    settings = Settings(status_file=str(tmp_path / "status.json"))

    async def sync(adapter, client, repo, storage, settings, counts):
        counts["seen"] = 2
        counts["processed"] = 1
        if adapter.source.value == "FUNDA":
            counts["failed"] = 1
            raise ScrapeError("blocked")
        counts["processed"] = 2

    with (
        patch("app.sync.asyncpg.create_pool", AsyncMock(return_value=pool)),
        patch("app.sync.advisory_lock", acquired),
        patch("app.sync.sync_source", AsyncMock(side_effect=sync)) as source_sync,
    ):
        with pytest.raises(ScrapeError, match="FUNDA"):
            await run_sync(settings)

    assert source_sync.await_count == 2
    results = json.loads((tmp_path / "status.json").read_text())
    assert results["FUNDA"]["failed"] == 1
    assert results["FUNDA"]["last_success"] is None
    assert results["KAMERNET"]["last_success"]
    assert results["KAMERNET"]["processed"] == 2
    pool.close.assert_awaited_once()


async def test_unknown_source_fails(tmp_path):
    with (
        patch("app.sync.asyncpg.create_pool", AsyncMock(return_value=AsyncMock())),
        patch("app.sync.advisory_lock", acquired),
    ):
        with pytest.raises(ScrapeError, match="unknown"):
            await run_sync(Settings(enabled_sources="FUNDA,TYPO", status_file=str(tmp_path / "s")))
