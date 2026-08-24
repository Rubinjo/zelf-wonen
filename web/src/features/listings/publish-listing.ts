import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { hasVerifiedIdentity } from "@/features/identity/idin-service";
import { collectReadinessIssues } from "@/features/listings/listing-service";
import { FundaPublisher } from "@/lib/integrations/publishing/funda-publisher";
import type { PublicationPayload } from "@/lib/integrations/publishing/publisher";
import type { PublishListingInput } from "@/lib/schemas/listing";

export class PublicationGateError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_FOUND"
            | "LISTING_NOT_READY"
            | "IDIN_VERIFICATION_REQUIRED"
            | "PACKAGE_PAYMENT_REQUIRED"
            | "IDEMPOTENCY_CONFLICT",
        message: string,
    ) {
        super(message);
        this.name = "PublicationGateError";
    }
}

const energyLabelNames = {
    A_PLUS_PLUS_PLUS_PLUS_PLUS: "A+++++",
    A_PLUS_PLUS_PLUS_PLUS: "A++++",
    A_PLUS_PLUS_PLUS: "A+++",
    A_PLUS_PLUS: "A++",
    A_PLUS: "A+",
    A: "A",
    B: "B",
    C: "C",
    D: "D",
    E: "E",
    F: "F",
    G: "G",
    UNKNOWN: "UNKNOWN",
} as const;

function mediaUrl(storageKey: string) {
    const baseUrl =
        process.env.OBJECT_STORAGE_MEDIA_BASE_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000";
    return new URL(
        storageKey.replace(/^\/+/, ""),
        `${baseUrl.replace(/\/+$/, "")}/`,
    ).toString();
}

