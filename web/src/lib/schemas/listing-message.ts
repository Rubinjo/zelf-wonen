import { z } from "zod";

export const listingMessageInputSchema = z.object({
    body: z.string().trim().min(1).max(4000),
    // Alleen de eigenaar stuurt dit mee: de woningzoeker waarop hij antwoordt.
    seekerUserId: z.string().uuid().optional(),
});
