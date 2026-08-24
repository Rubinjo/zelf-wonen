import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
    seekerListingInclude,
    listingSummary,
} from "@/features/seeker/seeker-service";

export class ListingMessageError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_FOUND"
            | "LISTING_NOT_MESSAGEABLE"
            | "OWN_LISTING"
            | "THREAD_NOT_FOUND",
        message: string,
    ) {
        super(message);
        this.name = "ListingMessageError";
    }
}

const threadMessageInclude = {
    author: { select: { id: true, name: true } },
    transferredToTransaction: {
        select: { id: true, status: true },
    },
} satisfies Prisma.ListingMessageInclude;

export type ListingThreadMessage = Prisma.ListingMessageGetPayload<{
    include: typeof threadMessageInclude;
}>;

async function loadMessageableListing(listingId: string) {
    const listing = await db.listing.findUnique({
        where: { id: listingId },
        select: {
            id: true,
            ownerId: true,
            purpose: true,
            status: true,
            titleNl: true,
            property: {
                select: {
                    street: true,
                    houseNumber: true,
                    houseNumberAddition: true,
                    postcode: true,
                    city: true,
                },
            },
        },
    });
    if (!listing) {
        throw new ListingMessageError(
            "LISTING_NOT_FOUND",
            "Advertentie niet gevonden",
        );
    }
    return listing;
}

async function activeTransactionForListing(listingId: string, userId: string) {
    const transaction = await db.propertyTransaction.findFirst({
        where: { listingId, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            status: true,
            buyerUserId: true,
            sellerUserId: true,
        },
    });
    if (!transaction) return null;
    if (
        transaction.buyerUserId !== userId &&
        transaction.sellerUserId !== userId
    ) {
        return null;
    }
    return { id: transaction.id, status: transaction.status };
}

export async function sendListingMessage(input: {
    listingId: string;
    authorUserId: string;
    body: string;
    // Alleen nodig als de EIGENAAR antwoordt: de gesprekspartner.
    seekerUserId?: string;
}) {
    const listing = await loadMessageableListing(input.listingId);
    if (listing.status !== "LIVE") {
        throw new ListingMessageError(
            "LISTING_NOT_MESSAGEABLE",
            "Voor deze woning kunnen geen berichten meer worden verstuurd",
        );
    }
    const isOwner = listing.ownerId === input.authorUserId;
    let seekerUserId: string;
    if (isOwner) {
        const target = input.seekerUserId;
        if (!target || target === listing.ownerId) {
            throw new ListingMessageError(
                "OWN_LISTING",
                "Je kunt geen bericht sturen naar je eigen advertentie",
            );
        }
        const existing = await db.listingMessage.findFirst({
            where: { listingId: input.listingId, seekerUserId: target },
            select: { id: true },
        });
        if (!existing) {
            throw new ListingMessageError(
                "THREAD_NOT_FOUND",
                "Dit gesprek bestaat niet (meer)",
            );
        }
        seekerUserId = target;
    } else {
        seekerUserId = input.authorUserId;
    }
    return db.listingMessage.create({
        data: {
            listingId: input.listingId,
            authorUserId: input.authorUserId,
            seekerUserId,
            body: input.body,
        },
        include: threadMessageInclude,
    });
}

// ---- Berichtenlijn van één woningzoeker met de eigenaar -------------------

export type ParticipantThread = {
    isOwner: false;
    listingId: string;
    currentUserId: string;
    canMessage: boolean;
    listing: ReturnType<typeof listingToView>;
    messages: ListingThreadMessage[];
    unreadIncoming: number;
    transaction: { id: string; status: string } | null;
};

