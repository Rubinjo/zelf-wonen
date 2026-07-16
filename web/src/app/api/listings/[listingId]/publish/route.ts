import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import {
    PublicationGateError,
    publishListing,
} from "@/features/listings/publish-listing";
import { publishListingSchema } from "@/lib/schemas/listing";

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const { listingId } = await context.params;
        z.string().uuid().parse(listingId);
        const input = publishListingSchema.parse(await request.json());
        const data = await publishListing(listingId, session.user.id, input);
        return NextResponse.json({ data }, { status: 202 });
    } catch (error) {
        if (error instanceof AuthenticationError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                {
                    status:
                        error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403,
                },
            );
        }
        if (error instanceof PublicationGateError) {
            const status = {
                LISTING_NOT_FOUND: 404,
                LISTING_NOT_READY: 422,
                IDIN_VERIFICATION_REQUIRED: 428,
                PACKAGE_PAYMENT_REQUIRED: 402,
                IDEMPOTENCY_CONFLICT: 409,
            }[error.code];
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status },
            );
        }
        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_PUBLICATION_REQUEST",
                        message: "Invalid publication request",
                    },
                },
                { status: 400 },
            );
        }
        console.error("Listing publication failed", error);
        return NextResponse.json(
            {
                error: {
                    code: "PUBLICATION_FAILED",
                    message: "Publication provider is unavailable",
                },
            },
            { status: 503 },
        );
    }
}
