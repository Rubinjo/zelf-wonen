import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    IdinVerificationError,
    startIdinVerification,
} from "@/features/identity/idin-service";
import { handleApiError } from "@/lib/api-response";

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const body = z
            .object({ locale: z.enum(["nl", "en"]).default("nl") })
            .parse(await request.json().catch(() => ({})));
        const data = await startIdinVerification({
            listingId,
            userId: session.user.id,
            locale: body.locale,
        });
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof IdinVerificationError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                {
                    status:
                        error.code === "LISTING_NOT_FOUND"
                            ? 404
                            : error.code === "PROVIDER_UNAVAILABLE"
                              ? 503
                              : 409,
                },
            );
        }
        return handleApiError(error, "IDIN_START_FAILED");
    }
}