export async function getParticipantThread(
    listingId: string,
    userId: string,
): Promise<ParticipantThread> {
    const listing = await loadMessageableListing(listingId);
    const isOwner = listing.ownerId === userId;
    const canMessage = listing.status === "LIVE" && !isOwner;
    const [messages, transaction] = await Promise.all([
        isOwner
            ? Promise.resolve([] as ListingThreadMessage[])
            : db.listingMessage.findMany({
                  where: { listingId, seekerUserId: userId },
                  include: threadMessageInclude,
                  orderBy: { createdAt: "asc" },
              }),
        activeTransactionForListing(listingId, userId),
    ]);
    const unreadIncoming = messages.filter(
        (message) =>
            message.authorUserId === listing.ownerId && !message.readAt,
    ).length;
    return {
        isOwner: false,
        listingId,
        currentUserId: userId,
        canMessage,
        listing: listingToView(listing),
        messages,
        unreadIncoming,
        transaction,
    };
}

// ---- Eigenaarsweergave: alle gesprekken op één advertentie ----------------

export type OwnerConversation = {
    seekerUserId: string;
    seekerName: string;
    messages: ListingThreadMessage[];
    unreadIncoming: number;
    lastMessageAt: string | null;
};

export type OwnerMessagesView = {
    isOwner: true;
    listingId: string;
    listing: ReturnType<typeof listingToView>;
    conversations: OwnerConversation[];
    transaction: { id: string; status: string } | null;
};

export async function getOwnerMessagesView(
    listingId: string,
    ownerId: string,
): Promise<OwnerMessagesView> {
    const listing = await db.listing.findFirst({
        where: { id: listingId, ownerId },
        select: {
            id: true,
            ownerId: true,
            purpose: true,
            status: true,
            titleNl: true,
            property: {
                select: {
                    street: true,
                    houseNumber: true,
                    houseNumberAddition: true,
                    postcode: true,
                    city: true,
                },
            },
        },
    });
    if (!listing) {
        throw new ListingMessageError(
            "LISTING_NOT_FOUND",
            "Advertentie niet gevonden",
        );
    }
    const [messages, transaction] = await Promise.all([
        db.listingMessage.findMany({
            where: { listingId },
            include: threadMessageInclude,
            orderBy: { createdAt: "asc" },
        }),
        activeTransactionForListing(listingId, ownerId),
    ]);
    const bySeeker = new Map<string, ListingThreadMessage[]>();
    const seekerNames = new Map<string, string>();
    for (const message of messages) {
        const thread = bySeeker.get(message.seekerUserId) ?? [];
        thread.push(message);
        bySeeker.set(message.seekerUserId, thread);
        if (message.authorUserId !== listing.ownerId) {
            seekerNames.set(message.seekerUserId, message.author.name);
        }
    }
    const conversations: OwnerConversation[] = [];
    for (const [seekerUserId, thread] of bySeeker) {
        conversations.push({
            seekerUserId,
            seekerName:
                seekerNames.get(seekerUserId) ?? seekerUserId.slice(0, 8),
            messages: thread,
            unreadIncoming: thread.filter(
                (message) =>
                    message.authorUserId !== listing.ownerId && !message.readAt,
            ).length,
            lastMessageAt: thread.at(-1)?.createdAt.toISOString() ?? null,
        });
    }
    conversations.sort((left, right) =>
        (right.lastMessageAt ?? "").localeCompare(left.lastMessageAt ?? ""),
    );
    return {
        isOwner: true,
        listingId,
        listing: listingToView(listing),
        conversations,
        transaction,
    };
}

export async function markListingMessagesRead(
    listingId: string,
    userId: string,
) {
    const listing = await loadMessageableListing(listingId);
    const isOwner = listing.ownerId === userId;
    const result = await db.listingMessage.updateMany({
        where: {
            listingId,
            readAt: null,
            ...(isOwner
                ? { authorUserId: { not: userId } }
                : { authorUserId: listing.ownerId, seekerUserId: userId }),
        },
        data: { readAt: new Date() },
    });
    return result.count;
}

export type UserMessageThread = {
    listingId: string;
    listing: ReturnType<typeof listingSummary>;
    lastMessageAt: string;
    messageCount: number;
    unreadIncoming: number;
    hasTransferred: boolean;
    transaction: { id: string; status: string } | null;
};

