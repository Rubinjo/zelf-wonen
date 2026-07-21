import { NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { getSeekerDashboard } from "@/features/seeker/seeker-service";
import { handleApiError } from "@/lib/api-response";

export async function GET() {
    try {
        const session = await requireEmailVerifiedUser();
        const dashboard = await getSeekerDashboard(session.user.id);
        return NextResponse.json({ data: dashboard });
    } catch (error) {
        return handleApiError(error, "SEEKER_DASHBOARD_FAILED");
    }
}
