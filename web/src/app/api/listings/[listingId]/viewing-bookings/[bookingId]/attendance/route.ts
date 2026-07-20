import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    reviewViewingAttendance,
    ViewingError,
} from "@/features/viewings/viewing-service";
import { handleApiError } from "@/lib/api-response";

type Context = {
    params: Promise<{ listingId: string; bookingId: string }>;
};

const attendanceSchema = z.object({
    attendanceStatus: z.enum(["CONFIRMED", "NO_SHOW"]),
});

export async function PATCH(request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const params = await context.params;
        const listingId = z.string().uuid().parse(params.listingId);
        const bookingId = z.string().uuid().parse(params.bookingId);
        const { attendanceStatus } = attendanceSchema.parse(
            await request.json(),
        );
        const data = await reviewViewingAttendance(
            session.user.id,
            listingId,
            bookingId,
            attendanceStatus,
        );
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof ViewingError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                {
                    status: error.code === "BOOKING_NOT_FOUND" ? 404 : 409,
                },
            );
        }
        return handleApiError(error, "VIEWING_ATTENDANCE_UPDATE_FAILED");
    }
}
