import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
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

    async def sync(adapter, client, repo, storage, settings, counts, **kwargs):
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
    assert results["FUNDA"]["error"] == "ScrapeError: blocked"
    assert results["KAMERNET"]["last_success"]
    assert results["KAMERNET"]["processed"] == 2
    pool.close.assert_awaited_once()


async def test_cooldown_logs_reason_without_extending_delay(tmp_path, caplog):
    path = tmp_path / "status.json"
    status = {
        "FUNDA": {
            "next_retry_at": (datetime.now(UTC) + timedelta(hours=12)).isoformat(),
            "consecutive_failures": 2,
            "error": "SourceUnavailable: challenge page for https://www.funda.nl/zoeken/koop",
        }
    }
    path.write_text(json.dumps(status))
    settings = Settings(enabled_sources="FUNDA", status_file=str(path))
    with (
        patch("app.sync.asyncpg.create_pool", AsyncMock(return_value=AsyncMock())),
        patch("app.sync.advisory_lock", acquired),
        patch("app.sync.sync_source", AsyncMock()) as source_sync,
    ):
        with pytest.raises(ScrapeError, match="FUNDA"):
            await run_sync(settings)
    source_sync.assert_not_awaited()
    assert json.loads(path.read_text()) == status
    assert status["FUNDA"]["error"] in caplog.text


async def test_unknown_source_fails(tmp_path):
    with (
        patch("app.sync.asyncpg.create_pool", AsyncMock(return_value=AsyncMock())),
        patch("app.sync.advisory_lock", acquired),
    ):
        with pytest.raises(ScrapeError, match="unknown"):
            await run_sync(Settings(enabled_sources="FUNDA,TYPO", status_file=str(tmp_path / "s")))


async def test_only_selected_adapter_runs(tmp_path):
    settings = Settings(enabled_sources="FUNDA", status_file=str(tmp_path / "status.json"))
    with (
        patch("app.sync.asyncpg.create_pool", AsyncMock(return_value=AsyncMock())),
        patch("app.sync.advisory_lock", acquired),
        patch("app.sync.sync_source", AsyncMock()) as source_sync,
    ):
        await run_sync(settings)
    source_sync.assert_awaited_once()
    assert source_sync.await_args.args[0].source.value == "FUNDA"
    results = json.loads((tmp_path / "status.json").read_text())
    assert set(results) == {"FUNDA"}
