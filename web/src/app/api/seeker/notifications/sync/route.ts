import { NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { syncSeekerNotifications } from "@/features/seeker/seeker-service";
import { handleApiError } from "@/lib/api-response";

export async function POST() {
    try {
        const session = await requireEmailVerifiedUser();
        await syncSeekerNotifications(session.user.id);
        return NextResponse.json({ data: { synced: true } });
    } catch (error) {
        return handleApiError(error, "NOTIFICATION_SYNC_FAILED");
    }
}
