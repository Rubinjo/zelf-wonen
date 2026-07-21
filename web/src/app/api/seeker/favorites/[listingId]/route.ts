import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { favoriteNoteSchema } from "@/lib/schemas/seeker";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const input = favoriteNoteSchema.parse(await request.json());
        const result = await db.favoriteListing.updateMany({
            where: { userId: session.user.id, listingId },
            data: { note: input.note || null },
        });
        if (!result.count)
            return NextResponse.json(
                {
                    error: {
                        code: "FAVORITE_NOT_FOUND",
                        message: "Favoriet niet gevonden",
                    },
                },
                { status: 404 },
            );
        return NextResponse.json({ data: { listingId, note: input.note } });
    } catch (error) {
        return handleApiError(error, "FAVORITE_UPDATE_FAILED");
    }
}

export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        await db.favoriteListing.deleteMany({
            where: { userId: session.user.id, listingId },
        });
        return NextResponse.json({ data: { listingId } });
    } catch (error) {
        return handleApiError(error, "FAVORITE_DELETE_FAILED");
    }
}