export async function listUserMessageThreads(userId: string) {
    const [messages, transactions] = await Promise.all([
        db.listingMessage.findMany({
            where: { seekerUserId: userId },
            include: { listing: { include: seekerListingInclude } },
            orderBy: { createdAt: "desc" },
        }),
        db.propertyTransaction.findMany({
            where: {
                OR: [{ buyerUserId: userId }, { sellerUserId: userId }],
                status: { not: "CANCELLED" },
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                status: true,
                buyerUserId: true,
                sellerUserId: true,
                listingId: true,
            },
        }),
    ]);
    const transactionByListing = new Map<
        string,
        { id: string; status: string } | null
    >();
    for (const transaction of transactions) {
        const accessible =
            transaction.buyerUserId === userId ||
            transaction.sellerUserId === userId;
        if (accessible && !transactionByListing.has(transaction.listingId)) {
            transactionByListing.set(transaction.listingId, {
                id: transaction.id,
                status: transaction.status,
            });
        }
    }
    const ownerByListing = new Map<string, string>();
    const threads = new Map<string, UserMessageThread>();
    for (const message of messages) {
        const listingId = message.listingId;
        ownerByListing.set(listingId, message.listing.ownerId);
        let thread = threads.get(listingId);
        if (!thread) {
            thread = {
                listingId,
                listing: listingSummary(message.listing),
                lastMessageAt: message.createdAt.toISOString(),
                messageCount: 0,
                unreadIncoming: 0,
                hasTransferred: false,
                transaction: transactionByListing.get(listingId) ?? null,
            };
            threads.set(listingId, thread);
        }
        if (message.createdAt.toISOString() > thread.lastMessageAt) {
            thread.lastMessageAt = message.createdAt.toISOString();
        }
        thread.messageCount += 1;
        if (message.transferredAt) thread.hasTransferred = true;
    }
    const listingIds = [...threads.keys()];
    if (listingIds.length > 0) {
        const incoming = await db.listingMessage.findMany({
            where: {
                listingId: { in: listingIds },
                seekerUserId: userId,
                authorUserId: { in: [...ownerByListing.values()] },
                readAt: null,
            },
            select: { listingId: true },
        });
        for (const message of incoming) {
            const thread = threads.get(message.listingId);
            if (thread) thread.unreadIncoming += 1;
        }
    }
    return [...threads.values()].sort((left, right) =>
        right.lastMessageAt.localeCompare(left.lastMessageAt),
    );
}

export async function getOwnerListingMessageSummary(
    ownerId: string,
    listingId: string,
) {
    const listing = await db.listing.findFirst({
        where: { id: listingId, ownerId },
        select: { id: true, ownerId: true },
    });
    if (!listing) return null;
    const [messages, transactions] = await Promise.all([
        db.listingMessage.findMany({
            where: { listingId },
            select: {
                id: true,
                authorUserId: true,
                readAt: true,
                transferredAt: true,
            },
        }),
        db.propertyTransaction.findMany({
            where: { listingId, status: { not: "CANCELLED" } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true },
        }),
    ]);
    const unreadIncoming = messages.filter(
        (message) => message.authorUserId !== ownerId && !message.readAt,
    ).length;
    return {
        unreadIncoming,
        total: messages.length,
        transferred: messages.filter((message) => message.transferredAt).length,
        transaction: transactions[0] ?? null,
    };
}

function listingToView(listing: {
    id: string;
    ownerId: string;
    purpose: string;
    status: string;
    titleNl: string | null;
    property: {
        street: string;
        houseNumber: number;
        houseNumberAddition: string | null;
        postcode: string;
        city: string;
    };
}) {
    return {
        id: listing.id,
        ownerId: listing.ownerId,
        purpose: listing.purpose,
        status: listing.status,
        titleNl: listing.titleNl,
        street: listing.property.street,
        houseNumber: listing.property.houseNumber,
        houseNumberAddition: listing.property.houseNumberAddition,
        postcode: listing.property.postcode,
        city: listing.property.city,
    };
}
