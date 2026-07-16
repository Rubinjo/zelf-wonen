import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    archiveOwnerListing,
    getOwnerListing,
    ListingMutationError,
    updateOwnerListing,
} from "@/features/listings/listing-service";
import { handleApiError } from "@/lib/api-response";
import { updateListingSchema } from "@/lib/schemas/listing";

type Context = { params: Promise<{ listingId: string }> };

function mutationError(error: ListingMutationError) {
    return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "LISTING_NOT_FOUND" ? 404 : 409 },
    );
}

export async function GET(_request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const data = await getOwnerListing(session.user.id, listingId);
        if (!data) {
            return NextResponse.json(
                {
                    error: {
                        code: "LISTING_NOT_FOUND",
                        message: "Listing not found",
                    },
                },
                { status: 404 },
            );
        }
        return NextResponse.json({ data });
    } catch (error) {
        return handleApiError(error, "LISTING_UNAVAILABLE");
    }
}

export async function PATCH(request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const input = updateListingSchema.parse(await request.json());
        const data = await updateOwnerListing(
            session.user.id,
            listingId,
            input,
        );
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof ListingMutationError) return mutationError(error);
        return handleApiError(error, "LISTING_UPDATE_FAILED");
    }
}

export async function DELETE(_request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        await archiveOwnerListing(session.user.id, listingId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        if (error instanceof ListingMutationError) return mutationError(error);
        return handleApiError(error, "LISTING_ARCHIVE_FAILED");
    }
}
