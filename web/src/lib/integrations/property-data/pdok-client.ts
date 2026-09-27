import type { AddressLookup } from "@/lib/schemas/property";

const PDOK_FREE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

type PdokDocument = {
    type?: string;
    nummeraanduiding_id?: string;
    adresseerbaarobject_id?: string;
    buurtcode?: string;
    buurtnaam?: string;
    wijkcode?: string;
    wijknaam?: string;
    gemeentecode?: string;
    postcode?: string;
    huisnummer?: number;
    huisnummertoevoeging?: string;
    huisletter?: string;
    straatnaam?: string;
    woonplaatsnaam?: string;
    gemeentenaam?: string;
    provincienaam?: string;
    provinciecode?: string;
    centroide_ll?: string;
    bouwjaar?: string;
    gekoppeld_perceel?: string[];
};

type PdokResponse = {
    response?: { docs?: PdokDocument[] };
};

function parsePoint(value?: string) {
    const match = value?.match(/^POINT\(([-\d.]+) ([-\d.]+)\)$/);
    if (!match) return null;
    return { longitude: Number(match[1]), latitude: Number(match[2]) };
}

export class PdokClient {
    async lookupAddress(input: AddressLookup) {
        const url = new URL(PDOK_FREE_URL);
        const addition = input.addition ? ` ${input.addition}` : "";
        url.searchParams.set(
            "q",
            `${input.postcode} ${input.houseNumber}${addition}`,
        );
        url.searchParams.set("fq", "type:adres");
        url.searchParams.append("fq", `postcode:${input.postcode}`);
        url.searchParams.append("fq", `huisnummer:${input.houseNumber}`);
        url.searchParams.set("rows", "100");

        const response = await fetch(url, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(5_000),
            next: { revalidate: 86_400 },
        });

        if (!response.ok) {
            throw new Error(
                `PDOK lookup failed with status ${response.status}`,
            );
        }

        const payload = (await response.json()) as PdokResponse;
        const document = payload.response?.docs?.find(
            (candidate) =>
                candidate.postcode?.replace(/\s/g, "") === input.postcode &&
                candidate.huisnummer === input.houseNumber &&
                [candidate.huisletter, candidate.huisnummertoevoeging].filter(Boolean).join("").toLowerCase() ===
                    (input.addition ?? "").replace(/[\s-]/g, "").toLowerCase(),
        );

        if (!document) return null;

        return {
            bagAddressId: document.nummeraanduiding_id ?? null,
            bagObjectId: document.adresseerbaarobject_id ?? null,
            neighborhoodCode: document.buurtcode ?? null,
            neighborhoodName: document.buurtnaam ?? null,
            districtCode: document.wijkcode ?? null,
            districtName: document.wijknaam ?? null,
            municipalityCode: document.gemeentecode
                ? `GM${document.gemeentecode.replace(/^GM/, "").padStart(4, "0")}`
                : null,
            provinceCode: document.provinciecode ? `PV${document.provinciecode.replace(/^PV/, "")}` : null,
            cadastralParcelIds: document.gekoppeld_perceel ?? [],
            address: {
                postcode:
                    document.postcode?.replace(/\s/g, "") ?? input.postcode,
                houseNumber: document.huisnummer ?? input.houseNumber,
                addition: [document.huisletter, document.huisnummertoevoeging].filter(Boolean).join("-") || null,
                street: document.straatnaam ?? "",
                city: document.woonplaatsnaam ?? "",
                municipality: document.gemeentenaam ?? null,
                province: document.provincienaam ?? null,
            },
            coordinates: parsePoint(document.centroide_ll),
            constructionYear: document.bouwjaar
                ? Number.parseInt(document.bouwjaar, 10)
                : null,
        };
    }
}
