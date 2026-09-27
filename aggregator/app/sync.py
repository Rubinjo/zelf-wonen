"""Sync orchestrator.

One run per source:

1. discover cheap summaries (sitemap/search),
2. refresh every discovered detail page to capture price/status changes,
3. store the raw detail payload in ``raw_payloads`` for debugging,
4. normalize and upsert master records + ``platform_links`` using stable source
   identity and conservative postcode matching for Funda,
5. download images into platform-controlled storage,
6. optionally expire absent links, only after complete successful discovery.

The whole run is guarded by a PostgreSQL advisory lock, so a scrape that runs
longer than the cron interval can never overlap with itself.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime

import asyncpg

from .adapters import AdapterRegistry, ListingGone, SourceAdapter
from .config import Settings
from .db import Repository
from .dedup import postcode_house_key, slugify
from .http_client import ScrapeError, ScraperClient
from .lock import advisory_lock
from .models import ListingAvailability
from .normalizer import clean_text, normalize_availability, normalize_price_cents, normalize_purpose
from .status import record_status
from .storage import ImageStorage

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    # Prisma timestamps are `timestamp without time zone`; asyncpg needs naive.
    return datetime.now(UTC).replace(tzinfo=None)


def _summary_hash(summary: dict) -> str:
    price = normalize_price_cents(summary.get("price_raw") or summary.get("price"))
    availability = normalize_availability(summary.get("status_raw") or summary.get("status"))
    purpose = normalize_purpose(summary.get("purpose_raw") or summary.get("purpose"))
    raw = f"{purpose.value}|{price}|{availability.value}|{clean_text(summary.get('title'))}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def run_sync(settings: Settings) -> None:
    pool = await asyncpg.create_pool(dsn=settings.database_url, min_size=1, max_size=5)
    try:
        async with advisory_lock(pool, settings) as acquired:
            if not acquired:
                logger.warning(
                    "skipping run: another aggregator holds advisory lock %d",
                    settings.advisory_lock_key,
                )
                raise ScrapeError("another aggregator is running")
            repo = Repository(pool, settings)
            storage = ImageStorage(settings)
            registry = AdapterRegistry.default(settings)
            async with ScraperClient(settings) as client:
                adapters = registry.enabled(settings.source_names)
                if {a.source.value for a in adapters} != set(settings.source_names) or not adapters:
                    raise ScrapeError("enabled sources are empty or contain unknown sources")
                failed: list[str] = []
                for adapter in adapters:
                    counts = {"seen": 0, "processed": 0, "failed": 0}
                    try:
                        await sync_source(adapter, client, repo, storage, settings, counts)
                    except Exception:  # one source must never take down the whole run
                        logger.exception("source %s failed", adapter.source.value)
                        failed.append(adapter.source.value)
                        record_status(
                            settings.status_file,
                            adapter.source.value,
                            counts=counts,
                            error="Source failed; inspect the service journal",
                        )
                    else:
                        record_status(
                            settings.status_file, adapter.source.value, counts=counts, error=None
                        )
                if failed:
                    raise ScrapeError(f"sources failed: {', '.join(failed)}")
    finally:
        await pool.close()


async def sync_source(
    adapter: SourceAdapter,
    client: ScraperClient,
    repo: Repository,
    storage: ImageStorage,
    settings: Settings,
    counts: dict[str, int] | None = None,
) -> int:
    counts = counts if counts is not None else {"seen": 0, "processed": 0, "failed": 0}
    seen_ids: set[str] = set()
    failures = 0
    async for summary in adapter.discover(client):
        external_id = str(summary.get("external_id") or "")
        if not external_id:
            continue
        seen_ids.add(external_id)
        counts["seen"] = len(seen_ids)
        try:
            await process_listing(adapter, client, repo, storage, settings, summary)
            counts["processed"] += 1
        except ScrapeError:
            failures += 1
            counts["failed"] += 1
            logger.warning("scrape failed for %s %s", adapter.source.value, summary.get("url"))
        except Exception:
            failures += 1
            counts["failed"] += 1
            logger.exception("unhandled error for %s %s", adapter.source.value, external_id)

    if not seen_ids or failures:
        raise ScrapeError(f"{adapter.source.value}: {len(seen_ids)} seen, {failures} failed")

    # Absence is not proof of removal unless discovery is known to be exhaustive.
    affected_masters = (
        await repo.mark_links_offline_for_source(adapter.source, seen_ids)
        if settings.expire_missing
        else []
    )
    for master_id in affected_masters:
        await repo.mark_master_offline_if_all_links_offline(master_id)
    logger.info(
        "source %s done: %d seen, %d masters reviewed",
        adapter.source.value,
        len(seen_ids),
        len(affected_masters),
    )
    return len(seen_ids)


async def process_listing(
    adapter: SourceAdapter,
    client: ScraperClient,
    repo: Repository,
    storage: ImageStorage,
    settings: Settings,
    summary: dict,
) -> None:
    now = utcnow()
    source = adapter.source
    external_id = str(summary.get("external_id") or "")
    summary_hash = _summary_hash(summary)

    existing_link = await repo.find_platform_link(source, external_id)
    # Sitemaps do not reliably expose price/status changes. Refresh every run.

    # --- Full detail fetch --------------------------------------------------
    try:
        payload = await adapter.fetch_detail(client, summary)
    except ListingGone:
        if existing_link is not None:
            await repo.upsert_platform_link(
                master_id=str(existing_link["listing_id"]),
                source=source,
                external_id=external_id,
                url=str(summary.get("url") or ""),
                status=ListingAvailability.OFFLINE,
                summary_hash=summary_hash,
                now=now,
            )
            await repo.mark_master_offline_if_all_links_offline(str(existing_link["listing_id"]))
        else:
            logger.info("new listing already gone at source: %s %s", source.value, external_id)
        return

    await repo.store_raw_payload(
        source=source,
        external_id=external_id,
        kind="detail",
        url=payload.url,
        http_status=None,
        content_type=payload.content_type,
        content_hash=hashlib.sha256(payload.body.encode("utf-8")).hexdigest(),
        body=payload.body,
        size_bytes=len(payload.body.encode("utf-8")),
        listing_id=str(existing_link["listing_id"]) if existing_link else None,
    )

    merged = {**summary, **adapter.parse_detail(summary, payload)}
    listing = adapter.normalize(merged)
    if (
        listing.street == "Onbekend"
        or listing.city == "Onbekend"
        or not (listing.asking_price_cents or listing.monthly_rent_cents)
    ):
        raise ScrapeError("detail page lacks a usable address or price")

    # --- Dedup + master upsert ----------------------------------------------
    postcode_key = postcode_house_key(
        listing.postcode, listing.house_number, listing.house_number_addition
    )
    # Rooms at one address are distinct offers. Keep Kamernet records source-scoped.
    if source.value == "KAMERNET":
        postcode_key = None
    street_key = None
    existing_master = (
        {"id": existing_link["listing_id"]}
        if existing_link
        else await repo.find_master_by_keys(postcode_key, street_key)
    )

    is_new = existing_master is None
    if is_new:
        dedup_key = postcode_key or f"source:{source.value}:{external_id}"
        master_id = await _create_master_with_slug_retry(
            repo, listing, dedup_key, postcode_key, street_key, summary_hash, now
        )
    else:
        master_id = str(existing_master["id"])
        await repo.update_master_summary(
            master_id,
            listing=listing,
            summary_hash=summary_hash,
            status=listing.availability,
            now=now,
            postcode_house_key=postcode_key,
            street_house_key=street_key,
        )

    await repo.upsert_platform_link(
        master_id=master_id,
        source=source,
        external_id=external_id,
        url=listing.url,
        status=listing.availability,
        summary_hash=summary_hash,
        now=now,
    )

    # --- Image hosting ------------------------------------------------------
    if listing.images and (is_new or await repo.count_images(master_id) == 0):
        await _download_images(
            adapter, client, storage, repo, settings, master_id, listing.url, listing.images
        )


async def _create_master_with_slug_retry(
    repo: Repository,
    listing,
    dedup_key: str,
    postcode_key: str | None,
    street_key: str | None,
    summary_hash: str,
    now: datetime,
) -> str:
    base_slug = slugify(listing.street, listing.house_number, listing.city)
    slug = base_slug
    for attempt in range(5):
        try:
            return await repo.create_master(
                dedup_key=dedup_key,
                postcode_house_key=postcode_key,
                street_house_key=street_key,
                purpose=listing.purpose,
                status=listing.availability,
                public_slug=slug,
                listing=listing,
                summary_hash=summary_hash,
                now=now,
            )
        except asyncpg.UniqueViolationError:
            slug = f"{base_slug}-{attempt + 2}"
    # Last resort: derive a unique slug from the dedup key hash.
    unique = hashlib.sha256(dedup_key.encode("utf-8")).hexdigest()[:10]
    return await repo.create_master(
        dedup_key=dedup_key,
        postcode_house_key=postcode_key,
        street_house_key=street_key,
        purpose=listing.purpose,
        status=listing.availability,
        public_slug=f"{base_slug}-{unique}",
        listing=listing,
        summary_hash=summary_hash,
        now=now,
    )


async def _download_images(
    adapter: SourceAdapter,
    client: ScraperClient,
    storage: ImageStorage,
    repo: Repository,
    settings: Settings,
    master_id: str,
    referer: str,
    images,
) -> None:
    for index, image in enumerate(images[: settings.max_images_per_listing]):
        try:
            stored = await storage.download_and_store(client, image.url, referer=referer)
        except Exception:
            logger.warning("image store failed for %s", image.url)
            continue
        if stored is None:
            continue
        await repo.upsert_image(
            master_id=master_id,
            storage_key=stored.storage_key,
            source_url=stored.source_url,
            mime_type=stored.mime_type,
            sha256=stored.sha256,
            width=image.width,
            height=image.height,
            sort_order=index,
        )
