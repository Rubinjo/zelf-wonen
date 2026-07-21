import { NextRequest, NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { notificationPreferenceSchema } from "@/lib/schemas/seeker";

export async function PATCH(request: NextRequest) {
    try {
        const session = await requireEmailVerifiedUser();
        const input = notificationPreferenceSchema.parse(await request.json());
        const preferences = await db.notificationPreference.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...input },
            update: input,
        });
        return NextResponse.json({ data: preferences });
    } catch (error) {
        return handleApiError(error, "PREFERENCES_UPDATE_FAILED");
    }
}
