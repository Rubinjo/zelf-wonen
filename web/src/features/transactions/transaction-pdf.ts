import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TransactionDocumentCategory } from "@/generated/prisma/client";
import {
    appendTransactionEvent,
    canonicalJson,
} from "@/features/transactions/transaction-service";
import { db } from "@/lib/db";

function safeText(value: unknown) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, "?");
}

function wrap(value: unknown, length = 88) {
    const words = safeText(value).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        if (`${line} ${word}`.trim().length > length && line) {
            lines.push(line);
            line = word;
        } else line = `${line} ${word}`.trim();
    }
    if (line) lines.push(line);
    return lines;
}

async function createPdf(
    title: string,
    subtitle: string,
    sections: Array<{ title: string; lines: string[] }>,
) {
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const add = (
        text: string,
        options?: {
            bold?: boolean;
            size?: number;
            color?: ReturnType<typeof rgb>;
        },
    ) => {
        const size = options?.size ?? 10;
        if (y < 65) {
            page = pdf.addPage([595.28, 841.89]);
            y = 790;
        }
        page.drawText(safeText(text), {
            x: 50,
            y,
            size,
            font: options?.bold ? bold : regular,
            color: options?.color ?? rgb(0.07, 0.16, 0.13),
        });
        y -= size + 6;
    };
    add(title, { bold: true, size: 19, color: rgb(0.03, 0.42, 0.32) });
    add(subtitle, { size: 11 });
    add(`Gegenereerd (UTC): ${new Date().toISOString()}`, { size: 8 });
    y -= 12;
    for (const section of sections) {
        add(section.title, {
            bold: true,
            size: 12,
            color: rgb(0.03, 0.29, 0.23),
        });
        for (const line of section.lines)
            for (const wrapped of wrap(line)) add(wrapped);
        y -= 9;
    }
    pdf.setTitle(title);
    pdf.setAuthor("ZelfWonen");
    return pdf.save();
}

