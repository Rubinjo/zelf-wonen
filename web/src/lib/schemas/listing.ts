import { z } from "zod";
import { dutchPostcodeSchema, erfpachtTypeSchema } from "./property";

const maxDatabaseBigInt = BigInt("9223372036854775807");
const centsSchema = z
    .string()
    .regex(/^\d+$/)
    .refine(
        (value) => /^\d+$/.test(value) && BigInt(value) <= maxDatabaseBigInt,
        "Amount exceeds the supported maximum",
    );
const positiveCentsSchema = centsSchema.refine(
    (value) => BigInt(value) > 0,
    "Amount must be greater than zero",
);

export const biddingMethodSchema = z.enum(["PRIVATE", "SEALED", "OPEN"]);

export const propertyTypeSchema = z.enum([
    "HOUSE",
    "APARTMENT",
    "PARKING",
    "LAND",
    "COMMERCIAL",
    "OTHER",
]);

export const roofTypeSchema = z.enum([
    "FLAT",
    "GABLE",
    "HIP",
    "MANSARD",
    "SHED",
    "COMBINATION",
    "OTHER",
]);

export const propertyAmenitySchema = z.enum([
    "SOLAR_PANELS",
    "AIR_CONDITIONING",
    "FIBER_OPTIC",
    "HEAT_PUMP",
    "EV_CHARGER",
    "FIREPLACE",
    "MECHANICAL_VENTILATION",
    "ALARM_SYSTEM",
]);

export const parkingOptionSchema = z.enum([
    "ON_PROPERTY",
    "FREE_STREET",
    "PAID_STREET",
    "PARKING_PERMIT",
    "PUBLIC_GARAGE",
    "PRIVATE_GARAGE",
    "SPACE_FOR_SALE",
]);

export const movableItemCategorySchema = z.enum([
    "STAYS",
    "GOES",
    "FOR_TAKEOVER",
]);

export const movableItemSchema = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    category: movableItemCategorySchema,
    notes: z.string().trim().max(240).default(""),
});

export const questionnaireAnswerSchema = z.object({
    questionId: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(80),
    answer: z.enum(["YES", "NO", "UNKNOWN", "NOT_APPLICABLE"]),
    details: z.string().trim().max(1_000).default(""),
});

export const listingAttributesSchema = z.object({
    condition: z.enum(["POOR", "FAIR", "GOOD", "EXCELLENT"]).optional(),
    outdoorSpace: z.boolean().optional(),
    parking: z.boolean().optional(),
    furnished: z.boolean().optional(),
    petsAllowed: z.boolean().optional(),
    depositCents: centsSchema.optional(),
    rentalDurationMonths: z.number().int().min(1).max(120).optional(),
    highlights: z.array(z.string().trim().min(1).max(180)).max(20).default([]),
    movableItems: z.array(movableItemSchema).max(150).default([]),
    questionnaireAnswers: z
        .array(questionnaireAnswerSchema)
        .max(50)
        .refine(
            (answers) =>
                new Set(answers.map((answer) => answer.questionId)).size ===
                answers.length,
            "Questionnaire answers must have unique question IDs",
        )
        .default([]),
});

const energyLabelInputSchema = z.object({
    registrationNumber: z.string().trim().max(120).nullable(),
    labelClass: z.enum([
        "A+++++",
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
    ]),
    primaryFossilEnergyKwhSqmYear: z.number().nonnegative().nullable(),
    registeredAt: z.string().datetime().nullable(),
    validUntil: z.string().datetime().nullable(),
});

