import { z } from "zod";

export const favoriteInputSchema = z.object({
    listingId: z.string().uuid(),
    note: z.string().trim().max(1000).optional(),
});

export const favoriteMigrationSchema = z.object({
    listingIds: z.array(z.string().uuid()).max(200),
});

export const favoriteNoteSchema = z.object({
    note: z.string().trim().max(1000),
});

export const savedSearchInputSchema = z.object({
    name: z.string().trim().min(2).max(80),
    queryString: z.string().trim().max(2000),
    notificationsEnabled: z.boolean().default(true),
});

export const notificationPreferenceSchema = z.object({
    newListing: z.boolean(),
    priceChange: z.boolean(),
    statusChange: z.boolean(),
    viewing: z.boolean(),
    bid: z.boolean(),
    transaction: z.boolean(),
    deadline: z.boolean(),
    inAppEnabled: z.boolean(),
});

export const shortlistInputSchema = z.object({
    label: z.string().trim().max(80).optional(),
    listingIds: z.array(z.string().uuid()).min(1).max(50),
    expiresInDays: z.coerce.number().int().min(1).max(90).default(30),
    includeNotes: z.boolean().default(false),
});
