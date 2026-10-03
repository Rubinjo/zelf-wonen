import json
from datetime import UTC, datetime

from app.status import record_status, source_retry_at


def test_failure_preserves_last_success(tmp_path):
    path = str(tmp_path / "status.json")
    counts = {"seen": 2, "processed": 2, "failed": 0}
    record_status(path, "FUNDA", counts=counts, error=None)
    success = json.loads((tmp_path / "status.json").read_text())["FUNDA"]["last_success"]
    record_status(path, "FUNDA", counts={**counts, "failed": 1}, error="failed")
    result = json.loads((tmp_path / "status.json").read_text())["FUNDA"]
    assert result["last_success"] == success
    assert result["failed"] == 1
    assert result["error"] == "failed"


def test_partial_does_not_claim_success_and_retry_after_survives_restart(tmp_path):
    path = str(tmp_path / "status.json")
    counts = {"seen": 100, "processed": 5, "failed": 0, "pending": 95}
    record_status(path, "FUNDA", counts=counts, error=None, completed=False)
    assert json.loads((tmp_path / "status.json").read_text())["FUNDA"]["last_success"] is None
    record_status(
        path, "FUNDA", counts=counts, error="rate limit", retry_after=90000, cooldown_seconds=60
    )
    assert (source_retry_at(path, "FUNDA") - datetime.now(UTC)).total_seconds() > 89990
