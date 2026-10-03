"""Sync orchestrator.

One run per source:

1. discover cheap summaries (sitemap/search),
2. refresh every discovered detail page to capture price/status changes,
3. store the raw detail payload in ``raw_payloads`` for debugging,
4. normalize and upsert master records + ``platform_links`` using stable source
   identity and conservative postcode matching for Funda,
5. download images into platform-controlled storage,
6. enrich neighborhoods using the web app's shared public-data clients,
7. optionally expire absent links, only after complete successful discovery.

The whole run is guarded by a PostgreSQL advisory lock, so a scrape that runs
longer than the cron interval can never overlap with itself.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import UTC, datetime

import asyncpg
import httpx

from .adapters import AdapterRegistry, ListingGone, SourceAdapter
from .checkpoint import Checkpoint
from .config import Settings
from .db import Repository
from .dedup import postcode_house_key, slugify
from .http_client import ScrapeError, ScraperClient, SourceUnavailable
from .lock import advisory_lock
from .models import ListingAvailability
from .neighborhood import enrich_neighborhood
from .normalizer import clean_text, normalize_availability, normalize_price_cents, normalize_purpose
from .status import record_status, source_last_error, source_retry_at
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
            async with ScraperClient(settings) as client, httpx.AsyncClient() as enrichment_client:
                adapters = registry.enabled(settings.source_names)
                if {a.source.value for a in adapters} != set(settings.source_names) or not adapters:
                    raise ScrapeError("enabled sources are empty or contain unknown sources")
                failed: list[str] = []
                for adapter in adapters:
                    counts = {"seen": 0, "processed": 0, "failed": 0}
                    try:
                        retry_at = source_retry_at(settings.status_file, adapter.source.value)
                        if retry_at and retry_at > datetime.now(UTC):
                            logger.warning(
                                "source %s cooling down until %s; last error: %s",
                                adapter.source.value,
                                retry_at.isoformat(),
                                source_last_error(settings.status_file, adapter.source.value)
                                or "unknown",
                            )
                            failed.append(adapter.source.value)
                            continue
                        async with asyncio.timeout(settings.source_timeout_seconds):
                            await sync_source(
                                adapter,
                                client,
                                repo,
                                storage,
                                settings,
                                counts,
                                checkpoint=Checkpoint(settings, adapter.source.value),
                                enrichment_client=enrichment_client,
                            )
                    except Exception as exc:  # one source must never take down the whole run
                        logger.exception("source %s failed", adapter.source.value)
                        failed.append(adapter.source.value)
                        record_status(
                            settings.status_file,
                            adapter.source.value,
                            counts=counts,
                            error=f"{type(exc).__name__}: {exc}"
                            if isinstance(exc, ScrapeError)
                            else f"{type(exc).__name__}: inspect the service journal",
                            cooldown_seconds=settings.source_cooldown_seconds,
                            max_cooldown_seconds=settings.max_source_cooldown_seconds,
                            retry_after=exc.retry_after
                            if isinstance(exc, SourceUnavailable)
                            else 0,
                        )
                    else:
                        record_status(
                            settings.status_file,
                            adapter.source.value,
                            counts=counts,
                            error=None,
                            completed=counts.get("pending", 0) == 0
                            and bool(counts.get("discovery_complete", 1)),
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
    *,
    checkpoint: Checkpoint | None = None,
    enrichment_client: httpx.AsyncClient | None = None,
) -> int:
    counts = counts if counts is not None else {"seen": 0, "processed": 0, "failed": 0}
    snapshot = checkpoint.load() if checkpoint else None
    summaries = list(snapshot.pending) if snapshot else []
    discovered = set(snapshot.seen_ids) if snapshot else set()
    discovery_complete = snapshot.discovery_complete if snapshot else False
    # Drain backlog before discovering more pages. This bounds memory, disk and
    # network work while retaining source order across scheduled invocations.
    if not discovery_complete and len(summaries) < settings.detail_batch_size:
        if snapshot:
            adapter.discovery_cursor = snapshot.discovery_cursor
        async for summary in adapter.discover(client):
            external_id = str(summary.get("external_id") or "")
            if not external_id:
                raise ScrapeError("discovered listing has no source identity")
            if external_id in discovered:
                continue
            discovered.add(external_id)
            summaries.append(summary)
            counts["seen"] = len(discovered)
            if len(discovered) > settings.max_listings_per_source:
                raise ScrapeError("listing limit reached; discovery incomplete")
        discovery_complete = adapter.discovery_complete
        if not discovered and discovery_complete:
            raise ScrapeError(f"{adapter.source.value}: empty discovery")
        if checkpoint:
            snapshot = snapshot or checkpoint.create(summaries)
            snapshot.pending = summaries
            snapshot.seen_ids = sorted(discovered)
            snapshot.discovery_cursor = adapter.discovery_cursor
            snapshot.discovery_complete = discovery_complete
            checkpoint.save(snapshot)
    seen_ids = discovered
    counts["discovery_complete"] = int(discovery_complete)
    counts["seen"] = len(seen_ids)
    remaining = list(summaries)
    failures = []
    consecutive_errors = 0
    batch = summaries[: settings.detail_batch_size] if checkpoint else summaries
    try:
        for summary in batch:
            try:
                await process_listing(
                    adapter,
                    client,
                    repo,
                    storage,
                    settings,
                    summary,
                    enrichment_client=enrichment_client,
                )
                counts["processed"] += 1
                consecutive_errors = 0
            except SourceUnavailable:
                # Do not turn a block into hundreds of per-listing retries.
                raise
            except Exception:
                counts["failed"] += 1
                consecutive_errors += 1
                external_id = str(summary["external_id"])
                attempts = snapshot.detail_attempts.get(external_id, 0) + 1 if snapshot else 1
                if snapshot:
                    snapshot.detail_attempts[external_id] = attempts
                if snapshot and attempts >= 3:
                    if external_id not in snapshot.rejected_ids:
                        snapshot.rejected_ids.append(external_id)
                    logger.error(
                        "deferring malformed %s listing %s until the next crawl",
                        adapter.source.value,
                        external_id,
                    )
                else:
                    failures.append(summary)
                logger.exception(
                    "listing failed for %s %s", adapter.source.value, summary.get("external_id")
                )
            remaining.pop(0)
            if snapshot and checkpoint and (counts["processed"] + counts["failed"]) % 25 == 0:
                snapshot.pending = remaining + failures
                checkpoint.save(snapshot)
            if consecutive_errors >= 3:
                raise ScrapeError("three consecutive listing errors; stopping source")
    finally:
        counts["pending"] = len(remaining) + len(failures)
        if snapshot and checkpoint:
            counts["rejected"] = len(snapshot.rejected_ids)
            snapshot.pending = remaining + failures
            checkpoint.save(snapshot)
    if counts["failed"]:
        raise ScrapeError(f"{adapter.source.value}: {counts['failed']} listing failures")
    if remaining or not discovery_complete:
        logger.info("source %s batch complete: %d pending", adapter.source.value, len(remaining))
        return len(seen_ids)

    if checkpoint and snapshot:
        # Search ordering and filters can hide still-active listings. Resolve
        # their status from detail pages in bounded batches at the end of a crawl.
        cutoff = datetime.fromisoformat(snapshot.created_at).astimezone(UTC).replace(tzinfo=None)
        stale = await repo.source_links_due_for_refresh(
            adapter.source, cutoff, settings.detail_batch_size, snapshot.rejected_ids
        )
        if stale:
            snapshot.pending = stale
            checkpoint.save(snapshot)
            counts["pending"] = len(stale)
            return len(seen_ids)
        if snapshot.rejected_ids:
            checkpoint.clear()
            raise ScrapeError(
                f"crawl finished with {len(snapshot.rejected_ids)} rejected listings; "
                "next run will start a fresh crawl"
            )

    # Absence is not proof of removal unless discovery is known to be exhaustive.
    affected_masters = (
        await repo.mark_links_offline_for_source(adapter.source, seen_ids)
        if settings.expire_missing and adapter.supports_missing_expiry
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
    if checkpoint:
        checkpoint.clear()
    return len(seen_ids)


async def process_listing(
    adapter: SourceAdapter,
    client: ScraperClient,
    repo: Repository,
    storage: ImageStorage,
    settings: Settings,
    summary: dict,
    *,
    enrichment_client: httpx.AsyncClient | None = None,
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
    if listing.images:
        await _download_images(
            adapter, client, storage, repo, settings, master_id, listing.url, listing.images
        )
    if enrichment_client is not None:
        await enrich_neighborhood(enrichment_client, settings, master_id)


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
    def image_key(url: str) -> str:
        # Funda's OpenGraph thumbnail and gallery photo can differ only in
        # resize options. Reuse the hosted thumbnail instead of adding a duplicate.
        return url.split("?", 1)[0] if adapter.source.value == "FUNDA" else url

    existing_urls = {image_key(url) for url in await repo.image_source_urls(master_id)}
    for index, image in enumerate(images[: settings.max_images_per_listing]):
        if image_key(image.url) in existing_urls:
            continue
        try:
            stored = await storage.download_and_store(client, image.url, referer=referer)
        except SourceUnavailable:
            raise
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
