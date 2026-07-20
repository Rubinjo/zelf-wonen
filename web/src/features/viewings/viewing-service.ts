import { db } from "@/lib/db";
import type { ViewingSlotInput } from "@/lib/schemas/viewing";

export class ViewingError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_FOUND"
            | "SLOT_NOT_FOUND"
            | "SLOT_BOOKED"
            | "SLOT_FULL"
            | "SLOT_IN_PAST"
            | "SLOT_OVERLAP"
            | "ALREADY_BOOKED"
            | "BOOKING_NOT_FOUND"
            | "VIEWING_NOT_FINISHED"
            | "OWN_LISTING",
        message: string,
    ) {
        super(message);
        this.name = "ViewingError";
    }
}

const editableListingStatuses = [
    "DRAFT",
    "READY_FOR_VERIFICATION",
    "LIVE",
    "UNDER_OFFER",
] as const;

function ownerSlotInclude() {
    return {
        bookings: {
            orderBy: { createdAt: "asc" as const },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        },
    };
}

async function assertOwnerCanPlan(
    transaction: Parameters<Parameters<typeof db.$transaction>[0]>[0],
    ownerId: string,
    listingId: string,
) {
    const listing = await transaction.listing.findFirst({
        where: {
            id: listingId,
            ownerId,
            status: { in: [...editableListingStatuses] },
        },
        select: { id: true },
    });
    if (!listing) {
        throw new ViewingError(
            "LISTING_NOT_FOUND",
            "Advertentie niet gevonden of niet meer beschikbaar voor planning",
        );
    }
}

async function assertNoOverlap(
    transaction: Parameters<Parameters<typeof db.$transaction>[0]>[0],
    listingId: string,
    input: ViewingSlotInput,
    excludedSlotId?: string,
) {
    const overlap = await transaction.viewingSlot.findFirst({
        where: {
            listingId,
            id: excludedSlotId ? { not: excludedSlotId } : undefined,
            startsAt: { lt: new Date(input.endsAt) },
            endsAt: { gt: new Date(input.startsAt) },
        },
        select: { id: true },
    });
    if (overlap) {
        throw new ViewingError(
            "SLOT_OVERLAP",
            "Dit tijdstip overlapt met een bestaande bezichtiging",
        );
    }
}

export async function listOwnerViewingSlots(
    ownerId: string,
    listingId: string,
) {
    const listing = await db.listing.findFirst({
        where: { id: listingId, ownerId },
        select: { id: true },
    });
    if (!listing)
        throw new ViewingError(
            "LISTING_NOT_FOUND",
            "Advertentie niet gevonden",
        );

    return db.viewingSlot.findMany({
        where: { listingId },
        include: ownerSlotInclude(),
        orderBy: { startsAt: "asc" },
    });
}

export async function createOwnerViewingSlot(
    ownerId: string,
    listingId: string,
    input: ViewingSlotInput,
) {
    if (new Date(input.startsAt) <= new Date()) {
        throw new ViewingError(
            "SLOT_IN_PAST",
            "Kies een tijdstip in de toekomst",
        );
    }
    return db.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        await assertOwnerCanPlan(transaction, ownerId, listingId);
        await assertNoOverlap(transaction, listingId, input);
        return transaction.viewingSlot.create({
            data: {
                listingId,
                type: input.type,
                startsAt: new Date(input.startsAt),
                endsAt: new Date(input.endsAt),
                publishedAt: new Date(input.publishedAt),
                capacity: input.capacity,
            },
            include: ownerSlotInclude(),
        });
    });
}

