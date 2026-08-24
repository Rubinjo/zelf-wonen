import { PDFDocument, StandardFonts } from "pdf-lib";
import { db } from "@/lib/db";
import { listingAttributesSchema } from "@/lib/schemas/listing";
import { getQuestionnaireSections } from "@/features/listings/property-questionnaire";
import { COLORS, PdfBuilder } from "@/features/pdf/pdf-builder";

const publicStatuses = ["LIVE", "UNDER_OFFER", "SOLD", "RENTED"] as const;

const categoryLabels = {
    STAYS: "Blijft achter",
    GOES: "Gaat mee",
    FOR_TAKEOVER: "Ter overname",
} as const;

const answerLabels = {
    YES: "Ja",
    NO: "Nee",
    UNKNOWN: "Niet bekend",
} as const;

export class MovableItemsPdfError extends Error {}


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
                    propertyType: true,
                },
            },
        },
    });
    if (!listing) throw new MovableItemsPdfError("Lijst niet gevonden");

    const attributes = listingAttributesSchema.safeParse(
        listing.attributes ?? {},
    );
    const items = attributes.success
        ? attributes.data.movableItems.filter(
              (item) => item.name.trim().length > 0,
          )
        : [];
    if (!items.length)
        throw new MovableItemsPdfError("Er zijn nog geen zaken toegevoegd");
    const questionnaireAnswers = attributes.success
        ? attributes.data.questionnaireAnswers
        : [];

    const address = [
        listing.property.street,
        listing.property.houseNumber,
        listing.property.houseNumberAddition,
    ]
        .filter(Boolean)
        .join(" ");
    const generatedOn = new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "long",
    }).format(new Date());

    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const doc = new PdfBuilder(pdf, regular, bold);

    // ---------- Header ----------
    doc.text("ZELFWONEN", { size: 9, bold: true, color: COLORS.brand });
    doc.gap(2);
    doc.hairline(COLORS.brand);
    doc.gap(12);
    doc.text("LIJST VAN ZAKEN EN VRAGENLIJST", { size: 22, bold: true });
    doc.gap(2);
    doc.text(address, { size: 13, bold: true });
    doc.text(`${listing.property.postcode} ${listing.property.city}`, {
        size: 11,
        color: COLORS.muted,
    });
    doc.text(`Gegenereerd op ${generatedOn}`, {
        size: 9,
        color: COLORS.muted,
    });
    doc.gap(12);

    // ---------- Intro ----------
    doc.box(
        "Over dit document",
        "Dit document is door de verkoper via ZelfWonen opgesteld en geeft inzicht in de woning zoals deze wordt aangeboden. Het bevat de lijst van roerende zaken — welke zaken achterblijven, meegaan of ter overname worden aangeboden — en een vragenlijst waarin de verkoper vragen over de juridische, bouwkundige en technische staat van de woning heeft beantwoord. Vragen die niet van toepassing zijn, zijn niet in dit document opgenomen.",
    );

    // ---------- Roerende zaken ----------
    doc.sectionTitle("Roerende zaken");
    doc.paragraph(
        "De volgende roerende zaken horen bij de woning en zijn door de verkoper als volgt ingedeeld.",
        { size: 9, color: COLORS.muted },
    );
    doc.gap(4);
    doc.table(
        [
            { header: "Zaak", width: 150 },
            { header: "Categorie", width: 120 },
            { header: "Toelichting", width: 225 },
        ],
        items.map((item) => [
            item.name,
            categoryLabels[item.category],
            item.notes || "",
        ]),
        { firstColumnBold: true },
    );

    // ---------- Vragenlijst ----------
    doc.sectionTitle("Vragenlijst over de woning");
    doc.paragraph(
        "De verkoper heeft onderstaande vragen over de woning beantwoord. Vragen die niet van toepassing zijn (n.v.t.), zijn weggelaten.",
        { size: 9, color: COLORS.muted },
    );
    doc.gap(4);

    const answersByQuestionId = new Map(
        questionnaireAnswers.map((answer) => [answer.questionId, answer]),
    );
    const sections = getQuestionnaireSections(listing.property.propertyType);
    let renderedAnyQuestion = false;
    for (const section of sections) {
        const rows: string[][] = [];
        for (const question of section.questions) {
            const answer = answersByQuestionId.get(question.id);
            if (!answer || answer.answer === "NOT_APPLICABLE") continue;
            rows.push([
                question.text,
                answerLabels[answer.answer],
                answer.details || "",
            ]);
        }
        if (!rows.length) continue;
        renderedAnyQuestion = true;
        doc.subsectionTitle(section.title);
        doc.table(
            [
                { header: "Vraag", width: 250 },
                { header: "Antwoord", width: 85 },
                { header: "Toelichting", width: 160 },
            ],
            rows,
        );
    }
    if (!renderedAnyQuestion) {
        doc.paragraph(
            "De verkoper heeft geen vragen over de woning beantwoord.",
            { size: 9, color: COLORS.muted },
        );
    }

    // ---------- Slot ----------
    doc.gap(6);
    doc.box(
        "Belangrijk",
        "Dit document is door de verkoper via ZelfWonen opgesteld. De informatie in dit document wordt automatisch overgenomen in de koopovereenkomst die via het platform wordt gesloten.",
    );

    pdf.setTitle(`Lijst van zaken en vragenlijst - ${address}`);
    pdf.setAuthor("ZelfWonen");
    pdf.setSubject("Lijst van zaken en vragenlijst bij woningadvertentie");

    return {
        bytes: await pdf.save(),
        fileName: `lijst-van-zaken-${listing.publicSlug ?? listing.id}.pdf`,
    };
}