// Gestructureerde tuininformatie; wordt in de layout-JSON van het pand
// opgeslagen (Property.layout.garden) en is doorzoekbaar via JSON-filters.
export const gardenInputSchema = z.object({
    hasGarden: z.boolean(),
    orientation: z
        .enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"])
        .nullable()
        .optional(),
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
    isMonument: z.boolean().default(false),
    erfpachtType: erfpachtTypeSchema.default("UNKNOWN"),
    erfpachtCanonCents: centsSchema.nullable().optional(),
    erfpachtDetails: z.string().trim().max(240).nullable().optional(),
    erfpachtEndDate: z.string().datetime().nullable().optional(),
    livingAreaSqm: z.number().positive().max(10_000).nullable().optional(),
    roomCount: z.number().int().positive().max(100).nullable().optional(),
    bedroomCount: z.number().int().nonnegative().max(100).nullable().optional(),
    bathroomCount: z
        .number()
        .int()
        .nonnegative()
        .max(100)
        .nullable()
        .optional(),
    floorCount: z.number().int().positive().max(100).nullable().optional(),
    roofType: roofTypeSchema.nullable().optional(),
    externalStorageAreaSqm: z
        .number()
        .nonnegative()
        .max(10_000)
        .nullable()
        .optional(),
    amenities: z.array(propertyAmenitySchema).max(20).optional(),
    parkingOptions: z.array(parkingOptionSchema).max(20).optional(),
    parkingSpacePriceCents: centsSchema.nullable().optional(),
    titleNl: z.string().trim().max(140).nullable().optional(),
    titleEn: z.string().trim().max(140).nullable().optional(),
    descriptionNl: z.string().trim().max(12_000).nullable().optional(),
    descriptionEn: z.string().trim().max(12_000).nullable().optional(),
    askingPriceCents: centsSchema.nullable().optional(),
    monthlyRentCents: centsSchema.nullable().optional(),
    serviceCostsCents: centsSchema.nullable().optional(),
    viewingNotes: z.string().trim().max(2_000).nullable().optional(),
    biddingMethod: biddingMethodSchema.default("PRIVATE"),
    minimumBidCents: positiveCentsSchema.nullable().optional(),
    bidIncrementCents: positiveCentsSchema.nullable().optional(),
    allowBidConditions: z.boolean().default(true),
    bidWindowOpensAt: z.string().datetime().nullable().optional(),
    bidWindowClosesAt: z.string().datetime().nullable().optional(),
    floorplannerEmbedUrl: z.string().url().max(2_000).nullable().optional(),
    attributes: listingAttributesSchema.nullable().optional(),
    energyLabel: energyLabelInputSchema.nullable().optional(),
    garden: gardenInputSchema.optional(),
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
        bathroomCount: z
            .number()
            .int()
            .nonnegative()
            .max(100)
            .nullable()
            .optional(),
        floorCount: z.number().int().positive().max(100).nullable().optional(),
        roofType: roofTypeSchema.nullable().optional(),
        externalStorageAreaSqm: z
            .number()
            .nonnegative()
            .max(10_000)
            .nullable()
            .optional(),
        amenities: z.array(propertyAmenitySchema).max(20).optional(),
        parkingOptions: z.array(parkingOptionSchema).max(20).optional(),
        parkingSpacePriceCents: centsSchema.nullable().optional(),
        constructionYear: z
            .number()
            .int()
            .min(1000)
            .max(2200)
            .nullable()
            .optional(),
        isMonument: z.boolean().optional(),
        erfpachtType: erfpachtTypeSchema.optional(),
        erfpachtCanonCents: centsSchema.nullable().optional(),
        erfpachtDetails: z.string().trim().max(240).nullable().optional(),
        erfpachtEndDate: z.string().datetime().nullable().optional(),
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
        biddingMethod: biddingMethodSchema.optional(),
        minimumBidCents: positiveCentsSchema.nullable().optional(),
        bidIncrementCents: positiveCentsSchema.nullable().optional(),
        allowBidConditions: z.boolean().optional(),
        bidWindowOpensAt: z.string().datetime().nullable().optional(),
        bidWindowClosesAt: z.string().datetime().nullable().optional(),
        floorplannerEmbedUrl: z.string().url().max(2_000).nullable().optional(),
        garden: gardenInputSchema.optional(),
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

export const publishListingSchema = z.strictObject({
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
    // Bestaande teksten van de eigenaar dienen als context; het model mag
    // feiten daaruit hergebruiken maar herschrijft ze tot een nieuw voorstel.
    existingTitleNl: z.string().max(200).optional(),
    existingDescriptionNl: z.string().max(6000).optional(),
    existingTitleEn: z.string().max(200).optional(),
    existingDescriptionEn: z.string().max(6000).optional(),
});

// Gestructureerd AI-antwoord: altijd alle vier de velden, zodat de editor
// elk invoerveld apart kan bijwerken.
export const listingDescriptionResultSchema = z.object({
    titleNl: z.string().min(1).max(200),
    descriptionNl: z.string().min(1).max(6000),
    titleEn: z.string().min(1).max(200),
    descriptionEn: z.string().min(1).max(6000),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type PublishListingInput = z.infer<typeof publishListingSchema>;
