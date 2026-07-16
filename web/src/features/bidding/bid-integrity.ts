import { createHash } from "node:crypto";
import { orderHashChain } from "@/lib/hash-chain";

function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, normalize(child)]),
        );
    }
    return value;
}

export function canonicalJson(value: unknown) {
    return JSON.stringify(normalize(value));
}

export type CanonicalBid = {
    listingId: string;
    bidderPseudonym: string;
    amountCents: string;
    currency: string;
    resolutiveConditions: unknown;
    financingDeadline: string | null;
    transferDateRequested: string | null;
    submittedAt: string;
};

export function computeBidEntryHash(
    previousHash: string | null,
    bid: CanonicalBid,
) {
    return createHash("sha256")
        .update(`${previousHash ?? "GENESIS"}:${canonicalJson(bid)}`)
        .digest("hex");
}

export type CanonicalBidEvent = {
    bidId: string;
    bidEntryHash: string;
    type: "SUBMITTED" | "WITHDRAWN" | "ACCEPTED" | "REJECTED" | "EXPIRED";
    reason: string | null;
    occurredAt: string;
};

export function computeBidEventEntryHash(
    previousHash: string | null,
    event: CanonicalBidEvent,
) {
    return createHash("sha256")
        .update(`${previousHash ?? "GENESIS"}:${canonicalJson(event)}`)
        .digest("hex");
}

export type StoredBidForIntegrity = CanonicalBid & {
    previousHash: string | null;
    entryHash: string;
};

export function verifyAndOrderBidChain<T extends StoredBidForIntegrity>(
    bids: T[],
) {
    const ordered = orderHashChain(bids);
    if (!ordered) return null;
    for (const bid of ordered) {
        if (
            computeBidEntryHash(bid.previousHash, {
                listingId: bid.listingId,
                bidderPseudonym: bid.bidderPseudonym,
                amountCents: bid.amountCents,
                currency: bid.currency,
                resolutiveConditions: bid.resolutiveConditions,
                financingDeadline: bid.financingDeadline,
                transferDateRequested: bid.transferDateRequested,
                submittedAt: bid.submittedAt,
            }) !== bid.entryHash
        ) {
            return null;
        }
    }
    return ordered;
}

export type StoredBidEventForIntegrity = Omit<
    CanonicalBidEvent,
    "bidEntryHash"
> & {
    previousHash: string | null;
    entryHash: string;
};

export function verifyAndOrderBidEventChain<
    T extends StoredBidEventForIntegrity,
>(events: T[], bidEntryHash: string) {
    const ordered = orderHashChain(events);
    if (!ordered) return null;
    for (const event of ordered) {
        if (
            computeBidEventEntryHash(event.previousHash, {
                bidId: event.bidId,
                bidEntryHash,
                type: event.type,
                reason: event.reason,
                occurredAt: event.occurredAt,
            }) !== event.entryHash
        ) {
            return null;
        }
    }
    return ordered;
}
