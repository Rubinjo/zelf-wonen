import {
    PDFDocument,
    rgb,
    type PDFFont,
    type PDFImage,
    type PDFPage,
} from "pdf-lib";

/**
 * Gedeelde, opgemaakte PDF-builder voor ZelfWonen-documenten (bijv. de
 * woningpaspoort-PDF en de lijst van zaken). Biedt pagina-koppen/-voeten,
 * sectietitels, kaders, tabellen, tekstomloop, scorebalken en het inbedden
 * van afbeeldingen.
 */

export type PdfColor = ReturnType<typeof rgb>;

export const COLORS = {
    text: rgb(0.07, 0.16, 0.13),
    muted: rgb(0.42, 0.48, 0.46),
    brand: rgb(0.03, 0.42, 0.32),
    brandDark: rgb(0.02, 0.29, 0.23),
    headerFill: rgb(0.04, 0.36, 0.28),
    rowAlt: rgb(0.96, 0.975, 0.97),
    border: rgb(0.86, 0.89, 0.87),
    boxFill: rgb(0.965, 0.98, 0.975),
    white: rgb(1, 1, 1),
    amber: rgb(0.76, 0.5, 0.05),
    red: rgb(0.72, 0.16, 0.1),
} as const;

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN_LEFT = 50;
export const MARGIN_RIGHT = 50;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const TOP_Y = 792;
const BOTTOM_Y = 64;

export type Column = { header: string; width: number };

const CELL_PADDING_X = 7;
const CELL_PADDING_Y = 6;

/** Maakt tekst veilig voor de standaard-PDF-lettertypen, met behoud van
 * Latijnse diakritische tekens (é, ë, è enz.) die in het Nederlandse
 * taalgebied veel voorkomen. */
export function safePdfText(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\u2026/g, "...")
        .replace(/\u00a0/g, " ")
        .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?");
}

