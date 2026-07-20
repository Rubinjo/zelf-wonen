import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    createOwnerViewingSlot,
    listOwnerViewingSlots,
    ViewingError,
} from "@/features/viewings/viewing-service";
import { handleApiError } from "@/lib/api-response";
import { createViewingSlotSchema } from "@/lib/schemas/viewing";

type Context = { params: Promise<{ listingId: string }> };

function viewingErrorResponse(error: ViewingError) {
    return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "LISTING_NOT_FOUND" ? 404 : 409 },
    );
}

export async function GET(_request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const data = await listOwnerViewingSlots(session.user.id, listingId);
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof ViewingError) return viewingErrorResponse(error);
        return handleApiError(error, "VIEWING_SLOTS_UNAVAILABLE");
    }
}

export async function POST(request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const input = createViewingSlotSchema.parse(await request.json());
        const data = await createOwnerViewingSlot(
            session.user.id,
            listingId,
            input,
        );
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        if (error instanceof ViewingError) return viewingErrorResponse(error);
        return handleApiError(error, "VIEWING_SLOT_CREATE_FAILED");
    }
}
