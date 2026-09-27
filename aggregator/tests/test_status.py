import json

from app.status import record_status


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
