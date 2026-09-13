import { Output } from "ai";
import { z } from "zod";

import {
    OpenRouterUnavailableError,
    generateTextWithFreeFallback,
} from "@/lib/integrations/openrouter";

/**
 * AI-gestuurde zoekinterpretatie voor de marketplace.
 *
 * Het model genereert uitsluitend een gestructureerd JSON-object dat hier
 * strikt wordt gevalideerd (enum-whitelists, bereikcontroles). De Prisma-query
 * zelf wordt in `marketplace-service.ts` opgebouwd; het model produceert nooit
 * SQL of Prisma-code.
 */

// ---- Gedeelde enum-whitelists (spiegelen de Prisma-enums) -------------------

export const aiSearchPropertyTypes = [
    "HOUSE",
    "APARTMENT",
    "PARKING",
    "LAND",
    "COMMERCIAL",
    "OTHER",
] as const;

export const aiSearchAmenities = [
    "SOLAR_PANELS",
    "AIR_CONDITIONING",
    "FIBER_OPTIC",
    "HEAT_PUMP",
    "EV_CHARGER",
    "FIREPLACE",
    "MECHANICAL_VENTILATION",
    "ALARM_SYSTEM",
] as const;

export const aiSearchParkingOptions = [
    "ON_PROPERTY",
    "FREE_STREET",
    "PAID_STREET",
    "PARKING_PERMIT",
    "PUBLIC_GARAGE",
    "PRIVATE_GARAGE",
    "SPACE_FOR_SALE",
] as const;

export const aiSearchEnergyLabels = [
    "A_PLUS_PLUS_PLUS_PLUS_PLUS",
    "A_PLUS_PLUS_PLUS_PLUS",
    "A_PLUS_PLUS_PLUS",
    "A_PLUS_PLUS",
    "A_PLUS",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
] as const;

const gardenOrientations = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
] as const;

// ---- Structured output schema ----------------------------------------------

export const aiSearchInterpretationSchema = z.object({
    purpose: z.enum(["SALE", "RENT"]).nullish(),
    location: z
        .object({
            city: z.string().trim().min(1).max(80).nullish(),
            street: z.string().trim().min(1).max(120).nullish(),
        })
        .nullish(),
    priceMin: z.number().nonnegative().finite().nullish(),
    priceMax: z.number().nonnegative().finite().nullish(),
    propertyTypes: z.array(z.enum(aiSearchPropertyTypes)).max(6).nullish(),
    livingAreaMin: z.number().nonnegative().finite().nullish(),
    plotAreaMin: z.number().nonnegative().finite().nullish(),
    roomsMin: z.number().int().nonnegative().nullish(),
    bedroomsMin: z.number().int().nonnegative().nullish(),
    bathroomsMin: z.number().int().nonnegative().nullish(),
    constructionYearMin: z.number().int().min(1000).max(2200).nullish(),
    constructionYearMax: z.number().int().min(1000).max(2200).nullish(),
    isMonument: z.boolean().nullish(),
    erfpacht: z.enum(["leasehold", "freehold"]).nullish(),
    energyLabels: z.array(z.enum(aiSearchEnergyLabels)).max(12).nullish(),
    amenities: z.array(z.enum(aiSearchAmenities)).max(8).nullish(),
    parkingOptions: z.array(z.enum(aiSearchParkingOptions)).max(7).nullish(),
    hasGarden: z.boolean().nullish(),
    gardenOrientation: z.enum(gardenOrientations).nullish(),
    availableFrom: z.enum(["now", "1m", "3m"]).nullish(),
    keywords: z.array(z.string().trim().min(1).max(40)).max(5).nullish(),
});

export type AiSearchInterpretation = z.infer<
    typeof aiSearchInterpretationSchema
>;

// ---- Prompt -----------------------------------------------------------------

