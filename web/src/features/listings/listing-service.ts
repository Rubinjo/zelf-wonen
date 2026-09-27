import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { NeighborhoodDataClient } from "@/lib/integrations/neighborhood-data-client";
import { PdokClient } from "@/lib/integrations/property-data/pdok-client";
import { hasVerifiedIdentity } from "@/features/identity/identity-service";
import { applyGardenToLayout } from "@/features/listings/garden";
import {
    getQuestionnaireSections,
    type QuestionnaireAnswer,
} from "@/features/listings/property-questionnaire";
import type {
    CreateListingInput,
    UpdateListingInput,
} from "@/lib/schemas/listing";

const pdok = new PdokClient();
const neighborhoodData = new NeighborhoodDataClient();
const storedEnergyLabelClasses = {
    "A+++++": "A_PLUS_PLUS_PLUS_PLUS_PLUS",
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
            neighborhoodProfile: true,
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
    publications: { orderBy: { createdAt: "desc" as const } },
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
    const verified = await hasVerifiedIdentity(ownerId);
    return listings.map((listing) => ({
        ...serializeListing(listing),
        identityVerified: verified,
    }));
}

export async function getOwnerListing(ownerId: string, listingId: string) {
    const listing = await db.listing.findFirst({
        where: { id: listingId, ownerId },
        include: listingInclude,
    });
    if (!listing) return null;
    return {
        ...serializeListing(listing),
        identityVerified: await hasVerifiedIdentity(ownerId),
    };
}

export async function createOwnerListing(
    ownerId: string,
    input: CreateListingInput,
) {
    const address = {
        postcode: input.postcode,
        houseNumber: input.houseNumber,
        addition: input.houseNumberAddition ?? undefined,
    };
    const listingId = randomUUID();
    const { listing, propertyId } = await db.$transaction(async (tx) => {
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
        const energyData = input.energyLabel
            ? {
                  registrationNumber: input.energyLabel.registrationNumber,
                  labelClass:
                      storedEnergyLabelClasses[input.energyLabel.labelClass] ??
                      "UNKNOWN",
                  primaryFossilEnergyKwhSqmYear:
                      input.energyLabel.primaryFossilEnergyKwhSqmYear,
                  registeredAt: input.energyLabel.registeredAt
                      ? new Date(input.energyLabel.registeredAt)
                      : null,
                  validUntil: input.energyLabel.validUntil
                      ? new Date(input.energyLabel.validUntil)
                      : null,
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
                isMonument: input.isMonument,
                livingAreaSqm: input.livingAreaSqm,
                roomCount: input.roomCount,
                bedroomCount: input.bedroomCount,
                bathroomCount: input.bathroomCount,
                floorCount: input.floorCount,
                roofType: input.roofType,
                externalStorageAreaSqm: input.externalStorageAreaSqm,
                amenities: input.amenities,
                parkingOptions: input.parkingOptions,
                erfpachtType: input.erfpachtType ?? "UNKNOWN",
                erfpachtCanonCents:
                    input.erfpachtCanonCents == null
                        ? null
                        : BigInt(input.erfpachtCanonCents),
                erfpachtDetails: input.erfpachtDetails ?? null,
                erfpachtEndDate: input.erfpachtEndDate
                    ? new Date(input.erfpachtEndDate)
                    : null,
                erfpachtSource:
                    input.erfpachtType && input.erfpachtType !== "UNKNOWN"
                        ? "MANUAL"
                        : null,
                erfpachtRetrievedAt:
                    input.erfpachtType && input.erfpachtType !== "UNKNOWN"
                        ? new Date()
                        : null,
                parkingSpacePriceCents:
                    !input.parkingOptions?.includes("SPACE_FOR_SALE") ||
                    input.parkingSpacePriceCents === undefined ||
                    input.parkingSpacePriceCents === null
                        ? null
                        : BigInt(input.parkingSpacePriceCents),
                layout: input.garden
                    ? applyGardenToLayout(null, {
                          hasGarden: input.garden.hasGarden,
                          orientation: input.garden.orientation ?? null,
                      })
                    : undefined,
                energyLabels: energyData
                    ? {
                          create: energyData,
                      }
                    : undefined,
            },
        });

        const listing = await tx.listing.create({
            data: {
                id: listingId,
                ownerId,
                propertyId: property.id,
                purpose: input.purpose,
                titleNl: input.titleNl ?? null,
                titleEn: input.titleEn ?? null,
                descriptionNl: input.descriptionNl ?? null,
                descriptionEn: input.descriptionEn ?? null,
                askingPriceCents:
                    input.askingPriceCents == null
                        ? null
                        : BigInt(input.askingPriceCents),
                monthlyRentCents:
                    input.monthlyRentCents == null
                        ? null
                        : BigInt(input.monthlyRentCents),
                serviceCostsCents:
                    input.serviceCostsCents == null
                        ? null
                        : BigInt(input.serviceCostsCents),
                viewingNotes: input.viewingNotes ?? null,
                biddingMethod: input.biddingMethod,
                minimumBidCents:
                    input.minimumBidCents == null
                        ? null
                        : BigInt(input.minimumBidCents),
                bidIncrementCents:
                    input.bidIncrementCents == null
                        ? null
                        : BigInt(input.bidIncrementCents),
                allowBidConditions: input.allowBidConditions,
                bidWindowOpensAt: input.bidWindowOpensAt
                    ? new Date(input.bidWindowOpensAt)
                    : null,
                bidWindowClosesAt: input.bidWindowClosesAt
                    ? new Date(input.bidWindowClosesAt)
                    : null,
                attributes:
                    input.attributes === undefined
                        ? undefined
                        : input.attributes === null
                          ? Prisma.JsonNull
                          : (input.attributes as Prisma.InputJsonValue),
                floorPlans: input.floorplannerEmbedUrl
                    ? {
                          create: {
                              mode: "FLOORPLANNER_EMBED",
                              embedUrl: input.floorplannerEmbedUrl,
                              floorName: "Interactive floor plan",
                          },
                      }
                    : undefined,
            },
            include: listingInclude,
        });
        return { listing, propertyId: property.id };
    });

    const result = {
        ...serializeListing(listing),
        identityVerified: await hasVerifiedIdentity(ownerId),
    };

    // Neighborhood stats (CBS/Overpass) are enriched in the background so the
    // create response never waits on slow external APIs. Properties can always
    // be backfilled later via `npm run neighborhood:backfill`.
    void enrichNeighborhood(propertyId, address, {
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
    });

    return result;
}

