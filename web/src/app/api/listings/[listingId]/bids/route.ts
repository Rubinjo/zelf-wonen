import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import { mayDiscloseBidsToSeller } from "@/features/bidding/bid-confidentiality";
import { BidSubmissionError, submitBid } from "@/features/bidding/submit-bid";
import { submitBidSchema } from "@/lib/schemas/bid";
import { db } from "@/lib/db";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const { listingId } = await context.params;
        z.string().uuid().parse(listingId);
        const listing = await db.listing.findFirst({
            where: { id: listingId, ownerId: session.user.id },
            select: {
                id: true,
                biddingMethod: true,
                bidWindowClosesAt: true,
            },
        });
        if (!listing) {
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
        if (!mayDiscloseBidsToSeller(listing)) {
            return NextResponse.json(
                {
                    error: {
                        code: "BIDS_CONFIDENTIAL",
                        message:
                            "Bids remain confidential until the bidding window closes",
                    },
                },
                { status: 403 },
            );
        }
        const bids = await db.bid.findMany({
            where: { listingId },
            orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
            include: { events: { orderBy: { occurredAt: "asc" } } },
        });
        return NextResponse.json({
            data: bids.map((bid) => ({
                id: bid.id,
                bidderPseudonym: bid.bidderPseudonym,
                amountCents: bid.amountCents.toString(),
                resolutiveConditions: bid.resolutiveConditions,
                financingDeadline: bid.financingDeadline?.toISOString() ?? null,
                transferDateRequested:
                    bid.transferDateRequested?.toISOString() ?? null,
                submittedAt: bid.submittedAt.toISOString(),
                entryHash: bid.entryHash,
                events: bid.events.map((event) => ({
                    id: event.id,
                    type: event.type,
                    reason: event.reason,
                    occurredAt: event.occurredAt.toISOString(),
                    entryHash: event.entryHash,
                })),
            })),
        });
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
        return NextResponse.json(
            {
                error: {
                    code: "BID_LOG_UNAVAILABLE",
                    message: "The bid log could not be loaded",
                },
            },
            { status: 500 },
        );
    }
}

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
