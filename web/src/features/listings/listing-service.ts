import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { EnergielabelNlClient } from "@/lib/integrations/property-data/energielabel-nl-client";
import type {
    CreateListingInput,
    UpdateListingInput,
} from "@/lib/schemas/listing";

const energielabelNl = new EnergielabelNlClient();
const storedEnergyLabelClasses = {
    "A++++": "A_PLUS_PLUS_PLUS_PLUS",
    "A+++": "A_PLUS_PLUS_PLUS",
    "A++": "A_PLUS_PLUS",
    "A+": "A_PLUS",
    A: "A",
    B: "B",
    C: "C",
    D: "D",
    E: "E",
    F: "F",
    G: "G",
} as const;

export class ListingMutationError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_FOUND"
            | "LISTING_LOCKED"
            | "VERSION_CONFLICT",
        message: string,
    ) {
        super(message);
        this.name = "ListingMutationError";
    }
}

const listingInclude = {
    property: {
        include: {
            energyLabels: {
                orderBy: { registeredAt: "desc" as const },
                take: 1,
            },
        },
    },
    media: { orderBy: { sortOrder: "asc" as const } },
    floorPlans: { orderBy: { sortOrder: "asc" as const } },
    identityAttempts: {
        where: { status: "VERIFIED" as const },
        orderBy: { completedAt: "desc" as const },
        take: 1,
    },
    publicationOrders: { orderBy: { createdAt: "desc" as const } },
    publications: { orderBy: { createdAt: "desc" as const } },
    _count: { select: { bids: true } },
};

function serializeListing(listing: Record<string, unknown>) {
    return JSON.parse(
        JSON.stringify(listing, (_key, value) => {
            if (typeof value === "bigint") return value.toString();
            if (
                value &&
                typeof value === "object" &&
                "toNumber" in value &&
                typeof value.toNumber === "function"
            ) {
                return value.toNumber();
            }
            return value;
        }),
    );
}

function normalizeNullableText(value: string | null | undefined) {
    return value === undefined ? undefined : value || null;
}

export async function listOwnerListings(ownerId: string) {
    const listings = await db.listing.findMany({
        where: { ownerId, status: { not: "ARCHIVED" } },
        include: listingInclude,
        orderBy: { updatedAt: "desc" },
    });
    return listings.map((listing) => serializeListing(listing));
}

export async function getOwnerListing(ownerId: string, listingId: string) {
    const listing = await db.listing.findFirst({
        where: { id: listingId, ownerId },
        include: listingInclude,
    });
    return listing ? serializeListing(listing) : null;
}

