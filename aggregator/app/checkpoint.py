"""Atomic work queues beside the status file, protected by the Postgres sync lock.

Only acknowledged items leave the queue. A crash may replay the current batch;
source-ID upserts make that safe. Search-page cursors distinguish partial crawls
from complete discovery; a partial crawl must never trigger absence-based expiry.
"""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from .config import Settings
from .http_client import ScrapeError


class Snapshot(BaseModel):
    version: int = 1
    configuration: str
    created_at: str
    seen_ids: list[str]
    pending: list[dict[str, Any]] = Field(default_factory=list)
    discovery_cursor: dict[str, int] = Field(default_factory=dict)
    discovery_complete: bool = False
    detail_attempts: dict[str, int] = Field(default_factory=dict)
    rejected_ids: list[str] = Field(default_factory=list)


class Checkpoint:
    def __init__(self, settings: Settings, source: str) -> None:
        self.path = Path(settings.status_file).parent / f"{source.lower()}.queue.json"
        prefix = source.lower() + "_"
        configuration = {
            key: value for key, value in settings.model_dump().items() if key.startswith(prefix)
        }
        self.configuration = hashlib.sha256(
            json.dumps(configuration, sort_keys=True).encode()
        ).hexdigest()

    def load(self) -> Snapshot | None:
        if not self.path.exists():
            return None
        try:
            snapshot = Snapshot.model_validate_json(self.path.read_text(encoding="utf-8"))
        except ValidationError as exc:
            # Do not silently lose pending work or turn corruption into expiry.
            raise ScrapeError(f"invalid checkpoint: {self.path}") from exc
        if snapshot.version != 1 or snapshot.configuration != self.configuration:
            return None
        if any(not item.get("external_id") or not item.get("url") for item in snapshot.pending):
            raise ScrapeError(f"invalid checkpoint entries: {self.path}")
        return snapshot

    def create(self, summaries: list[dict[str, Any]]) -> Snapshot:
        return Snapshot(
            configuration=self.configuration,
            created_at=datetime.now(UTC).isoformat(),
            seen_ids=[str(item["external_id"]) for item in summaries],
            pending=summaries,
        )

    def save(self, snapshot: Snapshot) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(snapshot.model_dump_json(), encoding="utf-8")
        temporary.replace(self.path)

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)
