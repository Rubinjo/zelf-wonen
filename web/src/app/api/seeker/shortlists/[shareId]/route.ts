import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ shareId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const shareId = z
            .string()
            .uuid()
            .parse((await context.params).shareId);
        await db.shortlistShare.updateMany({
            where: { id: shareId, ownerId: session.user.id, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        return NextResponse.json({ data: { id: shareId } });
    } catch (error) {
        return handleApiError(error, "SHORTLIST_REVOKE_FAILED");
    }
}
