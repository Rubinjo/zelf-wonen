import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { startDiditVerification } from "@/features/identity/didit-service";
import { DiditError } from "@/lib/integrations/identity/didit-client";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z.uuid().parse((await context.params).listingId);
        const body = z.object({ locale: z.enum(["nl", "en"]).default("nl") }).parse(await request.json());
        const data = await startDiditVerification({ listingId, userId: session.user.id, locale: body.locale });
        return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        if (error instanceof DiditError) {
            return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
        }
        return handleApiError(error, "IDENTITY_START_FAILED");
    }
}
