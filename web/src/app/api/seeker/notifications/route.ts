import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

const readSchema = z
    .object({
        notificationId: z.string().uuid().optional(),
        all: z.boolean().optional(),
    })
    .refine((value) => value.notificationId || value.all);
export async function PATCH(request: NextRequest) {
    try {
        const session = await requireEmailVerifiedUser();
        const input = readSchema.parse(await request.json());
        await db.seekerNotification.updateMany({
            where: {
                userId: session.user.id,
                readAt: null,
                ...(input.notificationId ? { id: input.notificationId } : {}),
            },
            data: { readAt: new Date() },
        });
        return NextResponse.json({ data: { updated: true } });
    } catch (error) {
        return handleApiError(error, "NOTIFICATION_UPDATE_FAILED");
    }
}
