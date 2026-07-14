import { z } from "zod";

export const resolutiveConditionsSchema = z.object({
    financing: z.boolean(),
    financingAmountCents: z.string().regex(/^\d+$/).optional(),
    buildingInspection: z.boolean(),
    inspectionLimitCents: z.string().regex(/^\d+$/).optional(),
    saleOfCurrentHome: z.boolean(),
    additionalConditions: z.array(z.string().trim().min(1).max(500)).max(10),
});

export const submitBidSchema = z.object({
    amountCents: z.string().regex(/^[1-9]\d*$/),
    resolutiveConditions: resolutiveConditionsSchema,
    financingDeadline: z.string().datetime().optional(),
    transferDateRequested: z.string().datetime().optional(),
    bidderPseudonym: z.string().trim().min(3).max(80),
    idempotencyKey: z.string().uuid(),
});

export type SubmitBidInput = z.infer<typeof submitBidSchema>;