async function enrichNeighborhood(
    propertyId: string,
    address: { postcode: string; houseNumber: number; addition?: string },
    coordinates: { latitude: number | null; longitude: number | null },
) {
    try {
        const pdokAddress = await pdok.lookupAddress(address);
        if (
            !pdokAddress?.neighborhoodCode ||
            !pdokAddress.neighborhoodName ||
            !pdokAddress.municipalityCode
        ) {
            return;
        }
        const profile = await neighborhoodData.lookup({
            neighborhoodCode: pdokAddress.neighborhoodCode,
            neighborhoodName: pdokAddress.neighborhoodName,
            districtCode: pdokAddress.districtCode,
            districtName: pdokAddress.districtName,
            municipalityCode: pdokAddress.municipalityCode,
            latitude:
                coordinates.latitude ??
                pdokAddress.coordinates?.latitude ??
                null,
            longitude:
                coordinates.longitude ??
                pdokAddress.coordinates?.longitude ??
                null,
        });
        if (!profile) return;
        await db.property.update({
            where: { id: propertyId },
            data: {
                neighborhoodProfile: {
                    upsert: { create: profile, update: profile },
                },
            },
        });
    } catch (error) {
        console.error("Background neighborhood enrichment failed", error);
    }
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

        const currentProperty = await tx.property.findUnique({
            where: { id: current.propertyId },
            select: { layout: true },
        });

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
                isMonument: input.isMonument,
                layout:
                    input.garden === undefined
                        ? undefined
                        : applyGardenToLayout(currentProperty?.layout, {
                              hasGarden: input.garden.hasGarden,
                              orientation: input.garden.orientation ?? null,
                          }),
                erfpachtType: input.erfpachtType,
                erfpachtCanonCents:
                    input.erfpachtCanonCents === undefined
                        ? undefined
                        : input.erfpachtCanonCents === null
                          ? null
                          : BigInt(input.erfpachtCanonCents),
                erfpachtDetails:
                    input.erfpachtDetails === undefined
                        ? undefined
                        : input.erfpachtDetails,
                erfpachtEndDate:
                    input.erfpachtEndDate === undefined
                        ? undefined
                        : input.erfpachtEndDate
                          ? new Date(input.erfpachtEndDate)
                          : null,
                erfpachtSource:
                    input.erfpachtType === undefined
                        ? undefined
                        : input.erfpachtType !== "UNKNOWN"
                          ? "MANUAL"
                          : null,
                erfpachtRetrievedAt:
                    input.erfpachtType === undefined
                        ? undefined
                        : input.erfpachtType !== "UNKNOWN"
                          ? new Date()
                          : null,
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

    return {
        ...serializeListing(updated),
        identityVerified: await hasVerifiedIdentity(ownerId),
    };
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
    attributes: Prisma.JsonValue | null;
    property: {
        propertyType: string;
        livingAreaSqm: unknown;
        roomCount: number | null;
        constructionYear: number | null;
        energyLabels: Array<{ labelClass: string }>;
    };
    media: Array<{
        kind: string;
        status: string;
        altTextNl: string | null;
    }>;
}) {
    const issues: ReadinessIssue[] = [];
    const isBuilding = ["HOUSE", "APARTMENT", "COMMERCIAL", "OTHER"].includes(
        listing.property.propertyType,
    );
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
    if (isBuilding && !listing.property.constructionYear)
        issues.push({
            field: "constructionYear",
            code: "CONSTRUCTION_YEAR_REQUIRED",
            message: "Vul het bouwjaar in",
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
    if (listing.biddingMethod !== "OPEN" && !listing.bidWindowOpensAt)
        issues.push({
            field: "bidWindowOpensAt",
            code: "REQUIRED",
            message: "Vul een begintijd voor de biedingsronde in",
        });
    if (listing.biddingMethod !== "OPEN" && !listing.bidWindowClosesAt)
        issues.push({
            field: "bidWindowClosesAt",
            code: "REQUIRED",
            message: "Vul een sluitingstijd voor de biedingsronde in",
        });
    if (listing.biddingMethod === "OPEN" && !listing.bidIncrementCents)
        issues.push({
            field: "bidIncrementCents",
            code: "REQUIRED",
            message: "Vul een minimale biedstap voor open bieden in",
        });

    const readyPhotos = listing.media.filter(
        (item) => item.kind === "PHOTO" && item.status === "READY",
    ).length;
    if (readyPhotos < 5)
        issues.push({
            field: "media",
            code: "PHOTO_MINIMUM",
            message: `Upload minimaal 5 foto's (er zijn er ${readyPhotos})`,
        });

    if (
        isBuilding &&
        !listing.media.some(
            (item) =>
                item.kind === "DOCUMENT" &&
                item.status === "READY" &&
                item.altTextNl !== "Lijst van zaken",
        )
    )
        issues.push({
            field: "energyLabels",
            code: "ENERGY_LABEL_PDF_REQUIRED",
            message: "Upload het officiële energielabel als PDF-document",
        });

    const attributes = listing.attributes as {
        movableItems?: Array<{ name?: unknown }>;
        questionnaireAnswers?: QuestionnaireAnswer[];
    } | null;
    const movableItems = Array.isArray(attributes?.movableItems)
        ? attributes.movableItems.filter(
              (item) => String(item?.name ?? "").trim().length > 0,
          )
        : [];
    const hasMovableItemsList =
        movableItems.length > 0 ||
        listing.media.some(
            (item) =>
                item.kind === "DOCUMENT" &&
                item.status === "READY" &&
                item.altTextNl === "Lijst van zaken",
        );
    if (!hasMovableItemsList)
        issues.push({
            field: "movableItems",
            code: "MOVABLE_ITEMS_REQUIRED",
            message: "Vul de lijst van zaken in of upload de PDF",
        });

    const questionnaireAnswers = Array.isArray(attributes?.questionnaireAnswers)
        ? attributes.questionnaireAnswers
        : [];
    const applicableQuestionIds = new Set(
        getQuestionnaireSections(listing.property.propertyType).flatMap(
            (questionnaireSection) =>
                questionnaireSection.questions.map((question) => question.id),
        ),
    );
    const unansweredCount = [...applicableQuestionIds].filter(
        (questionId) =>
            !questionnaireAnswers.some(
                (answer) => answer.questionId === questionId,
            ),
    ).length;
    if (unansweredCount > 0)
        issues.push({
            field: "questionnaireAnswers",
            code: "QUESTIONNAIRE_REQUIRED",
            message: `Beantwoord de vragenlijst volledig (${
                unansweredCount === 1
                    ? "nog 1 vraag open"
                    : `nog ${unansweredCount} vragen open`
            })`,
        });

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
            include: {
                property: {
                    include: {
                        energyLabels: {
                            orderBy: { registeredAt: "desc" as const },
                            take: 1,
                        },
                    },
                },
                media: true,
            },
        });
        if (!listing)
            throw new ListingMutationError(
                "LISTING_NOT_FOUND",
                "Listing not found",
            );
        if (!["DRAFT", "READY_FOR_VERIFICATION"].includes(listing.status)) {
            throw new ListingMutationError(
                "LISTING_LOCKED",
                "Live or finalized listings cannot be revalidated for editing",
            );
        }
        const issues = collectReadinessIssues(listing);
        if (issues.length > 0) {
            const serialized = serializeListing(listing) as {
                status: string;
                validatedAt: unknown;
            };
            if (listing.status === "READY_FOR_VERIFICATION") {
                await tx.listing.update({
                    where: { id: listingId },
                    data: {
                        status: "DRAFT",
                        validatedAt: null,
                        version: { increment: 1 },
                    },
                });
                serialized.status = "DRAFT";
                serialized.validatedAt = null;
            }
            return { ready: false, issues, listing: serialized };
        }
        if (listing.status === "READY_FOR_VERIFICATION") {
            return {
                ready: true,
                issues: [],
                listing: serializeListing(listing),
            };
        }

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
