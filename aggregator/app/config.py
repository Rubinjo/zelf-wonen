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

DEFAULT_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGGREGATOR_", env_file=".env", extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"

    # --- Database -----------------------------------------------------------
    database_url: str = "postgresql://houser:houser_dev_password@localhost:5432/houser"

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
    # Comma-separated list of residential proxy URLs, e.g.
    # "http://user:pass@host:8000,http://user:pass@host2:8000".
    proxy_urls: str = ""
    user_agents: str = "|".join(DEFAULT_USER_AGENTS)
    request_timeout_seconds: float = 30.0
    max_retries: int = 4
    retry_backoff_base_seconds: float = 2.0
    retry_backoff_max_seconds: float = 60.0
    # Pause between individual outbound requests to look like a human.
    polite_delay_seconds: float = 0.5
    # Hard cap per run per source (safety valve for development).
    max_listings_per_source: int = Field(default=10_000, ge=1)

    # --- Sources ------------------------------------------------------------
    enabled_sources: str = "FUNDA,KAMERNET"
    funda_base_url: str = "https://www.funda.nl"
    funda_sitemap_url: str = "https://www.funda.nl/sitemap/v1/huizen.xml"
    kamernet_base_url: str = "https://kamernet.nl"
    kamernet_search_url: str = "https://kamernet.nl/api/listing/search"

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
    max_images_per_listing: int = 40

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
