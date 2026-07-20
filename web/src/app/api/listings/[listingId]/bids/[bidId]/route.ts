import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { mayDiscloseBidsToSeller } from "@/features/bidding/bid-confidentiality";
import {
    computeBidEventEntryHash,
    verifyAndOrderBidChain,
    verifyAndOrderBidEventChain,
} from "@/features/bidding/bid-integrity";
import {
    appendTransactionEvent,
    canonicalJson,
    chainedHash,
} from "@/features/transactions/transaction-service";
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
            | "BIDS_CONFIDENTIAL"
            | "CHAIN_INVALID",
    ) {
        super(
            code === "BID_ALREADY_ACCEPTED"
                ? "Another bid has already been accepted"
                : code === "BIDS_CONFIDENTIAL"
                  ? "Bids cannot be decided before the bidding window closes"
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
                select: {
                    status: true,
                    biddingMethod: true,
                    bidWindowClosesAt: true,
                },
            });
            if (!listing) return null;
            if (!["LIVE", "UNDER_OFFER"].includes(listing.status)) {
                throw new BidDecisionError("LISTING_NOT_DECIDABLE");
            }
            if (!mayDiscloseBidsToSeller(listing)) {
                throw new BidDecisionError("BIDS_CONFIDENTIAL");
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
                const activeTransaction =
                    await tx.propertyTransaction.findFirst({
                        where: {
                            listingId,
                            status: { not: "CANCELLED" },
                        },
                        select: { id: true },
                    });
                if (listing.status !== "LIVE" || activeTransaction) {
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
                if (!bid.bidderUserId) {
                    throw new BidDecisionError("LISTING_NOT_DECIDABLE");
                }
                const passportSource = await tx.listing.findUniqueOrThrow({
                    where: { id: listingId },
                    include: {
                        property: { include: { energyLabels: true } },
                        media: {
                            where: { status: "READY" },
                            orderBy: { sortOrder: "asc" },
                        },
                        floorPlans: { orderBy: { sortOrder: "asc" } },
                    },
                });
                const snapshot = JSON.parse(
                    canonicalJson({
                        generatedAt: occurredAt.toISOString(),
                        listing: {
                            id: passportSource.id,
                            purpose: passportSource.purpose,
                            titleNl: passportSource.titleNl,
                            titleEn: passportSource.titleEn,
                            descriptionNl: passportSource.descriptionNl,
                            descriptionEn: passportSource.descriptionEn,
                            askingPriceCents:
                                passportSource.askingPriceCents?.toString() ??
                                null,
                            monthlyRentCents:
                                passportSource.monthlyRentCents?.toString() ??
                                null,
                            serviceCostsCents:
                                passportSource.serviceCostsCents?.toString() ??
                                null,
                            availableFrom:
                                passportSource.availableFrom?.toISOString() ??
                                null,
                            attributes: passportSource.attributes,
                        },
                        property: passportSource.property,
                        media: passportSource.media.map((item) => ({
                            id: item.id,
                            kind: item.kind,
                            sha256: item.sha256,
                            fileName: item.fileName,
                            mimeType: item.mimeType,
                            sizeBytes: item.sizeBytes.toString(),
                        })),
                        floorPlans: passportSource.floorPlans,
                    }),
                ) as Prisma.InputJsonValue;
                const completenessChecks = [
                    passportSource.titleNl,
                    passportSource.descriptionNl,
                    passportSource.property.livingAreaSqm,
                    passportSource.property.roomCount,
                    passportSource.property.constructionYear,
                    passportSource.property.energyLabels.length > 0,
                    passportSource.media.some((item) => item.kind === "PHOTO"),
                    passportSource.attributes,
                ];
                const completenessScore = Math.round(
                    (completenessChecks.filter(Boolean).length /
                        completenessChecks.length) *
                        100,
                );
                const previousPassport =
                    await tx.propertyPassportVersion.findFirst({
                        where: { listingId },
                        orderBy: { version: "desc" },
                        select: { version: true, entryHash: true },
                    });
                const passportVersion = (previousPassport?.version ?? 0) + 1;
                const passportPayload = {
                    listingId,
                    version: passportVersion,
                    listingVersionSource: passportSource.version,
                    completenessScore,
                    snapshot,
                    createdByUserId: session.user.id,
                    createdAt: occurredAt.toISOString(),
                };
                const passportHash = chainedHash(
                    previousPassport?.entryHash ?? null,
                    passportPayload,
                );
                await tx.propertyPassportVersion.create({
                    data: {
                        listingId,
                        version: passportVersion,
                        listingVersionSource: passportSource.version,
                        snapshot,
                        completenessScore,
                        previousHash: previousPassport?.entryHash,
                        entryHash: passportHash,
                        createdByUserId: session.user.id,
                        createdAt: occurredAt,
                    },
                });
                const transactionId = randomUUID();
                const isRental = passportSource.purpose === "RENT";
                const roomEventPayload = {
                    transactionId,
                    listingId,
                    acceptedBidId: bid.id,
                    sellerUserId: session.user.id,
                    buyerUserId: bid.bidderUserId,
                    occurredAt: occurredAt.toISOString(),
                };
                const transaction = await tx.propertyTransaction.create({
                    data: {
                        id: transactionId,
                        listingId,
                        acceptedBidId: bid.id,
                        sellerUserId: session.user.id,
                        buyerUserId: bid.bidderUserId,
                        status: "CONTRACT_PENDING",
                        purchasePriceCents: bid.amountCents,
                        targetTransferDate: bid.transferDateRequested,
                        milestones: {
                            create: [
                                {
                                    type: "PURCHASE_AGREEMENT",
                                    title: isRental
                                        ? "Huurovereenkomst"
                                        : "Koopovereenkomst",
                                    sortOrder: 1,
                                },
                                {
                                    type: "COOLING_OFF_PERIOD",
                                    title: "Wettelijke bedenktijd",
                                    status: isRental ? "WAIVED" : "NOT_STARTED",
                                    completedAt: isRental ? occurredAt : null,
                                    sortOrder: 2,
                                },
                                {
                                    type: "FINANCING",
                                    title: "Financiering",
                                    status: isRental ? "WAIVED" : "NOT_STARTED",
                                    completedAt: isRental ? occurredAt : null,
                                    dueAt: isRental
                                        ? null
                                        : bid.financingDeadline,
                                    sortOrder: 3,
                                },
                                {
                                    type: "BUILDING_INSPECTION",
                                    title: "Bouwkundige keuring",
                                    status: isRental ? "WAIVED" : "NOT_STARTED",
                                    completedAt: isRental ? occurredAt : null,
                                    sortOrder: 4,
                                },
                                {
                                    type: "SECURITY_DEPOSIT",
                                    title: isRental
                                        ? "Borg"
                                        : "Waarborgsom of bankgarantie",
                                    sortOrder: 5,
                                },
                                {
                                    type: "NOTARY_SELECTION",
                                    title: "Notaris kiezen",
                                    status: isRental ? "WAIVED" : "NOT_STARTED",
                                    completedAt: isRental ? occurredAt : null,
                                    sortOrder: 6,
                                },
                                {
                                    type: "DEED_OF_TRANSFER",
                                    title: isRental
                                        ? "Ingang huurovereenkomst"
                                        : "Akte van levering",
                                    dueAt: bid.transferDateRequested,
                                    sortOrder: 7,
                                },
                                {
                                    type: "FINAL_INSPECTION",
                                    title: "Eindinspectie en meterstanden",
                                    sortOrder: 8,
                                },
                                {
                                    type: "KEY_HANDOVER",
                                    title: "Sleuteloverdracht",
                                    dueAt: bid.transferDateRequested,
                                    sortOrder: 9,
                                },
                            ],
                        },
                        messages: {
                            create: {
                                authorUserId: session.user.id,
                                kind: "SYSTEM",
                                body: "De verkoper heeft het bod geaccepteerd. Deze beveiligde transactieruimte is geopend.",
                                createdAt: occurredAt,
                            },
                        },
                    },
                });
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "ROOM_CREATED",
                    roomEventPayload,
                );
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "PASSPORT_VERSION_CREATED",
                    { version: passportVersion, entryHash: passportHash },
                );
                return {
                    alreadyDecided: false,
                    event,
                    transactionId: transaction.id,
                };
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