export async function createOwnerListing(
    ownerId: string,
    input: CreateListingInput,
) {
    const liveEnergy = await energielabelNl
        .lookupAddress({
            postcode: input.postcode,
            houseNumber: input.houseNumber,
            addition: input.houseNumberAddition ?? undefined,
        })
        .catch((error) => {
            console.error(
                "Energielabel.nl lookup during creation failed",
                error,
            );
            return null;
        });
    const listingId = randomUUID();
    const listing = await db.$transaction(async (tx) => {
        const sourceEnergy = await tx.energyLabel.findFirst({
            where: {
                labelClass: { not: "UNKNOWN" },
                property: {
                    postcode: input.postcode,
                    houseNumber: input.houseNumber,
                    houseNumberAddition: input.houseNumberAddition ?? null,
                },
            },
            orderBy: { registeredAt: "desc" },
        });
        const energyData = liveEnergy
            ? {
                  registrationNumber: null,
                  labelClass: storedEnergyLabelClasses[liveEnergy.labelClass],
                  primaryFossilEnergyKwhSqmYear: null,
                  registeredAt: liveEnergy.registeredAt,
                  validUntil: liveEnergy.validUntil,
                  source: "ENERGIELABEL_NL",
                  retrievedAt: new Date(),
              }
            : sourceEnergy
              ? {
                    registrationNumber: sourceEnergy.registrationNumber,
                    labelClass: sourceEnergy.labelClass,
                    primaryFossilEnergyKwhSqmYear:
                        sourceEnergy.primaryFossilEnergyKwhSqmYear,
                    registeredAt: sourceEnergy.registeredAt,
                    validUntil: sourceEnergy.validUntil,
                    source: sourceEnergy.source,
                    retrievedAt: sourceEnergy.retrievedAt,
                }
              : null;

        // Property facts are snapshotted per listing. Reusing a row would let a
        // later draft silently change facts already shown on a live listing.
        const property = await tx.property.create({
            data: {
                ownerId,
                propertyType: input.propertyType,
                postcode: input.postcode,
                houseNumber: input.houseNumber,
                houseNumberAddition: input.houseNumberAddition ?? null,
                street: input.street,
                city: input.city,
                municipality: input.municipality,
                province: input.province,
                bagAddressId: input.bagAddressId,
                bagBuildingId: input.bagBuildingId,
                cadastralParcelId: input.cadastralParcelId,
                latitude: input.latitude,
                longitude: input.longitude,
                officialLandAreaSqm: input.officialLandAreaSqm,
                constructionYear: input.constructionYear,
                livingAreaSqm: input.livingAreaSqm,
                roomCount: input.roomCount,
                bedroomCount: input.bedroomCount,
                bathroomCount: input.bathroomCount,
                floorCount: input.floorCount,
                roofType: input.roofType,
                externalStorageAreaSqm: input.externalStorageAreaSqm,
                amenities: input.amenities,
                parkingOptions: input.parkingOptions,
                parkingSpacePriceCents:
                    !input.parkingOptions?.includes("SPACE_FOR_SALE") ||
                    input.parkingSpacePriceCents === undefined ||
                    input.parkingSpacePriceCents === null
                        ? null
                        : BigInt(input.parkingSpacePriceCents),
                energyLabels: energyData
                    ? {
                          create: energyData,
                      }
                    : undefined,
            },
        });

        return tx.listing.create({
            data: {
                id: listingId,
                ownerId,
                propertyId: property.id,
                purpose: input.purpose,
            },
            include: listingInclude,
        });
    });

    return serializeListing(listing);
}

