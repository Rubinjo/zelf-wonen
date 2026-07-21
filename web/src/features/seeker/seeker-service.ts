import type { Prisma, SeekerNotificationType } from "@/generated/prisma/client";
import { searchMarketplaceListings } from "@/features/listings/marketplace-service";
import { db } from "@/lib/db";

export const seekerListingInclude = {
    property: {
        include: {
            energyLabels: {
                orderBy: { registeredAt: "desc" as const },
                take: 1,
            },
        },
    },
    media: {
        where: { kind: "PHOTO" as const, status: "READY" as const },
        orderBy: { sortOrder: "asc" as const },
        take: 1,
    },
} satisfies Prisma.ListingInclude;

type SeekerListing = Prisma.ListingGetPayload<{
    include: typeof seekerListingInclude;
}>;

export function currentPrice(
    listing: Pick<
        SeekerListing,
        "purpose" | "askingPriceCents" | "monthlyRentCents"
    >,
) {
    return listing.purpose === "RENT"
        ? listing.monthlyRentCents
        : listing.askingPriceCents;
}

export function listingSummary(listing: SeekerListing) {
    return {
        id: listing.id,
        slug: listing.publicSlug,
        purpose: listing.purpose,
        status: listing.status,
        title: listing.titleNl,
        priceCents: currentPrice(listing)?.toString() ?? null,
        street: listing.property.street,
        houseNumber: listing.property.houseNumber,
        houseNumberAddition: listing.property.houseNumberAddition,
        postcode: listing.property.postcode,
        city: listing.property.city,
        livingAreaSqm: listing.property.livingAreaSqm?.toString() ?? null,
        roomCount: listing.property.roomCount,
        energyLabel: listing.property.energyLabels[0]?.labelClass ?? null,
        imageUrl: listing.media[0] ? `/${listing.media[0].storageKey}` : null,
    };
}

function paramsFromQuery(queryString: string) {
    const params = new URLSearchParams(
        queryString.startsWith("?") ? queryString.slice(1) : queryString,
    );
    const result: Record<string, string | string[]> = {};
    for (const key of new Set(params.keys())) {
        const values = params.getAll(key);
        result[key] = values.length > 1 ? values : values[0];
    }
    delete result.page;
    return result;
}

async function createNotification(
    userId: string,
    type: SeekerNotificationType,
    eventKey: string,
    title: string,
    body: string,
    href?: string,
    payload?: Prisma.InputJsonValue,
) {
    await db.seekerNotification.upsert({
        where: { userId_eventKey: { userId, eventKey } },
        create: { userId, type, eventKey, title, body, href, payload },
        update: {},
    });
}

export async function syncSeekerNotifications(userId: string) {
    const preferences = await db.notificationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });
    if (!preferences.inAppEnabled) return;
    const [favorites, viewings, bids, transactions, searches] =
        await Promise.all([
            db.favoriteListing.findMany({
                where: { userId },
                include: { listing: { include: seekerListingInclude } },
            }),
            db.viewingBooking.findMany({
                where: { userId },
                include: {
                    slot: {
                        include: { listing: { include: seekerListingInclude } },
                    },
                },
            }),
            db.bid.findMany({
                where: { bidderUserId: userId },
                include: {
                    events: { orderBy: { occurredAt: "desc" }, take: 1 },
                    listing: { include: seekerListingInclude },
                },
            }),
            db.propertyTransaction.findMany({
                where: { buyerUserId: userId },
                include: {
                    listing: { include: seekerListingInclude },
                    milestones: {
                        where: {
                            dueAt: { not: null },
                            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
                        },
                    },
                },
            }),
            db.savedSearch.findMany({
                where: { userId, notificationsEnabled: true },
            }),
        ]);

    for (const favorite of favorites) {
        const price = currentPrice(favorite.listing);
        if (
            preferences.priceChange &&
            favorite.priceSnapshotCents !== null &&
            price !== null &&
            favorite.priceSnapshotCents !== price
        ) {
            await createNotification(
                userId,
                "PRICE_CHANGED",
                `favorite-price:${favorite.id}:${price}`,
                "Prijs gewijzigd",
                `${favorite.listing.property.street} ${favorite.listing.property.houseNumber} heeft een nieuwe prijs.`,
                favorite.listing.publicSlug
                    ? `/woning/${favorite.listing.publicSlug}`
                    : undefined,
            );
        }
        if (
            preferences.statusChange &&
            favorite.statusSnapshot !== favorite.listing.status
        ) {
            await createNotification(
                userId,
                "LISTING_STATUS_CHANGED",
                `favorite-status:${favorite.id}:${favorite.listing.status}`,
                "Status woning gewijzigd",
                `${favorite.listing.property.street} ${favorite.listing.property.houseNumber} is nu ${favorite.listing.status.toLowerCase().replaceAll("_", " ")}.`,
                favorite.listing.publicSlug
                    ? `/woning/${favorite.listing.publicSlug}`
                    : undefined,
            );
        }
        if (
            favorite.priceSnapshotCents !== price ||
            favorite.statusSnapshot !== favorite.listing.status
        ) {
            await db.favoriteListing.update({
                where: { id: favorite.id },
                data: {
                    priceSnapshotCents: price,
                    statusSnapshot: favorite.listing.status,
                },
            });
        }
    }
    if (preferences.viewing)
        for (const viewing of viewings) {
            await createNotification(
                userId,
                "VIEWING_UPDATED",
                `viewing:${viewing.id}:${viewing.attendanceStatus}:${viewing.slot.startsAt.toISOString()}`,
                "Bezichtiging",
                `${viewing.slot.listing.property.street} ${viewing.slot.listing.property.houseNumber}: ${viewing.attendanceStatus.toLowerCase()}.`,
                "/dashboard/zoeker?tab=viewings",
            );
        }
    if (preferences.bid)
        for (const bid of bids) {
            const state = bid.events[0]?.type ?? "SUBMITTED";
            await createNotification(
                userId,
                "BID_UPDATED",
                `bid:${bid.id}:${state}`,
                state === "ACCEPTED" ? "Bod geaccepteerd" : "Status van je bod",
                `${bid.listing.property.street} ${bid.listing.property.houseNumber}: ${state.toLowerCase()}.`,
                "/dashboard/zoeker?tab=bids",
            );
        }
    if (preferences.transaction)
        for (const transaction of transactions) {
            await createNotification(
                userId,
                "TRANSACTION_UPDATED",
                `transaction:${transaction.id}:${transaction.status}:${transaction.version}`,
                "Transactie bijgewerkt",
                `${transaction.listing.property.street} ${transaction.listing.property.houseNumber}: ${transaction.status.toLowerCase().replaceAll("_", " ")}.`,
                `/dashboard/transacties/${transaction.id}`,
            );
            if (preferences.deadline)
                for (const milestone of transaction.milestones) {
                    const dueAt = milestone.dueAt!;
                    const days = Math.ceil(
                        (dueAt.getTime() - Date.now()) / 86_400_000,
                    );
                    if (days >= 0 && days <= 7)
                        await createNotification(
                            userId,
                            "DEADLINE_APPROACHING",
                            `deadline:${milestone.id}:${dueAt.toISOString()}`,
                            "Deadline nadert",
                            `${milestone.title} verloopt ${days === 0 ? "vandaag" : `over ${days} dagen`}.`,
                            `/dashboard/transacties/${transaction.id}`,
                        );
                }
        }
    if (preferences.newListing)
        for (const search of searches) {
            const searchParams = paramsFromQuery(search.queryString);
            const firstPage = await searchMarketplaceListings(searchParams);
            const remainingPages = await Promise.all(
                Array.from(
                    { length: Math.max(0, firstPage.pagination.pageCount - 1) },
                    (_, index) =>
                        searchMarketplaceListings({
                            ...searchParams,
                            page: String(index + 2),
                        }),
                ),
            );
            const matches = [firstPage, ...remainingPages]
                .flatMap((result) => result.data)
                .filter(
                    (listing) =>
                        listing.liveAt &&
                        new Date(listing.liveAt) > search.lastCheckedAt,
                );
            for (const listing of matches)
                await createNotification(
                    userId,
                    "NEW_LISTING",
                    `saved-search:${search.id}:${listing.id}`,
                    "Nieuwe woning voor je zoekopdracht",
                    `${listing.street} ${listing.houseNumber} in ${listing.city} past bij “${search.name}”.`,
                    `/woning/${listing.slug}`,
                );
            await db.savedSearch.update({
                where: { id: search.id },
                data: { lastCheckedAt: new Date() },
            });
        }
}

