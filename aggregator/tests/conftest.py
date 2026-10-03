import pytest


@pytest.fixture(autouse=True)
def offline_http_defaults(monkeypatch):
    # Unit transports do not serve robots.txt. Policy tests opt in explicitly.
    monkeypatch.setenv("AGGREGATOR_RESPECT_ROBOTS", "false")
    monkeypatch.setenv("AGGREGATOR_POLITE_DELAY_SECONDS", "0")
