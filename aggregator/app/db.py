"""PostgreSQL access layer (asyncpg).

The web app owns the schema via Prisma. To keep hand-written SQL safe, every
new aggregator model in ``web/prisma/schema.prisma`` carries an explicit
``@map("...")`` snake_case column name, so the SQL here never needs quoted
camelCase identifiers.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import asyncpg

from .config import Settings
from .models import ListingAvailability, ListingPurpose, ListingSource

MASTER_COLUMNS = """
    id, dedup_key, purpose, status, public_slug, title_nl, description_nl,
    asking_price_cents, monthly_rent_cents, service_costs_cents,
    postcode, house_number, house_number_addition, street, city, municipality,
    province, latitude, longitude, property_type, living_area_sqm, plot_area_sqm,
    volume_cubic_meters, room_count, bedroom_count, bathroom_count,
    construction_year, energy_label, interior, amenities, available_from,
    summary_hash, postcode_house_key, street_house_key,
    first_seen_at, last_seen_at, expired_at, last_sync_at, created_at, updated_at
"""


def utcnow() -> datetime:
    # Prisma maps DateTime to `timestamp without time zone`; asyncpg therefore
    # requires naive datetimes for those columns.
    return datetime.now(UTC).replace(tzinfo=None)


def _to_timestamp(value: Any) -> datetime | None:
    """Coerce an ISO date/datetime string or datetime into a naive timestamp."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None)
    except ValueError:
        return None


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