export async function updateOwnerListing(
    ownerId: string,
    listingId: string,
    input: UpdateListingInput,
) {
    const updated = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        const current = await tx.listing.findFirst({
            where: { id: listingId, ownerId },
            select: {
                id: true,
                propertyId: true,
                status: true,
                version: true,
                publications: {
                    where: {
                        status: { in: ["QUEUED", "SUBMITTED", "LIVE"] },
                    },
                    take: 1,
                    select: { id: true },
                },
            },
        });
        if (!current) {
            throw new ListingMutationError(
                "LISTING_NOT_FOUND",
                "Listing not found",
            );
        }
        if (
            !["DRAFT", "READY_FOR_VERIFICATION"].includes(current.status) ||
            current.publications.length > 0
        ) {
            throw new ListingMutationError(
                "LISTING_LOCKED",
                "Live or finalized listings cannot be edited",
            );
        }
        if (current.version !== input.version) {
            throw new ListingMutationError(
                "VERSION_CONFLICT",
                "This listing changed in another session. Reload and try again.",
            );
        }

        await tx.property.update({
            where: { id: current.propertyId },
            data: {
                propertyType: input.propertyType,
                livingAreaSqm: input.livingAreaSqm,
                officialLandAreaSqm: input.officialLandAreaSqm,
                roomCount: input.roomCount,
                bedroomCount: input.bedroomCount,
                bathroomCount: input.bathroomCount,
                floorCount: input.floorCount,
                roofType: input.roofType,
                externalStorageAreaSqm: input.externalStorageAreaSqm,
                amenities: input.amenities,
                parkingOptions: input.parkingOptions,
                parkingSpacePriceCents:
                    input.parkingOptions &&
                    !input.parkingOptions.includes("SPACE_FOR_SALE")
                        ? null
                        : input.parkingSpacePriceCents === undefined
                          ? undefined
                          : input.parkingSpacePriceCents === null
                            ? null
                            : BigInt(input.parkingSpacePriceCents),
                constructionYear: input.constructionYear,
            },
        });

        if (input.floorplannerEmbedUrl !== undefined) {
            await tx.floorPlan.deleteMany({
                where: { listingId, mode: "FLOORPLANNER_EMBED" },
            });
            if (input.floorplannerEmbedUrl) {
                await tx.floorPlan.create({
                    data: {
                        listingId,
                        mode: "FLOORPLANNER_EMBED",
                        embedUrl: input.floorplannerEmbedUrl,
                        floorName: "Interactive floor plan",
                    },
                });
            }
        }

        const listingData: Prisma.ListingUpdateInput = {
            purpose: input.purpose,
            titleNl: normalizeNullableText(input.titleNl),
            titleEn: normalizeNullableText(input.titleEn),
            descriptionNl: normalizeNullableText(input.descriptionNl),
            descriptionEn: normalizeNullableText(input.descriptionEn),
            askingPriceCents:
                input.askingPriceCents === undefined
                    ? undefined
                    : input.askingPriceCents === null
                      ? null
                      : BigInt(input.askingPriceCents),
            monthlyRentCents:
                input.monthlyRentCents === undefined
                    ? undefined
                    : input.monthlyRentCents === null
                      ? null
                      : BigInt(input.monthlyRentCents),
            serviceCostsCents:
                input.serviceCostsCents === undefined
                    ? undefined
                    : input.serviceCostsCents === null
                      ? null
                      : BigInt(input.serviceCostsCents),
            availableFrom:
                input.availableFrom === undefined
                    ? undefined
                    : input.availableFrom
                      ? new Date(input.availableFrom)
                      : null,
            viewingNotes: normalizeNullableText(input.viewingNotes),
            attributes:
                input.attributes === undefined
                    ? undefined
                    : input.attributes === null
                      ? Prisma.JsonNull
                      : (input.attributes as Prisma.InputJsonValue),
            biddingMethod: input.biddingMethod,
            minimumBidCents:
                input.minimumBidCents === undefined
                    ? undefined
                    : input.minimumBidCents === null
                      ? null
                      : BigInt(input.minimumBidCents),
            bidIncrementCents:
                input.bidIncrementCents === undefined
                    ? undefined
                    : input.bidIncrementCents === null
                      ? null
                      : BigInt(input.bidIncrementCents),
            allowBidConditions: input.allowBidConditions,
            bidWindowOpensAt:
                input.bidWindowOpensAt === undefined
                    ? undefined
                    : input.bidWindowOpensAt
                      ? new Date(input.bidWindowOpensAt)
                      : null,
            bidWindowClosesAt:
                input.bidWindowClosesAt === undefined
                    ? undefined
                    : input.bidWindowClosesAt
                      ? new Date(input.bidWindowClosesAt)
                      : null,
            status:
                current.status === "READY_FOR_VERIFICATION"
                    ? "DRAFT"
                    : undefined,
            validatedAt:
                current.status === "READY_FOR_VERIFICATION" ? null : undefined,
            version: { increment: 1 },
        };

        return tx.listing.update({
            where: { id: listingId },
            data: listingData,
            include: listingInclude,
        });
    });

    return serializeListing(updated);
}

export type ReadinessIssue = {
    field: string;
    code: string;
    message: string;
};

