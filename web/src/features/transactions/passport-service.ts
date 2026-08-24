import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
    appendTransactionEvent,
    canonicalJson,
    chainedHash,
} from "@/features/transactions/transaction-service";
import {
    computePassportCompleteness,
    type PassportCompleteness,
    type PassportSourceData,
} from "@/features/transactions/passport-completeness";

/**
 * Paspoortservice: bouwt momentopnamen (snapshots) van het woningpaspoort en
 * beheert de onveranderlijke versieketen. De draft (PropertyPassportDraft) is
 * bewerkbaar; een versie wordt alleen aangemaakt wanneer de inhoud daadwerkelijk
 * verandert (contenthash-vergelijking), zodat lege/identieke versies worden
 * voorkomen.
 */

/** Documentcategorieën die bijdragen aan het woningpaspoort. */
export const PASSPORT_DOCUMENT_CATEGORIES = [
    "ENERGY_LABEL",
    "FLOOR_PLAN",
    "VVE",
    "CADASTRAL",
    "BUILDING_INSPECTION",
] as const;

export function isPassportDocumentCategory(category: string) {
    return (PASSPORT_DOCUMENT_CATEGORIES as readonly string[]).includes(
        category,
    );
}

export const PASSPORT_DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
    ENERGY_LABEL: "Energielabel",
    FLOOR_PLAN: "Plattegrond",
    VVE: "VvE-stukken",
    CADASTRAL: "Kadastrale gegevens",
    BUILDING_INSPECTION: "Bouwkundige keuring",
};

export type PassportTrigger = "MANUAL" | "DRAFT_UPDATE" | "DOCUMENT_UPLOAD";

/** Gestructureerde, deterministische inhoud van één paspoortversie. */
export type PassportSnapshotContent = {
    completeness: PassportCompleteness;
    listingVersionSource: number;
    listing: Record<string, unknown>;
    draft: Record<string, unknown>;
    documents: Array<{
        id: string;
        category: string;
        fileName: string;
        sha256: string;
        uploadedByName: string | null;
    }>;
};

export type PassportSnapshot = {
    generatedAt: string;
    trigger: PassportTrigger;
    changeNote: string;
    content: PassportSnapshotContent;
};

export const PASSPORT_LISTING_SELECT = {
    id: true,
    version: true,
    purpose: true,
    publicSlug: true,
    titleNl: true,
    titleEn: true,
    descriptionNl: true,
    descriptionEn: true,
    askingPriceCents: true,
    monthlyRentCents: true,
    serviceCostsCents: true,
    availableFrom: true,
    attributes: true,
    property: {
        select: {
            street: true,
            houseNumber: true,
            houseNumberAddition: true,
            postcode: true,
            city: true,
            municipality: true,
            province: true,
            propertyType: true,
            livingAreaSqm: true,
            officialLandAreaSqm: true,
            volumeCubicMeters: true,
            roomCount: true,
            bedroomCount: true,
            bathroomCount: true,
            floorCount: true,
            roofType: true,
            externalStorageAreaSqm: true,
            constructionYear: true,
            isMonument: true,
            cadastralParcelId: true,
            amenities: true,
            parkingOptions: true,
            energyLabels: {
                orderBy: { registeredAt: "desc" },
                select: {
                    labelClass: true,
                    registrationNumber: true,
                    registeredAt: true,
                    validUntil: true,
                },
            },
            neighborhoodProfile: {
                select: {
                    neighborhoodName: true,
                    districtName: true,
                    statisticsYear: true,
                    population: true,
                    populationDensityPerKm2: true,
                    age0To14Percent: true,
                    age15To24Percent: true,
                    age25To44Percent: true,
                    age45To64Percent: true,
                    age65PlusPercent: true,
                    housingCorporationPercent: true,
                    registeredCrimesPer1000: true,
                    supermarketDistanceKm: true,
                    primarySchoolDistanceKm: true,
                    trainStationDistanceMeters: true,
                },
            },
        },
    },
    media: {
        where: { status: "READY" },
        orderBy: { sortOrder: "asc" },
        select: {
            id: true,
            kind: true,
            status: true,
            sortOrder: true,
            width: true,
            height: true,
            storageKey: true,
            fileName: true,
            sha256: true,
            mimeType: true,
        },
    },
    floorPlans: {
        orderBy: { sortOrder: "asc" },
        select: {
            id: true,
            mode: true,
            floorName: true,
            embedUrl: true,
            staticMediaId: true,
            sortOrder: true,
        },
    },
} satisfies Prisma.ListingSelect;

export type LoadedPassportListing = Prisma.ListingGetPayload<{
    select: typeof PASSPORT_LISTING_SELECT;
}>;

/** Normaliseert BigInt/Decimal/Date naar JSON-waarden voor een snapshot. */
function toJson(value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString();
    return value;
}

