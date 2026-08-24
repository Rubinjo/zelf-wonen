import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    ListingMessageError,
    markListingMessagesRead,
} from "@/features/messages/listing-messages-service";
import { handleApiError } from "@/lib/api-response";

export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const marked = await markListingMessagesRead(
            listingId,
            session.user.id,
        );
        return NextResponse.json({ data: { marked } });
    } catch (error) {
        if (error instanceof ListingMessageError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: 404 },
            );
        return handleApiError(error, "LISTING_MESSAGES_READ_FAILED");
    }
}
