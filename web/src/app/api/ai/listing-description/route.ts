import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import { listingDescriptionRequestSchema } from "@/lib/schemas/listing";

export async function POST(request: NextRequest) {
    try {
        await requireEmailVerifiedUser();
        const input = listingDescriptionRequestSchema.parse(
            await request.json(),
        );
        const { text } = await generateText({
            model: process.env.AI_WRITER_MODEL ?? "openai/gpt-4.1-mini",
            temperature: 0.2,
            system: "You write factual Dutch real-estate listings. Never invent features, measurements, legal claims, neighborhood demographics, or energy performance. Avoid discriminatory language. Return plain text only.",
            prompt: [
                `Language: ${input.locale === "nl" ? "Dutch" : "English"}`,
                `Transaction: ${input.purpose}`,
                `Property type: ${input.propertyType}`,
                `City: ${input.city}`,
                `Living area: ${input.livingAreaSqm} m2`,
                `Rooms: ${input.roomCount}`,
                `Verified highlights: ${input.highlights.join("; ") || "none"}`,
                input.existingText ? `Owner draft: ${input.existingText}` : "",
                "Write an inviting title and a concise 3-paragraph description. Clearly separate facts from subjective phrasing.",
            ]
                .filter(Boolean)
                .join("\n"),
        });

        return NextResponse.json({ data: { text } });
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
