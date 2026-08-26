import { createHash } from "node:crypto";
import { Output } from "ai";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { generateTextWithFreeFallback } from "@/lib/integrations/openrouter";
import {
    estimateResponseSchema,
    qualitativeFeaturesSchema,
    pythonEstimateResponseSchema,
    type EstimateRequest,
    type EstimateResponse,
    type PythonEstimateRequest,
    type QualitativeFeatures,
} from "@/lib/schemas/estimator";

type NumericEstimate = {
    estimatedValueCents: number;
    lowerBoundCents: number;
    upperBoundCents: number;
    confidence: number;
    modelVersion: string;
};

function normalizedInput(input: EstimateRequest) {
    return {
        ...input,
        postcode: input.postcode.toUpperCase(),
        userText: input.userText?.trim() ?? "",
        images: [...input.images]
            .map(({ sha256, mimeType, storageKey }) => ({
                sha256: sha256.toLowerCase(),
                mimeType,
                storageKey,
            }))
            .sort((a, b) => a.sha256.localeCompare(b.sha256)),
    };
}

function hashInput(input: EstimateRequest) {
    return createHash("sha256")
        .update(JSON.stringify(normalizedInput(input)))
        .digest("hex");
}

async function extractQualitativeFeatures(
    input: EstimateRequest,
    inputHash: string,
): Promise<QualitativeFeatures> {
    const mediaBaseUrl =
        process.env.OBJECT_STORAGE_MEDIA_BASE_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000";

    const seed = Number.parseInt(inputHash.slice(0, 8), 16) & 0x7fffffff;
    const { output } = await generateTextWithFreeFallback({
        temperature: 0,
        seed,
        output: Output.object({
            name: "PropertyQualitativeFeatures",
            description:
                "Scores using the fixed ZelfWonen property condition rubric",
            schema: qualitativeFeaturesSchema,
        }),
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: [
                            "Score only what is visible or explicitly stated.",
                            "Use integer 1-5: 1=poor/original, 2=dated, 3=average maintained, 4=modern good, 5=recent premium.",
                            "Do not infer neighborhood quality, protected traits, or occupant characteristics.",
                            `Owner text: ${input.userText || "No owner text supplied."}`,
                        ].join("\n"),
                    },
                    ...input.images.map((image) => ({
                        type: "image" as const,
                        image: new URL(
                            image.storageKey.replace(/^\/+/, ""),
                            `${mediaBaseUrl.replace(/\/+$/, "")}/`,
                        ),
                        mediaType: image.mimeType,
                    })),
                ],
            },
        ],
    });

    return qualitativeFeaturesSchema.parse(output);
}