async function persistGeneratedDocument(
    transactionId: string,
    userId: string,
    category: TransactionDocumentCategory,
    fileName: string,
    bytes: Uint8Array,
) {
    const id = randomUUID();
    const storageKey = `${transactionId}/${id}.pdf`;
    const directory = path.join(
        process.cwd(),
        ".data",
        "transaction-documents",
        transactionId,
    );
    const target = path.join(directory, `${id}.pdf`);
    await mkdir(directory, { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
    try {
        return await db.$transaction(async (tx) => {
            const previousCount = await tx.transactionDocument.count({
                where: { transactionId, category },
            });
            if (previousCount > 0) {
                await tx.transactionDocument.updateMany({
                    where: { transactionId, category, status: "AVAILABLE" },
                    data: { status: "SUPERSEDED" },
                });
            }
            const document = await tx.transactionDocument.create({
                data: {
                    id,
                    transactionId,
                    uploadedById: userId,
                    category,
                    storageKey,
                    mimeType: "application/pdf",
                    sha256: createHash("sha256").update(bytes).digest("hex"),
                    fileName,
                    sizeBytes: BigInt(bytes.byteLength),
                    version: previousCount + 1,
                },
            });
            await appendTransactionEvent(
                tx,
                transactionId,
                userId,
                "DOCUMENT_UPLOADED",
                {
                    documentId: document.id,
                    category,
                    generated: true,
                    version: document.version,
                    sha256: document.sha256,
                },
            );
            return document;
        });
    } catch (error) {
        await unlink(target).catch(() => undefined);
        throw error;
    }
}

export async function generateTransactionPdf(
    transactionId: string,
    userId: string,
    type: "AGREEMENT" | "PASSPORT",
) {
    const transaction = await db.propertyTransaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: {
            listing: {
                include: {
                    property: {
                        include: {
                            energyLabels: {
                                orderBy: { registeredAt: "desc" },
                                take: 1,
                            },
                        },
                    },
                },
            },
            seller: { select: { name: true, email: true } },
            buyer: { select: { name: true, email: true } },
        },
    });
    const address = `${transaction.listing.property.street} ${transaction.listing.property.houseNumber}${transaction.listing.property.houseNumberAddition ?? ""}, ${transaction.listing.property.postcode} ${transaction.listing.property.city}`;
    if (type === "AGREEMENT") {
        if (
            !transaction.sellerContractConfirmedAt ||
            !transaction.buyerContractConfirmedAt ||
            !transaction.contractTerms
        ) {
            throw new Error(
                "Beide partijen moeten de huidige afspraken eerst bevestigen",
            );
        }
        const terms = transaction.contractTerms as Record<string, unknown>;
        const isRental = transaction.listing.purpose === "RENT";
        const bytes = await createPdf(
            isRental
                ? "ZELFWONEN - HUURAFSPRAKEN"
                : "ZELFWONEN - KOOPOVEREENKOMSTAFSPRAKEN",
            address,
            [
                {
                    title: "Partijen",
                    lines: [
                        `Verkoper: ${transaction.seller.name} (${transaction.seller.email})`,
                        `Koper: ${transaction.buyer.name} (${transaction.buyer.email})`,
                    ],
                },
                {
                    title: isRental
                        ? "Woning en huurprijs"
                        : "Woning en koopsom",
                    lines: [
                        `Adres: ${address}`,
                        `${isRental ? "Maandhuur" : "Koopsom"}: EUR ${(Number(transaction.purchasePriceCents) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`,
                        `${isRental ? "Ingangsdatum" : "Beoogde overdracht"}: ${transaction.targetTransferDate?.toLocaleDateString("nl-NL") ?? "Nog overeen te komen"}`,
                    ],
                },
                {
                    title: "Voorwaarden",
                    lines: [
                        `Financieringsvoorbehoud: ${terms.financingCondition ? "Ja" : "Nee"}`,
                        `Bouwkundige keuring: ${terms.inspectionCondition ? "Ja" : "Nee"}`,
                        `Waarborgsom/bankgarantie: ${terms.securityDepositCents ? `EUR ${(Number(terms.securityDepositCents) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}` : "Niet vastgelegd"}`,
                        `Aanvullende afspraken: ${terms.additionalTerms || "Geen"}`,
                    ],
                },
                {
                    title: "Bevestiging",
                    lines: [
                        `Verkoper bevestigd: ${transaction.sellerContractConfirmedAt.toISOString()}`,
                        `Koper bevestigd: ${transaction.buyerContractConfirmedAt.toISOString()}`,
                        "Dit dossierdocument registreert de platformafspraken. Het vervangt geen notariële akte of gekwalificeerde elektronische handtekening.",
                    ],
                },
            ],
        );
        return persistGeneratedDocument(
            transactionId,
            userId,
            "PURCHASE_AGREEMENT",
            `${isRental ? "huurafspraken" : "koopafspraken"}-${transaction.listing.publicSlug ?? transaction.listingId}.pdf`,
            bytes,
        );
    }
    const passport = await db.propertyPassportVersion.findFirstOrThrow({
        where: { listingId: transaction.listingId },
        orderBy: { version: "desc" },
    });
    const property = transaction.listing.property;
    const bytes = await createPdf(
        `WONINGPASPOORT - VERSIE ${passport.version}`,
        address,
        [
            {
                title: "Dossierintegriteit",
                lines: [
                    `Volledigheid: ${passport.completenessScore}%`,
                    `Versiehash SHA-256: ${passport.entryHash}`,
                    `Vorige versiehash: ${passport.previousHash ?? "Eerste versie"}`,
                    `Bronadvertentie-versie: ${passport.listingVersionSource}`,
                ],
            },
            {
                title: "Officiele woninggegevens",
                lines: [
                    `Woningtype: ${property.propertyType}`,
                    `Woonoppervlak: ${property.livingAreaSqm?.toString() ?? "Onbekend"} m2`,
                    `Perceeloppervlak: ${property.officialLandAreaSqm?.toString() ?? "Onbekend"} m2`,
                    `Kamers: ${property.roomCount ?? "Onbekend"}`,
                    `Bouwjaar: ${property.constructionYear ?? "Onbekend"}`,
                    `Energielabel: ${property.energyLabels[0]?.labelClass ?? "Onbekend"}`,
                    `Kadastraal perceel: ${property.cadastralParcelId ?? "Onbekend"}`,
                ],
            },
            {
                title: "Momentopname",
                lines: [
                    `Snapshot SHA-256: ${createHash("sha256").update(canonicalJson(passport.snapshot)).digest("hex")}`,
                    "De volledige gestructureerde momentopname blijft in het beveiligde transactiedossier bewaard.",
                ],
            },
        ],
    );
    return persistGeneratedDocument(
        transactionId,
        userId,
        "PROPERTY_PASSPORT",
        `woningpaspoort-v${passport.version}-${transaction.listing.publicSlug ?? transaction.listingId}.pdf`,
        bytes,
    );
}
