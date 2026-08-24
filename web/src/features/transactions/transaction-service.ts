import { createHash } from "node:crypto";
import type { Prisma, TransactionEventType } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export class TransactionAccessError extends Error {
    constructor(
        readonly code:
            | "TRANSACTION_NOT_FOUND"
            | "TRANSACTION_FORBIDDEN"
            | "TRANSACTION_CLOSED",
        message: string,
    ) {
        super(message);
        this.name = "TransactionAccessError";
    }
}

export function canonicalJson(value: unknown): string {
    if (typeof value === "bigint") return JSON.stringify(value.toString());
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (
        value &&
        typeof value === "object" &&
        "toJSON" in value &&
        typeof value.toJSON === "function"
    ) {
        return canonicalJson(value.toJSON());
    }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(
                ([key, item]) =>
                    `${JSON.stringify(key)}:${canonicalJson(item)}`,
            )
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

export function chainedHash(previousHash: string | null, payload: unknown) {
    return createHash("sha256")
        .update(`${previousHash ?? ""}${canonicalJson(payload)}`)
        .digest("hex");
}

export async function requireTransactionParticipant(
    transactionId: string,
    userId: string,
) {
    const transaction = await db.propertyTransaction.findUnique({
        where: { id: transactionId },
        select: {
            id: true,
            listingId: true,
            sellerUserId: true,
            buyerUserId: true,
            status: true,
        },
    });
    if (!transaction)
        throw new TransactionAccessError(
            "TRANSACTION_NOT_FOUND",
            "Transactieruimte niet gevonden",
        );
    if (
        transaction.sellerUserId !== userId &&
        transaction.buyerUserId !== userId
    ) {
        throw new TransactionAccessError(
            "TRANSACTION_FORBIDDEN",
            "Je hebt geen toegang tot deze transactieruimte",
        );
    }
    return transaction;
}

export async function appendTransactionEvent(
    tx: Prisma.TransactionClient,
    transactionId: string,
    actorUserId: string | null,
    type: TransactionEventType,
    payload: Prisma.InputJsonValue,
) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${transactionId}))`;
    const latest = await tx.transactionEvent.findFirst({
        where: { transactionId },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { entryHash: true },
    });
    const occurredAt = new Date();
    const eventPayload = {
        transactionId,
        actorUserId,
        type,
        payload,
        occurredAt: occurredAt.toISOString(),
    };
    return tx.transactionEvent.create({
        data: {
            transactionId,
            actorUserId,
            type,
            payload,
            occurredAt,
            previousHash: latest?.entryHash ?? null,
            entryHash: chainedHash(latest?.entryHash ?? null, eventPayload),
        },
    });
}

export async function listUserTransactions(userId: string) {
    return db.propertyTransaction.findMany({
        where: { OR: [{ sellerUserId: userId }, { buyerUserId: userId }] },
        include: {
            listing: {
                include: {
                    property: true,
                    media: {
                        where: { kind: "PHOTO", status: "READY" },
                        take: 1,
                    },
                },
            },
            seller: { select: { id: true, name: true } },
            buyer: { select: { id: true, name: true } },
            milestones: { orderBy: { sortOrder: "asc" } },
            _count: { select: { messages: true, documents: true } },
        },
        orderBy: { updatedAt: "desc" },
    });
}

export async function getTransactionRoom(
    transactionId: string,
    userId: string,
) {
    await requireTransactionParticipant(transactionId, userId);
    return db.propertyTransaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: {
            listing: {
                include: {
                    property: {
                        select: {
                            propertyType: true,
                            street: true,
                            houseNumber: true,
                            houseNumberAddition: true,
                            postcode: true,
                            city: true,
                            livingAreaSqm: true,
                            roomCount: true,
                            constructionYear: true,
                            energyLabels: {
                                orderBy: { registeredAt: "desc" },
                                take: 1,
                            },
                        },
                    },
                },
            },
            acceptedBid: true,
            seller: { select: { id: true, name: true, email: true } },
            buyer: { select: { id: true, name: true, email: true } },
            securityPaidBy: { select: { id: true, name: true } },
            securityConfirmedBy: { select: { id: true, name: true } },
            securityFormChosenBy: { select: { id: true, name: true } },
            milestones: { orderBy: { sortOrder: "asc" } },
            messages: {
                include: {
                    author: { select: { id: true, name: true } },
                    documents: { where: { status: "AVAILABLE" } },
                },
                orderBy: { createdAt: "asc" },
                take: 200,
            },
            documents: {
                where: { status: "AVAILABLE" },
                include: { uploadedBy: { select: { id: true, name: true } } },
                orderBy: { createdAt: "desc" },
            },
            events: { orderBy: { occurredAt: "desc" }, take: 50 },
            agreement: true,
        },
    });
}

// Verplaatst de berichten die vóór de koop tussen koper en verkoper over de
// advertentie zijn gewisseld naar de chat van de transactieruimte. Roep dit aan
// binnen dezelfde database-transactie als het aanmaken van de transactie.
export async function transferListingMessagesToTransaction(
    tx: Prisma.TransactionClient,
    transaction: {
        id: string;
        listingId: string;
        sellerUserId: string;
        buyerUserId: string;
    },
) {
    const messages = await tx.listingMessage.findMany({
        where: {
            listingId: transaction.listingId,
            // Alleen de berichtenlijn van de koper wordt overgezet.
            seekerUserId: transaction.buyerUserId,
            transferredToTransactionId: null,
        },
        orderBy: { createdAt: "asc" },
    });
    if (messages.length === 0) return 0;
    const occurredAt = new Date();
    for (const message of messages) {
        await tx.transactionMessage.create({
            data: {
                transactionId: transaction.id,
                authorUserId: message.authorUserId,
                kind: "TEXT",
                body: message.body,
                createdAt: message.createdAt,
            },
        });
    }
    await tx.listingMessage.updateMany({
        where: { id: { in: messages.map((message) => message.id) } },
        data: {
            transferredToTransactionId: transaction.id,
            transferredAt: occurredAt,
        },
    });
    await tx.transactionMessage.create({
        data: {
            transactionId: transaction.id,
            authorUserId: transaction.buyerUserId,
            kind: "SYSTEM",
            body: `${messages.length} bericht${messages.length === 1 ? "" : "en"} van vóór de koop zijn overgezet naar deze transactiechat.`,
            createdAt: occurredAt,
        },
    });
    await appendTransactionEvent(
        tx,
        transaction.id,
        transaction.buyerUserId,
        "MESSAGE_IMPORTED",
        {
            count: messages.length,
            messageIds: messages.map((message) => message.id),
        },
    );
    await tx.propertyTransaction.update({
        where: { id: transaction.id },
        data: { version: { increment: 1 } },
    });
    return messages.length;
}
