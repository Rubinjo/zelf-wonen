import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import {
    AiSearchUnavailableError,
    interpretAiSearchQuery,
} from "@/features/listings/ai-search";

/**
 * AI-zoekinterpretatie: zet een natuurlijke-taalvraag om naar URL-parameters
 * voor /search. De client wordt doorgestuurd naar de bestaande zoekpagina,
 * zodat alle handmatige filters gewoon blijven werken en de geïnterpreteerde
 * filters zichtbaar zijn in de filterpanelen.
 */

function setParam(params: URLSearchParams, key: string, value: unknown) {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
}

export async function POST(request: NextRequest) {
    let query = "";
    try {
        const body = (await request.json()) as { query?: unknown };
        query =
            typeof body?.query === "string" ? body.query.trim().slice(0, 500) : "";
        if (!query) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_SEARCH_QUERY",
                        message: "Vul een zoekopdracht in.",
                    },
                },
                { status: 400 },
            );
        }

        const interpretation = await interpretAiSearchQuery(query);

        const params = new URLSearchParams();
        // Doel (kopen/huren): expliciet genoemd, anders platformstandaard SALE.
        setParam(params, "purpose", interpretation.purpose);
        if (interpretation.location?.city) {
            setParam(params, "city", interpretation.location.city);
        }
        if (interpretation.location?.street) {
            setParam(params, "q", interpretation.location.street);
        }
        setParam(params, "priceMin", interpretation.priceMin);
        setParam(params, "priceMax", interpretation.priceMax);
        for (const type of interpretation.propertyTypes ?? []) {
            params.append("propertyType", type);
        }
        setParam(params, "livingAreaMin", interpretation.livingAreaMin);
        setParam(params, "plotAreaMin", interpretation.plotAreaMin);
        setParam(params, "roomsMin", interpretation.roomsMin);
        setParam(params, "bedroomsMin", interpretation.bedroomsMin);
        setParam(params, "bathroomsMin", interpretation.bathroomsMin);
        setParam(
            params,
            "constructionYearMin",
            interpretation.constructionYearMin,
        );
        setParam(
            params,
            "constructionYearMax",
            interpretation.constructionYearMax,
        );
        setParam(params, "isMonument", interpretation.isMonument);
        setParam(params, "erfpacht", interpretation.erfpacht);
        for (const label of interpretation.energyLabels ?? []) {
            params.append("energyLabel", label);
        }
        for (const amenity of interpretation.amenities ?? []) {
            params.append("amenity", amenity);
        }
        for (const parking of interpretation.parkingOptions ?? []) {
            params.append("parking", parking);
        }
        setParam(params, "hasGarden", interpretation.hasGarden);
        setParam(
            params,
            "gardenOrientation",
            interpretation.gardenOrientation,
        );
        setParam(params, "availableFrom", interpretation.availableFrom);
        for (const keyword of interpretation.keywords ?? []) {
            params.append("keyword", keyword);
        }

        return NextResponse.json({
            data: {
                redirectUrl: `/search?${params.toString()}`,
                interpretation,
            },
        });
    } catch (error) {
        if (error instanceof AiSearchUnavailableError) {
            // Gracieus terugvallen op het bestaande vrije-tekstgedrag.
            const fallback = new URLSearchParams();
            if (query) fallback.set("q", query);
            return NextResponse.json({
                data: {
                    redirectUrl: `/search?${fallback.toString()}`,
                    degraded: true,
                },
            });
        }
        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: "AI_SEARCH_INTERPRETATION_FAILED",
                        message:
                            "De zoekopdracht kon niet worden geïnterpreteerd.",
                    },
                },
                { status: 502 },
            );
        }
        console.error("AI search interpretation failed", error);
        const fallback = new URLSearchParams();
        if (query) fallback.set("q", query);
        return NextResponse.json({
            data: {
                redirectUrl: `/search?${fallback.toString()}`,
                degraded: true,
            },
        });
    }
}
