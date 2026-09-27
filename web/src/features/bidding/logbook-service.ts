import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
    computeBidEntryHash,
    computeBidEventEntryHash,
} from "@/features/bidding/bid-integrity";
import { db } from "@/lib/db";
import { deleteStoredFile, storeFile } from "@/lib/storage";
import { orderHashChain } from "@/lib/hash-chain";

export class LogbookError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_FOUND"
            | "SALE_NOT_FINALIZED"
            | "CHAIN_INVALID",
        message: string,
    ) {
        super(message);
        this.name = "LogbookError";
    }
}

function safePdfText(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, "?");
}

function wrap(value: string, length = 92) {
    const words = safePdfText(value).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        if (`${line} ${word}`.trim().length > length) {
            lines.push(line);
            line = word;
        } else {
            line = `${line} ${word}`.trim();
        }
    }
    if (line) lines.push(line);
    return lines;
}

function formatEuroCents(value: bigint) {
    const oneHundred = BigInt(100);
    const euros = value / oneHundred;
    const cents = (value % oneHundred).toString().padStart(2, "0");
    return `${euros.toString()}.${cents}`;
}

export async function generateBidLogbook(listingId: string, userId: string) {
    const listing = await db.listing.findFirst({
        where: {
            id: listingId,
            OR: [
                { ownerId: userId },
                { bids: { some: { bidderUserId: userId } } },
            ],
        },
        include: {
            property: true,
            bids: {
                include: {
                    events: true,
                },
            },
        },
    });
    if (!listing)
        throw new LogbookError("LISTING_NOT_FOUND", "Listing not found");
    if (!["UNDER_OFFER", "SOLD", "RENTED"].includes(listing.status)) {
        throw new LogbookError(
            "SALE_NOT_FINALIZED",
            "The logbook becomes available after an offer is accepted",
        );
    }

    const bidChain = orderHashChain(listing.bids);
    if (!bidChain) {
        throw new LogbookError(
            "CHAIN_INVALID",
            "The bid chain topology failed its integrity check",
        );
    }
    const orderedBids = bidChain.map((bid) => {
        const events = orderHashChain(bid.events);
        if (!events) {
            throw new LogbookError(
                "CHAIN_INVALID",
                "The bid event chain topology failed its integrity check",
            );
        }
        return { ...bid, events };
    });

    let previous: string | null = null;
    for (const bid of orderedBids) {
        const expectedBidHash = computeBidEntryHash(previous, {
            listingId: bid.listingId,
            bidderPseudonym: bid.bidderPseudonym,
            amountCents: bid.amountCents.toString(),
            currency: bid.currency,
            resolutiveConditions: bid.resolutiveConditions,
            financingDeadline: bid.financingDeadline?.toISOString() ?? null,
            transferDateRequested:
                bid.transferDateRequested?.toISOString() ?? null,
            submittedAt: bid.submittedAt.toISOString(),
        });
        if (
            bid.previousHash !== previous ||
            bid.entryHash !== expectedBidHash
        ) {
            throw new LogbookError(
                "CHAIN_INVALID",
                "The bid chain integrity check failed",
            );
        }
        let previousEvent: string | null = null;
        for (const [index, event] of bid.events.entries()) {
            const expectedEventHash = computeBidEventEntryHash(previousEvent, {
                bidId: bid.id,
                bidEntryHash: bid.entryHash,
                type: event.type,
                reason: event.reason,
                occurredAt: event.occurredAt.toISOString(),
            });
            if (
                event.previousHash !== previousEvent ||
                event.entryHash !== expectedEventHash ||
                (index === 0 && event.type !== "SUBMITTED")
            ) {
                throw new LogbookError(
                    "CHAIN_INVALID",
                    "The bid event chain integrity check failed",
                );
            }
            previousEvent = event.entryHash;
        }
        if (bid.events.length === 0) {
            throw new LogbookError(
                "CHAIN_INVALID",
                "A bid is missing its submission event",
            );
        }
        previous = bid.entryHash;
    }
    const headHash =
        previous ??
        createHash("sha256").update(`EMPTY:${listing.id}`).digest("hex");

    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const addLine = (
        text: string,
        options?: {
            bold?: boolean;
            size?: number;
            color?: ReturnType<typeof rgb>;
        },
    ) => {
        if (y < 60) {
            page = pdf.addPage([595.28, 841.89]);
            y = 790;
        }
        page.drawText(safePdfText(text), {
            x: 50,
            y,
            size: options?.size ?? 10,
            font: options?.bold ? bold : regular,
            color: options?.color ?? rgb(0.08, 0.16, 0.13),
        });
        y -= (options?.size ?? 10) + 5;
    };

    addLine("ZELFWONEN - ANONYMIZED BIDDING LOGBOOK", {
        bold: true,
        size: 17,
        color: rgb(0.03, 0.42, 0.32),
    });
    y -= 8;
    addLine(
        `Property: ${listing.property.street} ${listing.property.houseNumber}${listing.property.houseNumberAddition ?? ""}, ${listing.property.postcode} ${listing.property.city}`,
    );
    addLine(`Listing reference: ${listing.id}`);
    addLine(`Generated (UTC): ${new Date().toISOString()}`);
    addLine(`Chain head SHA-256: ${headHash}`);
    addLine(
        "Personal details are omitted. Pseudonyms remain stable within this listing.",
    );
    y -= 14;

    if (orderedBids.length === 0) addLine("No bids were recorded.");
    orderedBids.forEach((bid, index) => {
        addLine(
            `${index + 1}. ${bid.bidderPseudonym} - EUR ${formatEuroCents(bid.amountCents)}`,
            { bold: true, size: 12 },
        );
        addLine(`Submitted (UTC): ${bid.submittedAt.toISOString()}`);
        addLine(`Conditions: ${JSON.stringify(bid.resolutiveConditions)}`);
        if (bid.financingDeadline)
            addLine(
                `Financing deadline: ${bid.financingDeadline.toISOString()}`,
            );
        if (bid.transferDateRequested)
            addLine(
                `Requested transfer: ${bid.transferDateRequested.toISOString()}`,
            );
        for (const event of bid.events)
            addLine(
                `Event: ${event.type} at ${event.occurredAt.toISOString()}${event.reason ? ` - ${event.reason}` : ""}`,
            );
        addLine(`Entry hash: ${bid.entryHash}`);
        y -= 10;
    });

    y -= 8;
    for (const line of wrap(
        "Integrity notice: every bid is linked to the previous bid by SHA-256. This document is an export of the platform record; it is not a purchase agreement or notarial deed.",
    ))
        addLine(line, { size: 8 });

    pdf.setTitle(
        `Bidding logbook ${listing.property.street} ${listing.property.houseNumber}`,
    );
    pdf.setAuthor("ZelfWonen");
    pdf.setSubject("Anonymized chronological bidding logbook");
    const bytes = await pdf.save();
    const documentSha256 = createHash("sha256").update(bytes).digest("hex");
    const exportId = randomUUID();
    const relativeKey = `logbooks/${listingId}/${exportId}.pdf`;
    await storeFile("logbooks", relativeKey, bytes);
    await db.bidLogbookExport
        .create({
            data: {
                id: exportId,
                listingId,
                storageKey: relativeKey,
                documentSha256,
                logbookHeadHash: headHash,
                anonymizationVersion: "v1",
                sharedAt: listing.ownerId === userId ? null : new Date(),
                recipientCount: listing.ownerId === userId ? 0 : 1,
            },
        })
        .catch(async (error) => {
            await deleteStoredFile("logbooks", relativeKey).catch(() => undefined);
            throw error;
        });
    return {
        bytes,
        fileName: `biedlogboek-${listing.publicSlug ?? listing.id}.pdf`,
        documentSha256,
    };
}
