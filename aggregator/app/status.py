"""Persist source results separately from public listing media."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path


def source_retry_at(path: str, source: str) -> datetime | None:
    target = Path(path)
    if not target.exists():
        return None
    value = json.loads(target.read_text(encoding="utf-8")).get(source, {}).get("next_retry_at")
    return datetime.fromisoformat(value) if value else None


def source_last_error(path: str, source: str) -> str | None:
    target = Path(path)
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8")).get(source, {}).get("error")


def clear_source_cooldown(path: str, source: str) -> None:
    """Clear only a validated source's cooldown, retaining history and other sources."""
    target = Path(path)
    if not target.exists():
        return
    data = json.loads(target.read_text(encoding="utf-8"))
    if source not in data:
        return
    data[source]["next_retry_at"] = None
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)


def record_status(
    path: str,
    source: str,
    *,
    counts: dict[str, int],
    error: str | None,
    completed: bool = True,
    cooldown_seconds: float = 0,
    max_cooldown_seconds: float = 604800,
    retry_after: float = 0,
) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    instant = datetime.now(UTC)
    now = instant.isoformat()
    previous = data.get(source, {})
    failures = previous.get("consecutive_failures", 0) + 1 if error else 0
    delay = max(
        retry_after,
        min(max_cooldown_seconds, cooldown_seconds * 2 ** min(max(0, failures - 1), 10)),
    )
    data[source] = {
        "last_attempt": now,
        "last_success": now if completed and not error else previous.get("last_success"),
        "last_progress": now if counts.get("processed") else previous.get("last_progress"),
        "outcome": "failed" if error else "complete" if completed else "partial",
        "consecutive_failures": failures,
        "next_retry_at": (instant + timedelta(seconds=delay)).isoformat() if error else None,
        **counts,
        "error": error,
    }
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)
