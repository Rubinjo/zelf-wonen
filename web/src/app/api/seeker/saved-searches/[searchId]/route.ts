import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

const patchSchema = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    notificationsEnabled: z.boolean().optional(),
});

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ searchId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const searchId = z
            .string()
            .uuid()
            .parse((await context.params).searchId);
        const input = patchSchema.parse(await request.json());
        const result = await db.savedSearch.updateMany({
            where: { id: searchId, userId: session.user.id },
            data: input,
        });
        if (!result.count)
            return NextResponse.json(
                {
                    error: {
                        code: "SEARCH_NOT_FOUND",
                        message: "Zoekopdracht niet gevonden",
                    },
                },
                { status: 404 },
            );
        return NextResponse.json({ data: { id: searchId } });
    } catch (error) {
        return handleApiError(error, "SAVED_SEARCH_UPDATE_FAILED");
    }
}
export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ searchId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const searchId = z
            .string()
            .uuid()
            .parse((await context.params).searchId);
        await db.savedSearch.deleteMany({
            where: { id: searchId, userId: session.user.id },
        });
        return NextResponse.json({ data: { id: searchId } });
    } catch (error) {
        return handleApiError(error, "SAVED_SEARCH_DELETE_FAILED");
    }
}
