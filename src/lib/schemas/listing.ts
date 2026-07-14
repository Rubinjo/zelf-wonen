import { z } from "zod";

export const publishListingSchema = z.object({
    package: z.enum(["BRONZE", "SILVER", "GOLD"]),
    channels: z.array(z.enum(["PLATFORM", "FUNDA"])).min(1),
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

export type PublishListingInput = z.infer<typeof publishListingSchema>;
