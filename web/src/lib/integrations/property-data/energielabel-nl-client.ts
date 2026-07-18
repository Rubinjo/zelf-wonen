import { z } from "zod";
import type { AddressLookup } from "@/lib/schemas/property";

const DEFAULT_API_URL = "https://www.energielabel.nl/api/v1/";
const requestHeaders = {
    accept: "application/json",
    referer: "https://www.energielabel.nl/woningen/zoek-je-energielabel/",
    "user-agent": "ZelfWonen/0.1 energy-label lookup",
};
const energyLabelClasses = [
    "A++++",
    "A+++",
    "A++",
    "A+",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
] as const;

const addressResponseSchema = z.object({
    houses: z.array(
        z.object({
            postcode: z.string(),
            houseNumber: z.number().int(),
            houseLetter: z.string().nullish(),
            houseAddition: z.string().nullish(),
            addressId: z.string().min(1),
        }),
    ),
});

const energyResponseSchema = z.object({
    energyClass: z.number().int(),
    registrationDate: z.string().nullish(),
    validUntil: z.string().nullish(),
    isTemporary: z.boolean(),
    isResidential: z.boolean(),
});

function normalizeAddition(value?: string | null) {
    return (value ?? "").replace(/[\s-]/g, "").toLowerCase();
}

function formatAddition(house: {
    houseLetter?: string | null;
    houseAddition?: string | null;
}) {
    return `${house.houseLetter ?? ""}${house.houseAddition ?? ""}`;
}

function toIsoDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(
        /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`,
    );
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export class EnergielabelNlClient {
    constructor(
        private readonly apiUrl =
            process.env.ENERGIELABEL_NL_API_BASE_URL || DEFAULT_API_URL,
    ) {}

    async lookupAddress(input: AddressLookup) {
        const addressUrl = new URL("house/addresses/", this.apiUrl);
        addressUrl.searchParams.set("postcode", input.postcode);
        addressUrl.searchParams.set("houseNumber", String(input.houseNumber));

        const addressResponse = await fetch(addressUrl, {
            headers: requestHeaders,
            signal: AbortSignal.timeout(5_000),
            cache: "no-store",
        });
        if (!addressResponse.ok) {
            throw new Error(
                `Energielabel.nl address lookup failed with status ${addressResponse.status}`,
            );
        }

        const addressData = addressResponseSchema.parse(
            await addressResponse.json(),
        );
        const requestedAddition = normalizeAddition(input.addition);
        const house = addressData.houses.find(
            (candidate) =>
                candidate.postcode.replace(/\s/g, "").toUpperCase() ===
                    input.postcode &&
                candidate.houseNumber === input.houseNumber &&
                normalizeAddition(formatAddition(candidate)) ===
                    requestedAddition,
        );
        if (!house) return null;

        const energyResponse = await fetch(
            new URL("house/energy-label/", this.apiUrl),
            {
                method: "POST",
                headers: {
                    ...requestHeaders,
                    "content-type": "application/json;charset=UTF-8",
                },
                body: JSON.stringify({
                    postcode: input.postcode,
                    houseNr: String(input.houseNumber),
                    houseNrAddition: input.addition ?? "",
                    addressId: house.addressId,
                }),
                signal: AbortSignal.timeout(5_000),
                cache: "no-store",
            },
        );
        if (energyResponse.status === 404) return null;
        if (!energyResponse.ok) {
            throw new Error(
                `Energielabel.nl lookup failed with status ${energyResponse.status}`,
            );
        }

        const energyData = energyResponseSchema.parse(
            await energyResponse.json(),
        );
        const labelClass = energyLabelClasses[energyData.energyClass];
        if (!energyData.isResidential || energyData.isTemporary || !labelClass) {
            return null;
        }

        return {
            registrationNumber: null,
            labelClass,
            primaryFossilEnergyKwhSqmYear: null,
            registeredAt: toIsoDate(energyData.registrationDate),
            validUntil: toIsoDate(energyData.validUntil),
        };
    }
}