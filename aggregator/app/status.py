"""Persist source results separately from public listing media."""

import json
from datetime import UTC, datetime
from pathlib import Path


def record_status(path: str, source: str, *, counts: dict[str, int], error: str | None) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(target.read_text()) if target.exists() else {}
    now = datetime.now(UTC).isoformat()
    previous = data.get(source, {})
    data[source] = {
        "last_attempt": now,
        "last_success": previous.get("last_success") if error else now,
        **counts,
        "error": error,
    }
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.replace(target)
