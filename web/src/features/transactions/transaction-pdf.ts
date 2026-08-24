import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type {
    Prisma,
    TransactionDocumentCategory,
} from "@/generated/prisma/client";
import {
    appendTransactionEvent,
    canonicalJson,
} from "@/features/transactions/transaction-service";
import {
    COLORS,
    PdfBuilder,
} from "@/features/pdf/pdf-builder";
import {
    computeCompletenessFromListing,
    PASSPORT_DOCUMENT_CATEGORIES,
    PASSPORT_LISTING_SELECT,
    type LoadedPassportListing,
} from "@/features/transactions/passport-service";
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
            agreement: true,
        },
    });
    const address = `${transaction.listing.property.street} ${transaction.listing.property.houseNumber}${transaction.listing.property.houseNumberAddition ?? ""}, ${transaction.listing.property.postcode} ${transaction.listing.property.city}`;
    if (type === "AGREEMENT") {
        if (transaction.listing.purpose === "SALE" && transaction.agreement) {
            return generateKoopovereenkomstPdf(transaction, userId);
        }
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
    return generatePropertyPassportPdf(transactionId, userId);
}

export class PassportNotFoundError extends Error {
    constructor(
        message = "Er is nog geen woningpaspoort vastgelegd voor deze woning",
    ) {
        super(message);
        this.name = "PassportNotFoundError";
    }
}

const propertyTypeLabels: Record<string, string> = {
    HOUSE: "Huis",
    APARTMENT: "Appartement",
    PARKING: "Parkeerplaats",
    LAND: "Bouwgrond",
    COMMERCIAL: "Bedrijfsruimte",
    OTHER: "Anders",
};
const roofTypeLabels: Record<string, string> = {
    FLAT: "Plat dak",
    GABLE: "Zadeldak",
    HIP: "Schilddak",
    MANSARD: "Mansardedak",
    SHED: "Lessenaarsdak",
    COMBINATION: "Samengesteld dak",
    OTHER: "Anders",
};
const energyLabelLabels: Record<string, string> = {
    A_PLUS_PLUS_PLUS_PLUS_PLUS: "A+++++",
    A_PLUS_PLUS_PLUS_PLUS: "A++++",
    A_PLUS_PLUS_PLUS: "A+++",
    A_PLUS_PLUS: "A++",
    A_PLUS: "A+",
    A: "A",
    B: "B",
    C: "C",
    D: "D",
    E: "E",
    F: "F",
    G: "G",
    UNKNOWN: "Onbekend",
};
const amenityLabels: Record<string, string> = {
    SOLAR_PANELS: "Zonnepanelen",
    AIR_CONDITIONING: "Airconditioning",
    FIBER_OPTIC: "Glasvezel",
    HEAT_PUMP: "Warmtepomp",
    EV_CHARGER: "Laadpaal",
    FIREPLACE: "Open haard",
    MECHANICAL_VENTILATION: "Mechanische ventilatie",
    ALARM_SYSTEM: "Alarmsysteem",
};
const parkingLabels: Record<string, string> = {
    ON_PROPERTY: "Op eigen terrein",
    FREE_STREET: "Gratis parkeren op straat",
    PAID_STREET: "Betaald parkeren op straat",
    PARKING_PERMIT: "Parkeervergunning",
    PUBLIC_GARAGE: "Openbare parkeergarage",
    PRIVATE_GARAGE: "Eigen garage",
    SPACE_FOR_SALE: "Parkeerplaats apart te koop",
};
const conditionLabels: Record<string, string> = {
    EXCELLENT: "Uitstekend",
    GOOD: "Goed",
    REASONABLE: "Redelijk",
    POOR: "Matig",
};
const passportCategoryLabels: Record<string, string> = {
    ENERGY_LABEL: "Energielabel",
    FLOOR_PLAN: "Plattegrond",
    VVE: "VvE-stukken",
    CADASTRAL: "Kadastrale gegevens",
    BUILDING_INSPECTION: "Bouwkundige keuring",
};
const statusLabels: Record<string, string> = {
    SATISFIED: "Aanwezig",
    MISSING: "Ontbreekt",
    NOT_APPLICABLE: "Niet van toepassing",
};

function formatSqm(value: unknown): string {
    if (value === null || value === undefined) return "Onbekend";
    const number = Number(value);
    if (!Number.isFinite(number)) return "Onbekend";
    return `${number.toLocaleString("nl-NL")} m²`;
}

function formatEurosText(cents: unknown): string {
    if (cents === null || cents === undefined) return "Onbekend";
    const number = Number(cents) / 100;
    if (!Number.isFinite(number)) return "Onbekend";
    return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(number);
}

