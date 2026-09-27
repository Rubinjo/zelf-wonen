import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { hasVerifiedIdentity } from "@/features/identity/identity-service";
import { collectReadinessIssues } from "@/features/listings/listing-service";
import type { PublishListingInput } from "@/lib/schemas/listing";

export class PublicationGateError extends Error {
    constructor(
        readonly code: "LISTING_NOT_FOUND" | "LISTING_NOT_READY" | "IDENTITY_VERIFICATION_REQUIRED" | "IDEMPOTENCY_CONFLICT",
        message: string,
    ) {
        super(message);
        this.name = "PublicationGateError";
    }
}

export async function publishListing(listingId: string, userId: string, input: PublishListingInput) {
    return db.$transaction(async (tx) => {
        // Serialize publication with draft edits and commit the public state atomically.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        const listing = await tx.listing.findFirst({
            where: { id: listingId, ownerId: userId },
            include: {
                owner: { select: { emailVerified: true } },
                property: {
                    include: {
                        energyLabels: {
                            orderBy: { registeredAt: "desc" },
                            take: 1,
                        },
                    },
                },
                media: {
                    where: { status: "READY" },
                    orderBy: { sortOrder: "asc" },
                },
            },
        });

        if (!listing) {
            throw new PublicationGateError(
                "LISTING_NOT_FOUND",
                "Listing not found",
            );
        }
        if (!listing.owner.emailVerified) {
            throw new PublicationGateError(
                "LISTING_NOT_READY",
                "Email must be verified",
            );
        }
        if (!["READY_FOR_VERIFICATION", "LIVE"].includes(listing.status)) {
            throw new PublicationGateError(
                "LISTING_NOT_READY",
                "Validate the draft before publishing",
            );
        }
        const identityVerified = await hasVerifiedIdentity(userId);
        if (!identityVerified) {
            throw new PublicationGateError(
                "IDENTITY_VERIFICATION_REQUIRED",
                "Complete identity verification before publishing",
            );
        }
        if (collectReadinessIssues(listing).length > 0) {
            throw new PublicationGateError(
                "LISTING_NOT_READY",
                "Complete all required fields (including energy label, movable items list and questionnaire) before publishing",
            );
        }

        const idempotencyKey = `${input.idempotencyKey}:PLATFORM`;
        const requestPayloadHash = createHash("sha256")
            .update(JSON.stringify({ listingId, userId, version: listing.version }))
            .digest("hex");
        const existing = await tx.listingPublication.findUnique({ where: { idempotencyKey } });
        if (existing && (
            existing.listingId !== listingId || existing.channel !== "PLATFORM" ||
            existing.requestPayloadHash !== requestPayloadHash
        )) {
            throw new PublicationGateError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for another publication request");
        }
        // A fresh key from a retry must not create duplicate live publications.
        const live = existing ?? await tx.listingPublication.findFirst({
            where: { listingId, channel: "PLATFORM", status: "LIVE" },
        });
        if (live?.status === "LIVE") {
            return { listingId, publications: [{ channel: live.channel, status: live.status }] };
        }
        const liveAt = new Date();
        const data = { status: "LIVE" as const, submittedAt: liveAt, liveAt, failedAt: null, failureCode: null };
        const publication = existing
            ? await tx.listingPublication.update({ where: { id: existing.id }, data })
            : await tx.listingPublication.create({
                data: { listingId, idempotencyKey, channel: "PLATFORM", requestPayloadHash, ...data },
            });
        await tx.listing.update({
            where: { id: listingId },
            data: { status: "LIVE", liveAt: listing.liveAt ?? liveAt, publicationRequestedAt: liveAt },
        });
        return { listingId, publications: [{ channel: publication.channel, status: publication.status }] };
    });
}
