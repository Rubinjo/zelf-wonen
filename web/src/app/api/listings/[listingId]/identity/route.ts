import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { identityProvider, latestVerifiedIdentity } from "@/features/identity/identity-service";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-response";

export async function GET(_request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z.uuid().parse((await context.params).listingId);
        const listing = await db.listing.findFirst({ where: { id: listingId, ownerId: session.user.id }, select: { id: true } });
        if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const verified = await latestVerifiedIdentity(session.user.id);
        const latest = await db.identityVerificationAttempt.findFirst({
            where: { userId: session.user.id, provider: identityProvider(), purpose: "LISTING_PUBLICATION" },
            orderBy: { requestedAt: "desc" }, select: { status: true },
        });
        return NextResponse.json({ data: { verified: Boolean(verified), verifiedAt: verified?.completedAt ?? null, expiresAt: verified?.expiresAt ?? null, status: latest?.status ?? null } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return handleApiError(error, "IDENTITY_STATUS_FAILED");
    }
}
