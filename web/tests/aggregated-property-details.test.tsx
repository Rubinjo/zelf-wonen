import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregatedAddress, mapAggregatedPropertyDetails } from "../src/features/listings/aggregated-property-details";
import { AggregatedPropertyDetails, type AggregatedListingView } from "../src/components/listing/aggregated-listing-detail";

const facts = {
    "aantal woonlagen": "1 woonlaag",
    "externe bergruimte": "8 m²",
    "soort dak": "Plat dak",
    "eigendomssituatie": "Volle eigendom",
    "voorzieningen": "Mechanische ventilatie en natuurlijke ventilatie",
    "soort parkeergelegenheid": "Betaald parkeren, openbaar parkeren en parkeervergunningen",
    "bijdrage vve": "€ 387,00 per maand",
    "tuin": "Zonneterras",
    "ligging tuin": "Gelegen op het zuidwesten",
    "aangeboden sinds": "Vandaag",
    "opstalverzekering": "Ja",
    "reservefonds aanwezig": "Ja",
    "badkamervoorzieningen": "Douche en ligbad",
};
const listing: AggregatedListingView = {
    titleNl: "Apartment", descriptionNl: null, purpose: "SALE", status: "ACTIVE",
    askingPriceCents: "44900000", monthlyRentCents: null, serviceCostsCents: null,
    postcode: "2334EJ", houseNumber: 179, houseNumberAddition: null,
    street: "Boerhaavelaan 179", city: "Leiden", municipality: "Leiden", province: "Zuid-Holland",
    latitude: 52.17, longitude: 4.48, propertyType: "APARTMENT", livingAreaSqm: 108,
    plotAreaSqm: null, volumeCubicMeters: 359, roomCount: 5, bedroomCount: 3,
    bathroomCount: 1, constructionYear: 1973, energyLabel: "F", availableFrom: null,
    amenities: ["Mechanische ventilatie", "natuurlijke ventilatie"], interior: facts,
    images: [], platformLinks: [{ id: "source", source: "FUNDA", url: "https://www.funda.nl/example", status: "ACTIVE" }],
};

test("Funda facts map only to supported native property fields", () => {
    const details = mapAggregatedPropertyDetails(facts, listing.amenities);
    assert.equal(details.floorCount, 1);
    assert.equal(details.externalStorageAreaSqm, 8);
    assert.equal(details.roofType, "FLAT");
    assert.equal(details.erfpachtType, "FREEHOLD");
    assert.equal(details.serviceCostsCents, 38700);
    assert.equal(details.garden, null);
    assert.deepEqual(details.amenities, ["MECHANICAL_VENTILATION"]);
    assert.deepEqual(details.parkingOptions, ["PAID_STREET", "PARKING_PERMIT"]);
});

test("Funda details use native categories and discard unmapped rows and amenities", () => {
    const html = renderToStaticMarkup(createElement(AggregatedPropertyDetails, { listing, language: "nl" }));
    for (const text of ["Algemeen", "Oppervlakten en inhoud", "Indeling", "Voorzieningen", "Parkeren",
        "359 m³", "8 m²", "Plat dak", "Volle eigendom", "Mechanische ventilatie", "Parkeervergunning",
    ]) assert.ok(html.includes(text), text);
    for (const text of ["aangeboden sinds", "opstalverzekering", "reservefonds", "badkamervoorzieningen",
        "Zonneterras", "natuurlijke ventilatie",
    ]) assert.ok(!html.includes(text), text);
    assert.ok(html.includes("Boerhaavelaan 179, 2334EJ Leiden"));
    assert.ok(!html.includes("179 179"));
});

test("garden direction and roof descriptions map to translated native options", () => {
    const interior = { ...facts, tuin: "Achtertuin", "ligging tuin": "Gelegen op het noordoosten",
        "soort dak": "Zadeldak bedekt met pannen" };
    const details = mapAggregatedPropertyDetails(interior, ["SOLAR_PANELS"]);
    assert.deepEqual(details.garden, { orientation: "NE" });
    assert.equal(details.roofType, "GABLE");
    assert.deepEqual(details.amenities, ["SOLAR_PANELS", "MECHANICAL_VENTILATION"]);
    const html = renderToStaticMarkup(createElement(AggregatedPropertyDetails, {
        listing: { ...listing, interior }, language: "en",
    }));
    assert.ok(html.includes("Areas and volume"));
    assert.ok(html.includes("Gable roof"));
    assert.ok(html.includes("Northeast"));
});

test("missing or unexpected facts do not invent features and suffixes are not repeated", () => {
    assert.deepEqual(mapAggregatedPropertyDetails(null, []).amenities, []);
    assert.equal(mapAggregatedPropertyDetails(["not a property"], []).roofType, null);
    assert.equal(aggregatedAddress({ ...listing, street: "Street 42A", houseNumber: 42, houseNumberAddition: "A" }),
        "Street 42A, 2334EJ Leiden");
});
