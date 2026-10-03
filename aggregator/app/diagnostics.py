"""Bounded source checks without database or media writes."""

import asyncio
import logging
from contextlib import aclosing

from .adapters import AdapterRegistry
from .config import Settings
from .http_client import ScrapeError, ScraperClient
from .status import clear_source_cooldown
from .storage import MAX_IMAGE_BYTES, image_content_type

logger = logging.getLogger(__name__)


async def check_sources(
    settings: Settings, *, check_images: bool = False, reset_cooldown: bool = False
) -> None:
    adapters = AdapterRegistry.default(settings).enabled(settings.source_names)
    if not adapters or {a.source.value for a in adapters} != set(settings.source_names):
        raise ScrapeError("enabled sources are empty or contain unknown sources")
    failed = []
    async with ScraperClient(settings) as client:
        for adapter in adapters:
            try:
                async with asyncio.timeout(min(settings.source_timeout_seconds, 120)):
                    async with aclosing(adapter.discover(client)) as discovery:
                        summary = await anext(discovery)
                    payload = await adapter.fetch_detail(client, summary)
                    listing = adapter.normalize(adapter.parse_detail(summary, payload))
                    if (
                        listing.street == "Onbekend"
                        or listing.city == "Onbekend"
                        or not (listing.asking_price_cents or listing.monthly_rent_cents)
                    ):
                        raise ScrapeError("detail lacks address or price")
                    if check_images and listing.images:
                        body = await client.fetch_bytes(
                            listing.images[0].url,
                            referer=listing.url,
                            max_bytes=MAX_IMAGE_BYTES,
                        )
                        if not body or image_content_type(body) is None:
                            raise ScrapeError("first listing image is unavailable or invalid")
                        logger.info("%s: one image validated", adapter.source.value)
                    logger.info(
                        "%s: discovery and one detail validated (ID %s); coverage not established",
                        adapter.source.value,
                        listing.external_id,
                    )
                if reset_cooldown:
                    clear_source_cooldown(settings.status_file, adapter.source.value)
                    logger.info("%s: saved cooldown cleared", adapter.source.value)
            except Exception:
                failed.append(adapter.source.value)
                logger.exception("%s source check failed", adapter.source.value)
    if failed:
        raise ScrapeError(f"source checks failed: {', '.join(failed)}")
