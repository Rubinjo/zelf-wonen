import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { enrichAggregatedNeighborhood, loadAggregatedNeighborhood } from "../src/features/listings/enrich-aggregated-neighborhood";
import { db } from "../src/lib/db";
import { NeighborhoodDataClient, type NeighborhoodData, type NeighborhoodLookup } from "../src/lib/integrations/neighborhood-data-client";
import { PdokClient } from "../src/lib/integrations/property-data/pdok-client";
import { POST } from "../src/app/api/internal/aggregator/neighborhood/route";

const restores: Array<() => void> = [];
afterEach(() => {
    restores.splice(0).reverse().forEach((restore) => restore());
    mock.restoreAll();
});

function stub(target: object, key: string, implementation: (...args: never[]) => unknown) {
    const original = Reflect.get(target, key);
    const fn = mock.fn(implementation);
    Reflect.set(target, key, fn);
    restores.push(() => Reflect.set(target, key, original));
    return fn;
}

const imported = {
    id: "8c718a80-5ced-4d89-b121-a165acdab366", postcode: "1012AB",
    houseNumber: 42, houseNumberAddition: "A", latitude: 50, longitude: 4,
    neighborhoodProfile: null,
};
const address = {
    neighborhoodCode: "BU03630001", neighborhoodName: "Centrum",
    districtCode: "WK036300", districtName: "Binnenstad", municipalityCode: "GM0363",
    coordinates: { latitude: 52.37, longitude: 4.89 },
    address: { municipality: "Amsterdam", province: "Noord-Holland" },
};

test("imports reuse native data sources and precise PDOK coordinates, then save their profile", async () => {
    stub(db.aggregatedListing, "findUnique", async () => imported);
    const lookup = mock.method(PdokClient.prototype, "lookupAddress", async () => address);
    let requested: NeighborhoodLookup | undefined;
    mock.method(NeighborhoodDataClient.prototype, "lookup", async (input: NeighborhoodLookup) => {
        requested = input;
        // Only fields relevant to persistence are needed by these mocked delegates.
        return { ...input, statisticsYear: 2025, population: 1200 } as unknown as NeighborhoodData;
    });
    const upsert = stub(db.neighborhoodProfile, "upsert", async () => ({}));
    const update = stub(db.aggregatedListing, "update", async () => ({}));
    stub(db, "$transaction", async (operations: Promise<unknown>[]) => Promise.all(operations));
    assert.equal(await enrichAggregatedNeighborhood(imported.id), "enriched");
    assert.deepEqual(lookup.mock.calls[0].arguments, [{ postcode: "1012AB", houseNumber: 42, addition: "A" }]);
    assert.equal(requested?.latitude, 52.37);
    assert.equal(requested?.longitude, 4.89);
    assert.deepEqual(Reflect.get(upsert.mock.calls[0].arguments[0], "where"), { aggregatedListingId: imported.id });
    const updated: object = Reflect.get(update.mock.calls[0].arguments[0], "data");
    assert.equal(Reflect.get(updated, "municipality"), "Amsterdam");
    assert.equal(Reflect.get(updated, "latitude"), 52.37);
});

test("fresh profiles skip external calls; failed lookup leaves old data available for retry", async () => {
    const lookup = mock.method(PdokClient.prototype, "lookupAddress", async () => { throw new Error("PDOK down"); });
    stub(db.aggregatedListing, "findUnique", async () => ({
        ...imported, neighborhoodProfile: { updatedAt: new Date() },
    }));
    const upsert = stub(db.neighborhoodProfile, "upsert", async () => ({}));
    assert.equal(await enrichAggregatedNeighborhood(imported.id), "cached");
    assert.equal(lookup.mock.callCount(), 0);
    await assert.rejects(enrichAggregatedNeighborhood(imported.id, true), /PDOK down/);
    assert.equal(upsert.mock.callCount(), 0);
});

test("opening an import without a profile enriches it and shares concurrent lookups", async () => {
    stub(db.aggregatedListing, "findUnique", async () => imported);
    const lookup = mock.method(PdokClient.prototype, "lookupAddress", async () => address);
    mock.method(NeighborhoodDataClient.prototype, "lookup", async (input: NeighborhoodLookup) => (
        { ...input, population: 1800, age0To14Percent: 20, busStopDistanceMeters: 150 } as unknown as NeighborhoodData
    ));
    stub(db.neighborhoodProfile, "upsert", async () => ({}));
    stub(db.aggregatedListing, "update", async () => ({}));
    stub(db, "$transaction", async (operations: Promise<unknown>[]) => Promise.all(operations));
    const profile = { neighborhoodName: "Centrum", population: 1800, age0To14Percent: 20, busStopDistanceMeters: 150 };
    stub(db.neighborhoodProfile, "findUnique", async () => profile);
    const first = loadAggregatedNeighborhood(imported.id);
    const second = loadAggregatedNeighborhood(imported.id);
    assert.equal(first, second);
    assert.deepEqual(await first, profile);
    assert.equal(lookup.mock.callCount(), 1);
});