async function readMediaBytes(
    storageKey: string | null,
): Promise<Uint8Array | null> {
    if (!storageKey) return null;
    try {
        return await readFile(
            path.join(process.cwd(), "public", storageKey.replace(/^\/+/, "")),
        );
    } catch {
        return null;
    }
}

function labelize(values: readonly string[], labels: Record<string, string>) {
    const mapped = values
        .map((value) => labels[value] ?? value)
        .filter((value) => value && value !== "Onbekend");
    return mapped.length ? mapped.join(", ") : null;
}

/**
 * Genereert de woningpaspoort-PDF op basis van de huidige dossiermomentopname
 * en de laatste versie in de onveranderlijke keten.
 */
export async function generatePropertyPassportPdf(
    transactionId: string,
    userId: string,
) {
    const transaction = await db.propertyTransaction.findUniqueOrThrow({
        where: { id: transactionId },
        select: { listingId: true },
    });
    const listing = await db.listing.findUniqueOrThrow({
        where: { id: transaction.listingId },
        select: PASSPORT_LISTING_SELECT,
    });
    const latest = await db.propertyPassportVersion.findFirst({
        where: { listingId: transaction.listingId },
        orderBy: { version: "desc" },
    });
    if (!latest) throw new PassportNotFoundError();

    const [draftRow, documents, floorPlanMedia] = await Promise.all([
        db.propertyPassportDraft.findUnique({
            where: { listingId: transaction.listingId },
            select: { fields: true },
        }),
        db.transactionDocument.findMany({
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
                createdAt: true,
                uploadedBy: { select: { name: true } },
            },
        }),
        db.listingMedia.findMany({
            where: {
                id: {
                    in: listing.floorPlans
                        .map((plan) => plan.staticMediaId)
                        .filter((value): value is string => value !== null),
                },
            },
            select: { id: true, storageKey: true, mimeType: true },
        }),
    ]);

    const draft =
        draftRow?.fields &&
        typeof draftRow.fields === "object" &&
        !Array.isArray(draftRow.fields)
            ? (draftRow.fields as Record<string, unknown>)
            : {};
    const completeness = computeCompletenessFromListing(
        listing as LoadedPassportListing,
        draft,
        documents,
    );

    const property = listing.property;
    const address = [
        property.street,
        property.houseNumber,
        property.houseNumberAddition,
    ]
        .filter((value) => value !== null && value !== undefined)
        .join(" ");
    const purposeLabel = listing.purpose === "RENT" ? "Verhuur" : "Verkoop";
    const generatedOn = new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "long",
        timeStyle: "short",
    }).format(new Date());

    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const doc = new PdfBuilder(pdf, regular, bold);

    // ---------- Kop ----------
    doc.text("ZELFWONEN", { size: 9, bold: true, color: COLORS.brand });
    doc.gap(2);
    doc.hairline(COLORS.brand);
    doc.gap(12);
    doc.text("WONINGPASPOORT", { size: 22, bold: true });
    doc.gap(2);
    doc.text(address, { size: 13, bold: true });
    doc.text(`${property.postcode} ${property.city}`, {
        size: 11,
        color: COLORS.muted,
    });
    doc.text(
        `${purposeLabel} · Versie ${latest.version} · Gegenereerd op ${generatedOn}`,
        { size: 9, color: COLORS.muted },
    );
    doc.gap(12);

    // ---------- Over dit document ----------
    doc.box(
        "Over dit document",
        "Dit woningpaspoort is een verifieerbare momentopname van het woningdossier: de woninggegevens, aangeleverde documenten en beantwoorde kenmerken op het moment van deze versie. Elke versie is voorzien van een unieke SHA-256-hash die verwijst naar de vorige versie, waardoor de keten aantoonbaar onveranderlijk is. Het paspoort wordt automatisch bijgewerkt wanneer de verkoper of verhuurder gegevens toevoegt.",
    );

    // ---------- Volledigheid ----------
    doc.sectionTitle("Volledigheid");
    doc.paragraph(
        `Het dossier is voor ${completeness.satisfied} van de ${completeness.applicable} onderdelen compleet.`,
        { size: 9, color: COLORS.muted },
    );
    doc.gap(4);
    doc.scoreBar(completeness.score);
    doc.gap(4);
    doc.table(
        [
            { header: "Onderdeel", width: 170 },
            { header: "Status", width: 90 },
            { header: "Wat is nog nodig?", width: 235 },
        ],
        completeness.items.map((item) => [
            item.label,
            statusLabels[item.status] ?? item.status,
            item.status === "MISSING" ? item.actionHint : "",
        ]),
    );

    // ---------- Woninggegevens ----------
    doc.sectionTitle("Woninggegevens");
    const energyLabel = property.energyLabels[0];
    doc.table(
        [
            { header: "Kenmerk", width: 200 },
            { header: "Waarde", width: 295 },
        ],
        [
            ["Adres", address],
            ["Postcode en plaats", `${property.postcode} ${property.city}`],
            [
                "Kadastraal perceel",
                property.cadastralParcelId ?? "Nog niet gekoppeld",
            ],
            [
                "Woningtype",
                propertyTypeLabels[String(property.propertyType)] ??
                    String(property.propertyType),
            ],
            ["Bouwjaar", property.constructionYear?.toString() ?? "Onbekend"],
            [
                "Woonoppervlak",
                formatSqm(property.livingAreaSqm),
            ],
            [
                "Perceeloppervlak",
                formatSqm(property.officialLandAreaSqm),
            ],
            [
                "Inhoud",
                property.volumeCubicMeters
                    ? `${Number(property.volumeCubicMeters).toLocaleString("nl-NL")} m³`
                    : "Onbekend",
            ],
            ["Aantal kamers", property.roomCount?.toString() ?? "Onbekend"],
            [
                "Slaapkamers",
                property.bedroomCount?.toString() ?? "Onbekend",
            ],
            [
                "Badkamers",
                property.bathroomCount?.toString() ?? "Onbekend",
            ],
            [
                "Verdiepingen",
                property.floorCount?.toString() ?? "Onbekend",
            ],
            ["Dak", roofTypeLabels[String(property.roofType)] ?? "Onbekend"],
            [
                "Energielabel",
                energyLabel
                    ? `${energyLabelLabels[energyLabel.labelClass] ?? energyLabel.labelClass}${
                          energyLabel.validUntil
                              ? ` (geldig t/m ${new Date(energyLabel.validUntil).toLocaleDateString("nl-NL")})`
                              : ""
                      }`
                    : "Onbekend",
            ],
            [
                "Monument",
                property.isMonument ? "Ja" : "Nee",
            ],
        ],
        { firstColumnBold: true },
    );

    // ---------- Kenmerken & voorzieningen ----------
    const amenities = labelize(property.amenities ?? [], amenityLabels);
    const parking = labelize(property.parkingOptions ?? [], parkingLabels);
    const featuresText =
        typeof draft.features === "string" && draft.features.trim()
            ? draft.features.trim()
            : null;
    if (amenities || parking || featuresText) {
        doc.sectionTitle("Kenmerken & voorzieningen");
        doc.table(
            [
                { header: "Categorie", width: 200 },
                { header: "Details", width: 295 },
            ],
            [
                ...(amenities ? [["Voorzieningen", amenities]] : []),
                ...(parking ? [["Parkeren", parking]] : []),
                ...(featuresText ? [["Bijzondere kenmerken", featuresText]] : []),
            ],
            { firstColumnBold: true },
        );
    }

    // ---------- Staat & onderhoud ----------
    const conditionText = conditionLabels[String(draft.condition)] ?? null;
    const insulation = Array.isArray(draft.insulation)
        ? (draft.insulation as string[]).filter(Boolean)
        : [];
    const maintenanceRows: Array<[string, string]> = [];
    if (conditionText)
        maintenanceRows.push(["Algemene staat", conditionText]);
    if (draft.lastInspectionAt)
        maintenanceRows.push([
            "Laatste bouwkundige keuring",
            String(draft.lastInspectionAt),
        ]);
    if (draft.renovationYear)
        maintenanceRows.push([
            "Renovatiejaar",
            String(draft.renovationYear),
        ]);
    if (draft.solarPanelWattage)
        maintenanceRows.push([
            "Zonnepanelen",
            `${Number(draft.solarPanelWattage).toLocaleString("nl-NL")} Wp`,
        ]);
    if (draft.heatPump) maintenanceRows.push(["Warmtepomp", "Ja"]);
    if (draft.boilerYear)
        maintenanceRows.push(["CV-ketel bouwjaar", String(draft.boilerYear)]);
    if (insulation.length)
        maintenanceRows.push(["Isolatie", insulation.join(", ")]);
    if (maintenanceRows.length || typeof draft.notes === "string") {
        doc.sectionTitle("Staat & onderhoud");
        doc.table(
            [
                { header: "Onderwerp", width: 200 },
                { header: "Waarde", width: 295 },
            ],
            maintenanceRows,
            { firstColumnBold: true },
        );
        if (typeof draft.notes === "string" && draft.notes.trim()) {
            doc.paragraph(draft.notes.trim(), { size: 9, color: COLORS.muted });
            doc.gap(4);
        }
    }

    // ---------- VvE ----------
    const vve =
        draft.vve && typeof draft.vve === "object"
            ? (draft.vve as Record<string, unknown>)
            : null;
    if (vve && (vve.name || vve.monthlyContributionCents)) {
        doc.sectionTitle("VvE-gegevens");
        doc.table(
            [
                { header: "Onderwerp", width: 200 },
                { header: "Waarde", width: 295 },
            ],
            [
                ...(vve.name ? [["VvE-naam", String(vve.name)]] : []),
                ...(vve.monthlyContributionCents
                    ? [
                          [
                              "Maandelijkse bijdrage",
                              formatEurosText(vve.monthlyContributionCents),
                          ],
                      ]
                    : []),
                ...(vve.reserveFundCents
                    ? [
                          [
                              "Reserveringsfonds",
                              formatEurosText(vve.reserveFundCents),
                          ],
                      ]
                    : []),
                ...(vve.contactEmail
                    ? [["Contact", String(vve.contactEmail)]]
                    : []),
            ],
            { firstColumnBold: true },
        );
    }

    // ---------- Buurt ----------
    const neighborhood = property.neighborhoodProfile;
    if (neighborhood) {
        doc.sectionTitle("Buurt");
        doc.table(
            [
                { header: "Kenmerk", width: 200 },
                { header: "Waarde", width: 295 },
            ],
            [
                ["Wijk", neighborhood.neighborhoodName],
                [
                    "Referentiejaar",
                    neighborhood.statisticsYear?.toString() ?? "Onbekend",
                ],
                ...(neighborhood.population
                    ? [
                          [
                              "Inwoners",
                              neighborhood.population.toLocaleString("nl-NL"),
                          ],
                      ]
                    : []),
                ...(neighborhood.populationDensityPerKm2
                    ? [
                          [
                              "Bevolkingsdichtheid",
                              `${neighborhood.populationDensityPerKm2.toLocaleString("nl-NL")}/km²`,
                          ],
                      ]
                    : []),
                ...(neighborhood.supermarketDistanceKm
                    ? [
                          [
                              "Dichtstbijzijnde supermarkt",
                              `${Number(neighborhood.supermarketDistanceKm).toLocaleString("nl-NL")} km`,
                          ],
                      ]
                    : []),
                ...(neighborhood.primarySchoolDistanceKm
                    ? [
                          [
                              "Dichtstbijzijnde basisschool",
                              `${Number(neighborhood.primarySchoolDistanceKm).toLocaleString("nl-NL")} km`,
                          ],
                      ]
                    : []),
                ...(neighborhood.trainStationDistanceMeters
                    ? [
                          [
                              "Treinstation",
                              `${(neighborhood.trainStationDistanceMeters / 1000).toLocaleString("nl-NL")} km`,
                          ],
                      ]
                    : []),
                ...(neighborhood.registeredCrimesPer1000
                    ? [
                          [
                              "Geregistreerde misdrijven",
                              `${Number(neighborhood.registeredCrimesPer1000).toLocaleString("nl-NL")}/1000 inwoners`,
                          ],
                      ]
                    : []),
            ],
            { firstColumnBold: true },
        );
    }

    // ---------- Foto's ----------
    const photos = listing.media.filter(
        (item) => item.kind === "PHOTO" && item.status === "READY",
    );
    if (photos.length) {
        doc.sectionTitle("Foto's");
        doc.paragraph(
            `De volgende ${Math.min(photos.length, 6)} foto('s) maken deel uit van het dossier.`,
            { size: 9, color: COLORS.muted },
        );
        doc.gap(4);
        let embeddedCount = 0;
        for (const photo of photos) {
            if (embeddedCount >= 6) break;
            const bytes = await readMediaBytes(photo.storageKey);
            const mimeType = photo.mimeType;
            if (!bytes) continue;
            const kind =
                mimeType === "image/png"
                    ? "png"
                    : mimeType === "image/jpeg"
                      ? "jpeg"
                      : null;
            if (!kind) continue;
            await doc.image({
                bytes,
                mimeType: kind,
                width: photo.width ?? 1200,
                height: photo.height ?? 800,
                caption: `Foto ${embeddedCount + 1}`,
            });
            embeddedCount += 1;
        }
    }

    // ---------- Plattegronden ----------
    if (listing.floorPlans.length) {
        doc.sectionTitle("Plattegronden");
        const staticPlan = listing.floorPlans.find(
            (plan) => plan.staticMediaId !== null,
        );
        const planMedia = staticPlan
            ? floorPlanMedia.find((media) => media.id === staticPlan.staticMediaId)
            : undefined;
        if (planMedia && planMedia.mimeType !== "image/webp") {
            const bytes = await readMediaBytes(planMedia.storageKey);
            if (bytes) {
                await doc.image({
                    bytes,
                    mimeType:
                        planMedia.mimeType === "image/png" ? "png" : "jpeg",
                    width: 1200,
                    height: 800,
                    caption: staticPlan?.floorName ?? "Plattegrond",
                });
            }
        } else {
            for (const plan of listing.floorPlans) {
                doc.text(plan.floorName ?? "Plattegrond", {
                    size: 10,
                    bold: true,
                });
                doc.paragraph(
                    plan.mode === "FLOORPLANNER_EMBED"
                        ? "Interactieve plattegrond via Floorplanner (beschikbaar in de advertentie)."
                        : "Plattegrond beschikbaar in het dossier.",
                    { size: 9, color: COLORS.muted },
                );
                doc.gap(4);
            }
        }
    }

    // ---------- Documenten ----------
    if (documents.length) {
        doc.sectionTitle("Documenten in het dossier");
        doc.table(
            [
                { header: "Document", width: 230 },
                { header: "Categorie", width: 120 },
                { header: "Geüpload", width: 145 },
            ],
            documents.map((document) => [
                document.fileName,
                passportCategoryLabels[document.category] ?? document.category,
                `${document.uploadedBy?.name ?? "Onbekend"} · ${new Date(document.createdAt).toLocaleDateString("nl-NL")}`,
            ]),
        );
    }

    // ---------- Dossierintegriteit ----------
    doc.sectionTitle("Dossierintegriteit");
    doc.table(
        [
            { header: "Kenmerk", width: 200 },
            { header: "Waarde", width: 295 },
        ],
        [
            ["Volledigheid", `${completeness.score}%`],
            ["Laatste versie", `Versie ${latest.version}`],
            [
                "Versiehash SHA-256",
                latest.entryHash,
            ],
            [
                "Vorige versiehash",
                latest.previousHash ?? "Eerste versie (geen voorganger)",
            ],
            [
                "Bronadvertentie-versie",
                latest.listingVersionSource.toString(),
            ],
            [
                "Momentopname SHA-256",
                createHash("sha256")
                    .update(canonicalJson(latest.snapshot))
                    .digest("hex"),
            ],
            [
                "Vastgelegd door",
                (latest.snapshot as { content?: unknown } | null)?.content
                    ? "ZelfWonen"
                    : `Vastgelegd op ${new Date(latest.createdAt).toLocaleString("nl-NL")}`,
            ],
        ],
        { firstColumnBold: true },
    );
    doc.gap(4);
    doc.box(
        "Onveranderlijke keten",
        "Elke versie bevat een hash van de vorige versie. Wijzigingen leiden tot een nieuwe versie; bestaande versies kunnen niet worden aangepast. De volledige gestructureerde momentopname blijft bewaard in het beveiligde transactiedossier.",
    );

    pdf.setTitle(`Woningpaspoort - ${address}`);
    pdf.setAuthor("ZelfWonen");
    pdf.setSubject("Verifieerbaar woningpaspoort");

    const bytes = await pdf.save();
    const fileName = `woningpaspoort-v${latest.version}-${listing.publicSlug ?? listing.id}.pdf`;
    return persistGeneratedDocument(
        transactionId,
        userId,
        "PROPERTY_PASSPORT",
        fileName,
        bytes,
    );
}