export async function updateOwnerViewingSlot(
    ownerId: string,
    listingId: string,
    slotId: string,
    input: ViewingSlotInput,
) {
    if (new Date(input.startsAt) <= new Date()) {
        throw new ViewingError(
            "SLOT_IN_PAST",
            "Kies een tijdstip in de toekomst",
        );
    }
    return db.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        await assertOwnerCanPlan(transaction, ownerId, listingId);
        const slot = await transaction.viewingSlot.findFirst({
            where: { id: slotId, listingId },
            select: { id: true, _count: { select: { bookings: true } } },
        });
        if (!slot)
            throw new ViewingError("SLOT_NOT_FOUND", "Tijdstip niet gevonden");
        if (slot._count.bookings > 0) {
            throw new ViewingError(
                "SLOT_BOOKED",
                "Een geboekte bezichtiging kan niet worden aangepast",
            );
        }
        await assertNoOverlap(transaction, listingId, input, slotId);
        return transaction.viewingSlot.update({
            where: { id: slotId },
            data: {
                type: input.type,
                startsAt: new Date(input.startsAt),
                endsAt: new Date(input.endsAt),
                publishedAt: new Date(input.publishedAt),
                capacity: input.capacity,
            },
            include: ownerSlotInclude(),
        });
    });
}

export async function deleteOwnerViewingSlot(
    ownerId: string,
    listingId: string,
    slotId: string,
) {
    return db.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
        await assertOwnerCanPlan(transaction, ownerId, listingId);
        const deleted = await transaction.viewingSlot.deleteMany({
            where: { id: slotId, listingId, bookings: { none: {} } },
        });
        if (deleted.count > 0) return;
        const exists = await transaction.viewingSlot.findFirst({
            where: { id: slotId, listingId },
            select: { id: true },
        });
        throw new ViewingError(
            exists ? "SLOT_BOOKED" : "SLOT_NOT_FOUND",
            exists
                ? "Een geboekte bezichtiging kan niet worden verwijderd"
                : "Tijdstip niet gevonden",
        );
    });
}

export async function bookViewingSlot(userId: string, slotId: string) {
    return db.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${slotId}))`;
        const now = new Date();
        const slot = await transaction.viewingSlot.findFirst({
            where: {
                id: slotId,
                publishedAt: { lte: now },
                listing: { status: "LIVE" },
            },
            include: {
                listing: { select: { ownerId: true } },
                _count: { select: { bookings: true } },
            },
        });
        if (!slot)
            throw new ViewingError("SLOT_NOT_FOUND", "Tijdstip niet gevonden");
        if (slot.listing.ownerId === userId) {
            throw new ViewingError(
                "OWN_LISTING",
                "Je kunt je eigen woning niet bezichtigen",
            );
        }
        if (slot.startsAt <= now) {
            throw new ViewingError(
                "SLOT_IN_PAST",
                "Dit tijdstip is niet meer beschikbaar",
            );
        }
        if (slot._count.bookings >= slot.capacity) {
            throw new ViewingError(
                "SLOT_FULL",
                "Dit tijdstip is inmiddels volgeboekt",
            );
        }
        const existing = await transaction.viewingBooking.findUnique({
            where: { slotId_userId: { slotId, userId } },
            select: { id: true },
        });
        if (existing) {
            throw new ViewingError(
                "ALREADY_BOOKED",
                "Je hebt dit tijdstip al geboekt",
            );
        }
        return transaction.viewingBooking.create({
            data: { slotId, userId },
            select: { id: true, createdAt: true },
        });
    });
}

export async function reviewViewingAttendance(
    ownerId: string,
    listingId: string,
    bookingId: string,
    attendanceStatus: "CONFIRMED" | "NO_SHOW",
) {
    return db.$transaction(async (transaction) => {
        const booking = await transaction.viewingBooking.findFirst({
            where: {
                id: bookingId,
                slot: { listingId, listing: { ownerId } },
            },
            include: {
                slot: { select: { endsAt: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        });
        if (!booking) {
            throw new ViewingError(
                "BOOKING_NOT_FOUND",
                "Boeking niet gevonden",
            );
        }
        if (booking.slot.endsAt > new Date()) {
            throw new ViewingError(
                "VIEWING_NOT_FINISHED",
                "Bevestig de aanwezigheid nadat de bezichtiging is afgelopen",
            );
        }
        return transaction.viewingBooking.update({
            where: { id: bookingId },
            data: { attendanceStatus, ownerReviewedAt: new Date() },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });
    });
}
