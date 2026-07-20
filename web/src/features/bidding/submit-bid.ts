import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
    canonicalJson,
    computeBidEntryHash,
    computeBidEventEntryHash,
    verifyAndOrderBidChain,
} from "@/features/bidding/bid-integrity";
import { db } from "@/lib/db";
import type { SubmitBidInput } from "@/lib/schemas/bid";

export class BidSubmissionError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_LIVE"
            | "OWN_LISTING"
            | "VIEWING_NOT_CONFIRMED"
            | "BID_WINDOW_CLOSED"
            | "BID_TOO_LOW"
            | "BID_INCREMENT_INVALID"
            | "BID_ALREADY_SUBMITTED"
            | "CONDITIONS_NOT_ALLOWED"
            | "IDEMPOTENCY_CONFLICT"
            | "CHAIN_INVALID",
        message: string,
    ) {
        super(message);
        this.name = "BidSubmissionError";
    }
}

function normalizedDate(value: string | null | undefined) {
    return value ? new Date(value).toISOString() : null;
}

function hasConditions(bid: SubmitBidInput) {
    return (
        bid.resolutiveConditions.financing ||
        bid.resolutiveConditions.buildingInspection ||
        bid.resolutiveConditions.saleOfCurrentHome ||
        bid.resolutiveConditions.additionalConditions.length > 0 ||
        Boolean(bid.financingDeadline)
    );
}

function assertIdempotentMatch(
    existing: {
        listingId: string;
        bidderUserId: string | null;
        amountCents: bigint;
        resolutiveConditions: unknown;
        financingDeadline: Date | null;
        transferDateRequested: Date | null;
    },
    input: {
        listingId: string;
        bidderUserId: string;
        bid: SubmitBidInput;
    },
) {
    const matches =
        existing.listingId === input.listingId &&
        existing.bidderUserId === input.bidderUserId &&
        existing.amountCents.toString() === input.bid.amountCents &&
        canonicalJson(existing.resolutiveConditions) ===
            canonicalJson(input.bid.resolutiveConditions) &&
        existing.financingDeadline?.toISOString() ===
            (normalizedDate(input.bid.financingDeadline) ?? undefined) &&
        existing.transferDateRequested?.toISOString() ===
            (normalizedDate(input.bid.transferDateRequested) ?? undefined);
    if (!matches) {
        throw new BidSubmissionError(
            "IDEMPOTENCY_CONFLICT",
            "This idempotency key was already used for another bid request",
        );
    }
}

