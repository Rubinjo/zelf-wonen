import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    generateBidLogbook,
    LogbookError,
} from "@/features/bidding/logbook-service";
import { handleApiError } from "@/lib/api-response";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const result = await generateBidLogbook(listingId, session.user.id);
        return new NextResponse(Buffer.from(result.bytes), {
            headers: {
                "content-type": "application/pdf",
                "content-disposition": `attachment; filename="${result.fileName}"`,
                "cache-control": "private, no-store",
                "x-document-sha256": result.documentSha256,
            },
        });
    } catch (error) {
        if (error instanceof LogbookError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "LISTING_NOT_FOUND" ? 404 : 409 },
            );
        }
        return handleApiError(error, "LOGBOOK_GENERATION_FAILED");
    }
}
