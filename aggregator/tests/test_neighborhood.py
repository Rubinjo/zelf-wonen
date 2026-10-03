import httpx
import pytest

from app.config import Settings
from app.neighborhood import enrich_neighborhood


@pytest.mark.parametrize("status", [200, 503, 401])
async def test_enrichment_uses_saved_listing_and_does_not_fail_imports(status, caplog):
    def handle(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer test-token"
        assert request.content == b'{"listingId":"saved-master"}'
        return httpx.Response(status, json={"status": "enriched"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        await enrich_neighborhood(
            client, Settings(neighborhood_enrichment_token="test-token"), "saved-master"
        )
    assert ("next sync will retry" in caplog.text) == (status != 200)
    assert "test-token" not in caplog.text