export async function submitBid(input: {
    listingId: string;
    bidderUserId: string;
    bid: SubmitBidInput;
    sourceIp: string | null;
}) {
    const existing = await db.bid.findUnique({
        where: { idempotencyKey: input.bid.idempotencyKey },
    });
    if (existing) {
        assertIdempotentMatch(existing, input);
        return existing;
    }

    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.listingId}))`;
        const listing = await tx.listing.findUnique({
            where: { id: input.listingId },
            select: {
                status: true,
                ownerId: true,
                biddingMethod: true,
                minimumBidCents: true,
                bidIncrementCents: true,
                allowBidConditions: true,
                bidWindowOpensAt: true,
                bidWindowClosesAt: true,
            },
        });
        if (!listing || listing.status !== "LIVE") {
            throw new BidSubmissionError(
                "LISTING_NOT_LIVE",
                "This listing is not accepting bids",
            );
        }
        if (listing.ownerId === input.bidderUserId) {
            throw new BidSubmissionError(
                "OWN_LISTING",
                "Owners cannot bid on their own listing",
            );
        }
        const confirmedViewing = await tx.viewingBooking.findFirst({
            where: {
                userId: input.bidderUserId,
                attendanceStatus: "CONFIRMED",
                slot: { listingId: input.listingId },
            },
            select: { id: true },
        });
        if (!confirmedViewing) {
            throw new BidSubmissionError(
                "VIEWING_NOT_CONFIRMED",
                "The owner must confirm that your viewing took place before you can bid",
            );
        }
        const now = new Date();
        if (
            (listing.bidWindowOpensAt && listing.bidWindowOpensAt > now) ||
            (listing.bidWindowClosesAt && listing.bidWindowClosesAt <= now)
        ) {
            throw new BidSubmissionError(
                "BID_WINDOW_CLOSED",
                "The bidding window is not open",
            );
        }
        if (!listing.allowBidConditions && hasConditions(input.bid)) {
            throw new BidSubmissionError(
                "CONDITIONS_NOT_ALLOWED",
                "This listing only accepts bids without conditions",
            );
        }

        const amountCents = BigInt(input.bid.amountCents);
        if (
            listing.minimumBidCents !== null &&
            amountCents < listing.minimumBidCents
        ) {
            throw new BidSubmissionError(
                "BID_TOO_LOW",
                `The minimum bid is ${listing.minimumBidCents.toString()} cents`,
            );
        }
        if (listing.biddingMethod === "SEALED") {
            const previousBid = await tx.bid.findFirst({
                where: {
                    listingId: input.listingId,
                    bidderUserId: input.bidderUserId,
                },
                select: { id: true },
            });
            if (previousBid) {
                throw new BidSubmissionError(
                    "BID_ALREADY_SUBMITTED",
                    "You can submit only one bid for this sealed bidding round",
                );
            }
        }
        if (listing.biddingMethod === "OPEN") {
            const highestBid = await tx.bid.aggregate({
                where: { listingId: input.listingId },
                _max: { amountCents: true },
            });
            if (highestBid._max.amountCents !== null) {
                const increment = listing.bidIncrementCents ?? BigInt(1);
                if (amountCents < highestBid._max.amountCents + increment) {
                    throw new BidSubmissionError(
                        "BID_INCREMENT_INVALID",
                        `The next bid must be at least ${(highestBid._max.amountCents + increment).toString()} cents`,
                    );
                }
            }
        }

        const concurrentExisting = await tx.bid.findUnique({
            where: { idempotencyKey: input.bid.idempotencyKey },
        });
        if (concurrentExisting) {
            assertIdempotentMatch(concurrentExisting, input);
            return concurrentExisting;
        }

        const existingChain = await tx.bid.findMany({
            where: { listingId: input.listingId },
            select: {
                listingId: true,
                bidderPseudonym: true,
                amountCents: true,
                currency: true,
                resolutiveConditions: true,
                financingDeadline: true,
                transferDateRequested: true,
                submittedAt: true,
                entryHash: true,
                previousHash: true,
            },
        });
        const orderedChain = verifyAndOrderBidChain(
            existingChain.map((bid) => ({
                ...bid,
                amountCents: bid.amountCents.toString(),
                financingDeadline: bid.financingDeadline?.toISOString() ?? null,
                transferDateRequested:
                    bid.transferDateRequested?.toISOString() ?? null,
                submittedAt: bid.submittedAt.toISOString(),
            })),
        );
        if (!orderedChain) {
            throw new BidSubmissionError(
                "CHAIN_INVALID",
                "The existing bid chain failed its integrity check",
            );
        }
        const previous = orderedChain.at(-1) ?? null;
        const submittedAt = new Date();
        const bidId = randomUUID();
        const bidderPseudonym = `Bieder ${createHash("sha256")
            .update(`${input.listingId}:${input.bidderUserId}`)
            .digest("hex")
            .slice(0, 8)
            .toUpperCase()}`;
        const entryHash = computeBidEntryHash(previous?.entryHash ?? null, {
            listingId: input.listingId,
            bidderPseudonym,
            amountCents: input.bid.amountCents,
            currency: "EUR",
            resolutiveConditions: input.bid.resolutiveConditions,
            financingDeadline: normalizedDate(input.bid.financingDeadline),
            transferDateRequested: normalizedDate(
                input.bid.transferDateRequested,
            ),
            submittedAt: submittedAt.toISOString(),
        });
        const sourceIpHash = input.sourceIp
            ? createHash("sha256")
                  .update(
                      `${process.env.IP_HASH_SALT ?? "development-only"}:${input.sourceIp}`,
                  )
                  .digest("hex")
            : null;

        return tx.bid.create({
            data: {
                id: bidId,
                listingId: input.listingId,
                bidderUserId: input.bidderUserId,
                idempotencyKey: input.bid.idempotencyKey,
                bidderPseudonym,
                amountCents: BigInt(input.bid.amountCents),
                resolutiveConditions: input.bid
                    .resolutiveConditions as Prisma.InputJsonValue,
                financingDeadline: input.bid.financingDeadline
                    ? new Date(input.bid.financingDeadline)
                    : null,
                transferDateRequested: input.bid.transferDateRequested
                    ? new Date(input.bid.transferDateRequested)
                    : null,
                submittedAt,
                sourceIpHash,
                previousHash: previous?.entryHash,
                entryHash,
                events: {
                    create: {
                        type: "SUBMITTED",
                        occurredAt: submittedAt,
                        entryHash: computeBidEventEntryHash(null, {
                            bidId,
                            bidEntryHash: entryHash,
                            type: "SUBMITTED",
                            reason: null,
                            occurredAt: submittedAt.toISOString(),
                        }),
                    },
                },
            },
        });
    });
}
