"""Reuse the web app's PDOK/CBS/OSM/RIVM/KCAF enrichment for imported listings."""

import logging

import httpx

from .config import Settings

logger = logging.getLogger(__name__)


async def enrich_neighborhood(
    client: httpx.AsyncClient, settings: Settings, master_id: str
) -> None:
    if not settings.neighborhood_enrichment_url:
        return
    try:
        response = await client.post(
            settings.neighborhood_enrichment_url,
            headers={"Authorization": f"Bearer {settings.neighborhood_enrichment_token}"},
            json={"listingId": master_id},
            timeout=90,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        # Imported facts/images remain usable when a public data source is down.
        # The next detail refresh retries profiles that are still missing/stale.
        logger.warning("neighborhood enrichment failed for %s; next sync will retry", master_id)
