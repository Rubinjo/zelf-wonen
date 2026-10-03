import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NeighborhoodDataClient } from "../src/lib/integrations/neighborhood-data-client";

test("shared neighborhood lookup uses GET with Overpass fallback and stores transport distances", async () => {
    const overpassRequests: URL[] = [];
    const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.hostname.startsWith("overpass")) {
            assert.equal(init?.method ?? "GET", "GET");
            assert.match(url.searchParams.get("data") ?? "", /highway=bus_stop/);
            overpassRequests.push(url);
            if (overpassRequests.length === 1) return new Response("Unavailable", { status: 406 });
            return Response.json({ elements: [
                { type: "node", id: 1, lat: 52, lon: 4, tags: { highway: "bus_stop" } },
                { type: "way", id: 2, center: { lat: 52.01, lon: 4 }, tags: { railway: "station" } },
                { type: "node", id: 3, lat: 52.001, lon: 4, tags: { shop: "supermarket" } },
            ] });
        }
        if (url.pathname.endsWith("/Tables")) {
            return Response.json({ value: [{ Identifier: "test-neighborhood", Period: "2025" }] });
        }
        if (url.pathname.endsWith("/test-neighborhood/DataProperties")) {
            return Response.json({ value: [
                { Key: "population", Title: "Aantal inwoners" },
                { Key: "density", Title: "Bevolkingsdichtheid" },
                { Key: "corporation", Title: "In bezit woningcorporatie" },
                { Key: "children", Title: "0 tot 15 jaar" },
            ] });
        }
        if (url.pathname.endsWith("/test-neighborhood/TypedDataSet")) {
            return Response.json({ value: [{
                WijkenEnBuurten: "BU00000001", population: 100, density: 1000,
                corporation: 10, children: 20,
            }] });
        }
        return Response.json({ value: [], features: [] });
    });
    try {
        const profile = await new NeighborhoodDataClient().lookup({
            neighborhoodCode: "BU00000001", neighborhoodName: "Test",
            districtCode: null, districtName: null, municipalityCode: "GM0000",
            latitude: 52, longitude: 4,
        });
        assert.equal(overpassRequests.length, 2);
        assert.equal(profile?.busStopDistanceMeters, 0);
        assert.equal(profile?.trainStationDistanceMeters, 1112);
        assert.equal(profile?.supermarketsWithin1Km, 1);
        assert.equal(profile?.age0To14Percent, 20);
        assert.ok(profile?.osmRetrievedAt);
    } finally {
        fetchMock.mock.restore();
    }
});
