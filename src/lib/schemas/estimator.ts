import { z } from "zod";
import { dutchPostcodeSchema } from "./property";

const rubricScore = z.number().int().min(1).max(5);

export const qualitativeFeaturesSchema = z.object({
    kitchenCondition: rubricScore.describe(
        "1 original/poor; 5 recently renovated/premium",
    ),
    bathroomCondition: rubricScore.describe(
        "1 original/poor; 5 recently renovated/premium",
    ),
    interiorFinish: rubricScore.describe(
        "1 major work required; 5 turnkey premium finish",
    ),
    naturalLight: rubricScore.describe(
        "1 limited; 5 exceptional natural light",
    ),
    exteriorCondition: rubricScore.describe(
        "1 major work required; 5 excellent condition",
    ),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().max(240)).max(10),
});

export const estimateRequestSchema = z.object({
    postcode: dutchPostcodeSchema,
    houseNumber: z.number().int().positive(),
    propertyType: z.enum([
        "HOUSE",
        "APARTMENT",
        "PARKING",
        "LAND",
        "COMMERCIAL",
        "OTHER",
    ]),
    livingAreaSqm: z.number().positive().max(10000),
    roomCount: z.number().int().positive().max(100),
    constructionYear: z.number().int().min(1000).max(2200).optional(),
    userText: z.string().max(5000).optional(),
    images: z
        .array(
            z.object({
                storageKey: z.string().min(1),
                sha256: z.string().regex(/^[a-f0-9]{64}$/i),
                mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            }),
        )
        .max(30)
        .default([]),
});

export const estimateResponseSchema = z.object({
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    cached: z.boolean(),
    tier: z.enum(["MULTIMODAL_ML", "BASIC_ML", "POSTCODE_SQM"]),
    estimatedValueCents: z.string().regex(/^\d+$/),
    lowerBoundCents: z.string().regex(/^\d+$/),
    upperBoundCents: z.string().regex(/^\d+$/),
    confidence: z.number().min(0).max(1),
    qualitativeFeatures: qualitativeFeaturesSchema.nullable(),
    disclaimer: z.string(),
});

export const pythonEstimateRequestSchema = estimateRequestSchema
    .omit({ images: true, userText: true })
    .extend({ qualitativeFeatures: qualitativeFeaturesSchema.nullable() });

export const pythonEstimateResponseSchema = z.object({
    estimatedValueCents: z.number().int().nonnegative(),
    lowerBoundCents: z.number().int().nonnegative(),
    upperBoundCents: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    modelVersion: z.string(),
});

export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
export type EstimateResponse = z.infer<typeof estimateResponseSchema>;
export type QualitativeFeatures = z.infer<typeof qualitativeFeaturesSchema>;
export type PythonEstimateRequest = z.infer<typeof pythonEstimateRequestSchema>;
export type PythonEstimateResponse = z.infer<
    typeof pythonEstimateResponseSchema
>;
