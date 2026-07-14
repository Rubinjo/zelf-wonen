import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { FundaPublisher } from "@/lib/integrations/publishing/funda-publisher";
import type { PublicationPayload } from "@/lib/integrations/publishing/publisher";
import type { PublishListingInput } from "@/lib/schemas/listing";

export class PublicationGateError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_FOUND"
            | "LISTING_NOT_READY"
            | "IDIN_VERIFICATION_REQUIRED"
            | "PACKAGE_PAYMENT_REQUIRED",
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
    const baseUrl = process.env.OBJECT_STORAGE_MEDIA_BASE_URL;
    if (!baseUrl)
        throw new Error("OBJECT_STORAGE_MEDIA_BASE_URL is not configured");
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
            publicationOrders: {
                where: { package: input.package, status: "PAID" },
                orderBy: { paidAt: "desc" },
                take: 1,
            },
            identityAttempts: {
                where: {
                    userId,
                    status: "VERIFIED",
                    purpose: {
                        in: ["LISTING_PUBLICATION", "EXTERNAL_PUBLICATION"],
                    },
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                    ],
                },
                orderBy: { completedAt: "desc" },
                take: 1,
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
    if (!listing.identityAttempts[0]) {
        throw new PublicationGateError(
            "IDIN_VERIFICATION_REQUIRED",
            "Complete iDIN identity verification before publishing",
        );
    }
    const order = listing.publicationOrders[0];
    if (!order) {
        throw new PublicationGateError(
            "PACKAGE_PAYMENT_REQUIRED",
            "Pay for the selected publication package before publishing",
        );
    }

    const photos = listing.media.filter((item) => item.kind === "PHOTO");
    if (
        !listing.descriptionNl ||
        !listing.property.livingAreaSqm ||
        !listing.property.roomCount ||
        photos.length === 0 ||
        (listing.purpose === "SALE" && !listing.askingPriceCents) ||
        (listing.purpose === "RENT" && !listing.monthlyRentCents)
    ) {
        throw new PublicationGateError(
            "LISTING_NOT_READY",
            "Complete the required listing fields and add at least one photo",
        );
    }

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
        livingAreaSqm: Number(listing.property.livingAreaSqm),
        roomCount: listing.property.roomCount,
        description: { nl: listing.descriptionNl, en: listing.descriptionEn },
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
    const results: Array<{
        channel: string;
        status: string;
        externalReference?: string;
    }> = [];

    for (const channel of input.channels) {
        const idempotencyKey = `${input.idempotencyKey}:${channel}`;
        const existing = await db.listingPublication.findUnique({
            where: { idempotencyKey },
        });
        if (existing) {
            results.push({
                channel,
                status: existing.status,
                externalReference: existing.externalReference ?? undefined,
            });
            continue;
        }

        const publication = await db.listingPublication.create({
            data: {
                listingId,
                orderId: order.id,
                idempotencyKey,
                channel,
                package: input.package,
                status: "QUEUED",
                requestPayloadHash,
            },
        });

        if (channel === "PLATFORM") {
            await db.$transaction([
                db.listingPublication.update({
                    where: { id: publication.id },
                    data: {
                        status: "LIVE",
                        submittedAt: new Date(),
                        liveAt: new Date(),
                    },
                }),
                db.listing.update({
                    where: { id: listingId },
                    data: { status: "LIVE", liveAt: new Date() },
                }),
            ]);
            results.push({ channel, status: "LIVE" });
            continue;
        }

        try {
            const result = await new FundaPublisher().publish(
                payload,
                idempotencyKey,
            );
            await db.listingPublication.update({
                where: { id: publication.id },
                data: {
                    status: result.status,
                    externalReference: result.externalReference,
                    submittedAt: result.submittedAt,
                    liveAt:
                        result.status === "LIVE" ? result.submittedAt : null,
                },
            });
            results.push({
                channel,
                status: result.status,
                externalReference: result.externalReference,
            });
        } catch (error) {
            await db.listingPublication.update({
                where: { id: publication.id },
                data: {
                    status: "FAILED",
                    failedAt: new Date(),
                    failureCode: "PROVIDER_ERROR",
                },
            });
            throw error;
        }
    }

    return { listingId, publications: results };
}
