import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { db } from "../src/lib/db";
import { parseMarketplaceFilters, searchMarketplaceListings, type MarketplaceListing } from "../src/features/listings/marketplace-service";
import { aggregatedMarketplaceWhere, compareMarketplaceListings } from "../src/features/listings/aggregated-marketplace";
import type { Prisma } from "../src/generated/prisma/client";

const restores: Array<() => void> = [];
afterEach(() => { restores.splice(0).reverse().forEach((restore) => restore()); mock.restoreAll(); });

// Prisma delegates expose their methods through a proxy rather than descriptors.
function stub<F extends (...args: never[]) => unknown>(target: object, key: string, implementation: F) {
    const original = Reflect.get(target, key);
    const fn = mock.fn(implementation);
    Reflect.set(target, key, fn);
    restores.push(() => { Reflect.set(target, key, original); });
    return fn;
}

test("sale and rent default to available and under offer; completed statuses are opt-in", () => {
    for (const purpose of ["SALE", "RENT"]) {
        assert.deepEqual(parseMarketplaceFilters({ purpose }).statuses, ["LIVE", "UNDER_OFFER"]);
        const completed = purpose === "SALE" ? "SOLD" : "RENTED";
        assert.deepEqual(parseMarketplaceFilters({ purpose, status: ["LIVE", completed] }).statuses, ["LIVE", completed]);
        const wrongPurpose = purpose === "SALE" ? "RENTED" : "SOLD";
        assert.deepEqual(parseMarketplaceFilters({ purpose, status: wrongPurpose }).statuses, ["LIVE", "UNDER_OFFER"]);
    }
});

test("imports respect search filters and never label expired listings as completed transactions", () => {
    const filters = parseMarketplaceFilters({ purpose: "RENT", city: "Amsterdam", q: "centrum", keyword: "balkon", energyLabel: "A", amenity: "HEAT_PUMP", livingAreaMin: "40" });
    const where = aggregatedMarketplaceWhere(filters, { lte: BigInt(150000) }, { livingAreaSqm: { gte: 40 } });
    assert.equal(where.status, "ACTIVE");
    assert.equal(where.purpose, "RENT");
    assert.deepEqual(where.monthlyRentCents, { lte: BigInt(150000) });
    assert.deepEqual(where.livingAreaSqm, { gte: 40 });
    assert.deepEqual(where.city, { equals: "Amsterdam", mode: "insensitive" });
    assert.deepEqual(where.energyLabel, { in: ["A"] });
    assert.deepEqual(where.amenities, { hasEvery: ["HEAT_PUMP"] });
    assert.equal((where.AND as unknown[]).length, 2);
    for (const status of ["UNDER_OFFER", "RENTED"]) {
        assert.deepEqual(aggregatedMarketplaceWhere(parseMarketplaceFilters({ purpose: "RENT", status }), {}, {}).id, { in: [] });
    }
    const neighborhoodProfile = { is: { noiseRoadLden: { lte: 40 } } };
    const enriched = aggregatedMarketplaceWhere(filters, {}, { neighborhoodProfile });
    assert.equal(enriched.id, undefined);
    assert.deepEqual(enriched.neighborhoodProfile, neighborhoodProfile);
});

test("combined results paginate after sorting and use hosted import photos", async () => {
    const ownerRows = Array.from({ length: 20 }, (_, i) => ({
        id: `owner-${i}`, publicSlug: `owner-${i}`, purpose: "RENT", status: "UNDER_OFFER",
        titleNl: "Owner home", askingPriceCents: null, monthlyRentCents: BigInt(100000 + i * 2000),
        liveAt: new Date(), property: { street: "Street", houseNumber: i, city: "Amsterdam", postcode: "1000AA", energyLabels: [] },
        transactions: [], media: [],
    }));
    const importedRows = Array.from({ length: 20 }, (_, i) => ({
        id: `import-${i}`, publicSlug: `import-${i}`, purpose: "RENT", status: "ACTIVE",
        street: "Imported street", houseNumber: i, city: "Amsterdam", postcode: null,
        monthlyRentCents: BigInt(101000 + i * 2000), firstSeenAt: new Date(),
        latitude: null, longitude: null, livingAreaSqm: null, plotAreaSqm: null,
        images: [{ storageKey: "photo.jpg" }], platformLinks: [{ source: "KAMERNET" }],
    }));
    stub(db.listing, "count", async () => 20);
    stub(db.aggregatedListing, "count", async () => 20);
    const owners = stub(db.listing, "findMany", async (args: Prisma.ListingFindManyArgs) => ownerRows.slice(0, args.take ?? 20));
    const imports = stub(db.aggregatedListing, "findMany", async (args: Prisma.AggregatedListingFindManyArgs) => importedRows.slice(0, args.take ?? 20));
    const result = await searchMarketplaceListings({ purpose: "RENT", sort: "price_asc", page: "2" });
    assert.equal(result.pagination.total, 40);
    assert.equal(result.pagination.pageCount, 3);
    assert.equal(result.data.length, 18);
    assert.deepEqual(result.data.slice(0, 2).map((row) => row.id), ["owner-9", "import-9"]);
    assert.equal(result.data[1].imageUrl, `${(process.env.AGGREGATED_MEDIA_BASE_URL ?? "/aggregated-media").replace(/\/+$/, "")}/photo.jpg`);
    assert.equal(result.data[1].externalSource, "Kamernet");
    assert.equal(result.data[1].bidWindowClosesAt, null);
    assert.equal(owners.mock.calls[0].arguments[0].take, 36);
    assert.equal(imports.mock.calls[0].arguments[0].take, 36);
});

test("combined sorting keeps nulls last and handles bigint prices without rounding", () => {
    const rows = [
        { id: "b", priceCents: "9007199254740993", livingAreaSqm: 20, liveAt: "2026-10-02" },
        { id: "a", priceCents: "9007199254740992", livingAreaSqm: 30, liveAt: "2026-10-01" },
        { id: "c", priceCents: null, livingAreaSqm: null, liveAt: null },
    ] as MarketplaceListing[];
    for (const [sort, ids] of [
        ["price_asc", ["a", "b", "c"]], ["price_desc", ["b", "a", "c"]],
        ["area_desc", ["a", "b", "c"]], ["newest", ["b", "a", "c"]],
    ] as const) {
        assert.deepEqual([...rows].sort((a, b) => compareMarketplaceListings(a, b, sort)).map((row) => row.id), ids);
    }
});