type AgreementPdfTransaction = Prisma.PropertyTransactionGetPayload<{
    include: {
        listing: {
            include: {
                property: {
                    include: {
                        energyLabels: {
                            orderBy: { registeredAt: "desc" };
                            take: 1;
                        };
                    };
                };
            };
        };
        seller: { select: { name: true; email: true } };
        buyer: { select: { name: true; email: true } };
        agreement: true;
    };
}>;

function formatEuros(cents: bigint | string | null | undefined) {
    if (cents === null || cents === undefined) return "niet vastgelegd";
    return `EUR ${(Number(BigInt(cents)) / 100).toLocaleString("nl-NL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatDate(date: Date | string | null | undefined) {
    if (!date) return "niet overeengekomen";
    return new Date(date).toLocaleDateString("nl-NL");
}

function civilStatusLine(status: string | null, spouse: string | null) {
    const statusText = status?.trim() ? status.trim() : "onbekend";
    if (spouse?.trim())
        return `${statusText}, echtgenoot/partner: ${spouse.trim()}`;
    return statusText;
}

/**
 * Genereert de koopovereenkomst (bestaande woning) op basis van de
 * gestructureerde PurchaseAgreement, met de bepalingen van het gangbare
 * model 2017/2022 en de wettelijke termijnen (Art 7:2 BW e.v.).
 */
export async function generateKoopovereenkomstPdf(
    transaction: AgreementPdfTransaction,
    userId: string,
) {
    const agreement = transaction.agreement!;
    const property = transaction.listing.property;
    const address = `${property.street} ${property.houseNumber}${property.houseNumberAddition ?? ""}, ${property.postcode} ${property.city}`;
    const movables = (agreement.movables ?? []) as Array<{
        description: string;
        valueCents: string;
    }>;
    const signed = agreement.status === "SIGNED";
    const sections: Array<{ title: string; lines: string[] }> = [
        {
            title: "Ondergetekenden",
            lines: [
                `Verkoper: ${transaction.seller.name} (${transaction.seller.email})`,
                `Burgerlijke staat verkoper: ${civilStatusLine(agreement.sellerCivilStatus, agreement.sellerSpouseName)}`,
                `Adres verkoper (domicilie): ${agreement.sellerAddress ?? "niet opgegeven"}`,
                `Koper: ${transaction.buyer.name} (${transaction.buyer.email})`,
                `Burgerlijke staat koper: ${civilStatusLine(agreement.buyerCivilStatus, agreement.buyerSpouseName)}`,
                `Adres koper (domicilie): ${agreement.buyerAddress ?? "niet opgegeven"}`,
                "De verkoper verklaart dat, indien hij/zij gehuwd is of een geregistreerd partnerschap heeft, de echtgenoot/partner de voor deze verkoop benodigde toestemming verleent als bedoeld in artikel 1:88 BW.",
            ],
        },
        {
            title: "Artikel 1 - Verkoop en koop",
            lines: [
                `De verkoper verkoopt aan de koper, die van de verkoper koopt, de onroerende zaak: ${address}.`,
                `Kadastrale omschrijving: ${agreement.kadastraleOmschrijving ?? "niet opgegeven (indicatief; zie de leveringsakte)"}`,
                `Woonoppervlak: ${property.livingAreaSqm?.toString() ?? "onbekend"} m2 (indicatief, Art 7:17 lid 6 BW)`,
                `Perceeloppervlak: ${property.officialLandAreaSqm?.toString() ?? "onbekend"} m2`,
                `Bouwjaar: ${property.constructionYear ?? "onbekend"}; Energielabel: ${property.energyLabels[0]?.labelClass ?? "onbekend"}`,
                `Koopsom: ${formatEuros(transaction.purchasePriceCents)}`,
                movables.length
                    ? `Aanverwante roerende zaken (totaal ${formatEuros(agreement.movablesValueCents)}): ${movables.map((item) => `${item.description} (${formatEuros(item.valueCents)})`).join("; ")}`
                    : "Geen roerende zaken overeengekomen.",
                "De onroerende zaak wordt verkocht in de staat waarin deze zich bevindt, met alle zichtbare en onzichtbare gebreken. De koop is aangegaan onder de opschortende voorwaarde van aan- en verkrijging onder de tussenkomst van een notaris.",
            ],
        },
        {
            title: "Artikel 2 - Kosten en belastingen",
            lines: [
                agreement.buyerPaysCosts
                    ? "Alle kosten en belastingen van de eigendomsoverdracht (waaronder overdrachtsbelasting, notaris- en kadasterkosten) komen voor rekening van de koper (kosten koper)."
                    : "De kosten en belastingen van de eigendomsoverdracht worden verdeeld zoals partijen zijn overeengekomen.",
            ],
        },
        {
            title: "Artikel 3 - Betaling",
            lines: [
                "De koopsom wordt voldaan door overschrijving op de derdengeldenrekening van de notaris, uiterlijk bij het passeren van de leveringsakte, en wordt pas na inschrijving daarvan aan de verkoper uitgekeerd (Art 7:26 BW).",
            ],
        },
        {
            title: "Artikel 4 - Eigendomsoverdracht",
            lines: [
                `De eigendomsoverdracht vindt plaats bij het passeren van de leveringsakte op ${formatDate(agreement.transferDate)}, ten overstaan van de door de koper gekozen notaris.`,
                "De overdracht vindt plaats vrij van bijzondere lasten en beperkingen, behoudens hetgeen in deze overeenkomst is aanvaard (Art 7:15 BW).",
            ],
        },
        {
            title: "Artikel 5 - Waarborgsom / bankgarantie",
            lines: [
                agreement.securityType === "NONE"
                    ? "Er is geen waarborgsom of bankgarantie overeengekomen."
                    : `${formatEuros(agreement.securityAmountCents)}, uiterlijk ${formatDate(agreement.securityDueDate)}, als zekerheid voor de nakoming van de verplichtingen (maximaal 10% van de koopsom, Art 7:26 lid 4 BW).`,
                "De koper kiest of hij deze zekerheid stelt als waarborgsom (storting op de derdengeldenrekening van de notaris) of als bankgarantie voor dat bedrag.",
            ],
        },
        {
            title: "Artikel 6 - Staat van de woning en verborgen gebreken",
            lines: [
                "De koper aanvaardt de woning in de staat waarin deze zich bevindt. De verkoper blijft aansprakelijk voor gebreken die hij kende maar niet aan de koper heeft medegedeeld (verzwijging).",
                "De verkoper verklaart dat er geen bodemverontreiniging, asbest, huur, optierechten of na te komen verplichtingen bekend zijn anders dan aan de koper gemeld (Art 7:15 en 7:17 BW).",
            ],
        },
        {
            title: "Artikel 7 - Feitelijke levering en sleuteloverdracht",
            lines: [
                `De feitelijke levering met sleuteloverdracht vindt plaats op ${formatDate(agreement.transferDate)}, of zoveel eerder of later als partijen overeenkomen.`,
            ],
        },
        {
            title: "Artikel 8 - Baten, lasten en canons",
            lines: [
                "Zakelijke lasten, belastingen en canons worden tussen partijen naar tijdsgelang verrekend over de datum van de feitelijke levering.",
            ],
        },
        {
            title: "Artikel 9 - Hoofdelijkheid",
            lines: [
                "Indien de koper uit meer dan een persoon bestaat, is ieder van hen hoofdelijk aansprakelijk voor de nakoming van alle verplichtingen uit deze overeenkomst (Art 6:6 BW).",
            ],
        },
        {
            title: "Artikel 10 - Risico",
            lines: [
                "Het risico van de onroerende zaak gaat op de koper over op het moment van de feitelijke levering. Tot die tijd is het risico voor de verkoper (Art 7:10 BW).",
            ],
        },
        {
            title: "Artikel 11 - Verzuim, ontbinding en boete",
            lines: [
                "Bij niet-tijdige nakoming door een partij wordt die partij in verzuim gesteld en is een boete van 10% van de koopsom verschuldigd, onverminderd het recht op aanvullende schadevergoeding, ontbinding en nakoming (Art 6:74 e.v. en 6:265 BW).",
            ],
        },
        {
            title: "Artikel 12 - Energielabel",
            lines: [
                `Het geldige energielabel (${property.energyLabels[0]?.labelClass ?? "onbekend"}) is aan de koper ter hand gesteld (Woningwet).`,
            ],
        },
        {
            title: "Artikel 13 - Domicilie",
            lines: [
                "Partijen kiezen voor deze overeenkomst domicilie op het adres van de notaris; schriftelijke mededelingen aan dat adres worden geacht te zijn ontvangen.",
            ],
        },
        {
            title: "Artikel 14 - Registratie koopovereenkomst",
            lines: [
                agreement.kadasterRegistration
                    ? "De koper kan deze koopovereenkomst in de openbare registers laten inschrijven ter bescherming tegen een latere vervreemding of bezwaring voor de duur van zes maanden (Art 7:3 BW). De kosten (ongeveer EUR 200) komen voor rekening van de koper."
                    : "Partijen hebben afgesproken de koopovereenkomst niet in de openbare registers in te schrijven.",
            ],
        },
        {
            title: "Artikel 15 - Identiteit partijen",
            lines: [
                "Partijen zijn gehouden hun identiteit aan de notaris te tonen (Wwft) en de notaris in staat te stellen de benodigde onderzoeken te verrichten.",
            ],
        },
        {
            title: "Artikel 16 - Ontbindende voorwaarden",
            lines: [
                agreement.financingCondition
                    ? `De koop kan door de koper worden ontbonden indien hij niet binnen ${agreement.financingTermWeeks} weken na ondertekening, na een reële inspanning, een financiering voor de koopsom heeft verkregen. Deadline: ${formatDate(agreement.financingDeadline)}. De ontbinding wordt schriftelijk aan de verkoper meegedeeld, uiterlijk de eerstvolgende werkdag na afloop van de termijn.`
                    : "Geen financieringsvoorbehoud overeengekomen.",
                agreement.inspectionCondition
                    ? `De koper kan binnen ${agreement.inspectionTermDays} dagen na ondertekening een bouwkundige keuring laten uitvoeren. Deadline: ${formatDate(agreement.inspectionDeadline)}. Indien de herstelkosten meer bedragen dan ${formatEuros(agreement.inspectionCostCapCents)} kan de koop schriftelijk worden ontbonden, onder bijvoeging van het keuringsrapport.`
                    : "Geen bouwkundig keuringsvoorbehoud overeengekomen.",
                agreement.nhgCondition
                    ? `Voorbehoud van verkrijging van Nationale Hypotheek Garantie (NHG) binnen ${agreement.nhgTermWeeks} weken na ondertekening. Deadline: ${formatDate(agreement.nhgDeadline)}.`
                    : "Geen NHG-voorbehoud overeengekomen.",
                agreement.foundationCondition
                    ? `Voorbehoud van een funderingsonderzoek binnen ${agreement.foundationTermWeeks} weken na ondertekening. Deadline: ${formatDate(agreement.foundationDeadline)}.`
                    : "Geen funderingsvoorbehoud overeengekomen.",
                "Ontbinding op grond van een voorwaarde geschiedt schriftelijk en kosteloos voor de koper.",
            ],
        },
        {
            title: "Artikel 17 - Bedenktijd",
            lines: [
                `De koper heeft een wettelijke bedenktijd van ten minste drie dagen (Art 7:2 lid 2 BW), waarvan ten minste twee werkdagen, te rekenen vanaf 00:00 van de dag na ontvangst van de ondertekende akte.`,
                signed
                    ? `Berekend einde bedenktijd: ${formatDate(agreement.coolingOffEndsAt)} (23:59).`
                    : "De bedenktijd start nadat de koper een exemplaar van de door beide partijen ondertekende koopovereenkomst heeft ontvangen.",
                "Binnen deze termijn kan de koper de koop zonder opgaaf van reden ontbinden. Een kortere termijn is niet toegestaan; een langere kan worden overeengekomen.",
            ],
        },
        {
            title: "Artikel 18 - Schriftelijke vastlegging",
            lines: [
                "Deze overeenkomst is bindend zodra koper en verkoper hebben ondertekend, ook wanneer de ondertekening op verschillende tijdstippen plaatsvindt. Elke wijziging behoeft schriftelijke instemming.",
            ],
        },
        {
            title: "Artikel 19 - Toepasselijk recht",
            lines: [
                "Op deze overeenkomst is uitsluitend Nederlands recht van toepassing. De bevoegde rechter is de rechter van de woonplaats van de koper.",
            ],
        },
        {
            title: "Ondertekening",
            lines: [
                signed
                    ? `Ondertekend door de verkoper (${transaction.seller.name}) op ${formatDate(agreement.sellerSignedAt)} via ${agreement.sellerSignatureMethod ?? "platformbevestiging"}.`
                    : `Verkoper: ${transaction.seller.name} - nog niet ondertekend.`,
                signed
                    ? `Ondertekend door de koper (${transaction.buyer.name}) op ${formatDate(agreement.buyerSignedAt)} via ${agreement.buyerSignatureMethod ?? "platformbevestiging"}.`
                    : `Koper: ${transaction.buyer.name} - nog niet ondertekend.`,
                `Conceptversie: v${agreement.version} (status ${agreement.status}).`,
            ],
        },
    ];
    if (agreement.additionalTerms?.trim()) {
        sections.splice(sections.length - 1, 0, {
            title: "Aanvullende afspraken",
            lines: [agreement.additionalTerms.trim()],
        });
    }
    const bytes = await createPdf(
        "ZELFWONEN - KOOPOVEREENKOMST",
        `${address} · bestaande woning`,
        [
            ...sections,
            {
                title: "Disclaimer",
                lines: [
                    "Deze overeenkomst is opgesteld met behulp van de ZelfWonen-platformovereenkomst. De digitale ondertekening is een platformbevestiging van instemming (Art 3:15a BW) en geen gekwalificeerde elektronische handtekening. Voor de eigendomsoverdracht is een notariële leveringsakte vereist. Laat deze overeenkomst vóór ondertekening controleren door een deskundige of de notaris.",
                ],
            },
        ],
    );
    return persistGeneratedDocument(
        transaction.id,
        userId,
        "PURCHASE_AGREEMENT",
        `koopovereenkomst-v${agreement.version}-${transaction.listing.publicSlug ?? transaction.listingId}.pdf`,
        bytes,
    );
}
