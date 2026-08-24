import { NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { listUserMessageThreads } from "@/features/messages/listing-messages-service";
import { getSeekerDashboard } from "@/features/seeker/seeker-service";
import { handleApiError } from "@/lib/api-response";

export async function GET() {
    try {
        const session = await requireEmailVerifiedUser();
        const [dashboard, messageThreads] = await Promise.all([
            getSeekerDashboard(session.user.id),
            listUserMessageThreads(session.user.id),
        ]);
        return NextResponse.json({
            data: { ...dashboard, messageThreads },
        });
    } catch (error) {
        return handleApiError(error, "SEEKER_DASHBOARD_FAILED");
    }
}