async function runPythonModel(
    input: PythonEstimateRequest,
): Promise<NumericEstimate> {
    const endpoint = process.env.ML_ESTIMATOR_URL;
    if (!endpoint) throw new Error("ML_ESTIMATOR_URL is not configured");

    const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/estimate`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(process.env.ML_ESTIMATOR_TOKEN
                ? { authorization: `Bearer ${process.env.ML_ESTIMATOR_TOKEN}` }
                : {}),
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
        throw new Error(`Python estimator returned ${response.status}`);
    }

    return pythonEstimateResponseSchema.parse(await response.json());
}

async function runPostcodeFallback(
    input: EstimateRequest,
): Promise<NumericEstimate> {
    const sector = input.postcode.slice(0, 4);
    const localStat = await db.postcodePriceStat.findFirst({
        where: {
            postcodeSector: sector,
            propertyType: input.propertyType,
            effectiveAt: { lte: new Date() },
        },
        orderBy: { effectiveAt: "desc" },
    });
    const stat =
        localStat ??
        (await db.postcodePriceStat.findFirst({
            where: {
                postcodeSector: "NL",
                propertyType: input.propertyType,
                effectiveAt: { lte: new Date() },
            },
            orderBy: { effectiveAt: "desc" },
        }));
    const averagePricePerSqmCents = stat
        ? Number(stat.averagePricePerSqmCents)
        : Number(process.env.EMERGENCY_PRICE_PER_SQM_CENTS ?? 450_000);
    const estimate = Math.round(averagePricePerSqmCents * input.livingAreaSqm);

    return {
        estimatedValueCents: estimate,
        lowerBoundCents: Math.round(estimate * 0.85),
        upperBoundCents: Math.round(estimate * 1.15),
        confidence: stat
            ? Math.min(0.65, 0.35 + stat.sampleSize / 10_000)
            : 0.25,
        modelVersion: stat?.datasetVersion ?? "emergency-national-baseline",
    };
}

function toResponse(
    inputHash: string,
    cached: boolean,
    tier: EstimateResponse["tier"],
    result: NumericEstimate,
    features: QualitativeFeatures | null,
): EstimateResponse {
    return estimateResponseSchema.parse({
        inputHash,
        cached,
        tier,
        estimatedValueCents: String(result.estimatedValueCents),
        lowerBoundCents: String(result.lowerBoundCents),
        upperBoundCents: String(result.upperBoundCents),
        confidence: result.confidence,
        qualitativeFeatures: features,
        disclaimer:
            "Indicative automated estimate, not a valuation report (taxatierapport) or financial advice.",
    });
}

export async function estimateProperty(
    input: EstimateRequest,
    userId: string,
): Promise<EstimateResponse> {
    if (input.images.length > 0) {
        const authorized = await db.listingMedia.count({
            where: {
                status: "READY",
                listing: { ownerId: userId },
                OR: input.images.map((image) => ({
                    storageKey: image.storageKey,
                    sha256: image.sha256.toLowerCase(),
                    mimeType: image.mimeType,
                })),
            },
        });
        if (authorized !== input.images.length) {
            throw new Error("One or more estimator images are not authorized");
        }
    }
    const inputHash = hashInput(input);
    const cached = await db.estimateCache.findUnique({ where: { inputHash } });
    if (cached && (!cached.expiresAt || cached.expiresAt > new Date())) {
        return estimateResponseSchema.parse({
            inputHash,
            cached: true,
            tier: cached.tier,
            estimatedValueCents: cached.estimatedValueCents.toString(),
            lowerBoundCents: cached.lowerBoundCents.toString(),
            upperBoundCents: cached.upperBoundCents.toString(),
            confidence: cached.confidenceBasisPoints / 10_000,
            qualitativeFeatures: cached.qualitativeFeatures,
            disclaimer:
                "Indicative automated estimate, not a valuation report (taxatierapport) or financial advice.",
        });
    }

    let tier: EstimateResponse["tier"] = "POSTCODE_SQM";
    let features: QualitativeFeatures | null = null;
    let result: NumericEstimate;

    try {
        if (input.images.length === 0) throw new Error("No images supplied");
        features = await extractQualitativeFeatures(input, inputHash);
        result = await runPythonModel({
            postcode: input.postcode,
            houseNumber: input.houseNumber,
            propertyType: input.propertyType,
            livingAreaSqm: input.livingAreaSqm,
            roomCount: input.roomCount,
            constructionYear: input.constructionYear,
            qualitativeFeatures: features,
        });
        tier = "MULTIMODAL_ML";
    } catch (tierOneError) {
        console.warn("Estimator tier 1 unavailable", tierOneError);
        features = null;
        try {
            result = await runPythonModel({
                postcode: input.postcode,
                houseNumber: input.houseNumber,
                propertyType: input.propertyType,
                livingAreaSqm: input.livingAreaSqm,
                roomCount: input.roomCount,
                constructionYear: input.constructionYear,
                qualitativeFeatures: null,
            });
            tier = "BASIC_ML";
        } catch (tierTwoError) {
            console.warn("Estimator tier 2 unavailable", tierTwoError);
            result = await runPostcodeFallback(input);
        }
    }

    await db.estimateCache.upsert({
        where: { inputHash },
        create: {
            inputHash,
            normalizedInput: normalizedInput(input) as Prisma.InputJsonValue,
            qualitativeFeatures: features as Prisma.InputJsonValue | undefined,
            imageHashes: input.images.map((image) => image.sha256),
            tier,
            estimatedValueCents: BigInt(result.estimatedValueCents),
            lowerBoundCents: BigInt(result.lowerBoundCents),
            upperBoundCents: BigInt(result.upperBoundCents),
            confidenceBasisPoints: Math.round(result.confidence * 10_000),
            llmModelVersion: features ? "openrouter/auto" : null,
            mlModelVersion:
                tier === "POSTCODE_SQM" ? null : result.modelVersion,
            publicDatasetVersion:
                tier === "POSTCODE_SQM" ? result.modelVersion : null,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {},
    });

    return toResponse(inputHash, false, tier, result, features);
}
