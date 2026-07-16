import { z } from "zod";
import { dutchPostcodeSchema } from "./property";

const maxDatabaseBigInt = BigInt("9223372036854775807");
const centsSchema = z
    .string()
    .regex(/^\d+$/)
    .refine(
        (value) => /^\d+$/.test(value) && BigInt(value) <= maxDatabaseBigInt,
        "Amount exceeds the supported maximum",
    );

export const propertyTypeSchema = z.enum([
    "HOUSE",
    "APARTMENT",
    "PARKING",
    "LAND",
    "COMMERCIAL",
    "OTHER",
]);

export const listingAttributesSchema = z.object({
    condition: z.enum(["POOR", "FAIR", "GOOD", "EXCELLENT"]).optional(),
    outdoorSpace: z.boolean().optional(),
    parking: z.boolean().optional(),
    furnished: z.boolean().optional(),
    petsAllowed: z.boolean().optional(),
    depositCents: centsSchema.optional(),
    rentalDurationMonths: z.number().int().min(1).max(120).optional(),
    highlights: z.array(z.string().trim().min(1).max(180)).max(20).default([]),
});

export const createListingSchema = z.object({
    purpose: z.enum(["SALE", "RENT"]),
    propertyType: propertyTypeSchema,
    postcode: dutchPostcodeSchema,
    houseNumber: z.coerce.number().int().positive(),
    houseNumberAddition: z.string().trim().max(12).nullable().optional(),
    street: z.string().trim().min(1).max(160),
    city: z.string().trim().min(1).max(120),
    municipality: z.string().trim().max(120).nullable().optional(),
    province: z.string().trim().max(120).nullable().optional(),
    bagAddressId: z.string().trim().max(80).nullable().optional(),
    bagBuildingId: z.string().trim().max(80).nullable().optional(),
    cadastralParcelId: z.string().trim().max(120).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    officialLandAreaSqm: z
        .number()
        .nonnegative()
        .max(1_000_000)
        .nullable()
        .optional(),
    constructionYear: z
        .number()
        .int()
        .min(1000)
        .max(2200)
        .nullable()
        .optional(),
    livingAreaSqm: z.number().positive().max(10_000).nullable().optional(),
    roomCount: z.number().int().positive().max(100).nullable().optional(),
    bedroomCount: z.number().int().nonnegative().max(100).nullable().optional(),
});

export const updateListingSchema = z
    .object({
        version: z.number().int().positive(),
        purpose: z.enum(["SALE", "RENT"]).optional(),
        propertyType: propertyTypeSchema.optional(),
        livingAreaSqm: z.number().positive().max(10_000).nullable().optional(),
        officialLandAreaSqm: z
            .number()
            .nonnegative()
            .max(1_000_000)
            .nullable()
            .optional(),
        roomCount: z.number().int().positive().max(100).nullable().optional(),
        bedroomCount: z
            .number()
            .int()
            .nonnegative()
            .max(100)
            .nullable()
            .optional(),
        constructionYear: z
            .number()
            .int()
            .min(1000)
            .max(2200)
            .nullable()
            .optional(),
        titleNl: z.string().trim().max(140).nullable().optional(),
        titleEn: z.string().trim().max(140).nullable().optional(),
        descriptionNl: z.string().trim().max(12_000).nullable().optional(),
        descriptionEn: z.string().trim().max(12_000).nullable().optional(),
        askingPriceCents: centsSchema.nullable().optional(),
        monthlyRentCents: centsSchema.nullable().optional(),
        serviceCostsCents: centsSchema.nullable().optional(),
        availableFrom: z.string().datetime().nullable().optional(),
        viewingNotes: z.string().trim().max(2_000).nullable().optional(),
        attributes: listingAttributesSchema.nullable().optional(),
        bidWindowOpensAt: z.string().datetime().nullable().optional(),
        bidWindowClosesAt: z.string().datetime().nullable().optional(),
        floorplannerEmbedUrl: z.string().url().max(2_000).nullable().optional(),
    })
    .refine(
        (value) =>
            !value.bidWindowOpensAt ||
            !value.bidWindowClosesAt ||
            new Date(value.bidWindowOpensAt) <
                new Date(value.bidWindowClosesAt),
        {
            message: "Bid window must close after it opens",
            path: ["bidWindowClosesAt"],
        },
    );

export const publishListingSchema = z.object({
    package: z.enum(["BRONZE", "SILVER", "GOLD"]),
    channels: z
        .array(z.enum(["PLATFORM", "FUNDA"]))
        .min(1)
        .max(2)
        .refine((channels) => new Set(channels).size === channels.length, {
            message: "Publication channels must be unique",
        }),
    idempotencyKey: z.string().uuid(),
});

export const createPublicationOrderSchema = z.object({
    package: z.enum(["BRONZE", "SILVER", "GOLD"]),
    idempotencyKey: z.string().uuid(),
});

export const listingDescriptionRequestSchema = z.object({
    locale: z.enum(["nl", "en"]),
    purpose: z.enum(["SALE", "RENT"]),
    propertyType: z.string().max(80),
    city: z.string().max(120),
    livingAreaSqm: z.number().positive(),
    roomCount: z.number().int().positive(),
    highlights: z.array(z.string().max(180)).max(20),
    existingText: z.string().max(6000).optional(),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type PublishListingInput = z.infer<typeof publishListingSchema>;
