import { z } from "zod";

export const dutchPostcodeSchema = z
    .string()
    .transform((value) => value.replace(/\s/g, "").toUpperCase())
    .pipe(
        z.string().regex(/^[1-9][0-9]{3}[A-Z]{2}$/, "Invalid Dutch postcode"),
    );

export const addressLookupSchema = z.object({
    postcode: dutchPostcodeSchema,
    houseNumber: z.coerce.number().int().positive(),
    addition: z.string().trim().max(12).optional(),
});

export const propertyDataSchema = z.object({
    bagAddressId: z.string().nullable(),
    bagBuildingId: z.string().nullable(),
    cadastralParcelId: z.string().nullable(),
    suggestedPropertyType: z
        .enum(["HOUSE", "APARTMENT", "PARKING", "LAND", "COMMERCIAL", "OTHER"])
        .nullable(),
    address: z.object({
        postcode: dutchPostcodeSchema,
        houseNumber: z.number().int().positive(),
        addition: z.string().nullable(),
        street: z.string(),
        city: z.string(),
        municipality: z.string().nullable(),
        province: z.string().nullable(),
    }),
    coordinates: z
        .object({ latitude: z.number(), longitude: z.number() })
        .nullable(),
    officialLandAreaSqm: z.number().nonnegative().nullable(),
    livingAreaSqm: z.number().positive().nullable(),
    roomCount: z.number().int().positive().nullable(),
    bedroomCount: z.number().int().nonnegative().nullable(),
    constructionYear: z.number().int().min(1000).max(2200).nullable(),
    energy: z
        .object({
            registrationNumber: z.string().nullable(),
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
        })
        .nullable(),
    sources: z.array(
        z.object({
            provider: z.enum([
                "PDOK",
                "BAG",
                "KADASTER",
                "RVO_EP_ONLINE",
                "ENERGIELABEL_NL",
            ]),
            retrievedAt: z.string().datetime(),
        }),
    ),
});

export type AddressLookup = z.infer<typeof addressLookupSchema>;
export type PropertyData = z.infer<typeof propertyDataSchema>;