class Repository:
    def __init__(self, pool: asyncpg.Pool, settings: Settings) -> None:
        self.pool = pool
        self.settings = settings

    # --- Reads --------------------------------------------------------------

    async def find_master_by_keys(
        self, postcode_house_key: str | None, street_house_key: str | None
    ) -> asyncpg.Record | None:
        if postcode_house_key:
            row = await self.pool.fetchrow(
                f"SELECT {MASTER_COLUMNS} FROM aggregated_listings "
                "WHERE postcode_house_key = $1 LIMIT 1",
                postcode_house_key,
            )
            if row:
                return row
        if street_house_key:
            row = await self.pool.fetchrow(
                f"SELECT {MASTER_COLUMNS} FROM aggregated_listings "
                "WHERE street_house_key = $1 LIMIT 1",
                street_house_key,
            )
            if row:
                return row
        return None

    async def find_master_by_dedup_key(self, dedup_key: str) -> asyncpg.Record | None:
        return await self.pool.fetchrow(
            f"SELECT {MASTER_COLUMNS} FROM aggregated_listings WHERE dedup_key = $1 LIMIT 1",
            dedup_key,
        )

    async def find_platform_link(
        self, source: ListingSource, external_id: str
    ) -> asyncpg.Record | None:
        return await self.pool.fetchrow(
            "SELECT id, listing_id, source, external_id, url, status, summary_hash, last_seen_at "
            "FROM aggregated_platform_links WHERE source = $1 AND external_id = $2 LIMIT 1",
            source.value,
            external_id,
        )

    async def source_links_due_for_refresh(
        self, source: ListingSource, before: datetime, limit: int, exclude_ids: list[str]
    ) -> list[dict[str, str]]:
        """Recheck active links missing from search instead of assuming removal."""
        rows = await self.pool.fetch(
            "SELECT p.external_id, p.url, a.purpose::text AS purpose_raw "
            "FROM aggregated_platform_links p JOIN aggregated_listings a ON a.id = p.listing_id "
            "WHERE p.source = $1 AND p.status = 'ACTIVE' "
            "AND (p.last_seen_at IS NULL OR p.last_seen_at < $2) "
            "AND NOT (p.external_id = ANY($4::text[])) "
            "ORDER BY p.last_seen_at NULLS FIRST, p.id LIMIT $3",
            source.value,
            before,
            limit,
            exclude_ids,
        )
        return [dict(row) for row in rows]

    # --- Writes -------------------------------------------------------------

    async def create_master(
        self,
        *,
        dedup_key: str,
        postcode_house_key: str | None,
        street_house_key: str | None,
        purpose: ListingPurpose,
        status: ListingAvailability,
        public_slug: str,
        listing: Any,
        summary_hash: str,
        now: datetime,
    ) -> str:
        row = await self.pool.fetchrow(
            """
            INSERT INTO aggregated_listings (
                id, dedup_key, postcode_house_key, street_house_key, purpose, status,
                public_slug, title_nl, description_nl, asking_price_cents,
                monthly_rent_cents, service_costs_cents, postcode, house_number,
                house_number_addition, street, city, municipality, province,
                latitude, longitude, property_type, living_area_sqm, plot_area_sqm,
                volume_cubic_meters, room_count, bedroom_count, bathroom_count,
                construction_year, energy_label, interior, amenities, available_from,
                summary_hash, first_seen_at, last_seen_at, last_sync_at,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
                $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
            )
            RETURNING id
            """,
            dedup_key,
            postcode_house_key,
            street_house_key,
            purpose.value,
            status.value,
            public_slug,
            listing.title,
            listing.description,
            listing.asking_price_cents,
            listing.monthly_rent_cents,
            listing.service_costs_cents,
            listing.postcode,
            listing.house_number,
            listing.house_number_addition,
            listing.street,
            listing.city,
            listing.municipality,
            listing.province,
            _decimal(listing.latitude),
            _decimal(listing.longitude),
            listing.property_type.value,
            _decimal(listing.living_area_sqm),
            _decimal(listing.plot_area_sqm),
            _decimal(listing.volume_cubic_meters),
            listing.room_count,
            listing.bedroom_count,
            listing.bathroom_count,
            listing.construction_year,
            listing.energy_label.value if listing.energy_label else None,
            _json(listing.interior),
            listing.amenities,
            _to_timestamp(listing.available_from),
            summary_hash,
            now,
            now,
            now,
            now,
            now,
        )
        return str(row["id"])

    async def update_master_summary(
        self,
        master_id: str,
        *,
        listing: Any,
        summary_hash: str,
        status: ListingAvailability,
        now: datetime,
        postcode_house_key: str | None = None,
        street_house_key: str | None = None,
    ) -> None:
        """Refresh mutable summary fields and fill gaps in address/property facts."""
        await self.pool.execute(
            """
            UPDATE aggregated_listings SET
                status = $2,
                title_nl = COALESCE(NULLIF($3, ''), title_nl),
                description_nl = COALESCE(NULLIF($4, ''), description_nl),
                asking_price_cents = COALESCE($5, asking_price_cents),
                monthly_rent_cents = COALESCE($6, monthly_rent_cents),
                service_costs_cents = COALESCE($7, service_costs_cents),
                postcode = COALESCE($8, postcode),
                city = COALESCE(NULLIF($9, ''), city),
                municipality = COALESCE(NULLIF($10, ''), municipality),
                province = COALESCE(NULLIF($11, ''), province),
                latitude = COALESCE($12, latitude),
                longitude = COALESCE($13, longitude),
                property_type = COALESCE($14, property_type),
                living_area_sqm = COALESCE($15, living_area_sqm),
                plot_area_sqm = COALESCE($16, plot_area_sqm),
                volume_cubic_meters = COALESCE($17, volume_cubic_meters),
                room_count = COALESCE($18, room_count),
                bedroom_count = COALESCE($19, bedroom_count),
                bathroom_count = COALESCE($20, bathroom_count),
                construction_year = COALESCE($21, construction_year),
                energy_label = COALESCE($22, energy_label),
                interior = CASE WHEN $23::jsonb = '{}'::jsonb THEN interior ELSE $23::jsonb END,
                amenities = CASE
                    WHEN $24::text[] = '{}'::text[] THEN amenities
                    ELSE $24::text[]
                END,
                available_from = COALESCE($25, available_from),
                summary_hash = $26,
                last_seen_at = $27,
                last_sync_at = $27,
                expired_at = NULL,
                postcode_house_key = COALESCE($28, postcode_house_key),
                street_house_key = COALESCE($29, street_house_key),
                house_number = CASE WHEN $30 > 0 THEN $30 ELSE house_number END,
                house_number_addition = COALESCE(NULLIF($31, ''), house_number_addition),
                street = COALESCE(NULLIF($32, ''), street)
            WHERE id = $1
            """,
            master_id,
            status.value,
            listing.title or "",
            listing.description or "",
            listing.asking_price_cents,
            listing.monthly_rent_cents,
            listing.service_costs_cents,
            listing.postcode,
            listing.city or "",
            listing.municipality or "",
            listing.province or "",
            _decimal(listing.latitude),
            _decimal(listing.longitude),
            listing.property_type.value,
            _decimal(listing.living_area_sqm),
            _decimal(listing.plot_area_sqm),
            _decimal(listing.volume_cubic_meters),
            listing.room_count,
            listing.bedroom_count,
            listing.bathroom_count,
            listing.construction_year,
            listing.energy_label.value if listing.energy_label else None,
            _json(listing.interior),
            listing.amenities,
            _to_timestamp(listing.available_from),
            summary_hash,
            now,
            postcode_house_key,
            street_house_key,
            listing.house_number,
            listing.house_number_addition,
            listing.street,
        )

    async def count_images(self, master_id: str) -> int:
        row = await self.pool.fetchrow(
            "SELECT COUNT(*)::int AS count FROM aggregated_listing_images WHERE listing_id = $1",
            master_id,
        )
        return int(row["count"]) if row else 0

    async def image_source_urls(self, master_id: str) -> set[str]:
        rows = await self.pool.fetch(
            "SELECT source_url FROM aggregated_listing_images WHERE listing_id = $1", master_id
        )
        return {row["source_url"] for row in rows}

    async def touch_master(
        self, master_id: str, status: ListingAvailability, now: datetime
    ) -> None:
        """Refresh liveness timestamps without touching scraped facts (skip-detail path)."""
        await self.pool.execute(
            "UPDATE aggregated_listings SET status = $2, last_seen_at = $3, last_sync_at = $3, "
            "expired_at = NULL WHERE id = $1",
            master_id,
            status.value,
            now,
        )

    async def upsert_platform_link(
        self,
        *,
        master_id: str,
        source: ListingSource,
        external_id: str,
        url: str,
        status: ListingAvailability,
        summary_hash: str,
        now: datetime,
    ) -> None:
        await self.pool.execute(
            """
            INSERT INTO aggregated_platform_links (
                id, listing_id, source, external_id, url, status, summary_hash,
                first_seen_at, last_seen_at, created_at, updated_at
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $7, $8, $9)
            ON CONFLICT (source, external_id) DO UPDATE SET
                listing_id = EXCLUDED.listing_id,
                url = EXCLUDED.url,
                status = EXCLUDED.status,
                summary_hash = EXCLUDED.summary_hash,
                last_seen_at = EXCLUDED.last_seen_at,
                updated_at = EXCLUDED.updated_at
            """,
            master_id,
            source.value,
            external_id,
            url,
            status.value,
            summary_hash,
            now,
            now,
            now,
        )

    async def upsert_image(
        self,
        *,
        master_id: str,
        storage_key: str,
        source_url: str,
        mime_type: str,
        sha256: str,
        width: int | None,
        height: int | None,
        sort_order: int,
    ) -> None:
        await self.pool.execute(
            """
            INSERT INTO aggregated_listing_images (
                id, listing_id, storage_key, source_url, mime_type, sha256,
                width, height, sort_order
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (storage_key) DO NOTHING
            """,
            master_id,
            storage_key,
            source_url,
            mime_type,
            sha256,
            width,
            height,
            sort_order,
        )

    async def store_raw_payload(
        self,
        *,
        source: ListingSource,
        external_id: str,
        kind: str,
        url: str,
        http_status: int | None,
        content_type: str | None,
        content_hash: str,
        body: str,
        size_bytes: int | None,
        listing_id: str | None,
    ) -> None:
        await self.pool.execute(
            """
            INSERT INTO raw_payloads (
                id, source, external_id, kind, url, http_status, content_type,
                content_hash, body, bytes, listing_id, retrieved_at
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            source.value,
            external_id,
            kind,
            url,
            http_status,
            content_type,
            content_hash,
            body,
            size_bytes,
            listing_id,
            utcnow(),
        )

    # --- Expiry -------------------------------------------------------------

    async def mark_links_offline_for_source(
        self, source: ListingSource, seen_external_ids: set[str]
    ) -> list[str]:
        """Mark links of ``source`` not seen this run as OFFLINE (never delete)."""
        if not seen_external_ids:
            rows = await self.pool.fetch(
                "SELECT listing_id, external_id FROM aggregated_platform_links WHERE source = $1",
                source.value,
            )
        else:
            rows = await self.pool.fetch(
                "SELECT listing_id, external_id FROM aggregated_platform_links "
                "WHERE source = $1 AND external_id <> ALL($2::text[])",
                source.value,
                list(seen_external_ids),
            )
        if not rows:
            return []
        await self.pool.execute(
            "UPDATE aggregated_platform_links SET status = $2, last_seen_at = $3 "
            "WHERE source = $1 AND external_id = ANY($4::text[])",
            source.value,
            ListingAvailability.OFFLINE.value,
            utcnow(),
            [row["external_id"] for row in rows],
        )
        return [str(row["listing_id"]) for row in rows]

    async def mark_master_offline_if_all_links_offline(self, master_id: str) -> None:
        await self.pool.execute(
            """
            UPDATE aggregated_listings
            SET status = 'OFFLINE', expired_at = COALESCE(expired_at, now())
            WHERE id = $1 AND NOT EXISTS (
                SELECT 1 FROM aggregated_platform_links
                WHERE listing_id = $1 AND status = 'ACTIVE'
            )
            """,
            master_id,
        )


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return None