export async function getSeekerDashboard(userId: string) {
    const [
        favorites,
        searches,
        notifications,
        preferences,
        viewings,
        bids,
        transactions,
        shares,
    ] = await Promise.all([
        db.favoriteListing.findMany({
            where: { userId },
            include: { listing: { include: seekerListingInclude } },
            orderBy: { updatedAt: "desc" },
        }),
        db.savedSearch.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
        }),
        db.seekerNotification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 100,
        }),
        db.notificationPreference.upsert({
            where: { userId },
            create: { userId },
            update: {},
        }),
        db.viewingBooking.findMany({
            where: { userId },
            include: {
                slot: {
                    include: { listing: { include: seekerListingInclude } },
                },
            },
            orderBy: { slot: { startsAt: "desc" } },
        }),
        db.bid.findMany({
            where: { bidderUserId: userId },
            include: {
                events: { orderBy: { occurredAt: "asc" } },
                listing: { include: seekerListingInclude },
                transaction: { select: { id: true, status: true } },
            },
            orderBy: { submittedAt: "desc" },
        }),
        db.propertyTransaction.findMany({
            where: { buyerUserId: userId },
            include: {
                listing: { include: seekerListingInclude },
                milestones: true,
            },
            orderBy: { updatedAt: "desc" },
        }),
        db.shortlistShare.findMany({
            where: { ownerId: userId },
            include: { _count: { select: { items: true } } },
            orderBy: { createdAt: "desc" },
        }),
    ]);
    return {
        favorites: favorites.map((item) => ({
            id: item.id,
            note: item.note,
            createdAt: item.createdAt,
            listing: listingSummary(item.listing),
        })),
        searches,
        notifications,
        preferences,
        viewings: viewings.map((item) => ({
            id: item.id,
            attendanceStatus: item.attendanceStatus,
            createdAt: item.createdAt,
            slot: {
                id: item.slot.id,
                startsAt: item.slot.startsAt,
                endsAt: item.slot.endsAt,
                type: item.slot.type,
            },
            listing: listingSummary(item.slot.listing),
        })),
        bids: bids.map((item) => ({
            id: item.id,
            amountCents: item.amountCents.toString(),
            submittedAt: item.submittedAt,
            financingDeadline: item.financingDeadline,
            transferDateRequested: item.transferDateRequested,
            events: item.events,
            transaction: item.transaction,
            listing: listingSummary(item.listing),
        })),
        transactions: transactions.map((item) => ({
            id: item.id,
            status: item.status,
            updatedAt: item.updatedAt,
            milestones: item.milestones,
            listing: listingSummary(item.listing),
        })),
        shares,
    };
}