const SYSTEM_PROMPT = [
    "Je vertaalt een natuurlijke-zoekopdracht van een gebruiker naar een gestructureerde zoekopdracht voor een Nederlandse woningmarktplace.",
    "Zelfstandigheidseisen:",
    "- Gebruik alleen velden die de gebruiker expliciet of impliciet duidelijk heeft gemaakt. Laat alles wat niet gevraagd wordt weg (null/undefined), zodat bestaande filters niet onnodig beperkt worden.",
    "- Prijs: bij KOPEN gaat het om koopprijs (askingPrice), bij HUREN om huurprijs per maand. 'onder de 400k' => priceMax 400000. 'tot en met' is inclusief.",
    "- Woningtype: appartement/flat => APARTMENT, huis/property/villa => HOUSE, bouwgrond/kavel => LAND, kantoor/winkel/praktijkruimte => COMMERCIAL, parkeerplaats/garage-box => PARKING.",
    '- Energielabel: \'label A of beter\' => ["A_PLUS", "A", "B", "C", "D", "E", "F", "G"] (alle A-varianten plus lager); \'minimaal label B\' => ["B","C","D","E","F","G"]. Gebruik de exacte enum-waarden.',
    "- Voorzieningen en parkeren: gebruik exact de gegeven enum-waarden.",
    "- Tuin: 'met tuin' => hasGarden true; tuin op het zuiden/oosten enz. => gardenOrientation (S/E/...).",
    "- Beschikbaarheid: 'direct beschikbaar/per direct' => now, 'binnen een maand' => 1m, 'binnen drie maanden' => 3m.",
    "- Erfpacht: 'eigen grond/volle eigendom/geen erfpacht' => freehold; 'erfpacht' => leasehold.",
    "- Monument: 'monument/rijksmonument' => isMonument true.",
    "- Bouwjaar: 'gebouwd na 1990' => constructionYearMin 1991; 'vanaf 1975' => constructionYearMin 1975; 'voor 1930' => constructionYearMax 1929.",
    "- Keywords: resterende concrete wensen die niet in een veld passen (bijv. 'balkon', 'schuur', 'hoekwoning', 'zolder'). Max 5 korte termen, geen plaatsnamen.",
    "- Plaatsnamen horen in location.city, straatnamen in location.street — nooit in keywords.",
    "Antwoord uitsluitend met het JSON-object conform het schema.",
].join("\n");

// ---- Interpretation ----------------------------------------------------------

export class AiSearchUnavailableError extends Error {}

function clampNumber(value: number | null | undefined, max: number) {
    if (value === undefined || value === null) return null;
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.min(value, max);
}

/**
 * Roept OpenRouter aan via de Vercel AI SDK (Auto Router met gratis-model-
 * terugval) en valideert het resultaat strikt tegen het schema. Gooit
 * `AiSearchUnavailableError` wanneer OpenRouter niet geconfigureerd is of
 * faalt.
 */
export async function interpretAiSearchQuery(
    query: string,
): Promise<AiSearchInterpretation> {
    const trimmed = query.trim().slice(0, 500);
    if (!trimmed) throw new AiSearchUnavailableError("EMPTY_QUERY");

    let output: AiSearchInterpretation | null | undefined;
    try {
        const result = await generateTextWithFreeFallback({
            temperature: 0,
            system: SYSTEM_PROMPT,
            prompt: `Zoekopdracht van de gebruiker: "${trimmed}"`,
            output: Output.object({
                name: "MarketplaceSearchQuery",
                description:
                    "Gestructureerde zoekopdracht voor de woningmarketplace; laat velden weg die de gebruiker niet vroeg.",
                schema: aiSearchInterpretationSchema,
            }),
        });
        output = result.output as AiSearchInterpretation | null | undefined;
    } catch (error) {
        if (error instanceof OpenRouterUnavailableError)
            throw new AiSearchUnavailableError(error.message);
        // Structured-output- of validatiefouten van het model zelf: doorlaten.
        throw error;
    }
    if (!output) throw new AiSearchUnavailableError("AI_NO_OUTPUT");

    // Defensieve normalisatie bovenop de schema-validatie: bereiken forceren
    // en logische inconsistenties oplossen voordat filters worden gebouwd.
    let priceMin = clampNumber(output.priceMin, 100_000_000);
    let priceMax = clampNumber(output.priceMax, 100_000_000);
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
        [priceMin, priceMax] = [priceMax, priceMin];
    }
    let constructionYearMin = clampNumber(output.constructionYearMin, 2200);
    let constructionYearMax = clampNumber(output.constructionYearMax, 2200);
    if (
        constructionYearMin !== null &&
        constructionYearMax !== null &&
        constructionYearMin > constructionYearMax
    ) {
        [constructionYearMin, constructionYearMax] = [
            constructionYearMax,
            constructionYearMin,
        ];
    }

    const normalized: AiSearchInterpretation = {
        purpose: output.purpose ?? null,
        location: output.location ?? null,
        priceMin,
        priceMax,
        propertyTypes: output.propertyTypes ?? null,
        livingAreaMin: clampNumber(output.livingAreaMin, 10_000),
        plotAreaMin: clampNumber(output.plotAreaMin, 1_000_000),
        roomsMin: clampNumber(output.roomsMin, 20),
        bedroomsMin: clampNumber(output.bedroomsMin, 20),
        bathroomsMin: clampNumber(output.bathroomsMin, 15),
        constructionYearMin,
        constructionYearMax,
        isMonument: output.isMonument ?? null,
        erfpacht: output.erfpacht ?? null,
        energyLabels: output.energyLabels ?? null,
        amenities: output.amenities ?? null,
        parkingOptions: output.parkingOptions ?? null,
        hasGarden: output.hasGarden ?? null,
        gardenOrientation: output.gardenOrientation ?? null,
        availableFrom: output.availableFrom ?? null,
        keywords: output.keywords ?? null,
    };
    return normalized;
}
