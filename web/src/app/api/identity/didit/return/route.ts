import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { applyDiditResult } from "@/features/identity/didit-service";
import { retrieveDiditSession } from "@/lib/integrations/identity/didit-client";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    try {
        const session = await requireEmailVerifiedUser();
        const id = z.uuid().parse(request.nextUrl.searchParams.get("attempt"));
        let attempt = await db.identityVerificationAttempt.findFirst({
            where: { id, userId: session.user.id, provider: { in: ["DIDIT", "DIDIT_SANDBOX"] }, purpose: "LISTING_PUBLICATION" },
        });
        if (!attempt?.listingId) throw new Error("Unknown attempt");
        // Browser query parameters never determine verification status.
        if (["INITIATED", "PENDING"].includes(attempt.status) && z.uuid().safeParse(attempt.providerReference).success) {
            try {
                const decision = await retrieveDiditSession(attempt.providerReference);
                if (decision.vendor_data === attempt.id) attempt = await applyDiditResult(decision);
            } catch {
                // A delayed webhook can finish the attempt; keep the user in a pending state.
            }
        }
        const redirect = new URL(`/dashboard/listings/${attempt.listingId}`, appUrl);
        redirect.searchParams.set("verification", attempt.status.toLowerCase());
        return NextResponse.redirect(redirect);
    } catch {
        return NextResponse.redirect(new URL("/dashboard", appUrl));
    }
}
