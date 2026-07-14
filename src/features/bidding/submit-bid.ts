import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SubmitBidInput } from "@/lib/schemas/bid";

export class BidSubmissionError extends Error {
    constructor(
        readonly code: "LISTING_NOT_LIVE" | "OWN_LISTING" | "BID_WINDOW_CLOSED",
        message: string,
    ) {
        super(message);
        this.name = "BidSubmissionError";
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
    if (existing) return existing;

    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.listingId}))`;
        const listing = await tx.listing.findUnique({
            where: { id: input.listingId },
            select: { status: true, ownerId: true },
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

        const previous = await tx.bid.findFirst({
            where: { listingId: input.listingId },
            orderBy: { submittedAt: "desc" },
            select: { entryHash: true },
        });
        const submittedAt = new Date();
        const canonical = JSON.stringify({
            listingId: input.listingId,
            bidderUserId: input.bidderUserId,
            amountCents: input.bid.amountCents,
            currency: "EUR",
            resolutiveConditions: input.bid.resolutiveConditions,
            financingDeadline: input.bid.financingDeadline ?? null,
            transferDateRequested: input.bid.transferDateRequested ?? null,
            submittedAt: submittedAt.toISOString(),
        });
        const entryHash = createHash("sha256")
            .update(`${previous?.entryHash ?? "GENESIS"}:${canonical}`)
            .digest("hex");
        const sourceIpHash = input.sourceIp
            ? createHash("sha256")
                  .update(
                      `${process.env.IP_HASH_SALT ?? "development-only"}:${input.sourceIp}`,
                  )
                  .digest("hex")
            : null;

        return tx.bid.create({
            data: {
                listingId: input.listingId,
                bidderUserId: input.bidderUserId,
                idempotencyKey: input.bid.idempotencyKey,
                bidderPseudonym: input.bid.bidderPseudonym,
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
                        entryHash: createHash("sha256")
                            .update(
                                `GENESIS:${entryHash}:SUBMITTED:${submittedAt.toISOString()}`,
                            )
                            .digest("hex"),
                    },
                },
            },
        });
    });
}
