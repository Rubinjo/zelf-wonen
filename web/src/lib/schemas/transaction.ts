import { z } from "zod";

export const messageInputSchema = z.object({
    body: z.string().trim().min(1).max(4000),
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
        // De verkoper mag een notaris alleen VOORSTELLEN; alleen de koper
        // bevestigt de uiteindelijke notaris.
        action: z.enum(["PROPOSE", "CONFIRM"]).default("CONFIRM"),
        notaryDetails: z.object({
            officeName: z.string().trim().min(1).max(200),
            contactName: z.string().trim().max(200).optional(),
            email: z.string().email().optional().or(z.literal("")),
            phone: z.string().trim().max(40).optional(),
            address: z.string().trim().max(300).optional(),
            reference: z.string().trim().max(100).optional(),
            // Kwaliteitsrekening voor de storting van de waarborgsom.
            clientAccountHolder: z.string().trim().max(200).optional(),
            clientAccountIban: z
                .string()
                .trim()
                .toUpperCase()
                .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/)
                .optional()
                .or(z.literal("")),
        }),
    }),
    z.object({
        section: z.literal("SECURITY"),
        // Waarborgsom (Art 7:26 lid 4 BW): rolgebaseerde acties.
        //  - CHOOSE_FORM: alleen de koper kiest waarborgsom of bankgarantie.
        //  - GENERATE_REFERENCE: beide partijen mogen het betaalkenmerk aanmaken.
        //  - MARK_PAID: alleen de koper registreert de storting.
        //  - CONFIRM: alleen de verkoper bevestigt de ontvangst.
        action: z.enum([
            "CHOOSE_FORM",
            "GENERATE_REFERENCE",
            "MARK_PAID",
            "CONFIRM",
        ]),
        form: z.enum(["DEPOSIT", "BANK_GUARANTEE"]).optional(),
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

/** Bewerkbare velden van het woningpaspoort (verkoper/verhuurder). */
export const passportDraftSchema = z.object({
    condition: z
        .enum(["EXCELLENT", "GOOD", "REASONABLE", "POOR"])
        .nullable()
        .optional(),
    lastInspectionAt: z.string().trim().max(10).nullable().optional(),
    renovationYear: z.coerce
        .number()
        .int()
        .min(1900)
        .max(2100)
        .nullable()
        .optional(),
    solarPanelWattage: z.coerce
        .number()
        .int()
        .min(0)
        .max(200000)
        .nullable()
        .optional(),
    heatPump: z.boolean().optional(),
    boilerYear: z.coerce
        .number()
        .int()
        .min(1900)
        .max(2100)
        .nullable()
        .optional(),
    insulation: z.array(z.string().trim().max(40)).max(12).optional(),
    vve: z
        .object({
            name: z.string().trim().max(200).nullable().optional(),
            monthlyContributionCents: z.coerce
                .number()
                .int()
                .min(0)
                .max(100000000)
                .nullable()
                .optional(),
            reserveFundCents: z.coerce
                .number()
                .int()
                .min(0)
                .max(1000000000)
                .nullable()
                .optional(),
            contactEmail: z
                .string()
                .email()
                .max(200)
                .nullable()
                .optional()
                .or(z.literal("")),
        })
        .nullable()
        .optional(),
    features: z.string().trim().max(1000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
});

export const documentCategorySchema = z.enum([
    "CHAT_ATTACHMENT",
    "PURCHASE_AGREEMENT",
    "PROPERTY_PASSPORT",
    "FINANCING",
    "BUILDING_INSPECTION",
    "SECURITY_DEPOSIT",
    "NOTARY",
    "FINAL_INSPECTION",
    "ENERGY_LABEL",
    "FLOOR_PLAN",
    "VVE",
    "CADASTRAL",
    "OTHER",
]);