export async function publishListing(
    listingId: string,
    userId: string,
    input: PublishListingInput,
) {
    const listing = await db.listing.findFirst({
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
            "IDIN_VERIFICATION_REQUIRED",
            "Complete iDIN identity verification before publishing",
        );
    }
    const photos = listing.media.filter((item) => item.kind === "PHOTO");
    if (collectReadinessIssues(listing).length > 0) {
        throw new PublicationGateError(
            "LISTING_NOT_READY",
            "Complete all required fields (including energy label, movable items list and questionnaire) before publishing",
        );
    }
    // collectReadinessIssues guarantees the fields below are non-null.
    const descriptionNl = listing.descriptionNl as string;
    const roomCount = listing.property.roomCount as number;
    const livingAreaSqm = Number(listing.property.livingAreaSqm);

    const latestEnergy = listing.property.energyLabels[0] ?? null;
    const payload: PublicationPayload = {
        listingId: listing.id,
        package: input.package,
        purpose: listing.purpose,
        address: {
            postcode: listing.property.postcode,
            houseNumber: listing.property.houseNumber,
            addition: listing.property.houseNumberAddition,
            street: listing.property.street,
            city: listing.property.city,
        },
        askingPriceCents: listing.askingPriceCents?.toString() ?? null,
        monthlyRentCents: listing.monthlyRentCents?.toString() ?? null,
        livingAreaSqm,
        roomCount,
        description: { nl: descriptionNl, en: listing.descriptionEn },
        energy: latestEnergy
            ? {
                  labelClass: energyLabelNames[latestEnergy.labelClass],
                  primaryFossilEnergyKwhSqmYear:
                      latestEnergy.primaryFossilEnergyKwhSqmYear === null
                          ? null
                          : Number(latestEnergy.primaryFossilEnergyKwhSqmYear),
                  registrationNumber: latestEnergy.registrationNumber,
              }
            : null,
        photos: photos.map((item) => ({
            url: mediaUrl(item.storageKey),
            sha256: item.sha256,
            mimeType: item.mimeType,
            sortOrder: item.sortOrder,
        })),
        floorPlans: listing.media
            .filter((item) => item.kind === "FLOOR_PLAN_STATIC")
            .map((item) => ({
                url: mediaUrl(item.storageKey),
                sha256: item.sha256,
                mimeType: item.mimeType,
                sortOrder: item.sortOrder,
            })),
    };
    const requestPayloadHash = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
    const requestedPublications = input.channels.map((channel) => ({
        channel,
        idempotencyKey: `${input.idempotencyKey}:${channel}`,
    }));
    const claim = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        const current = await tx.listing.findFirst({
            where: { id: listingId, ownerId: userId },
            select: { status: true },
        });
        if (
            !current ||
            !["READY_FOR_VERIFICATION", "LIVE"].includes(current.status)
        ) {
            throw new PublicationGateError(
                current ? "LISTING_NOT_READY" : "LISTING_NOT_FOUND",
                current
                    ? "Validate the draft before publishing"
                    : "Listing not found",
            );
        }

        const existing = await tx.listingPublication.findMany({
            where: {
                idempotencyKey: {
                    in: requestedPublications.map(
                        (publication) => publication.idempotencyKey,
                    ),
                },
            },
        });
        for (const publication of existing) {
            const requested = requestedPublications.find(
                (item) => item.idempotencyKey === publication.idempotencyKey,
            );
            if (
                !requested ||
                publication.listingId !== listingId ||
                publication.channel !== requested.channel ||
                publication.package !== input.package ||
                publication.requestPayloadHash !== requestPayloadHash
            ) {
                throw new PublicationGateError(
                    "IDEMPOTENCY_CONFLICT",
                    "This idempotency key was already used for another publication request",
                );
            }
        }
        if (existing.length > 0 && existing.length !== input.channels.length) {
            throw new PublicationGateError(
                "IDEMPOTENCY_CONFLICT",
                "The publication request does not match its original channels",
            );
        }

        if (existing.length === input.channels.length) {
            const orderIds = new Set(existing.map((item) => item.orderId));
            if (orderIds.size !== 1 || !existing[0].orderId) {
                throw new PublicationGateError(
                    "IDEMPOTENCY_CONFLICT",
                    "The existing publication request has inconsistent payment context",
                );
            }
            const existingOrder = await tx.publicationOrder.findFirst({
                where: {
                    id: existing[0].orderId,
                    listingId,
                    userId,
                    package: input.package,
                    status: "PAID",
                },
            });
            if (!existingOrder) {
                throw new PublicationGateError(
                    "IDEMPOTENCY_CONFLICT",
                    "The existing publication request has invalid payment context",
                );
            }
            const publications = await Promise.all(
                existing.map((publication) =>
                    publication.status === "FAILED"
                        ? tx.listingPublication.update({
                              where: { id: publication.id },
                              data: {
                                  status: "QUEUED",
                                  failedAt: null,
                                  failureCode: null,
                              },
                          })
                        : publication,
                ),
            );
            return { order: existingOrder, publications };
        }

        const order = await tx.publicationOrder.findFirst({
            where: {
                listingId,
                userId,
                package: input.package,
                status: "PAID",
                consumedAt: null,
            },
            orderBy: { paidAt: "desc" },
        });
        if (!order) {
            throw new PublicationGateError(
                "PACKAGE_PAYMENT_REQUIRED",
                "Pay for the selected publication package before publishing",
            );
        }
        const publications = await Promise.all(
            requestedPublications.map((publication) =>
                tx.listingPublication.create({
                    data: {
                        listingId,
                        orderId: order.id,
                        idempotencyKey: publication.idempotencyKey,
                        channel: publication.channel,
                        package: input.package,
                        status: "QUEUED",
                        requestPayloadHash,
                    },
                }),
            ),
        );
        await tx.publicationOrder.update({
            where: { id: order.id },
            data: { consumedAt: new Date() },
        });
        return { order, publications };
    });
    const results: Array<{
        channel: string;
        status: string;
        externalReference?: string;
    }> = [];

    for (const channel of input.channels) {
        const publication = claim.publications.find(
            (item) => item.channel === channel,
        );
        if (!publication) {
            throw new PublicationGateError(
                "IDEMPOTENCY_CONFLICT",
                "The claimed publication channels are inconsistent",
            );
        }
        const shouldProcess =
            publication.status === "QUEUED" ||
            (channel === "FUNDA" && publication.status === "SUBMITTED");
        if (!shouldProcess) {
            results.push({
                channel,
                status: publication.status,
                externalReference: publication.externalReference ?? undefined,
            });
            continue;
        }

        if (channel === "PLATFORM") {
            const result = await db.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
                const currentPublication =
                    await tx.listingPublication.findUniqueOrThrow({
                        where: { id: publication.id },
                    });
                if (currentPublication.status !== "QUEUED") {
                    return currentPublication;
                }
                const currentListing = await tx.listing.findFirst({
                    where: {
                        id: listingId,
                        ownerId: userId,
                        status: { in: ["READY_FOR_VERIFICATION", "LIVE"] },
                    },
                    select: { liveAt: true },
                });
                if (!currentListing) {
                    throw new PublicationGateError(
                        "LISTING_NOT_READY",
                        "The listing is no longer publishable",
                    );
                }
                const liveAt = new Date();
                const livePublication = await tx.listingPublication.update({
                    where: { id: publication.id },
                    data: {
                        status: "LIVE",
                        submittedAt: liveAt,
                        liveAt,
                    },
                });
                await tx.listing.update({
                    where: { id: listingId },
                    data: {
                        status: "LIVE",
                        liveAt: currentListing.liveAt ?? liveAt,
                        publicationRequestedAt: liveAt,
                    },
                });
                return livePublication;
            });
            results.push({
                channel,
                status: result.status,
                externalReference: result.externalReference ?? undefined,
            });
            continue;
        }

        try {
            const result = await db.$transaction(
                async (tx) => {
                    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
                    const currentPublication =
                        await tx.listingPublication.findUniqueOrThrow({
                            where: { id: publication.id },
                        });
                    if (
                        !["QUEUED", "SUBMITTED"].includes(
                            currentPublication.status,
                        )
                    ) {
                        return currentPublication;
                    }
                    const currentListing = await tx.listing.findFirst({
                        where: {
                            id: listingId,
                            ownerId: userId,
                            status: {
                                in: ["READY_FOR_VERIFICATION", "LIVE"],
                            },
                        },
                        select: { liveAt: true },
                    });
                    if (!currentListing) {
                        throw new PublicationGateError(
                            "LISTING_NOT_READY",
                            "The listing is no longer publishable",
                        );
                    }
                    const providerResult = await new FundaPublisher().publish(
                        payload,
                        publication.idempotencyKey,
                    );
                    const updated = await tx.listingPublication.update({
                        where: { id: publication.id },
                        data: {
                            status: providerResult.status,
                            externalReference: providerResult.externalReference,
                            submittedAt: providerResult.submittedAt,
                            liveAt:
                                providerResult.status === "LIVE"
                                    ? providerResult.submittedAt
                                    : null,
                        },
                    });
                    await tx.listing.update({
                        where: { id: listingId },
                        data:
                            providerResult.status === "LIVE"
                                ? {
                                      status: "LIVE",
                                      liveAt:
                                          currentListing.liveAt ??
                                          providerResult.submittedAt,
                                      publicationRequestedAt:
                                          providerResult.submittedAt,
                                  }
                                : {
                                      publicationRequestedAt:
                                          providerResult.submittedAt,
                                  },
                    });
                    return updated;
                },
                { timeout: 20_000 },
            );
            results.push({
                channel,
                status: result.status,
                externalReference: result.externalReference ?? undefined,
            });
        } catch (error) {
            await db.listingPublication.updateMany({
                where: { id: publication.id, status: "QUEUED" },
                data: {
                    status: "FAILED",
                    failedAt: new Date(),
                    failureCode: "PROVIDER_ERROR",
                },
            });
            console.error("Funda publication failed", error);
            results.push({
                channel,
                status:
                    publication.status === "SUBMITTED" ? "SUBMITTED" : "FAILED",
                externalReference: publication.externalReference ?? undefined,
            });
        }
    }

    return { listingId, publications: results };
}
