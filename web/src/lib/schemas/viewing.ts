import { z } from "zod";

const viewingPeriodSchema = z
    .object({
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
    })
    .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
        message: "De eindtijd moet na de starttijd liggen",
        path: ["endsAt"],
    });

export const createViewingSlotSchema = viewingPeriodSchema.and(
    z.discriminatedUnion("type", [
        z.object({ type: z.literal("APPOINTMENT"), capacity: z.literal(1) }),
        z.object({
            type: z.literal("OPEN_HOUSE"),
            capacity: z.number().int().min(1).max(100),
        }),
    ]),
);

export const updateViewingSlotSchema = createViewingSlotSchema;

export type ViewingSlotInput = z.infer<typeof createViewingSlotSchema>;
