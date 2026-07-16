import { z } from "zod";

const maxBigInt = BigInt("9223372036854775807");
const nonnegativeCentsSchema = z
    .string()
    .regex(/^\d+$/)
    .refine(
        (value) => /^\d+$/.test(value) && BigInt(value) <= maxBigInt,
        "Amount is too large",
    );
const positiveCentsSchema = z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine(
        (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= maxBigInt,
        "Amount is too large",
    );

export const resolutiveConditionsSchema = z.object({
    financing: z.boolean(),
    financingAmountCents: nonnegativeCentsSchema.optional(),
    buildingInspection: z.boolean(),
    inspectionLimitCents: nonnegativeCentsSchema.optional(),
    saleOfCurrentHome: z.boolean(),
    additionalConditions: z.array(z.string().trim().min(1).max(500)).max(10),
});

export const submitBidSchema = z.object({
    amountCents: positiveCentsSchema,
    resolutiveConditions: resolutiveConditionsSchema,
    financingDeadline: z.string().datetime().optional(),
    transferDateRequested: z.string().datetime().optional(),
    idempotencyKey: z.string().uuid(),
});

export type SubmitBidInput = z.infer<typeof submitBidSchema>;
