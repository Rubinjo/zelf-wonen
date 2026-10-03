"""Runtime configuration for the aggregator.

Everything is overridable through ``AGGREGATOR_``-prefixed environment variables
(see :class:`Settings`). Secrets (object-storage keys, proxy credentials) must
come from a managed secret store in production; never commit them to the repo.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGGREGATOR_", env_file=".env", extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"

    # --- Database -----------------------------------------------------------
    database_url: str = "postgresql://zelfwonen:zelfwonen_dev_password@localhost:5432/zelfwonen"
    neighborhood_enrichment_url: str = "http://localhost:3000/api/internal/aggregator/neighborhood"
    neighborhood_enrichment_token: str = "zelfwonen-local-aggregator"

    # --- Scheduling / locking ----------------------------------------------
    # Cron interval. The advisory lock guarantees a scrape that runs longer than
    # this interval never overlaps with the next run.
    sync_interval_seconds: int = Field(default=6 * 60 * 60, ge=60)
    # Stable Postgres advisory lock key (single bigint) shared by all replicas.
    advisory_lock_key: int = 7_241_001
    status_file: str = ".state/status.json"
    # Enable only after verifying that discovery covers the entire source.
    expire_missing: bool = False

    # --- Scraping resilience ------------------------------------------------
    # Legacy list settings accept multiple values but only the first is used.
    # Identity remains stable across retries and scheduled runs.
    proxy_urls: str = ""
    user_agents: str = "zelfwonen-aggregator/0.1"
    # Legacy setting name: true checks and warns; false skips advisory checks.
    respect_robots: bool = True
    request_timeout_seconds: float = Field(default=30.0, gt=0)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_backoff_base_seconds: float = Field(default=2.0, ge=0)
    retry_backoff_max_seconds: float = Field(default=60.0, ge=0)
    # A single session and low request rate reduce load; never rotate after a block.
    polite_delay_seconds: float = Field(default=5.0, ge=0)
    source_timeout_seconds: float = Field(default=14400, gt=0)
    source_cooldown_seconds: int = Field(default=21600, ge=60)
    max_source_cooldown_seconds: int = Field(default=604800, ge=60)
    max_pages_per_search: int = Field(default=1000, ge=1)
    discovery_page_batch_size: int = Field(default=20, ge=1)
    detail_batch_size: int = Field(default=500, ge=1)
    # Hard cap per run per source (safety valve for development).
    max_listings_per_source: int = Field(default=100_000, ge=1)

    # --- Sources ------------------------------------------------------------
    enabled_sources: str = "FUNDA,KAMERNET"
    funda_base_url: str = "https://www.funda.nl"
    # Chrome-compatible TLS/HTTP and headers avoid the observed httpx challenge.
    funda_transport: Literal["chrome", "http"] = "chrome"
    # Optional legacy discovery contracts; empty selects public search HTML.
    funda_sitemap_url: str = ""
    funda_search_urls: str = (
        "https://www.funda.nl/zoeken/koop?selected_area=%5B%22nl%22%5D|"
        "https://www.funda.nl/zoeken/huur?selected_area=%5B%22nl%22%5D"
    )
    kamernet_base_url: str = "https://kamernet.nl"
    kamernet_search_url: str = ""
    kamernet_search_urls: str = (
        "https://kamernet.nl/huren/kamer-nederland|"
        "https://kamernet.nl/huren/appartement-nederland|"
        "https://kamernet.nl/huren/studio-nederland"
    )

    # --- Image hosting ------------------------------------------------------
    # "s3" uploads to S3-compatible object storage (AWS S3 / Cloudflare R2);
    # "local" writes to disk (a persistent shared volume on the single-VM deployment).
    image_storage_mode: Literal["local", "s3"] = "local"
    # Default writes into the web app's public folder so Next.js serves the
    # re-hosted images at /aggregated-media/* in local development.
    local_media_dir: str = "../web/public/aggregated-media"
    object_storage_endpoint_url: str | None = None
    object_storage_region: str = "auto"
    object_storage_bucket: str = "zelfwonen-listings"
    object_storage_access_key_id: str | None = None
    object_storage_secret_access_key: str | None = None
    max_images_per_listing: int = Field(default=50, ge=0)

    @property
    def proxy_list(self) -> list[str]:
        return [item.strip() for item in self.proxy_urls.split(",") if item.strip()]

    @property
    def user_agent_list(self) -> list[str]:
        return [item for item in self.user_agents.split("|") if item.strip()]

    @property
    def source_names(self) -> list[str]:
        return [item.strip().upper() for item in self.enabled_sources.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
