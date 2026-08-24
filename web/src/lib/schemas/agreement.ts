import { z } from "zod";

const cents = z
    .string()
    .regex(/^\d+$/, "Ongeldig bedrag")
    .nullable()
    .optional();

const movableSchema = z.object({
    description: z.string().trim().min(1).max(200),
    valueCents: z.string().regex(/^\d+$/).default("0"),
});

export const agreementFormSchema = z.object({
    sellerCivilStatus: z.string().trim().min(1).max(80),
    sellerAddress: z.string().trim().min(1).max(300),
    sellerSpouseName: z.string().trim().max(120).nullable().optional(),
    buyerCivilStatus: z.string().trim().min(1).max(80),
    buyerAddress: z.string().trim().min(1).max(300),
    buyerSpouseName: z.string().trim().max(120).nullable().optional(),
    kadastraleOmschrijving: z.string().trim().max(300).nullable().optional(),
    movables: z.array(movableSchema).max(25).default([]),
    // De verkoper bepaalt alleen of zekerheid vereist is; de koper kiest de
    // vorm (waarborgsom of bankgarantie) na ondertekening (Art 7:26 lid 4 BW).
    securityType: z.enum(["NONE", "REQUIRED"]),
    securityAmountCents: cents,
    securityDueDate: z.coerce.date().nullable().optional(),
    financingCondition: z.boolean(),
    financingTermWeeks: z.coerce.number().int().min(1).max(26).default(6),
    inspectionCondition: z.boolean(),
    inspectionTermDays: z.coerce.number().int().min(1).max(60).default(14),
    inspectionCostCapCents: cents,
    nhgCondition: z.boolean(),
    nhgTermWeeks: z.coerce.number().int().min(1).max(26).default(8),
    foundationCondition: z.boolean(),
    foundationTermWeeks: z.coerce.number().int().min(1).max(26).default(4),
    transferDate: z.coerce.date(),
    kadasterRegistration: z.boolean().default(true),
    buyerPaysCosts: z.boolean().default(true),
    coolingOffDays: z.coerce.number().int().min(3).max(14).default(3),
    additionalTerms: z.string().trim().max(3000).nullable().optional(),
});

export type AgreementFormData = z.infer<typeof agreementFormSchema>;