function projectListing(listing: LoadedPassportListing): Record<string, unknown> {
    const property = listing.property;
    return {
        id: listing.id,
        purpose: listing.purpose,
        publicSlug: listing.publicSlug,
        titleNl: listing.titleNl,
        titleEn: listing.titleEn,
        descriptionNl: listing.descriptionNl,
        descriptionEn: listing.descriptionEn,
        askingPriceCents: toJson(listing.askingPriceCents),
        monthlyRentCents: toJson(listing.monthlyRentCents),
        serviceCostsCents: toJson(listing.serviceCostsCents),
        availableFrom: toJson(listing.availableFrom),
        attributes: listing.attributes,
        property: {
            street: property.street,
            houseNumber: property.houseNumber,
            houseNumberAddition: property.houseNumberAddition,
            postcode: property.postcode,
            city: property.city,
            municipality: property.municipality,
            province: property.province,
            propertyType: property.propertyType,
            livingAreaSqm: toJson(property.livingAreaSqm),
            officialLandAreaSqm: toJson(property.officialLandAreaSqm),
            volumeCubicMeters: toJson(property.volumeCubicMeters),
            roomCount: property.roomCount,
            bedroomCount: property.bedroomCount,
            bathroomCount: property.bathroomCount,
            floorCount: property.floorCount,
            roofType: property.roofType,
            externalStorageAreaSqm: toJson(property.externalStorageAreaSqm),
            constructionYear: property.constructionYear,
            isMonument: property.isMonument,
            cadastralParcelId: property.cadastralParcelId,
            amenities: property.amenities ?? [],
            parkingOptions: property.parkingOptions ?? [],
            energyLabels: property.energyLabels.map((label) => ({
                labelClass: label.labelClass,
                registrationNumber: label.registrationNumber,
                registeredAt: toJson(label.registeredAt),
                validUntil: toJson(label.validUntil),
            })),
            neighborhoodProfile: property.neighborhoodProfile
                ? toJson(property.neighborhoodProfile)
                : null,
        },
        media: listing.media.map((item) => ({
            id: item.id,
            kind: item.kind,
            status: item.status,
            sortOrder: item.sortOrder,
            width: item.width,
            height: item.height,
            storageKey: item.storageKey,
            fileName: item.fileName,
            sha256: item.sha256,
            mimeType: item.mimeType,
        })),
        floorPlans: listing.floorPlans.map((plan) => ({
            id: plan.id,
            mode: plan.mode,
            floorName: plan.floorName,
            embedUrl: plan.embedUrl,
            staticMediaId: plan.staticMediaId,
            sortOrder: plan.sortOrder,
        })),
    };
}

function buildSourceData(
    listing: LoadedPassportListing,
    draft: Record<string, unknown>,
    documents: Array<{ category: string }>,
): PassportSourceData {
    return {
        purpose: (listing.purpose as "SALE" | "RENT") ?? "SALE",
        propertyType: String(listing.property.propertyType ?? ""),
        listing: {
            titleNl: listing.titleNl,
            descriptionNl: listing.descriptionNl,
            attributes: listing.attributes,
            property: {
                livingAreaSqm: listing.property.livingAreaSqm,
                roomCount: listing.property.roomCount,
                constructionYear: listing.property.constructionYear,
                cadastralParcelId: listing.property.cadastralParcelId,
                energyLabels: listing.property.energyLabels,
                neighborhoodProfile: listing.property.neighborhoodProfile,
            },
            media: listing.media,
            floorPlans: listing.floorPlans,
        },
        draft,
        documents,
    };
}

async function loadPassportListing(
    tx: Prisma.TransactionClient,
    listingId: string,
) {
    return tx.listing.findUniqueOrThrow({
        where: { id: listingId },
        select: PASSPORT_LISTING_SELECT,
    });
}

/** Berekent de volledigheid op basis van geladen listing + draft + documenten. */
export function computeCompletenessFromListing(
    listing: LoadedPassportListing,
    draft: Record<string, unknown>,
    documents: Array<{ category: string }>,
) {
    return computePassportCompleteness(
        buildSourceData(listing, draft, documents),
    );
}

async function loadPassportDocuments(
    tx: Prisma.TransactionClient,
    transactionId: string,
) {
    return tx.transactionDocument.findMany({
        where: {
            transactionId,
            status: "AVAILABLE",
            category: { in: [...PASSPORT_DOCUMENT_CATEGORIES] },
        },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            category: true,
            fileName: true,
            sha256: true,
            uploadedBy: { select: { name: true } },
        },
    });
}

async function loadDraft(
    tx: Prisma.TransactionClient,
    listingId: string,
): Promise<Record<string, unknown>> {
    const draft = await tx.propertyPassportDraft.findUnique({
        where: { listingId },
        select: { fields: true },
    });
    const fields = draft?.fields;
    return fields && typeof fields === "object" && !Array.isArray(fields)
        ? (fields as Record<string, unknown>)
        : {};
}

export type PassportSnapshotResult = {
    snapshot: PassportSnapshot;
    contentHash: string;
};

