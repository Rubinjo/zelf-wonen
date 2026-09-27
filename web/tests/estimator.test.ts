import assert from "node:assert/strict";
import { test } from "node:test";
import { PdokClient } from "../src/lib/integrations/property-data/pdok-client";
import { estimateRequestSchema, pythonEstimateResponseSchema } from "../src/lib/schemas/estimator";

test("PDOK checks apartment additions and returns official geography", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.deepEqual(url.searchParams.getAll("fq"), ["type:adres", "postcode:1012JS", "huisnummer:1"]);
        return Response.json({ response: { docs: [
            { postcode: "1012JS", huisnummer: 1, gemeentecode: "0363" },
            { postcode: "1012JS", huisnummer: 1, huisletter: "A", huisnummertoevoeging: "2",
                gemeentecode: "0363", provinciecode: "PV27", centroide_ll: "POINT(4.89 52.37)" },
        ] } });
    };
    try {
        const found = await new PdokClient().lookupAddress({ postcode: "1012JS", houseNumber: 1, addition: "A-2" });
        assert.equal(found?.municipalityCode, "GM0363");
        assert.equal(found?.provinceCode, "PV27");
        assert.equal(found?.address.addition, "A-2");
        assert.deepEqual(found?.coordinates, { longitude: 4.89, latitude: 52.37 });
        assert.equal(await new PdokClient().lookupAddress({ postcode: "1012JS", houseNumber: 1, addition: "B" }), null);
    } finally {
        globalThis.fetch = original;
    }
});

test("public requests cannot inject estimator geography", () => {
    const parsed = estimateRequestSchema.parse({ postcode: "1012JS", houseNumber: 1,
        propertyType: "HOUSE", livingAreaSqm: 100, roomCount: 4,
        municipalityCode: "GM9999", provinceCode: "PV31", latitude: 51, longitude: 5 });
    assert.equal("municipalityCode" in parsed, false);
    assert.equal("provinceCode" in parsed, false);
    assert.equal("latitude" in parsed, false);
});

test("statistical responses accept zero comparables and preserve evidence", () => {
    const parsed = pythonEstimateResponseSchema.parse({ estimatedValueCents: 40000000,
        lowerBoundCents: 22000000, upperBoundCents: 58000000, confidence: 0.2,
        modelVersion: "test", comparableCount: 0, valuationMonth: "2026-07",
        conditionAdjustmentPercent: 0, method: "MUNICIPAL_WOZ", calibrated: false,
        warnings: ["Indicative only"], sourceUrl: "https://www.cbs.nl/", referenceMonth: "2024-01",
        askingBenchmarkCents: null, askingSourceUrl: null });
    assert.equal(parsed.comparableCount, 0);
    assert.equal(parsed.calibrated, false);
});