export function collectReadinessIssues(listing: {
    purpose: "SALE" | "RENT";
    titleNl: string | null;
    descriptionNl: string | null;
    askingPriceCents: bigint | null;
    monthlyRentCents: bigint | null;
    biddingMethod: "PRIVATE" | "SEALED" | "OPEN";
    bidIncrementCents: bigint | null;
    bidWindowOpensAt: Date | null;
    bidWindowClosesAt: Date | null;
    property: { livingAreaSqm: unknown; roomCount: number | null };
    media: Array<{ kind: string; status: string }>;
}) {
    const issues: ReadinessIssue[] = [];
    if (!listing.titleNl?.trim())
        issues.push({
            field: "titleNl",
            code: "REQUIRED",
            message: "Voeg een Nederlandse titel toe",
        });
    if (!listing.descriptionNl?.trim())
        issues.push({
            field: "descriptionNl",
            code: "REQUIRED",
            message: "Voeg een Nederlandse beschrijving toe",
        });
    if (!listing.property.livingAreaSqm)
        issues.push({
            field: "livingAreaSqm",
            code: "REQUIRED",
            message: "Vul de woonoppervlakte in",
        });
    if (!listing.property.roomCount)
        issues.push({
            field: "roomCount",
            code: "REQUIRED",
            message: "Vul het aantal kamers in",
        });
    if (listing.purpose === "SALE" && !listing.askingPriceCents)
        issues.push({
            field: "askingPriceCents",
            code: "REQUIRED",
            message: "Vul een vraagprijs in",
        });
    if (listing.purpose === "RENT" && !listing.monthlyRentCents)
        issues.push({
            field: "monthlyRentCents",
            code: "REQUIRED",
            message: "Vul een maandelijkse huurprijs in",
        });
    if (listing.biddingMethod === "SEALED" && !listing.bidWindowClosesAt)
        issues.push({
            field: "bidWindowClosesAt",
            code: "REQUIRED",
            message: "Vul een sluitingstijd voor de gesloten biedingsronde in",
        });
    if (listing.biddingMethod === "OPEN" && !listing.bidIncrementCents)
        issues.push({
            field: "bidIncrementCents",
            code: "REQUIRED",
            message: "Vul een minimale biedstap voor open bieden in",
        });
    if (
        !listing.media.some(
            (item) => item.kind === "PHOTO" && item.status === "READY",
        )
    ) {
        issues.push({
            field: "media",
            code: "PHOTO_REQUIRED",
            message: "Upload minimaal één foto",
        });
    }
    if (
        listing.bidWindowOpensAt &&
        listing.bidWindowClosesAt &&
        listing.bidWindowOpensAt >= listing.bidWindowClosesAt
    ) {
        issues.push({
            field: "bidWindowClosesAt",
            code: "INVALID_RANGE",
            message: "Laat de biedingsronde sluiten nadat deze is geopend",
        });
    }
    return issues;
}

export async function validateOwnerListing(ownerId: string, listingId: string) {
    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        const listing = await tx.listing.findFirst({
            where: { id: listingId, ownerId },
            include: { property: true, media: true },
        });
        if (!listing)
            throw new ListingMutationError(
                "LISTING_NOT_FOUND",
                "Listing not found",
            );
        if (listing.status === "READY_FOR_VERIFICATION") {
            return {
                ready: true,
                issues: [],
                listing: serializeListing(listing),
            };
        }
        if (listing.status !== "DRAFT") {
            throw new ListingMutationError(
                "LISTING_LOCKED",
                "Live or finalized listings cannot be revalidated for editing",
            );
        }
        const issues = collectReadinessIssues(listing);
        if (issues.length > 0)
            return {
                ready: false,
                issues,
                listing: serializeListing(listing),
            };

        const slug =
            listing.publicSlug ??
            `${listing.property.street}-${listing.property.houseNumber}-${listing.id.slice(0, 8)}`
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
        const ready = await tx.listing.update({
            where: { id: listingId },
            data: {
                status: "READY_FOR_VERIFICATION",
                validatedAt: new Date(),
                publicSlug: slug,
                version: { increment: 1 },
            },
            include: listingInclude,
        });
        return { ready: true, issues: [], listing: serializeListing(ready) };
    });
}

export async function archiveOwnerListing(ownerId: string, listingId: string) {
    const result = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        const listing = await tx.listing.findFirst({
            where: { id: listingId, ownerId },
            select: {
                status: true,
                publications: {
                    where: { status: { in: ["QUEUED", "SUBMITTED", "LIVE"] } },
                    take: 1,
                    select: { id: true },
                },
            },
        });
        if (!listing) return "NOT_FOUND" as const;
        if (
            !["DRAFT", "READY_FOR_VERIFICATION"].includes(listing.status) ||
            listing.publications.length > 0
        ) {
            return "LOCKED" as const;
        }
        await tx.listing.update({
            where: { id: listingId },
            data: { status: "ARCHIVED", version: { increment: 1 } },
        });
        return "ARCHIVED" as const;
    });
    if (result === "NOT_FOUND")
        throw new ListingMutationError(
            "LISTING_NOT_FOUND",
            "Listing not found",
        );
    if (result === "LOCKED")
        throw new ListingMutationError(
            "LISTING_LOCKED",
            "A listing with an active publication cannot be archived",
        );
}