export function wrapText(
    value: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
): string[] {
    const text = safePdfText(value).trim();
    if (!text) return [""];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            line = candidate;
        } else {
            if (line) lines.push(line);
            if (font.widthOfTextAtSize(word, size) > maxWidth) {
                let current = "";
                for (const character of word) {
                    if (
                        current &&
                        font.widthOfTextAtSize(current + character, size) >
                            maxWidth
                    ) {
                        lines.push(current);
                        current = character;
                    } else {
                        current += character;
                    }
                }
                line = current;
            } else {
                line = word;
            }
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

export class PdfBuilder {
    private readonly pdf: PDFDocument;
    private readonly regular: PDFFont;
    private readonly bold: PDFFont;
    private page!: PDFPage;
    private y = TOP_Y;
    private pageNumber = 1;

    constructor(pdf: PDFDocument, regular: PDFFont, bold: PDFFont) {
        this.pdf = pdf;
        this.regular = regular;
        this.bold = bold;
        this.newPage();
    }

    private newPage() {
        this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        this.y = TOP_Y;
        this.page.drawRectangle({
            x: 0,
            y: PAGE_HEIGHT - 8,
            width: PAGE_WIDTH,
            height: 8,
            color: COLORS.brand,
        });
        this.drawFooter();
        this.pageNumber += 1;
    }

    private drawFooter() {
        this.page.drawText(
            safePdfText(`ZelfWonen · Pagina ${this.pageNumber}`),
            {
                x: MARGIN_LEFT,
                y: 42,
                size: 8,
                font: this.regular,
                color: COLORS.muted,
            },
        );
        this.page.drawText(safePdfText("ZelfWonen"), {
            x:
                PAGE_WIDTH -
                MARGIN_RIGHT -
                this.regular.widthOfTextAtSize("ZelfWonen", 8),
            y: 42,
            size: 8,
            font: this.bold,
            color: COLORS.brand,
        });
    }

    private ensureSpace(needed: number) {
        if (this.y - needed < BOTTOM_Y) this.newPage();
    }

    gap(amount: number) {
        this.y -= amount;
    }

    get currentPage() {
        return this.page;
    }

    hairline(color: PdfColor = COLORS.border) {
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: this.y,
            width: CONTENT_WIDTH,
            height: 0.8,
            color,
        });
        this.y -= 8;
    }

    text(
        value: string,
        options: {
            size?: number;
            bold?: boolean;
            color?: PdfColor;
            x?: number;
        } = {},
    ) {
        const size = options.size ?? 10;
        this.ensureSpace(size + 6);
        this.page.drawText(safePdfText(value), {
            x: options.x ?? MARGIN_LEFT,
            y: this.y,
            size,
            font: options.bold ? this.bold : this.regular,
            color: options.color ?? COLORS.text,
        });
        this.y -= size + 6;
    }

    paragraph(
        value: string,
        options: { size?: number; color?: PdfColor; width?: number } = {},
    ) {
        const size = options.size ?? 10;
        const width = options.width ?? CONTENT_WIDTH;
        const lines = wrapText(value, this.regular, size, width);
        const lineHeight = size + 4;
        this.ensureSpace(lines.length * lineHeight);
        for (const line of lines) {
            this.page.drawText(safePdfText(line), {
                x: MARGIN_LEFT,
                y: this.y,
                size,
                font: this.regular,
                color: options.color ?? COLORS.text,
            });
            this.y -= lineHeight;
        }
    }

    sectionTitle(value: string) {
        const size = 12;
        this.ensureSpace(34);
        this.y -= 6;
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: this.y - 2,
            width: 3,
            height: size + 4,
            color: COLORS.brand,
        });
        this.page.drawText(safePdfText(value.toUpperCase()), {
            x: MARGIN_LEFT + 10,
            y: this.y,
            size,
            font: this.bold,
            color: COLORS.brandDark,
        });
        this.y -= size + 12;
    }

    subsectionTitle(value: string) {
        const size = 10;
        this.ensureSpace(28);
        this.y -= 2;
        this.page.drawText(safePdfText(value), {
            x: MARGIN_LEFT,
            y: this.y,
            size,
            font: this.bold,
            color: COLORS.brandDark,
        });
        this.y -= size + 8;
    }

    box(title: string, body: string) {
        const titleSize = 10;
        const bodySize = 9.5;
        const sidePadding = 18;
        const lineHeight = bodySize + 4;
        const bodyLines = wrapText(
            body,
            this.regular,
            bodySize,
            CONTENT_WIDTH - sidePadding * 2,
        ).length;
        const height =
            CELL_PADDING_Y * 2 + titleSize + 6 + bodyLines * lineHeight;
        this.ensureSpace(height + 12);
        this.y -= 8;
        const top = this.y;
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: top - height,
            width: CONTENT_WIDTH,
            height,
            color: COLORS.boxFill,
        });
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: top - height,
            width: 4,
            height,
            color: COLORS.brand,
        });
        let textY = top - CELL_PADDING_Y - titleSize;
        this.page.drawText(safePdfText(title.toUpperCase()), {
            x: MARGIN_LEFT + sidePadding,
            y: textY,
            size: titleSize,
            font: this.bold,
            color: COLORS.brandDark,
        });
        textY -= titleSize + 5;
        for (const line of wrapText(
            body,
            this.regular,
            bodySize,
            CONTENT_WIDTH - sidePadding * 2,
        )) {
            this.page.drawText(safePdfText(line), {
                x: MARGIN_LEFT + sidePadding,
                y: textY,
                size: bodySize,
                font: this.regular,
                color: COLORS.text,
            });
            textY -= lineHeight;
        }
        this.y -= height + 8;
    }

    table(
        columns: Column[],
        rows: string[][],
        options: { cellSize?: number; firstColumnBold?: boolean } = {},
    ) {
        const cellSize = options.cellSize ?? 9;
        const lineHeight = cellSize + 4;
        const headerHeight = cellSize + 16;
        const minRowHeight = lineHeight + CELL_PADDING_Y * 2;

        const wrapped = rows.map((row) =>
            columns.map((column, index) =>
                wrapText(
                    row[index] ?? "",
                    this.regular,
                    cellSize,
                    column.width - CELL_PADDING_X * 2,
                ),
            ),
        );
        const rowHeights = wrapped.map((row) => {
            const maxLines = Math.max(...row.map((lines) => lines.length), 1);
            return Math.max(
                maxLines * lineHeight + CELL_PADDING_Y * 2,
                minRowHeight,
            );
        });

        const headerCells = columns.map((column) => [column.header]);
        const drawHeader = () => {
            this.ensureSpace(headerHeight + 8);
            this.y -= 6;
            this.drawRow(
                headerCells,
                columns,
                headerHeight,
                COLORS.headerFill,
                this.bold,
                COLORS.white,
                cellSize,
                false,
            );
            this.y -= headerHeight;
        };

        drawHeader();

        wrapped.forEach((row, rowIndex) => {
            const height = rowHeights[rowIndex];
            if (this.y - height < BOTTOM_Y) {
                this.newPage();
                this.y -= 6;
                this.drawRow(
                    headerCells,
                    columns,
                    headerHeight,
                    COLORS.headerFill,
                    this.bold,
                    COLORS.white,
                    cellSize,
                    false,
                );
                this.y -= headerHeight;
            }
            const fill = rowIndex % 2 === 1 ? COLORS.rowAlt : undefined;
            this.drawRow(
                row,
                columns,
                height,
                fill,
                this.regular,
                COLORS.text,
                cellSize,
                options.firstColumnBold ?? false,
            );
            this.y -= height;
        });
        this.y -= 10;
    }

    private drawRow(
        cells: string[][],
        columns: Column[],
        height: number,
        fill: PdfColor | undefined,
        font: PDFFont,
        color: PdfColor,
        size: number,
        boldFirst: boolean,
    ) {
        const top = this.y;
        if (fill) {
            this.page.drawRectangle({
                x: MARGIN_LEFT,
                y: top - height,
                width: CONTENT_WIDTH,
                height,
                color: fill,
            });
        }
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: top,
            width: CONTENT_WIDTH,
            height: 0.6,
            color: COLORS.border,
        });
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: top - height,
            width: CONTENT_WIDTH,
            height: 0.6,
            color: COLORS.border,
        });
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: top - height,
            width: 0.6,
            height,
            color: COLORS.border,
        });

        let columnStartX = MARGIN_LEFT;
        cells.forEach((lines, index) => {
            const column = columns[index];
            const cellFont = boldFirst && index === 0 ? this.bold : font;
            let textY = top - CELL_PADDING_Y - size;
            for (const line of lines) {
                this.page.drawText(safePdfText(line), {
                    x: columnStartX + CELL_PADDING_X,
                    y: textY,
                    size,
                    font: cellFont,
                    color,
                });
                textY -= size + 4;
            }
            columnStartX += column.width;
            this.page.drawRectangle({
                x: columnStartX,
                y: top - height,
                width: 0.6,
                height,
                color: COLORS.border,
            });
        });
    }

    /** Teken een voortgangsbalk (bijv. volledigheidspercentage). */
    scoreBar(percent: number) {
        const barWidth = CONTENT_WIDTH;
        const barHeight = 14;
        const clamped = Math.max(0, Math.min(100, percent));
        this.ensureSpace(barHeight + 22);
        this.y -= 8;
        this.page.drawRectangle({
            x: MARGIN_LEFT,
            y: this.y - barHeight,
            width: barWidth,
            height: barHeight,
            color: COLORS.border,
        });
        if (clamped > 0) {
            this.page.drawRectangle({
                x: MARGIN_LEFT,
                y: this.y - barHeight,
                width: Math.max((barWidth * clamped) / 100, 2),
                height: barHeight,
                color: COLORS.brand,
            });
        }
        this.y -= barHeight + 6;
        this.page.drawText(
            safePdfText(`${clamped}% compleet`),
            {
                x: MARGIN_LEFT,
                y: this.y,
                size: 9,
                font: this.bold,
                color: COLORS.brandDark,
            },
        );
        this.y -= 15;
    }

    /** Bed een afbeelding in (JPG/PNG) en teken deze passend binnen de
     * inhoudsbreedte, met een optioneel bijschrift. */
    async image(options: {
        bytes: Uint8Array;
        mimeType: "jpeg" | "png";
        width: number;
        height: number;
        caption?: string;
    }) {
        const embedded: PDFImage =
            options.mimeType === "jpeg"
                ? await this.pdf.embedJpg(options.bytes)
                : await this.pdf.embedPng(options.bytes);
        const availableWidth = CONTENT_WIDTH;
        const maxHeight = 230;
        const scale = Math.min(
            availableWidth / Math.max(options.width, 1),
            maxHeight / Math.max(options.height, 1),
        );
        const drawWidth = options.width * scale;
        const drawHeight = options.height * scale;
        const captionLines = options.caption
            ? wrapText(options.caption, this.regular, 8, availableWidth)
            : [];
        const captionHeight = captionLines.length * 12;
        this.ensureSpace(drawHeight + captionHeight + 20);
        this.y -= 8;
        const x = MARGIN_LEFT + (availableWidth - drawWidth) / 2;
        this.page.drawImage(embedded, {
            x,
            y: this.y - drawHeight,
            width: drawWidth,
            height: drawHeight,
        });
        this.y -= drawHeight + 6;
        for (const line of captionLines) {
            this.page.drawText(safePdfText(line), {
                x: MARGIN_LEFT,
                y: this.y,
                size: 8,
                font: this.regular,
                color: COLORS.muted,
            });
            this.y -= 12;
        }
        this.y -= 6;
    }
}
