import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    deleteOwnerViewingSlot,
    updateOwnerViewingSlot,
    ViewingError,
} from "@/features/viewings/viewing-service";
import { handleApiError } from "@/lib/api-response";
import { updateViewingSlotSchema } from "@/lib/schemas/viewing";

type Context = { params: Promise<{ listingId: string; slotId: string }> };

function viewingErrorResponse(error: ViewingError) {
    return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code.includes("NOT_FOUND") ? 404 : 409 },
    );
}

export async function PATCH(request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const params = await context.params;
        const listingId = z.string().uuid().parse(params.listingId);
        const slotId = z.string().uuid().parse(params.slotId);
        const input = updateViewingSlotSchema.parse(await request.json());
        const data = await updateOwnerViewingSlot(
            session.user.id,
            listingId,
            slotId,
            input,
        );
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof ViewingError) return viewingErrorResponse(error);
        return handleApiError(error, "VIEWING_SLOT_UPDATE_FAILED");
    }
}

export async function DELETE(_request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const params = await context.params;
        const listingId = z.string().uuid().parse(params.listingId);
        const slotId = z.string().uuid().parse(params.slotId);
        await deleteOwnerViewingSlot(session.user.id, listingId, slotId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        if (error instanceof ViewingError) return viewingErrorResponse(error);
        return handleApiError(error, "VIEWING_SLOT_DELETE_FAILED");
    }
}
