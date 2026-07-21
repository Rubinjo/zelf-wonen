import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { shortlistInputSchema } from "@/lib/schemas/seeker";

export async function POST(request: NextRequest) {
    try {
        const session = await requireEmailVerifiedUser();
        const input = shortlistInputSchema.parse(await request.json());
        const favorites = await db.favoriteListing.findMany({
            where: {
                userId: session.user.id,
                listingId: { in: [...new Set(input.listingIds)] },
            },
            select: { listingId: true, note: true },
        });
        if (!favorites.length)
            return NextResponse.json(
                {
                    error: {
                        code: "SHORTLIST_EMPTY",
                        message: "Selecteer minimaal één favoriet",
                    },
                },
                { status: 400 },
            );
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const share = await db.shortlistShare.create({
            data: {
                ownerId: session.user.id,
                label: input.label,
                tokenHash,
                expiresAt: new Date(
                    Date.now() + input.expiresInDays * 86_400_000,
                ),
                items: {
                    create: favorites.map((item, index) => ({
                        listingId: item.listingId,
                        note: input.includeNotes ? item.note : null,
                        sortOrder: index,
                    })),
                },
            },
        });
        return NextResponse.json(
            { data: { id: share.id, token, expiresAt: share.expiresAt } },
            { status: 201 },
        );
    } catch (error) {
        return handleApiError(error, "SHORTLIST_CREATE_FAILED");
    }
}
