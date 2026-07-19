import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    ListingMutationError,
    validateOwnerListing,
} from "@/features/listings/listing-service";
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
        const data = await validateOwnerListing(session.user.id, listingId);
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof ListingMutationError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "LISTING_NOT_FOUND" ? 404 : 409 },
            );
        }
        return handleApiError(error, "LISTING_VALIDATION_FAILED");
    }
}
