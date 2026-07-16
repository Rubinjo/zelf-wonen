import { NextRequest, NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    createOwnerListing,
    listOwnerListings,
} from "@/features/listings/listing-service";
import { handleApiError } from "@/lib/api-response";
import { createListingSchema } from "@/lib/schemas/listing";

export async function GET() {
    try {
        const session = await requireEmailVerifiedUser();
        const data = await listOwnerListings(session.user.id);
        return NextResponse.json({ data });
    } catch (error) {
        return handleApiError(error, "LISTINGS_UNAVAILABLE");
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireEmailVerifiedUser();
        const input = createListingSchema.parse(await request.json());
        const data = await createOwnerListing(session.user.id, input);
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        return handleApiError(error, "LISTING_CREATION_FAILED");
    }
}
