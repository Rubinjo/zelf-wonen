import { z } from "zod";
import { dutchPostcodeSchema } from "./property";

const rubricScore = z.number().int().min(1).max(5).nullable();

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
    addition: z.string().trim().max(12).optional(),
    wozValueCents: z.number().int().min(1000000).max(2000000000).optional(),
    wozAssessmentYear: z.number().int().min(2000).max(2200).optional(),
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

const evidenceShape = {
    method: z.enum(["COMPARABLE_SALES", "PROPERTY_WOZ", "MUNICIPAL_WOZ"]),
    warnings: z.array(z.string()),
    sourceUrl: z.string().url(),
    referenceMonth: z.string().nullable(),
    calibrated: z.literal(false),
    askingBenchmarkCents: z.number().int().positive().nullable(),
    askingSourceUrl: z.string().url().nullable(),
};

export const estimateResponseSchema = z.object({
    ...evidenceShape,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    cached: z.boolean(),
    tier: z.enum(["MULTIMODAL_ML", "BASIC_ML", "POSTCODE_SQM"]),
    estimatedValueCents: z.string().regex(/^\d+$/),
    lowerBoundCents: z.string().regex(/^\d+$/),
    upperBoundCents: z.string().regex(/^\d+$/),
    confidence: z.number().min(0).max(1),
    qualitativeFeatures: qualitativeFeaturesSchema.nullable(),
    disclaimer: z.string(),
    modelVersion: z.string(),
    comparableCount: z.number().int().min(0),
    valuationMonth: z.string().regex(/^20[0-9]{2}-(0[1-9]|1[0-2])$/),
    conditionAdjustmentPercent: z.number().min(-4).max(4),
});

export const pythonEstimateRequestSchema = estimateRequestSchema
    .omit({ images: true, userText: true })
    .extend({ qualitativeFeatures: qualitativeFeaturesSchema.nullable(),
        municipalityCode: z.string().regex(/^GM[0-9]{4}$/).optional(),
        provinceCode: z.string().regex(/^PV(2[0-9]|3[01])$/).optional(),
        latitude: z.number().min(50).max(54).optional(),
        longitude: z.number().min(3).max(8).optional() });

export const pythonEstimateResponseSchema = z.object({
    ...evidenceShape,
    estimatedValueCents: z.number().int().nonnegative(),
    lowerBoundCents: z.number().int().nonnegative(),
    upperBoundCents: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    modelVersion: z.string(),
    comparableCount: z.number().int().min(0),
    valuationMonth: z.string().regex(/^20[0-9]{2}-(0[1-9]|1[0-2])$/),
    conditionAdjustmentPercent: z.number().min(-4).max(4),
});

export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
export type EstimateResponse = z.infer<typeof estimateResponseSchema>;
export type QualitativeFeatures = z.infer<typeof qualitativeFeaturesSchema>;
export type PythonEstimateRequest = z.infer<typeof pythonEstimateRequestSchema>;
export type PythonEstimateResponse = z.infer<
    typeof pythonEstimateResponseSchema
>;
