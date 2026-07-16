import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    computeBidEventEntryHash,
    verifyAndOrderBidChain,
    verifyAndOrderBidEventChain,
} from "@/features/bidding/bid-integrity";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

const decisionSchema = z.object({
    decision: z.enum(["ACCEPTED", "REJECTED"]),
    reason: z.string().trim().max(500).optional(),
});

class BidDecisionError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_DECIDABLE"
            | "BID_ALREADY_ACCEPTED"
            | "CHAIN_INVALID",
    ) {
        super(
            code === "BID_ALREADY_ACCEPTED"
                ? "Another bid has already been accepted"
                : code === "CHAIN_INVALID"
                  ? "The bid event chain failed its integrity check"
                  : "This listing no longer accepts bid decisions",
        );
        this.name = "BidDecisionError";
    }
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ listingId: string; bidId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const params = await context.params;
        const listingId = z.string().uuid().parse(params.listingId);
        const bidId = z.string().uuid().parse(params.bidId);
        const input = decisionSchema.parse(await request.json());
        const result = await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
            const listing = await tx.listing.findFirst({
                where: { id: listingId, ownerId: session.user.id },
                select: { status: true },
            });
            if (!listing) return null;
            if (!["LIVE", "UNDER_OFFER"].includes(listing.status)) {
                throw new BidDecisionError("LISTING_NOT_DECIDABLE");
            }
            const bid = await tx.bid.findFirst({
                where: {
                    id: bidId,
                    listingId,
                },
                include: {
                    events: true,
                },
            });
            if (!bid) return null;
            const listingBids = await tx.bid.findMany({
                where: { listingId },
            });
            const verifiedBids = verifyAndOrderBidChain(
                listingBids.map((item) => ({
                    ...item,
                    amountCents: item.amountCents.toString(),
                    financingDeadline:
                        item.financingDeadline?.toISOString() ?? null,
                    transferDateRequested:
                        item.transferDateRequested?.toISOString() ?? null,
                    submittedAt: item.submittedAt.toISOString(),
                })),
            );
            const orderedEvents = verifyAndOrderBidEventChain(
                bid.events.map((event) => ({
                    ...event,
                    occurredAt: event.occurredAt.toISOString(),
                })),
                bid.entryHash,
            );
            if (!orderedEvents || orderedEvents[0]?.type !== "SUBMITTED") {
                throw new BidDecisionError("CHAIN_INVALID");
            }
            if (!verifiedBids) {
                throw new BidDecisionError("CHAIN_INVALID");
            }
            if (
                orderedEvents.some((event) =>
                    ["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(event.type),
                )
            ) {
                return {
                    alreadyDecided: true,
                    event: orderedEvents.at(-1),
                };
            }
            if (input.decision === "ACCEPTED") {
                const accepted = await tx.bidEvent.findFirst({
                    where: {
                        type: "ACCEPTED",
                        bid: { listingId },
                    },
                    select: { id: true },
                });
                if (listing.status !== "LIVE" || accepted) {
                    throw new BidDecisionError("BID_ALREADY_ACCEPTED");
                }
            }
            const occurredAt = new Date();
            const previousHash = orderedEvents.at(-1)?.entryHash ?? null;
            const entryHash = computeBidEventEntryHash(previousHash, {
                bidId: bid.id,
                bidEntryHash: bid.entryHash,
                type: input.decision,
                reason: input.reason ?? null,
                occurredAt: occurredAt.toISOString(),
            });
            const event = await tx.bidEvent.create({
                data: {
                    bidId: bid.id,
                    type: input.decision,
                    reason: input.reason,
                    occurredAt,
                    previousHash,
                    entryHash,
                },
            });
            if (input.decision === "ACCEPTED") {
                await tx.listing.update({
                    where: { id: listingId },
                    data: { status: "UNDER_OFFER", version: { increment: 1 } },
                });
            }
            return { alreadyDecided: false, event };
        });
        if (!result) {
            return NextResponse.json(
                { error: { code: "BID_NOT_FOUND", message: "Bid not found" } },
                { status: 404 },
            );
        }
        return NextResponse.json({ data: result });
    } catch (error) {
        if (error instanceof BidDecisionError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: 409 },
            );
        }
        return handleApiError(error, "BID_DECISION_FAILED");
    }
}
