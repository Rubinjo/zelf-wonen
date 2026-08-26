import { Output } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import {
    OpenRouterUnavailableError,
    generateTextWithFreeFallback,
} from "@/lib/integrations/openrouter";
import {
    listingDescriptionRequestSchema,
    listingDescriptionResultSchema,
} from "@/lib/schemas/listing";

export async function POST(request: NextRequest) {
    try {
        await requireEmailVerifiedUser();
        const input = listingDescriptionRequestSchema.parse(
            await request.json(),
        );
        const { output } = await generateTextWithFreeFallback({
            temperature: 0.2,
            system: "You write factual Dutch real-estate listings. Never invent features, measurements, legal claims, neighborhood demographics, or energy performance. Avoid discriminatory language. Return plain text only.",
            prompt: [
                `Transaction: ${input.purpose}`,
                `Property type: ${input.propertyType}`,
                `City: ${input.city}`,
                `Living area: ${input.livingAreaSqm} m2`,
                `Rooms: ${input.roomCount}`,
                `Verified highlights: ${input.highlights.join("; ") || "none"}`,
                input.existingTitleNl
                    ? `Current Dutch title (owner draft): ${input.existingTitleNl}`
                    : "",
                input.existingDescriptionNl
                    ? `Current Dutch description (owner draft): ${input.existingDescriptionNl}`
                    : "",
                input.existingTitleEn
                    ? `Current English title (owner draft): ${input.existingTitleEn}`
                    : "",
                input.existingDescriptionEn
                    ? `Current English description (owner draft): ${input.existingDescriptionEn}`
                    : "",
                "Write a proposal for all four fields: an inviting Dutch title, a concise 3-paragraph Dutch description, an English title and an English description. Reuse facts from the owner drafts where present, but rewrite them into fresh proposals. Clearly separate facts from subjective phrasing. Respond in the JSON structure requested of you.",
            ]
                .filter(Boolean)
                .join("\n"),
            output: Output.object({
                name: "ListingCopy",
                description:
                    "Voorstel voor Nederlandse en Engelse titel en omschrijving van de woningadvertentie.",
                schema: listingDescriptionResultSchema,
            }),
        });

        return NextResponse.json({ data: output });
    } catch (error) {
        if (error instanceof AuthenticationError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                {
                    status:
                        error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403,
                },
            );
        }
        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_DESCRIPTION_INPUT",
                        message: "Invalid listing details",
                    },
                },
                { status: 400 },
            );
        }
        if (error instanceof OpenRouterUnavailableError) {
            return NextResponse.json(
                {
                    error: {
                        code: "AI_UNAVAILABLE",
                        message:
                            error.message === "OPENROUTER_NOT_CONFIGURED"
                                ? "AI is niet geconfigureerd (OPENROUTER_API_KEY ontbreekt)."
                                : "De schrijfassistent is momenteel onbereikbaar.",
                    },
                },
                { status: 503 },
            );
        }
        console.error("AI description generation failed", error);
        return NextResponse.json(
            {
                error: {
                    code: "AI_WRITER_UNAVAILABLE",
                    message: "The writing assistant is unavailable",
                },
            },
            { status: 503 },
        );
    }
}
