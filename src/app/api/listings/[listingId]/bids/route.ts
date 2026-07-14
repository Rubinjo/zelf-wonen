import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import { BidSubmissionError, submitBid } from "@/features/bidding/submit-bid";
import { submitBidSchema } from "@/lib/schemas/bid";

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const { listingId } = await context.params;
        z.string().uuid().parse(listingId);
        const bid = submitBidSchema.parse(await request.json());
        const data = await submitBid({
            listingId,
            bidderUserId: session.user.id,
            bid,
            sourceIp:
                request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                null,
        });

        return NextResponse.json(
            {
                data: {
                    id: data.id,
                    listingId: data.listingId,
                    amountCents: data.amountCents.toString(),
                    submittedAt: data.submittedAt.toISOString(),
                    entryHash: data.entryHash,
                },
            },
            { status: 201 },
        );
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
        if (error instanceof BidSubmissionError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: 409 },
            );
        }
        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_BID",
                        message: "The bid or its conditions are invalid",
                        fieldErrors: error.flatten().fieldErrors,
                    },
                },
                { status: 400 },
            );
        }
        console.error("Bid submission failed", error);
        return NextResponse.json(
            {
                error: {
                    code: "BID_SUBMISSION_FAILED",
                    message: "The bid could not be recorded",
                },
            },
            { status: 503 },
        );
    }
}