test("transport source failures retry after an hour while complete profiles keep the longer cache", async () => {
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const incomplete = { ...imported, neighborhoodProfile: { updatedAt: staleTime, osmRetrievedAt: null } };
    const find = stub(db.aggregatedListing, "findUnique", async () => incomplete);
    const lookup = mock.method(PdokClient.prototype, "lookupAddress", async () => address);
    mock.method(NeighborhoodDataClient.prototype, "lookup", async () => null);
    assert.equal(await enrichAggregatedNeighborhood(imported.id), "unavailable");
    assert.equal(lookup.mock.callCount(), 1);
    find.mock.mockImplementation(async () => ({
        ...imported, neighborhoodProfile: { updatedAt: staleTime, osmRetrievedAt: staleTime },
    }));
    assert.equal(await enrichAggregatedNeighborhood(imported.id), "cached");
    assert.equal(lookup.mock.callCount(), 1);
});

test("hidden house numbers use postcode statistics without guessed coordinates", async () => {
    stub(db.aggregatedListing, "findUnique", async () => ({ ...imported, houseNumber: 0 }));
    const exact = mock.method(PdokClient.prototype, "lookupAddress", async () => null);
    const location: NeighborhoodLookup = {
        neighborhoodCode: address.neighborhoodCode, neighborhoodName: address.neighborhoodName,
        municipalityCode: address.municipalityCode, districtCode: address.districtCode,
        districtName: address.districtName, latitude: null, longitude: null,
    };
    mock.method(PdokClient.prototype, "lookupNeighborhoodByPostcode", async () => location);
    const lookup = mock.method(NeighborhoodDataClient.prototype, "lookup", async () => null);
    assert.equal(await enrichAggregatedNeighborhood(imported.id), "unavailable");
    assert.equal(exact.mock.callCount(), 0);
    assert.deepEqual(lookup.mock.calls[0].arguments, [location]);
});

test("postcode lookup rejects ambiguous or incomplete address sets", async () => {
    const first = { postcode: "1012AB", buurtcode: "BU03630001", buurtnaam: "Centrum", gemeentecode: "0363" };
    const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({
        response: { numFound: 1, docs: [first] },
    }));
    const pdok = new PdokClient();
    const location = await pdok.lookupNeighborhoodByPostcode("1012AB");
    assert.equal(location?.municipalityCode, "GM0363");
    assert.equal(location?.latitude, null);
    fetchMock.mock.mockImplementation(async () => Response.json({
        response: { numFound: 2, docs: [first, { ...first, buurtcode: "BU03630002" }] },
    }));
    assert.equal(await pdok.lookupNeighborhoodByPostcode("1012AB"), null);
    fetchMock.mock.mockImplementation(async () => Response.json({
        response: { numFound: 101, docs: [first] },
    }));
    assert.equal(await pdok.lookupNeighborhoodByPostcode("1012AB"), null);
});

test("internal endpoint rejects unauthenticated and malformed requests before database access", async () => {
    const before = process.env.AGGREGATOR_ENRICHMENT_TOKEN;
    process.env.AGGREGATOR_ENRICHMENT_TOKEN = "secret-token";
    restores.push(() => {
        if (before === undefined) delete process.env.AGGREGATOR_ENRICHMENT_TOKEN;
        else process.env.AGGREGATOR_ENRICHMENT_TOKEN = before;
    });
    const find = stub(db.aggregatedListing, "findUnique", async () => null);
    assert.equal((await POST(new Request("http://localhost/api", { method: "POST" }))).status, 401);
    assert.equal((await POST(new Request("http://localhost/api", {
        method: "POST", headers: { authorization: "Bearer secret-token" }, body: '{"listingId":"bad"}',
    }))).status, 400);
    assert.equal(find.mock.callCount(), 0);
    assert.equal((await POST(new Request("http://localhost/api", {
        method: "POST", headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({ listingId: imported.id }),
    }))).status, 404);
});