/** Bouwt de momentopname op basis van listing + draft + documenten. */
export async function buildPassportSnapshot(
    tx: Prisma.TransactionClient,
    listingId: string,
    transactionId: string,
    trigger: PassportTrigger,
    changeNote: string,
): Promise<PassportSnapshotResult> {
    const [listing, draft, documents] = await Promise.all([
        loadPassportListing(tx, listingId),
        loadDraft(tx, listingId),
        loadPassportDocuments(tx, transactionId),
    ]);
    const source = buildSourceData(listing, draft, documents);
    const completeness = computePassportCompleteness(source);
    const content: PassportSnapshotContent = {
        completeness,
        listingVersionSource: listing.version,
        listing: projectListing(listing),
        draft,
        documents: documents.map((document) => ({
            id: document.id,
            category: document.category,
            fileName: document.fileName,
            sha256: document.sha256,
            uploadedByName: document.uploadedBy?.name ?? null,
        })),
    };
    const contentHash = createHash("sha256")
        .update(canonicalJson(content))
        .digest("hex");
    const snapshot: PassportSnapshot = {
        generatedAt: new Date().toISOString(),
        trigger,
        changeNote,
        content,
    };
    return { snapshot, contentHash };
}

/** Contenthash van een eerder opgeslagen snapshot (om wijzigingen te detecteren). */
function snapshotContentHash(snapshot: Prisma.JsonValue | null): string | null {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
        return null;
    const content = (snapshot as Record<string, unknown>).content;
    if (content === undefined || content === null) return null;
    return createHash("sha256")
        .update(canonicalJson(content))
        .digest("hex");
}

/**
 * Maakt een nieuwe paspoortversie aan wanneer de inhoud sinds de laatste versie
 * is gewijzigd. Bij identieke inhoud wordt niets aangemaakt (voorkomt ruis).
 * Retourneert de aangemaakte versie of `null`.
 */
export async function maybeCreatePassportVersion(
    tx: Prisma.TransactionClient,
    listingId: string,
    transactionId: string,
    actorUserId: string,
    trigger: PassportTrigger,
    changeNote: string,
) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
    const previous = await tx.propertyPassportVersion.findFirst({
        where: { listingId },
        orderBy: { version: "desc" },
        select: { version: true, entryHash: true, snapshot: true },
    });
    const { snapshot, contentHash } = await buildPassportSnapshot(
        tx,
        listingId,
        transactionId,
        trigger,
        changeNote,
    );
    if (
        previous &&
        snapshotContentHash(previous.snapshot) === contentHash
    ) {
        return null;
    }
    const nextVersion = (previous?.version ?? 0) + 1;
    const createdAt = new Date();
    const payload = {
        listingId,
        version: nextVersion,
        listingVersionSource: snapshot.content.listingVersionSource,
        completenessScore: snapshot.content.completeness.score,
        snapshot,
        createdByUserId: actorUserId,
        createdAt: createdAt.toISOString(),
    };
    const entryHash = chainedHash(previous?.entryHash ?? null, payload);
    const created = await tx.propertyPassportVersion.create({
        data: {
            listingId,
            version: nextVersion,
            listingVersionSource: snapshot.content.listingVersionSource,
            snapshot: snapshot as Prisma.InputJsonValue,
            completenessScore: snapshot.content.completeness.score,
            previousHash: previous?.entryHash ?? null,
            entryHash,
            createdByUserId: actorUserId,
            createdAt,
        },
    });
    await appendTransactionEvent(
        tx,
        transactionId,
        actorUserId,
        "PASSPORT_VERSION_CREATED",
        {
            version: nextVersion,
            entryHash,
            changeNote: snapshot.changeNote,
            trigger,
        },
    );
    return created;
}

/** Huidige (live) paspoortstatus voor beide partijen: score, checklist en
 * of de inhoud sinds de laatste versie is gewijzigd. */
export async function getPassportDraftStatus(
    tx: Prisma.TransactionClient,
    listingId: string,
    transactionId: string,
) {
    const [latest, listing, draft, documents] = await Promise.all([
        tx.propertyPassportVersion.findFirst({
            where: { listingId },
            orderBy: { version: "desc" },
            select: { version: true, snapshot: true, entryHash: true },
        }),
        loadPassportListing(tx, listingId),
        loadDraft(tx, listingId),
        loadPassportDocuments(tx, transactionId),
    ]);
    const source = buildSourceData(listing, draft, documents);
    const live = computePassportCompleteness(source);
    const content = {
        completeness: live,
        listingVersionSource: listing.version,
        listing: projectListing(listing),
        draft,
        documents: documents.map((document) => ({
            id: document.id,
            category: document.category,
            fileName: document.fileName,
            sha256: document.sha256,
            uploadedByName: document.uploadedBy?.name ?? null,
        })),
    } satisfies PassportSnapshotContent;
    const contentHash = createHash("sha256")
        .update(canonicalJson(content))
        .digest("hex");
    return {
        completeness: live,
        editableFields: draft,
        documents: documents.map((document) => ({
            id: document.id,
            category: document.category,
            fileName: document.fileName,
            sha256: document.sha256,
            uploadedByName: document.uploadedBy?.name ?? null,
        })),
        latestVersion: latest?.version ?? null,
        latestEntryHash: latest?.entryHash ?? null,
        hasChangesSinceLatest:
            latest === null ||
            snapshotContentHash(latest.snapshot) !== contentHash,
    };
}
