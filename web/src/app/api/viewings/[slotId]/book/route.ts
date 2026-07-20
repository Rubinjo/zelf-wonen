import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    bookViewingSlot,
    ViewingError,
} from "@/features/viewings/viewing-service";
import { handleApiError } from "@/lib/api-response";

type Context = { params: Promise<{ slotId: string }> };

export async function POST(_request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const slotId = z
            .string()
            .uuid()
            .parse((await context.params).slotId);
        const data = await bookViewingSlot(session.user.id, slotId);
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        if (error instanceof ViewingError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "SLOT_NOT_FOUND" ? 404 : 409 },
            );
        }
        return handleApiError(error, "VIEWING_BOOKING_FAILED");
    }
}
