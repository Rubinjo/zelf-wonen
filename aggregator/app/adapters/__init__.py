"""Source adapter contract and registry.

New sources are added by implementing :class:`SourceAdapter` and registering it
in :meth:`AdapterRegistry.default`. The sync orchestrator only knows about this
interface, so Funda/Kamernet specifics never leak into the pipeline.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from ..config import Settings
from ..http_client import ScraperClient
from ..models import ListingSource, NormalizedListing


@dataclass
class DetailPayload:
    """Raw detail-page response: kept verbatim for the ``raw_payloads`` table."""

    url: str
    content_type: str | None
    body: str


class ListingGone(RuntimeError):
    """The source no longer serves this listing (404/410). Never delete — mark offline."""


class SourceAdapter(ABC):
    """A pluggable listing source.

    ``discover`` yields cheap summary items (from a sitemap or search endpoint);
    ``fetch_detail`` returns the full raw payload for one item; ``normalize``
    converts either a summary or a detail payload into the strict internal
    :class:`NormalizedListing`.
    """

    source: ListingSource
    display_name: str
    # Brand color used by the web UI for the "view original listing" buttons.
    brand_hex: str = "#000000"

    @abstractmethod
    def discover(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        """Yield summary dicts, each with at least ``external_id`` and ``url``."""

    @abstractmethod
    async def fetch_detail(self, client: ScraperClient, summary: dict[str, Any]) -> DetailPayload:
        """Fetch the full detail page for a summary item."""

    @abstractmethod
    def parse_detail(self, summary: dict[str, Any], payload: DetailPayload) -> dict[str, Any]:
        """Extract chaotic fields from the raw detail payload."""

    @abstractmethod
    def normalize(self, merged: dict[str, Any]) -> NormalizedListing:
        """Map merged summary + detail fields onto the strict internal schema."""


class AdapterRegistry:
    def __init__(self) -> None:
        self._adapters: dict[ListingSource, SourceAdapter] = {}

    def register(self, adapter: SourceAdapter) -> None:
        self._adapters[adapter.source] = adapter

    def get(self, source: ListingSource) -> SourceAdapter:
        return self._adapters[source]

    def enabled(self, names: list[str]) -> list[SourceAdapter]:
        wanted = {name.upper() for name in names}
        return [adapter for adapter in self._adapters.values() if adapter.source.value in wanted]

    @classmethod
    def default(cls, settings: Settings | None = None) -> AdapterRegistry:
        from .funda import FundaAdapter
        from .kamernet import KamernetAdapter

        registry = cls()
        registry.register(FundaAdapter(settings))
        registry.register(KamernetAdapter(settings))
        return registry
