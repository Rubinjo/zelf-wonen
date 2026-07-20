import { z } from "zod";

export const messageInputSchema = z.object({
    body: z.string().trim().min(1).max(4000),
});

export const milestoneInputSchema = z.object({
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "WAIVED"]),
    dueAt: z.coerce.date().nullable().optional(),
    details: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const transactionDetailsSchema = z.discriminatedUnion("section", [
    z.object({
        section: z.literal("CONTRACT"),
        contractTerms: z.object({
            additionalTerms: z.string().trim().max(3000).optional(),
            financingCondition: z.boolean(),
            inspectionCondition: z.boolean(),
            securityDepositCents: z.string().regex(/^\d+$/).optional(),
        }),
        confirm: z.boolean().default(false),
    }),
    z.object({
        section: z.literal("NOTARY"),
        notaryDetails: z.object({
            officeName: z.string().trim().min(1).max(200),
            contactName: z.string().trim().max(200).optional(),
            email: z.string().email().optional().or(z.literal("")),
            phone: z.string().trim().max(40).optional(),
            address: z.string().trim().max(300).optional(),
            reference: z.string().trim().max(100).optional(),
        }),
    }),
    z.object({
        section: z.literal("HANDOVER"),
        handoverDetails: z.object({
            inspectedAt: z.coerce.date().optional(),
            electricityMeter: z.string().trim().max(80).optional(),
            gasMeter: z.string().trim().max(80).optional(),
            waterMeter: z.string().trim().max(80).optional(),
            keyCount: z.coerce.number().int().min(0).max(100).optional(),
            notes: z.string().trim().max(2000).optional(),
        }),
    }),
    z.object({
        section: z.literal("STATUS"),
        status: z.enum(["COMPLETED", "CANCELLED"]),
        reason: z.string().trim().max(1000).optional(),
    }),
]);

export const passportNoteSchema = z.object({
    changeNote: z.string().trim().min(3).max(500),
});

export const documentCategorySchema = z.enum([
    "CHAT_ATTACHMENT",
    "PURCHASE_AGREEMENT",
    "PROPERTY_PASSPORT",
    "FINANCING",
    "BUILDING_INSPECTION",
    "NOTARY",
    "FINAL_INSPECTION",
    "OTHER",
]);
