import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { listingAttributesSchema } from "@/lib/schemas/listing";

const publicStatuses = ["LIVE", "UNDER_OFFER", "SOLD", "RENTED"] as const;
const categoryLabels = {
    STAYS: "Blijft achter",
    GOES: "Gaat mee",
    FOR_TAKEOVER: "Ter overname",
} as const;

export class MovableItemsPdfError extends Error {}

function safePdfText(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, "?");
}

function wrap(value: string, length: number) {
    const words = safePdfText(value).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        if (`${line} ${word}`.trim().length > length && line) {
            lines.push(line);
            line = word;
        } else {
            line = `${line} ${word}`.trim();
        }
    }
    if (line) lines.push(line);
    return lines;
}

export async function generateMovableItemsPdf(
    listingId: string,
    userId: string | null,
) {
    const listing = await db.listing.findFirst({
        where: {
            id: listingId,
            OR: [
                { status: { in: [...publicStatuses] } },
                ...(userId ? [{ ownerId: userId }] : []),
            ],
        },
        select: {
            id: true,
            publicSlug: true,
            attributes: true,
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
    if (!listing) throw new MovableItemsPdfError("Lijst niet gevonden");

    const attributes = listingAttributesSchema.safeParse(
        listing.attributes ?? {},
    );
    const items = attributes.success ? attributes.data.movableItems : [];
    if (!items.length)
        throw new MovableItemsPdfError("Er zijn nog geen zaken toegevoegd");

    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const addText = (
        text: string,
        options?: { bold?: boolean; size?: number; x?: number },
    ) => {
        const size = options?.size ?? 10;
        if (y < 65) {
            page = pdf.addPage([595.28, 841.89]);
            y = 790;
        }
        page.drawText(safePdfText(text), {
            x: options?.x ?? 50,
            y,
            size,
            font: options?.bold ? bold : regular,
            color: rgb(0.08, 0.16, 0.13),
        });
        y -= size + 6;
    };

    addText("LIJST VAN ZAKEN", { bold: true, size: 18 });
    y -= 5;
    addText(
        `${listing.property.street} ${listing.property.houseNumber}${listing.property.houseNumberAddition ? ` ${listing.property.houseNumberAddition}` : ""}`,
        { bold: true, size: 12 },
    );
    addText(`${listing.property.postcode} ${listing.property.city}`);
    addText(
        `Gegenereerd op ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date())}`,
    );
    y -= 14;

    for (const category of Object.keys(categoryLabels) as Array<
        keyof typeof categoryLabels
    >) {
        const categoryItems = items.filter(
            (item) => item.category === category,
        );
        if (!categoryItems.length) continue;
        addText(categoryLabels[category].toUpperCase(), {
            bold: true,
            size: 12,
        });
        y -= 2;
        for (const item of categoryItems) {
            addText(`- ${item.name}`, { bold: true });
            if (item.notes) {
                for (const line of wrap(item.notes, 82)) {
                    addText(line, { x: 62, size: 9 });
                }
            }
            y -= 4;
        }
        y -= 8;
    }

    y -= 6;
    for (const line of wrap(
        "Deze lijst is door de verkoper bij de woningadvertentie opgesteld. Leg de definitieve afspraken vast in de koopovereenkomst.",
        92,
    )) {
        addText(line, { size: 8 });
    }
    pdf.setTitle(
        `Lijst van zaken - ${listing.property.street} ${listing.property.houseNumber}`,
    );
    pdf.setAuthor("ZelfWonen");
    pdf.setSubject("Roerende-zakenlijst bij woningadvertentie");

    return {
        bytes: await pdf.save(),
        fileName: `lijst-van-zaken-${listing.publicSlug ?? listing.id}.pdf`,
    };
}
