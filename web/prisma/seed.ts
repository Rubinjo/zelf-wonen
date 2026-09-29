/**
 * ZelfWonen — Development seed
 * ============================
 *
 * Loads a full set of dummy data into the LOCAL development database so every
 * feature of the platform can be exercised end-to-end:
 *
 *   - 10 user accounts (owners + seekers) with WORKING credentials
 *   - 14 properties (house / apartment / parking / land) incl. monuments
 *   - energy labels + CBS neighborhood profiles
 *   - listings in every status: DRAFT, READY_FOR_VERIFICATION, LIVE,
 *     UNDER_OFFER, SOLD, RENTED, ARCHIVED + an expired-bid-window listing
 *   - media, floor plans, free PLATFORM publications
 *   - cryptographically chained bids & bid events
 *   - viewing slots/bookings, favorites, saved searches, shortlist shares,
 *     seeker notifications, identity verification attempts + audit logs
 *   - 3 property transactions (pending sale, completed sale, completed rental)
 *     with milestones, messages, documents, events + passport versions
 *   - estimator caches + postcode price stats
 *
 * SAFETY
 * ------
 * This script REFUSES to run unless it targets the local dev database:
 *   * NODE_ENV must not be `production`
 *   * DATABASE_URL (or the built-in fallback) must point at localhost/127.0.0.1
 * It also WIPES all existing data first, so it is fully re-runnable. The
 * append-only triggers (bids, events, audit logs, passport versions, ...) are
 * temporarily disabled during the reseed and re-enabled afterwards.
 *
 * Run with:
 *   npm run db:seed
 *   # or: npx prisma db seed
 */
import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { hashPassword } from "@better-auth/utils/password";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PrismaPg } from "@prisma/adapter-pg";
import {
    PrismaClient,
    Prisma,
    BiddingMethod,
    BidEventType,
    EnergyLabelClass,
    ErfpachtType,
    ListingStatus,
    ParkingOption,
    PropertyAmenity,
    PropertyType,
    RoofType,
    TransactionDocumentCategory,
    TransactionEventType,
    VerificationKind,
    VerificationPurpose,
    VerificationStatus,
    ViewingAttendanceStatus,
    ViewingType,
} from "@/generated/prisma/client";
import { propertyQuestionnaireSections } from "@/features/listings/property-questionnaire";

config({ path: ".env.local" });
config();

/* ------------------------------------------------------------------ *
 * Environment guard — this must stay strict so the seed can never hit  *
 * a production/staging database.                                       *
 * ------------------------------------------------------------------ */
const DEV_FALLBACK_URL =
    "postgresql://zelfwonen:zelfwonen_dev_password@localhost:5432/zelfwonen?schema=public";

function assertDevEnvironment() {
    const nodeEnv = process.env.NODE_ENV;
    const url = process.env.DATABASE_URL ?? DEV_FALLBACK_URL;
    const isLocal = /localhost|127\.0\.0\.1|::1/.test(url);

    if (nodeEnv === "production") {
        throw new Error(
            `[seed] Refusing to run: NODE_ENV=${nodeEnv}. Seeding is only allowed for the development environment.`,
        );
    }
    if (!isLocal) {
        throw new Error(
            `[seed] Refusing to run: DATABASE_URL does not point at a local development database (got: ${url}).`,
        );
    }
}

/* ------------------------------------------------------------------ *
 * Hash helpers. These must stay in sync with the application code:     *
 *   - src/features/bidding/bid-integrity.ts  (bid + bid event chains)  *
 *   - src/features/transactions/transaction-service.ts (chainedHash)   *
 *   - src/lib/auth.ts (verification audit chain)                       *
 * ------------------------------------------------------------------ */
function sha256(input: string) {
    return createHash("sha256").update(input).digest("hex");
}

/** Canonical JSON used by the bid integrity module (sorted keys, no bigint handling). */
function normalizeCanonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalizeCanonical);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, normalizeCanonical(child)]),
        );
    }
    return value;
}
function bidCanonicalJson(value: unknown) {
    return JSON.stringify(normalizeCanonical(value));
}

/** Canonical JSON used by transaction-service (bigint→string, Date→ISO). */
function txnCanonicalJson(value: unknown): string {
    if (typeof value === "bigint") return JSON.stringify(value.toString());
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (
        value &&
        typeof value === "object" &&
        "toJSON" in value &&
        typeof (value as { toJSON?: unknown }).toJSON === "function"
    ) {
        return txnCanonicalJson((value as { toJSON: () => unknown }).toJSON());
    }
    if (Array.isArray(value))
        return `[${value.map(txnCanonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(
                ([key, item]) =>
                    `${JSON.stringify(key)}:${txnCanonicalJson(item)}`,
            )
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
function chainedHash(previousHash: string | null, payload: unknown) {
    return createHash("sha256")
        .update(`${previousHash ?? ""}${txnCanonicalJson(payload)}`)
        .digest("hex");
}

function bidEntryHash(
    previousHash: string | null,
    bid: {
        listingId: string;
        bidderPseudonym: string;
        amountCents: string;
        currency: string;
        resolutiveConditions: unknown;
        financingDeadline: string | null;
        transferDateRequested: string | null;
        submittedAt: string;
    },
) {
    return sha256(`${previousHash ?? "GENESIS"}:${bidCanonicalJson(bid)}`);
}

function bidEventEntryHash(
    previousHash: string | null,
    event: {
        bidId: string;
        bidEntryHash: string;
        type: string;
        reason: string | null;
        occurredAt: string;
    },
) {
    return sha256(`${previousHash ?? "GENESIS"}:${bidCanonicalJson(event)}`);
}

function verificationAuditHash(
    previousHash: string | null,
    entry: {
        userId: string;
        kind: string;
        status: string;
        purpose: string;
        provider: string;
        occurredAt: string;
    },
) {
    const canonical = JSON.stringify(entry);
    return sha256(`${previousHash ?? "GENESIS"}:${canonical}`);
}

/* ------------------------------------------------------------------ *
 * Small date helpers                                                   *
 * ------------------------------------------------------------------ */
function daysFromNow(days: number, hourOffset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    if (hourOffset !== 0) date.setHours(date.getHours() + hourOffset);
    return date;
}

/* ------------------------------------------------------------------ *
 * Dummy media generation.                                              *
 *                                                                      *
 * Listing photos/floor plans are served straight from `public/` (the   *
 * UI renders `/${storageKey}`), transaction documents are read from    *
 * `.data/transaction-documents/{transactionId}/`. We generate real     *
 * files during the seed so those URLs actually resolve instead of      *
 * returning 404.                                                       *
 * ------------------------------------------------------------------ */
const PUBLIC_ROOT = path.resolve(process.cwd(), "public");
const DATA_ROOT = path.resolve(process.cwd(), ".data");

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([length, typeBuf, data, crcBuf]);
}

/** Encode an RGBA pixel buffer (width*height*4) as a PNG. */
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // filter: none
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let rgb: [number, number, number];
    if (hp < 1) rgb = [c, x, 0];
    else if (hp < 2) rgb = [x, c, 0];
    else if (hp < 3) rgb = [0, c, x];
    else if (hp < 4) rgb = [0, x, c];
    else if (hp < 5) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    const m = l - c / 2;
    return [
        Math.round((rgb[0] + m) * 255),
        Math.round((rgb[1] + m) * 255),
        Math.round((rgb[2] + m) * 255),
    ];
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function lerpColor(
    a: [number, number, number],
    b: [number, number, number],
    t: number,
): [number, number, number] {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function fillRow(
    buf: Buffer,
    width: number,
    y: number,
    x0: number,
    x1: number,
    color: [number, number, number],
) {
    const start = Math.max(0, x0);
    const end = Math.min(width, x1);
    for (let x = start; x < end; x++) {
        const i = (y * width + x) * 4;
        buf[i] = color[0];
        buf[i + 1] = color[1];
        buf[i + 2] = color[2];
        buf[i + 3] = 255;
    }
}

function fillRect(
    buf: Buffer,
    width: number,
    height: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: [number, number, number],
) {
    const ys = Math.max(0, y0);
    const ye = Math.min(height, y1);
    for (let y = ys; y < ye; y++) {
        fillRow(buf, width, y, x0, x1, color);
    }
}

function fillTri(
    buf: Buffer,
    width: number,
    height: number,
    a: [number, number],
    b: [number, number],
    c: [number, number],
    color: [number, number, number],
) {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(width, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(height, Math.ceil(Math.max(a[1], b[1], c[1])));
    const sign = (
        p1: [number, number],
        p2: [number, number],
        p: [number, number],
    ) => (p[0] - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (p[1] - p2[1]);
    const d1 = sign(a, b, [minX, minY]);
    const d2 = sign(b, c, [minX, minY]);
    const d3 = sign(c, a, [minX, minY]);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) {
            const p: [number, number] = [x + 0.5, y + 0.5];
            const s1 = sign(a, b, p);
            const s2 = sign(b, c, p);
            const s3 = sign(c, a, p);
            const inside = hasNeg
                ? s1 <= 0 && s2 <= 0 && s3 <= 0
                : s1 >= 0 && s2 >= 0 && s3 >= 0;
            if (inside) {
                const i = (y * width + x) * 4;
                buf[i] = color[0];
                buf[i + 1] = color[1];
                buf[i + 2] = color[2];
                buf[i + 3] = 255;
            }
        }
    }
}

/** A simple but pleasant "property photo" placeholder (gradient + house silhouette). */
function renderPhotoPng(listingId: string, index: number): Buffer {
    const width = 1600;
    const height = 1200;
    const buf = Buffer.alloc(width * height * 4);
    const digest = sha256(`${listingId}:photo:${index}`);
    const hue = parseInt(digest.slice(0, 2), 16) % 360;

    const horizon = Math.floor(height * 0.74);
    const skyTop = hslToRgb(hue, 0.55, 0.82);
    const skyBottom = hslToRgb((hue + 24) % 360, 0.5, 0.68);
    const groundTop = hslToRgb((hue + 40) % 360, 0.32, 0.48);
    const groundBottom = hslToRgb((hue + 56) % 360, 0.28, 0.34);

    for (let y = 0; y < horizon; y++) {
        fillRow(
            buf,
            width,
            y,
            0,
            width,
            lerpColor(skyTop, skyBottom, y / horizon),
        );
    }
    for (let y = horizon; y < height; y++) {
        fillRow(
            buf,
            width,
            y,
            0,
            width,
            lerpColor(
                groundTop,
                groundBottom,
                (y - horizon) / (height - horizon),
            ),
        );
    }

    // A small sun/cloud accent in the sky (deterministic position).
    const sunX = (parseInt(digest.slice(4, 6), 16) % 900) + 200;
    const sunY = (parseInt(digest.slice(6, 8), 16) % 160) + 60;
    fillRect(
        buf,
        width,
        height,
        sunX - 30,
        sunY - 30,
        sunX + 30,
        sunY + 30,
        [255, 250, 235],
    );
    fillTri(
        buf,
        width,
        height,
        [sunX, sunY - 40],
        [sunX - 34, sunY + 20],
        [sunX + 34, sunY + 20],
        [255, 250, 235],
    );

    // House silhouette.
    const houseW = Math.floor(
        width * (0.3 + (parseInt(digest.slice(2, 4), 16) % 20) / 100),
    );
    const houseH = Math.floor(height * 0.28);
    const hx0 = Math.floor((width - houseW) / 2);
    const hx1 = hx0 + houseW;
    const hy1 = horizon + Math.floor(height * 0.03);
    const hy0 = hy1 - houseH;
    const wall = hslToRgb((hue + 60) % 360, 0.3, 0.8);
    const roof = hslToRgb((hue + 80) % 360, 0.42, 0.46);
    const trim = hslToRgb(hue, 0.5, 0.96);

    fillRect(buf, width, height, hx0, hy0, hx1, hy1, wall);
    fillTri(
        buf,
        width,
        height,
        [hx0 - Math.floor(houseW * 0.12), hy0],
        [hx1 + Math.floor(houseW * 0.12), hy0],
        [Math.floor((hx0 + hx1) / 2), hy0 - Math.floor(houseH * 0.42)],
        roof,
    );
    // Windows + door.
    const winW = Math.floor(houseW * 0.18);
    const winH = Math.floor(houseH * 0.24);
    const winY = hy0 + Math.floor(houseH * 0.18);
    fillRect(
        buf,
        width,
        height,
        hx0 + Math.floor(houseW * 0.12),
        winY,
        hx0 + Math.floor(houseW * 0.12) + winW,
        winY + winH,
        trim,
    );
    fillRect(
        buf,
        width,
        height,
        hx1 - Math.floor(houseW * 0.12) - winW,
        winY,
        hx1 - Math.floor(houseW * 0.12),
        winY + winH,
        trim,
    );
    const doorW = Math.floor(houseW * 0.14);
    const doorH = Math.floor(height * 0.1);
    fillRect(
        buf,
        width,
        height,
        Math.floor((hx0 + hx1) / 2 - doorW / 2),
        hy1 - doorH,
        Math.floor((hx0 + hx1) / 2 + doorW / 2),
        hy1,
        hslToRgb(hue, 0.42, 0.34),
    );

    return encodePng(width, height, buf);
}

/** A simple room-grid "floor plan" placeholder. */
function renderFloorPlanPng(listingId: string): Buffer {
    const width = 1200;
    const height = 900;
    const buf = Buffer.alloc(width * height * 4);
    fillRect(buf, width, height, 0, 0, width, height, [247, 246, 242]);
    const wall: [number, number, number] = [58, 58, 58];
    const m = 90;
    const outer = 14;
    const inner = 9;

    // Outer walls.
    fillRect(buf, width, height, m, m, width - m, m + outer, wall);
    fillRect(
        buf,
        width,
        height,
        m,
        height - m - outer,
        width - m,
        height - m,
        wall,
    );
    fillRect(buf, width, height, m, m, m + outer, height - m, wall);
    fillRect(
        buf,
        width,
        height,
        width - m - outer,
        m,
        width - m,
        height - m,
        wall,
    );

    // Internal walls (rooms). Layout is varied deterministically per listing.
    const digest = sha256(listingId);
    const midX = Math.floor(
        width * (0.44 + (parseInt(digest.slice(0, 2), 16) % 12) / 100),
    );
    const wallY = Math.floor(
        height * (0.5 + (parseInt(digest.slice(2, 4), 16) % 17) / 100),
    );
    const topRoomY = Math.floor(
        height * (0.36 + (parseInt(digest.slice(4, 6), 16) % 10) / 100),
    );
    fillRect(
        buf,
        width,
        height,
        midX - inner / 2,
        m + outer,
        midX + inner / 2,
        wallY,
        wall,
    );
    fillRect(
        buf,
        width,
        height,
        m + outer,
        wallY,
        midX - inner / 2,
        wallY + inner,
        wall,
    );
    fillRect(
        buf,
        width,
        height,
        midX + inner / 2,
        topRoomY,
        width - m - outer,
        topRoomY + inner,
        wall,
    );
    fillRect(
        buf,
        width,
        height,
        m + outer,
        topRoomY,
        Math.floor(width * 0.3),
        topRoomY + inner,
        wall,
    );
    fillRect(
        buf,
        width,
        height,
        Math.floor(width * 0.75),
        m + outer,
        Math.floor(width * 0.75) + inner,
        wallY,
        wall,
    );

    // Door gaps (draw a lighter band through a wall).
    const gap: [number, number, number] = [247, 246, 242];
    fillRect(
        buf,
        width,
        height,
        midX - inner / 2 - 1,
        wallY - 40,
        midX + inner / 2 + 1,
        wallY - 22,
        gap,
    );

    return encodePng(width, height, buf);
}

async function writePublicFile(
    storageKey: string,
    bytes: Buffer,
): Promise<void> {
    const root = path.resolve(PUBLIC_ROOT);
    const target = path.resolve(PUBLIC_ROOT, storageKey);
    if (!target.startsWith(`${root}${path.sep}`)) {
        throw new Error(`[seed] Invalid media storage key: ${storageKey}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
}

async function writeDummyPdf(
    directory: string,
    fileName: string,
    title: string,
    body: string,
): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    doc.setAuthor("ZelfWonen dev seed");
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    page.drawText("ZelfWonen", { x: 60, y: 800, size: 22, font: bold });
    page.drawText(title, { x: 60, y: 768, size: 14, font: bold });
    page.drawText(body, { x: 60, y: 742, size: 11, font });
    page.drawText("Development seed document (dummy).", {
        x: 60,
        y: 722,
        size: 9,
        font,
    });
    const bytes = await doc.save();
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, fileName), bytes);
    return Buffer.from(bytes);
}

/* ------------------------------------------------------------------ *
 * Append-only tables whose DELETE is blocked by immutability.sql.      *
 * ------------------------------------------------------------------ */
const APPEND_ONLY_TABLES = [
    "bids",
    "bid_events",
    "verification_audit_logs",
    "audit_events",
    "bid_logbook_exports",
    "transaction_events",
    "property_passport_versions",
];

const ALL_TABLES = [
    "property_passport_versions",
    "transaction_events",
    "transaction_documents",
    "transaction_messages",
    "transaction_milestones",
    "property_transactions",
    "bid_events",
    "bid_logbook_exports",
    "bids",
    "listing_publications",
    "publication_orders",
    "identity_verification_attempts",
    "verification_audit_logs",
    "viewing_bookings",
    "viewing_slots",
    "audit_events",
    "listing_media",
    "floor_plans",
    "shortlist_items",
    "shortlist_shares",
    "seeker_notifications",
    "saved_searches",
    "favorite_listings",
    "notification_preferences",
    "listings",
    "neighborhood_profiles",
    "energy_labels",
    "properties",
    "accounts",
    "sessions",
    "two_factors",
    "verifications",
    "users",
    "estimate_cache",
    "postcode_price_stats",
];

type Tx = Prisma.TransactionClient;

/* ================================================================== *
 * Seed helpers                                                        *
 * ================================================================== */
async function createBidChain(
    tx: Tx,
    listingId: string,
    bids: Array<{
        bidderUserId: string;
        bidderPseudonym: string;
        amountCents: bigint;
        resolutiveConditions: unknown;
        financingDeadline?: Date;
        transferDateRequested?: Date;
        submittedAt: Date;
        events?: Array<{
            type: string;
            reason?: string | null;
            occurredAt: Date;
        }>;
    }>,
) {
    const created: Array<{
        id: string;
        entryHash: string;
        bidderUserId: string | null;
        amountCents: bigint;
    }> = [];
    let previousHash: string | null = null;

    for (const bid of bids) {
        const canonical = {
            listingId,
            bidderPseudonym: bid.bidderPseudonym,
            amountCents: bid.amountCents.toString(),
            currency: "EUR",
            resolutiveConditions: bid.resolutiveConditions,
            financingDeadline: bid.financingDeadline?.toISOString() ?? null,
            transferDateRequested:
                bid.transferDateRequested?.toISOString() ?? null,
            submittedAt: bid.submittedAt.toISOString(),
        };
        const entryHash = bidEntryHash(previousHash, canonical);

        const row = await tx.bid.create({
            data: {
                id: randomUUID(),
                listingId,
                bidderUserId: bid.bidderUserId,
                idempotencyKey: randomUUID(),
                bidderPseudonym: bid.bidderPseudonym,
                amountCents: bid.amountCents,
                currency: "EUR",
                resolutiveConditions:
                    bid.resolutiveConditions as Prisma.InputJsonValue,
                financingDeadline: bid.financingDeadline,
                transferDateRequested: bid.transferDateRequested,
                submittedAt: bid.submittedAt,
                sourceIpHash: sha256("127.0.0.1"),
                previousHash,
                entryHash,
            },
        });

        // The first event of every bid chain is always SUBMITTED.
        let previousEvent: string | null = null;
        const submitEventHash = bidEventEntryHash(null, {
            bidId: row.id,
            bidEntryHash: entryHash,
            type: "SUBMITTED",
            reason: null,
            occurredAt: bid.submittedAt.toISOString(),
        });
        await tx.bidEvent.create({
            data: {
                id: randomUUID(),
                bidId: row.id,
                type: "SUBMITTED",
                occurredAt: bid.submittedAt,
                previousHash: null,
                entryHash: submitEventHash,
            },
        });
        previousEvent = submitEventHash;

        for (const event of bid.events ?? []) {
            const eventHash = bidEventEntryHash(previousEvent, {
                bidId: row.id,
                bidEntryHash: entryHash,
                type: event.type,
                reason: event.reason ?? null,
                occurredAt: event.occurredAt.toISOString(),
            });
            await tx.bidEvent.create({
                data: {
                    id: randomUUID(),
                    bidId: row.id,
                    type: event.type as BidEventType,
                    reason: event.reason ?? null,
                    occurredAt: event.occurredAt,
                    previousHash: previousEvent,
                    entryHash: eventHash,
                },
            });
            previousEvent = eventHash;
        }

        created.push({
            id: row.id,
            entryHash,
            bidderUserId: bid.bidderUserId,
            amountCents: bid.amountCents,
        });
        previousHash = entryHash;
    }

    return created;
}

async function appendTransactionEvent(
    tx: Tx,
    transactionId: string,
    actorUserId: string | null,
    type: TransactionEventType,
    payload: unknown,
    occurredAt: Date,
) {
    const latest = await tx.transactionEvent.findFirst({
        where: { transactionId },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { entryHash: true },
    });
    const previous = latest?.entryHash ?? null;
    const eventPayload = {
        transactionId,
        actorUserId,
        type,
        payload,
        occurredAt: occurredAt.toISOString(),
    };
    const entryHash = chainedHash(previous, eventPayload);
    return tx.transactionEvent.create({
        data: {
            transactionId,
            actorUserId,
            type,
            payload: payload as Prisma.InputJsonValue,
            occurredAt,
            previousHash: previous,
            entryHash,
        },
    });
}

async function createPassportVersion(
    tx: Tx,
    listing: { id: string; version: number },
    snapshot: unknown,
    completenessScore: number,
    createdByUserId: string,
    createdAt: Date,
) {
    const previous = await tx.propertyPassportVersion.findFirst({
        where: { listingId: listing.id },
        orderBy: { version: "desc" },
        select: { version: true, entryHash: true },
    });
    const version = (previous?.version ?? 0) + 1;
    const payload = {
        listingId: listing.id,
        version,
        listingVersionSource: listing.version,
        completenessScore,
        snapshot,
        createdByUserId,
        createdAt: createdAt.toISOString(),
    };
    const entryHash = chainedHash(previous?.entryHash ?? null, payload);
    return tx.propertyPassportVersion.create({
        data: {
            listingId: listing.id,
            version,
            listingVersionSource: listing.version,
            snapshot: snapshot as Prisma.InputJsonValue,
            completenessScore,
            previousHash: previous?.entryHash ?? null,
            entryHash,
            createdByUserId,
            createdAt,
        },
    });
}

async function appendVerificationAudit(
    tx: Tx,
    userId: string,
    occurredAt: Date,
    purpose: "ACCOUNT_ACCESS" | "LISTING_PUBLICATION" = "ACCOUNT_ACCESS",
) {
    const latest = await tx.verificationAuditLog.findFirst({
        where: { userId },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { entryHash: true },
    });
    const previous = latest?.entryHash ?? null;
    const entry = {
        userId,
        kind: "EMAIL" as VerificationKind,
        status: "VERIFIED" as VerificationStatus,
        purpose,
        provider: "BETTER_AUTH",
        occurredAt: occurredAt.toISOString(),
    };
    const entryHash = verificationAuditHash(previous, entry);
    return tx.verificationAuditLog.create({
        data: {
            userId,
            kind: entry.kind,
            status: entry.status,
            purpose: entry.purpose,
            provider: entry.provider,
            occurredAt,
            previousHash: previous,
            entryHash,
        },
    });
}

async function appendAuditEvent(
    tx: Tx,
    input: {
        aggregateType: string;
        aggregateId: string;
        actorUserId: string | null;
        listingId: string | null;
        eventType: string;
        payload: unknown;
        occurredAt: Date;
    },
) {
    const latest = await tx.auditEvent.findFirst({
        where: {
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { entryHash: true },
    });
    const previous = latest?.entryHash ?? null;
    const hashPayload = {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actorUserId: input.actorUserId,
        listingId: input.listingId,
        eventType: input.eventType,
        payload: input.payload,
        occurredAt: input.occurredAt.toISOString(),
    };
    const entryHash = chainedHash(previous, hashPayload);
    return tx.auditEvent.create({
        data: {
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
            actorUserId: input.actorUserId,
            listingId: input.listingId,
            eventType: input.eventType,
            payload: input.payload as Prisma.InputJsonValue,
            occurredAt: input.occurredAt,
            previousHash: previous,
            entryHash,
        },
    });
}

/* ================================================================== *
 * Main seed                                                           *
 * ================================================================== */
async function main() {
    assertDevEnvironment();

    const connectionString = process.env.DATABASE_URL ?? DEV_FALLBACK_URL;
    const prisma = new PrismaClient({
        adapter: new PrismaPg(connectionString),
    });

    // Remove previously generated dummy media; everything is regenerated below.
    await rm(path.join(PUBLIC_ROOT, "dev"), { recursive: true, force: true });
    await rm(path.join(DATA_ROOT, "transaction-documents"), {
        recursive: true,
        force: true,
    });
    await rm(path.join(DATA_ROOT, "logbooks"), {
        recursive: true,
        force: true,
    });

    // ---- Credentials -------------------------------------------------
    const SEED_PASSWORD = "DevPassw0rd!";
    const passwordHash = await hashPassword(SEED_PASSWORD);

    try {
        await prisma.$transaction(
            async (tx) => {
                // ---- 1. Disable append-only triggers + wipe ----------
                for (const table of APPEND_ONLY_TABLES) {
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE "${table}" DISABLE TRIGGER ALL`,
                    );
                }
                await tx.$executeRawUnsafe(
                    `TRUNCATE TABLE ${ALL_TABLES.join(", ")} CASCADE`,
                );

                // ---- 2. Users -----------------------------------------
                const users: Record<string, { id: string }> = {};
                const userSpecs = [
                    // owners / sellers
                    ["jan", "Jan de Vries", "jan.devries@example.dev", "NL"],
                    ["sanne", "Sanne Bakker", "sanne.bakker@example.dev", "NL"],
                    [
                        "mohamed",
                        "Mohamed El Amrani",
                        "mohamed.elamrani@example.dev",
                        "NL",
                    ],
                    ["anouk", "Anouk Jansen", "anouk.jansen@example.dev", "NL"],
                    [
                        "pieter",
                        "Pieter Visser",
                        "pieter.visser@example.dev",
                        "NL",
                    ],
                    // seekers / buyers
                    [
                        "thomas",
                        "Thomas Mulder",
                        "thomas.mulder@example.dev",
                        "NL",
                    ],
                    ["lisa", "Lisa van Dijk", "lisa.vandijk@example.dev", "NL"],
                    [
                        "david",
                        "David de Boer",
                        "david.deboer@example.dev",
                        "NL",
                    ],
                    ["femke", "Femke Smit", "femke.smit@example.dev", "NL"],
                    ["bram", "Bram Willems", "bram.willems@example.dev", "EN"],
                ] as const;

                for (const [key, name, email, locale] of userSpecs) {
                    const user = await tx.user.create({
                        data: {
                            name,
                            email,
                            emailVerified: true,
                            locale: locale as "NL" | "EN",
                            notificationPreference: {
                                create: {
                                    newListing: true,
                                    priceChange: true,
                                    statusChange: true,
                                    viewing: true,
                                    bid: true,
                                    transaction: true,
                                    deadline: key !== "bram",
                                },
                            },
                        },
                    });
                    // Better Auth stores the credential login here, with the
                    // user's id as accountId (see sign-up.mjs in better-auth).
                    await tx.account.create({
                        data: {
                            userId: user.id,
                            accountId: user.id,
                            providerId: "credential",
                            password: passwordHash,
                        },
                    });
                    users[key] = { id: user.id };
                    await appendVerificationAudit(
                        tx,
                        user.id,
                        daysFromNow(-60),
                        "ACCOUNT_ACCESS",
                    );
                }

                // ---- 3. Properties ------------------------------------
                type PropSpec = {
                    key: string;
                    owner: keyof typeof users;
                    postcode: string;
                    houseNumber: number;
                    addition?: string;
                    street: string;
                    city: string;
                    municipality: string;
                    province: string;
                    lat: number;
                    lng: number;
                    type: PropertyType;
                    living?: number;
                    land?: number;
                    volume?: number;
                    rooms?: number;
                    bedrooms?: number;
                    bathrooms?: number;
                    floors?: number;
                    roof?: RoofType | null;
                    externalStorage?: number;
                    amenities?: PropertyAmenity[];
                    parking?: ParkingOption[];
                    parkingPrice?: bigint;
                    year?: number | null;
                    monument?: boolean;
                    erfpachtType?: ErfpachtType;
                    erfpachtCanonCents?: bigint;
                    erfpachtDetails?: string;
                    erfpachtEndDate?: string;
                    hasGarden?: boolean;
                    gardenOrientation?:
                        | "N"
                        | "NE"
                        | "E"
                        | "SE"
                        | "S"
                        | "SW"
                        | "W"
                        | "NW";
                };
                const propSpecs: PropSpec[] = [
                    {
                        key: "gracht",
                        owner: "jan",
                        postcode: "1012AB",
                        houseNumber: 48,
                        street: "Herengracht",
                        city: "Amsterdam",
                        municipality: "Amsterdam",
                        province: "Noord-Holland",
                        lat: 52.3682,
                        lng: 4.889,
                        type: "APARTMENT",
                        living: 132,
                        volume: 420,
                        rooms: 5,
                        bedrooms: 3,
                        bathrooms: 2,
                        floors: 3,
                        roof: "FLAT",
                        amenities: [
                            "FIBER_OPTIC",
                            "FIREPLACE",
                            "MECHANICAL_VENTILATION",
                        ],
                        parking: ["PAID_STREET"],
                        year: 1895,
                        monument: true,
                        erfpachtType: ErfpachtType.LEASEHOLD_AFGEKOCHT,
                        erfpachtDetails:
                            "Erfpacht is eenmalig afgekocht tot 2050",
                        erfpachtEndDate: "2050-12-31T00:00:00Z",
                    },
                    {
                        key: "jordaan",
                        owner: "jan",
                        postcode: "1015GN",
                        houseNumber: 12,
                        street: "Prinsengracht",
                        city: "Amsterdam",
                        municipality: "Amsterdam",
                        province: "Noord-Holland",
                        lat: 52.3745,
                        lng: 4.8839,
                        type: "APARTMENT",
                        living: 95,
                        volume: 300,
                        rooms: 4,
                        bedrooms: 2,
                        bathrooms: 1,
                        floors: 2,
                        roof: "FLAT",
                        amenities: ["FIBER_OPTIC", "HEAT_PUMP"],
                        parking: ["PARKING_PERMIT"],
                        year: 1930,
                        monument: true,
                        erfpachtType: ErfpachtType.LEASEHOLD,
                        erfpachtCanonCents: BigInt(300000),
                        erfpachtDetails: "Canon wordt jaarlijks geïndexeerd",
                        erfpachtEndDate: "2035-06-30T00:00:00Z",
                    },
                    {
                        key: "oudwest",
                        owner: "pieter",
                        postcode: "1055JG",
                        houseNumber: 74,
                        addition: "A",
                        street: "Kinkerstraat",
                        city: "Amsterdam",
                        municipality: "Amsterdam",
                        province: "Noord-Holland",
                        lat: 52.3647,
                        lng: 4.8661,
                        type: "APARTMENT",
                        living: 48,
                        volume: 140,
                        rooms: 2,
                        bedrooms: 1,
                        bathrooms: 1,
                        floors: 1,
                        roof: "FLAT",
                        amenities: ["FIBER_OPTIC", "MECHANICAL_VENTILATION"],
                        parking: ["PARKING_PERMIT"],
                        year: 1952,
                        erfpachtType: ErfpachtType.LEASEHOLD,
                        erfpachtCanonCents: BigInt(180000),
                        erfpachtDetails: "Canon wordt jaarlijks geïndexeerd",
                    },
                    {
                        key: "watergraafsmeer",
                        owner: "sanne",
                        postcode: "1093PN",
                        houseNumber: 22,
                        street: "Hugo de Vrieslaan",
                        city: "Amsterdam",
                        municipality: "Amsterdam",
                        province: "Noord-Holland",
                        lat: 52.3485,
                        lng: 4.9144,
                        type: "HOUSE",
                        living: 165,
                        land: 210,
                        volume: 520,
                        rooms: 6,
                        bedrooms: 4,
                        bathrooms: 2,
                        floors: 3,
                        roof: "COMBINATION",
                        amenities: [
                            "SOLAR_PANELS",
                            "HEAT_PUMP",
                            "EV_CHARGER",
                            "FIBER_OPTIC",
                            "ALARM_SYSTEM",
                        ],
                        parking: ["ON_PROPERTY", "PRIVATE_GARAGE"],
                        year: 1998,
                        erfpachtType: ErfpachtType.FREEHOLD,
                        hasGarden: true,
                        gardenOrientation: "S",
                    },
                    {
                        key: "zuidoost",
                        owner: "mohamed",
                        postcode: "1102HC",
                        houseNumber: 305,
                        street: "Bijlmerdreef",
                        city: "Amsterdam",
                        municipality: "Amsterdam",
                        province: "Noord-Holland",
                        lat: 52.3144,
                        lng: 4.9551,
                        type: "APARTMENT",
                        living: 82,
                        volume: 240,
                        rooms: 3,
                        bedrooms: 2,
                        bathrooms: 1,
                        floors: 2,
                        roof: "FLAT",
                        amenities: ["MECHANICAL_VENTILATION", "FIBER_OPTIC"],
                        parking: ["FREE_STREET", "PUBLIC_GARAGE"],
                        year: 1978,
                    },
                    {
                        key: "oudwijk_utrecht",
                        owner: "jan",
                        postcode: "3581CT",
                        houseNumber: 5,
                        street: "Rubenslaan",
                        city: "Utrecht",
                        municipality: "Utrecht",
                        province: "Utrecht",
                        lat: 52.0855,
                        lng: 5.1455,
                        type: "HOUSE",
                        living: 148,
                        land: 180,
                        volume: 470,
                        rooms: 5,
                        bedrooms: 3,
                        bathrooms: 2,
                        floors: 3,
                        roof: "GABLE",
                        amenities: [
                            "SOLAR_PANELS",
                            "FIBER_OPTIC",
                            "HEAT_PUMP",
                            "FIREPLACE",
                        ],
                        parking: ["ON_PROPERTY"],
                        year: 1995,
                        hasGarden: true,
                        gardenOrientation: "SW",
                    },
                    {
                        key: "deuithof_utrecht",
                        owner: "anouk",
                        postcode: "3584CS",
                        houseNumber: 89,
                        street: "Padualaan",
                        city: "Utrecht",
                        municipality: "Utrecht",
                        province: "Utrecht",
                        lat: 52.0866,
                        lng: 5.1742,
                        type: "APARTMENT",
                        living: 72,
                        volume: 210,
                        rooms: 3,
                        bedrooms: 2,
                        bathrooms: 1,
                        floors: 2,
                        roof: "FLAT",
                        amenities: ["FIBER_OPTIC", "MECHANICAL_VENTILATION"],
                        parking: ["FREE_STREET"],
                        year: 2005,
                    },
                    {
                        key: "rotterdam_centrum",
                        owner: "sanne",
                        postcode: "3011CC",
                        houseNumber: 15,
                        street: "Coolsingel",
                        city: "Rotterdam",
                        municipality: "Rotterdam",
                        province: "Zuid-Holland",
                        lat: 51.9225,
                        lng: 4.4792,
                        type: "APARTMENT",
                        living: 88,
                        volume: 260,
                        rooms: 3,
                        bedrooms: 2,
                        bathrooms: 1,
                        floors: 2,
                        roof: "FLAT",
                        amenities: [
                            "FIBER_OPTIC",
                            "AIR_CONDITIONING",
                            "MECHANICAL_VENTILATION",
                        ],
                        parking: ["PAID_STREET", "PUBLIC_GARAGE"],
                        year: 2015,
                    },
                    {
                        key: "feijenoord",
                        owner: "mohamed",
                        postcode: "3072EA",
                        houseNumber: 108,
                        street: "Beijerlandselaan",
                        city: "Rotterdam",
                        municipality: "Rotterdam",
                        province: "Zuid-Holland",
                        lat: 51.897,
                        lng: 4.5068,
                        type: "HOUSE",
                        living: 120,
                        land: 90,
                        volume: 360,
                        rooms: 4,
                        bedrooms: 3,
                        bathrooms: 1,
                        floors: 3,
                        roof: "SHED",
                        amenities: ["MECHANICAL_VENTILATION"],
                        parking: ["FREE_STREET"],
                        year: 1934,
                        hasGarden: true,
                        gardenOrientation: "W",
                    },
                    {
                        key: "denhaag_centrum",
                        owner: "mohamed",
                        postcode: "2511AG",
                        houseNumber: 27,
                        street: "Lange Voorhout",
                        city: "Den Haag",
                        municipality: "Den Haag",
                        province: "Zuid-Holland",
                        lat: 52.082,
                        lng: 4.313,
                        type: "APARTMENT",
                        living: 110,
                        volume: 340,
                        rooms: 4,
                        bedrooms: 3,
                        bathrooms: 2,
                        floors: 2,
                        roof: "FLAT",
                        amenities: [
                            "FIBER_OPTIC",
                            "FIREPLACE",
                            "MECHANICAL_VENTILATION",
                        ],
                        parking: ["PAID_STREET"],
                        year: 1910,
                        monument: true,
                    },
                    {
                        key: "haarlem_centrum",
                        owner: "pieter",
                        postcode: "2011XN",
                        houseNumber: 42,
                        street: "Grote Houtstraat",
                        city: "Haarlem",
                        municipality: "Haarlem",
                        province: "Noord-Holland",
                        lat: 52.3797,
                        lng: 4.636,
                        type: "HOUSE",
                        living: 136,
                        land: 110,
                        volume: 400,
                        rooms: 5,
                        bedrooms: 3,
                        bathrooms: 2,
                        floors: 3,
                        roof: "GABLE",
                        amenities: ["SOLAR_PANELS", "FIBER_OPTIC", "HEAT_PUMP"],
                        parking: ["FREE_STREET", "PARKING_PERMIT"],
                        year: 1905,
                        monument: true,
                        hasGarden: true,
                        gardenOrientation: "E",
                    },
                    {
                        key: "eindhoven",
                        owner: "anouk",
                        postcode: "5611DE",
                        houseNumber: 3,
                        street: "Stratumseind",
                        city: "Eindhoven",
                        municipality: "Eindhoven",
                        province: "Noord-Brabant",
                        lat: 51.4348,
                        lng: 5.4852,
                        type: "HOUSE",
                        living: 125,
                        land: 140,
                        volume: 380,
                        rooms: 4,
                        bedrooms: 3,
                        bathrooms: 2,
                        floors: 3,
                        roof: "GABLE",
                        amenities: [
                            "FIBER_OPTIC",
                            "HEAT_PUMP",
                            "SOLAR_PANELS",
                            "EV_CHARGER",
                        ],
                        parking: ["ON_PROPERTY", "PRIVATE_GARAGE"],
                        year: 2002,
                        hasGarden: true,
                        gardenOrientation: "N",
                    },
                    {
                        key: "parking",
                        owner: "sanne",
                        postcode: "1067NX",
                        houseNumber: 88,
                        street: "Pieter Calandlaan",
                        city: "Amsterdam",
                        municipality: "Amsterdam",
                        province: "Noord-Holland",
                        lat: 52.3478,
                        lng: 4.8278,
                        type: "PARKING",
                        land: 20,
                        parking: ["PRIVATE_GARAGE", "SPACE_FOR_SALE"],
                        parkingPrice: BigInt(3500000),
                        year: 1990,
                    },
                    {
                        key: "land",
                        owner: "jan",
                        postcode: "5324AM",
                        houseNumber: 1,
                        street: "Ammerzodenseweg",
                        city: "Ammerzoden",
                        municipality: "Maasdriel",
                        province: "Gelderland",
                        lat: 51.7489,
                        lng: 5.2337,
                        type: "LAND",
                        land: 5000,
                        year: null,
                    },
                ];

                const properties: Record<string, { id: string }> = {};
                for (const spec of propSpecs) {
                    const property = await tx.property.create({
                        data: {
                            ownerId: users[spec.owner].id,
                            postcode: spec.postcode,
                            houseNumber: spec.houseNumber,
                            houseNumberAddition: spec.addition,
                            street: spec.street,
                            city: spec.city,
                            municipality: spec.municipality,
                            province: spec.province,
                            latitude: spec.lat,
                            longitude: spec.lng,
                            propertyType: spec.type,
                            livingAreaSqm: spec.living,
                            officialLandAreaSqm: spec.land,
                            volumeCubicMeters: spec.volume,
                            roomCount: spec.rooms,
                            bedroomCount: spec.bedrooms,
                            bathroomCount: spec.bathrooms,
                            floorCount: spec.floors,
                            roofType: spec.roof,
                            externalStorageAreaSqm: spec.externalStorage,
                            amenities: spec.amenities ?? [],
                            parkingOptions: spec.parking ?? [],
                            parkingSpacePriceCents: spec.parkingPrice,
                            constructionYear: spec.year,
                            isMonument: spec.monument ?? false,
                            erfpachtType: spec.erfpachtType ?? "UNKNOWN",
                            erfpachtCanonCents: spec.erfpachtCanonCents,
                            erfpachtDetails: spec.erfpachtDetails,
                            erfpachtEndDate: spec.erfpachtEndDate
                                ? new Date(spec.erfpachtEndDate)
                                : null,
                            erfpachtSource: spec.erfpachtType ? "MANUAL" : null,
                            erfpachtRetrievedAt: spec.erfpachtType
                                ? new Date()
                                : null,
                            layout: {
                                rooms: [
                                    {
                                        name: "Woonkamer",
                                        floor: 0,
                                        areaSqm: 32,
                                    },
                                    { name: "Keuken", floor: 0, areaSqm: 14 },
                                ],
                                ...(spec.hasGarden
                                    ? {
                                          garden: {
                                              orientation:
                                                  spec.gardenOrientation ??
                                                  null,
                                          },
                                      }
                                    : {}),
                            },
                        },
                    });
                    properties[spec.key] = { id: property.id };
                }

                // ---- 4. Neighborhood profiles + energy labels ---------
                const profiles: Array<[string, Record<string, unknown>]> = [
                    [
                        "gracht",
                        {
                            code: "BU03630001",
                            name: "Grachtengordel-West",
                            district: "Binnensingel",
                            muni: "0363",
                            population: 15420,
                            density: 9100,
                            corp: 12.4,
                            crimes: 88.2,
                            supermarket: 0.2,
                            school: 0.3,
                            daycare: 0.3,
                            gp: 0.2,
                            bus: 250,
                            tram: 400,
                            metro: 1400,
                            train: 1300,
                        },
                    ],
                    [
                        "jordaan",
                        {
                            code: "BU03630002",
                            name: "Jordaan",
                            district: "Centrum",
                            muni: "0363",
                            population: 19480,
                            density: 13200,
                            corp: 21.8,
                            crimes: 102.5,
                            supermarket: 0.4,
                            school: 0.5,
                            daycare: 0.4,
                            gp: 0.3,
                            bus: 300,
                            tram: 350,
                            metro: 1100,
                            train: 1600,
                        },
                    ],
                    [
                        "oudwest",
                        {
                            code: "BU03630015",
                            name: "Helmersbuurt",
                            district: "Oud-West",
                            muni: "0363",
                            population: 8210,
                            density: 10400,
                            corp: 18.3,
                            crimes: 95.1,
                            supermarket: 0.5,
                            school: 0.6,
                            daycare: 0.4,
                            gp: 0.4,
                            bus: 250,
                            tram: 300,
                            metro: 1300,
                            train: 1900,
                        },
                    ],
                    [
                        "watergraafsmeer",
                        {
                            code: "BU03630028",
                            name: "Julianapark",
                            district: "Oost",
                            muni: "0363",
                            population: 7420,
                            density: 6400,
                            corp: 8.1,
                            crimes: 42.7,
                            supermarket: 0.6,
                            school: 0.4,
                            daycare: 0.5,
                            gp: 0.6,
                            bus: 300,
                            tram: 450,
                            metro: 900,
                            train: 1200,
                        },
                    ],
                    [
                        "zuidoost",
                        {
                            code: "BU03630052",
                            name: "Bijlmer Centrum",
                            district: "Zuidoost",
                            muni: "0363",
                            population: 12480,
                            density: 6800,
                            corp: 62.4,
                            crimes: 134.9,
                            supermarket: 0.3,
                            school: 0.4,
                            daycare: 0.5,
                            gp: 0.5,
                            bus: 200,
                            tram: 500,
                            metro: 350,
                            train: 1400,
                        },
                    ],
                    [
                        "oudwijk_utrecht",
                        {
                            code: "BU03440022",
                            name: "Oudwijk",
                            district: "Oost",
                            muni: "0344",
                            population: 5210,
                            density: 4200,
                            corp: 15.6,
                            crimes: 38.4,
                            supermarket: 0.5,
                            school: 0.4,
                            daycare: 0.3,
                            gp: 0.5,
                            bus: 250,
                            tram: 0,
                            metro: 0,
                            train: 1500,
                        },
                    ],
                    [
                        "deuithof_utrecht",
                        {
                            code: "BU03440025",
                            name: "De Uithof",
                            district: "Oost",
                            muni: "0344",
                            population: 3100,
                            density: 1900,
                            corp: 4.2,
                            crimes: 12.1,
                            supermarket: 1.2,
                            school: 0.6,
                            daycare: 0.8,
                            gp: 1.0,
                            bus: 150,
                            tram: 0,
                            metro: 0,
                            train: 2600,
                        },
                    ],
                    [
                        "rotterdam_centrum",
                        {
                            code: "BU05990001",
                            name: "Stadsdriehoek",
                            district: "Centrum",
                            muni: "0599",
                            population: 12100,
                            density: 8800,
                            corp: 28.9,
                            crimes: 188.4,
                            supermarket: 0.3,
                            school: 0.5,
                            daycare: 0.6,
                            gp: 0.4,
                            bus: 200,
                            tram: 250,
                            metro: 400,
                            train: 800,
                        },
                    ],
                    [
                        "feijenoord",
                        {
                            code: "BU05990018",
                            name: "Feijenoord",
                            district: "Feijenoord",
                            muni: "0599",
                            population: 9890,
                            density: 7600,
                            corp: 58.7,
                            crimes: 172.3,
                            supermarket: 0.4,
                            school: 0.3,
                            daycare: 0.5,
                            gp: 0.4,
                            bus: 200,
                            tram: 300,
                            metro: 600,
                            train: 1400,
                        },
                    ],
                    [
                        "denhaag_centrum",
                        {
                            code: "BU05180001",
                            name: "Kortenbos",
                            district: "Centrum",
                            muni: "0518",
                            population: 8120,
                            density: 7900,
                            corp: 33.5,
                            crimes: 141.2,
                            supermarket: 0.4,
                            school: 0.5,
                            daycare: 0.5,
                            gp: 0.3,
                            bus: 150,
                            tram: 300,
                            metro: 0,
                            train: 1200,
                        },
                    ],
                    [
                        "haarlem_centrum",
                        {
                            code: "BU03920002",
                            name: "Vijfhoek",
                            district: "Centrum",
                            muni: "0392",
                            population: 4680,
                            density: 6100,
                            corp: 24.1,
                            crimes: 76.8,
                            supermarket: 0.3,
                            school: 0.4,
                            daycare: 0.4,
                            gp: 0.4,
                            bus: 200,
                            tram: 0,
                            metro: 0,
                            train: 1100,
                        },
                    ],
                    [
                        "eindhoven",
                        {
                            code: "BU07720001",
                            name: "Centrum",
                            district: "Centrum",
                            muni: "0772",
                            population: 15240,
                            density: 7200,
                            corp: 19.2,
                            crimes: 96.5,
                            supermarket: 0.3,
                            school: 0.4,
                            daycare: 0.4,
                            gp: 0.3,
                            bus: 150,
                            tram: 0,
                            metro: 0,
                            train: 1300,
                        },
                    ],
                    [
                        "parking",
                        {
                            code: "BU03630049",
                            name: "Osdorp Midden",
                            district: "Nieuw-West",
                            muni: "0363",
                            population: 6890,
                            density: 3600,
                            corp: 71.2,
                            crimes: 88.4,
                            supermarket: 0.5,
                            school: 0.4,
                            daycare: 0.6,
                            gp: 0.6,
                            bus: 200,
                            tram: 400,
                            metro: 600,
                            train: 2400,
                        },
                    ],
                    [
                        "land",
                        {
                            code: "BU02630005",
                            name: "Ammerzoden Buitengebied",
                            district: "Buitengebied",
                            muni: "0263",
                            population: 380,
                            density: 90,
                            corp: 3.4,
                            crimes: 18.2,
                            supermarket: 3.2,
                            school: 2.1,
                            daycare: 3.0,
                            gp: 3.4,
                            bus: 900,
                            tram: 0,
                            metro: 0,
                            train: 7200,
                        },
                    ],
                ];

                // Omgevingsgegevens per profiel: geluid (Lden), funderingsrisico
                // en buurt-samenstelling (geslacht, huishouden, opleiding).
                // Realistische demo-waarden; de backfill vult echte bronnen in.
                type EnvSpec = {
                    noiseRoad?: number | null;
                    noiseRail?: number | null;
                    noiseIndustry?: number | null;
                    noiseAircraft?: number | null;
                    foundationLevel?: "NONE" | "LOW" | "MEDIUM" | "HIGH";
                    foundationAreaShare?: number;
                    foundationPre1970?: number;
                    foundationGround?: string;
                    foundationDetail?: string;
                    male?: number;
                    female?: number;
                    avgSize?: number;
                    single?: number;
                    couple?: number;
                    family?: number;
                    eduLow?: number;
                    eduMedium?: number;
                    eduHigh?: number;
                };
                const envSpecs: Record<string, EnvSpec> = {
                    gracht: {
                        noiseRoad: 56,
                        noiseRail: 41,
                        noiseAircraft: 55,
                        foundationLevel: "HIGH",
                        foundationAreaShare: 100,
                        foundationPre1970: 88,
                        foundationGround: "Klei / veen",
                        foundationDetail: "Stedelijk gebied - 80-100 %",
                        male: 49.1,
                        female: 50.9,
                        avgSize: 1.7,
                        single: 56,
                        couple: 29,
                        family: 15,
                        eduLow: 9,
                        eduMedium: 27,
                        eduHigh: 64,
                    },
                    jordaan: {
                        noiseRoad: 59,
                        noiseRail: 38,
                        noiseAircraft: 54,
                        foundationLevel: "HIGH",
                        foundationAreaShare: 100,
                        foundationPre1970: 91,
                        foundationGround: "Klei / veen",
                        foundationDetail: "Stedelijk gebied - 80-100 %",
                        male: 50.2,
                        female: 49.8,
                        avgSize: 1.6,
                        single: 62,
                        couple: 26,
                        family: 12,
                        eduLow: 10,
                        eduMedium: 28,
                        eduHigh: 62,
                    },
                    oudwest: {
                        noiseRoad: 57,
                        noiseAircraft: 52,
                        foundationLevel: "MEDIUM",
                        foundationAreaShare: 100,
                        foundationPre1970: 74,
                        foundationGround: "Zand / klei",
                        foundationDetail: "Stedelijk gebied - 80-100 %",
                        male: 48.4,
                        female: 51.6,
                        avgSize: 1.8,
                        single: 55,
                        couple: 30,
                        family: 15,
                        eduLow: 11,
                        eduMedium: 30,
                        eduHigh: 59,
                    },
                    watergraafsmeer: {
                        noiseRoad: 55,
                        noiseRail: 48,
                        noiseAircraft: 58,
                        foundationLevel: "MEDIUM",
                        foundationAreaShare: 80,
                        foundationPre1970: 55,
                        foundationGround: "Klei / zand",
                        foundationDetail: "Stedelijk gebied - 40-80 %",
                        male: 47.9,
                        female: 52.1,
                        avgSize: 2.1,
                        single: 44,
                        couple: 31,
                        family: 25,
                        eduLow: 12,
                        eduMedium: 29,
                        eduHigh: 59,
                    },
                    zuidoost: {
                        noiseRoad: 63,
                        noiseRail: 60,
                        noiseAircraft: 52,
                        foundationLevel: "LOW",
                        foundationAreaShare: 20,
                        foundationPre1970: 12,
                        foundationGround: "Zand",
                        foundationDetail: "Bebouwing na 1970",
                        male: 48.8,
                        female: 51.2,
                        avgSize: 2.2,
                        single: 39,
                        couple: 28,
                        family: 33,
                        eduLow: 24,
                        eduMedium: 42,
                        eduHigh: 34,
                    },
                    oudwijk_utrecht: {
                        noiseRoad: 54,
                        foundationLevel: "MEDIUM",
                        foundationAreaShare: 70,
                        foundationPre1970: 58,
                        foundationGround: "Klei / veen",
                        foundationDetail: "Bebouwing 40-80 %",
                        male: 48.6,
                        female: 51.4,
                        avgSize: 1.9,
                        single: 48,
                        couple: 30,
                        family: 22,
                        eduLow: 13,
                        eduMedium: 33,
                        eduHigh: 54,
                    },
                    deuithof_utrecht: {
                        noiseRoad: 58,
                        noiseRail: 52,
                        foundationLevel: "LOW",
                        foundationAreaShare: 10,
                        foundationPre1970: 8,
                        foundationGround: "Zand",
                        foundationDetail: "Bebouwing na 1970",
                        male: 50.4,
                        female: 49.6,
                        avgSize: 2.0,
                        single: 42,
                        couple: 33,
                        family: 25,
                        eduLow: 9,
                        eduMedium: 28,
                        eduHigh: 63,
                    },
                    rotterdam_centrum: {
                        noiseRoad: 61,
                        noiseRail: 53,
                        noiseIndustry: 51,
                        foundationLevel: "MEDIUM",
                        foundationAreaShare: 90,
                        foundationPre1970: 62,
                        foundationGround: "Klei / zand",
                        foundationDetail: "Stedelijk gebied - 80-100 %",
                        male: 50.8,
                        female: 49.2,
                        avgSize: 1.7,
                        single: 60,
                        couple: 26,
                        family: 14,
                        eduLow: 15,
                        eduMedium: 36,
                        eduHigh: 49,
                    },
                    feijenoord: {
                        noiseRoad: 62,
                        noiseRail: 58,
                        noiseIndustry: 53,
                        foundationLevel: "HIGH",
                        foundationAreaShare: 100,
                        foundationPre1970: 82,
                        foundationGround: "Klei / veen",
                        foundationDetail: "Stedelijk gebied - 80-100 %",
                        male: 49.6,
                        female: 50.4,
                        avgSize: 2.1,
                        single: 42,
                        couple: 28,
                        family: 30,
                        eduLow: 31,
                        eduMedium: 42,
                        eduHigh: 27,
                    },
                    denhaag_centrum: {
                        noiseRoad: 60,
                        noiseRail: 56,
                        noiseAircraft: 44,
                        foundationLevel: "MEDIUM",
                        foundationAreaShare: 85,
                        foundationPre1970: 68,
                        foundationGround: "Zand / klei",
                        foundationDetail: "Stedelijk gebied - 80-100 %",
                        male: 49.4,
                        female: 50.6,
                        avgSize: 1.8,
                        single: 55,
                        couple: 28,
                        family: 17,
                        eduLow: 17,
                        eduMedium: 35,
                        eduHigh: 48,
                    },
                    haarlem_centrum: {
                        noiseRoad: 55,
                        noiseRail: 51,
                        noiseAircraft: 49,
                        foundationLevel: "HIGH",
                        foundationAreaShare: 95,
                        foundationPre1970: 85,
                        foundationGround: "Klei / veen",
                        foundationDetail: "Stedelijk gebied - 80-100 %",
                        male: 48.1,
                        female: 51.9,
                        avgSize: 1.9,
                        single: 50,
                        couple: 29,
                        family: 21,
                        eduLow: 14,
                        eduMedium: 33,
                        eduHigh: 53,
                    },
                    eindhoven: {
                        noiseRoad: 58,
                        noiseRail: 49,
                        noiseIndustry: 46,
                        noiseAircraft: 62,
                        foundationLevel: "LOW",
                        foundationAreaShare: 25,
                        foundationPre1970: 28,
                        foundationGround: "Zand",
                        foundationDetail: "Bebouwing na 1970",
                        male: 51.2,
                        female: 48.8,
                        avgSize: 1.9,
                        single: 52,
                        couple: 28,
                        family: 20,
                        eduLow: 18,
                        eduMedium: 38,
                        eduHigh: 44,
                    },
                    parking: {
                        noiseRoad: 52,
                        noiseAircraft: 58,
                        foundationLevel: "MEDIUM",
                        foundationAreaShare: 75,
                        foundationPre1970: 59,
                        foundationGround: "Zand / klei",
                        foundationDetail: "Bebouwing 40-80 %",
                        male: 49.0,
                        female: 51.0,
                        avgSize: 2.0,
                        single: 40,
                        couple: 31,
                        family: 29,
                        eduLow: 21,
                        eduMedium: 40,
                        eduHigh: 39,
                    },
                    land: {
                        noiseRoad: 45,
                        noiseRail: 42,
                        foundationLevel: "LOW",
                        foundationAreaShare: 15,
                        foundationPre1970: 38,
                        foundationGround: "Zand / klei",
                        foundationDetail: "Landelijk gebied",
                        male: 50.5,
                        female: 49.5,
                        avgSize: 2.4,
                        single: 22,
                        couple: 40,
                        family: 38,
                        eduLow: 38,
                        eduMedium: 42,
                        eduHigh: 20,
                    },
                };

                for (const [key, p] of profiles) {
                    const env = envSpecs[key];
                    await tx.neighborhoodProfile.create({
                        data: {
                            propertyId: properties[key].id,
                            neighborhoodCode: p.code as string,
                            neighborhoodName: p.name as string,
                            districtCode: null,
                            districtName: p.district as string,
                            municipalityCode: p.muni as string,
                            statisticsYear: 2025,
                            population: p.population as number,
                            populationDensityPerKm2: p.density as number,
                            nationalPopulationDensityPerKm2: 536,
                            age0To14Percent: 14.1,
                            age15To24Percent: 12.8,
                            age25To44Percent: 33.5,
                            age45To64Percent: 24.6,
                            age65PlusPercent: 15.0,
                            nationalAge0To14Percent: 15.7,
                            nationalAge15To24Percent: 12.1,
                            nationalAge25To44Percent: 29.8,
                            nationalAge45To64Percent: 26.5,
                            nationalAge65PlusPercent: 15.9,
                            housingCorporationPercent: p.corp as number,
                            nationalHousingCorporationPercent: 28.0,
                            registeredCrimesPer1000: p.crimes as number,
                            nationalRegisteredCrimesPer1000: 44.3,
                            crimeStatisticsYear: 2024,
                            supermarketDistanceKm: p.supermarket as number,
                            primarySchoolDistanceKm: p.school as number,
                            daycareDistanceKm: p.daycare as number,
                            generalPracticeDistanceKm: p.gp as number,
                            primarySchoolsWithin3Km: 12,
                            supermarketsWithin1Km:
                                (p.supermarket as number) <= 0.5 ? 3 : 1,
                            schoolsWithin1Km: 4,
                            busStopDistanceMeters: p.bus as number,
                            tramStopDistanceMeters: p.tram as number,
                            metroStationDistanceMeters: p.metro as number,
                            trainStationDistanceMeters: p.train as number,
                            noiseRoadLden: env?.noiseRoad ?? null,
                            noiseRailLden: env?.noiseRail ?? null,
                            noiseIndustryLden: env?.noiseIndustry ?? null,
                            noiseAircraftLden: env?.noiseAircraft ?? null,
                            noiseGridMeters: env ? 10 : null,
                            noiseSource: env ? "RIVM Atlas Leefomgeving" : null,
                            noiseRetrievedAt: env ? daysFromNow(-45) : null,
                            foundationRiskLevel: env?.foundationLevel ?? null,
                            foundationRiskAreaShare:
                                env?.foundationAreaShare ?? null,
                            foundationPre1970Percent:
                                env?.foundationPre1970 ?? null,
                            foundationGroundClass:
                                env?.foundationGround ?? null,
                            foundationRiskDetail: env?.foundationDetail ?? null,
                            foundationRiskSource: env
                                ? "KCAF/PDOK en BAG (indicatieve aandachtsgebieden funderingsproblematiek)"
                                : null,
                            foundationRiskRetrievedAt: env
                                ? daysFromNow(-45)
                                : null,
                            malePercent: env?.male ?? null,
                            femalePercent: env?.female ?? null,
                            averageHouseholdSize: env?.avgSize ?? null,
                            singleHouseholdPercent: env?.single ?? null,
                            coupleHouseholdPercent: env?.couple ?? null,
                            familyHouseholdPercent: env?.family ?? null,
                            educationLowPercent: env?.eduLow ?? null,
                            educationMediumPercent: env?.eduMedium ?? null,
                            educationHighPercent: env?.eduHigh ?? null,
                            educationStatisticsYear: env ? 2024 : null,
                            demographicsSourceUrl: env
                                ? "https://www.cbs.nl/nl-nl/reeksen/kerncijfers-wijken-en-buurten"
                                : null,
                            demographicsRetrievedAt: env
                                ? daysFromNow(-45)
                                : null,
                            cbsDataset: "Kerncijfers wijken en buurten 2025",
                            cbsSourceUrl:
                                "https://www.cbs.nl/nl-nl/reeksen/kerncijfers-wijken-en-buurten",
                            cbsRetrievedAt: daysFromNow(-45),
                            crimeDataset: "Geregistreerde criminaliteit 2024",
                            crimeSourceUrl: "https://www.cbs.nl/",
                            osmSourceUrl: "https://www.openstreetmap.org/",
                            osmRetrievedAt: daysFromNow(-45),
                        },
                    });
                }

                const energyLabels: Array<
                    [string, EnergyLabelClass, number, string]
                > = [
                    ["gracht", "C", 158.5, "RVO_EP_ONLINE"],
                    ["jordaan", "D", 187.2, "RVO_EP_ONLINE"],
                    ["oudwest", "D", 176.4, "RVO_EP_ONLINE"],
                    ["watergraafsmeer", "A", 62.3, "RVO_EP_ONLINE"],
                    ["zuidoost", "B", 88.7, "RVO_EP_ONLINE"],
                    ["oudwijk_utrecht", "A_PLUS", 58.9, "RVO_EP_ONLINE"],
                    ["deuithof_utrecht", "A_PLUS_PLUS", 41.2, "RVO_EP_ONLINE"],
                    ["rotterdam_centrum", "A_PLUS_PLUS", 44.6, "RVO_EP_ONLINE"],
                    ["feijenoord", "E", 214.3, "RVO_EP_ONLINE"],
                    ["denhaag_centrum", "C", 152.1, "RVO_EP_ONLINE"],
                    ["haarlem_centrum", "C", 147.8, "RVO_EP_ONLINE"],
                    ["eindhoven", "A_PLUS", 55.4, "RVO_EP_ONLINE"],
                ];
                for (const [key, labelClass, kwh, source] of energyLabels) {
                    await tx.energyLabel.create({
                        data: {
                            propertyId: properties[key].id,
                            registrationNumber: `NL.000.${Math.floor(100000 + Math.random() * 899999)}.1`,
                            labelClass,
                            primaryFossilEnergyKwhSqmYear: kwh,
                            registeredAt: daysFromNow(-400),
                            validUntil: daysFromNow(320),
                            source,
                            sourcePayload: {
                                provider: "RVO",
                                issuedAt: daysFromNow(-400).toISOString(),
                            },
                            retrievedAt: daysFromNow(-20),
                        },
                    });
                }

                // ---- 5. Listings --------------------------------------
                type ListingSpec = {
                    key: string;
                    property: keyof typeof properties;
                    owner: keyof typeof users;
                    purpose: "SALE" | "RENT";
                    status: ListingStatus;
                    titleNl: string | null;
                    titleEn: string | null;
                    descriptionNl: string | null;
                    descriptionEn: string | null;
                    asking?: bigint;
                    rent?: bigint;
                    serviceCosts?: bigint;
                    availableFrom?: Date;
                    viewingNotes?: string;
                    attributes: Prisma.InputJsonValue;
                    biddingMethod: BiddingMethod;
                    minimumBid?: bigint;
                    bidIncrement?: bigint;
                    allowBidConditions?: boolean;
                    bidWindowOpensAt?: Date;
                    bidWindowClosesAt?: Date;
                    validatedAt?: Date;
                    publicationRequestedAt?: Date;
                    liveAt?: Date;
                    finalizedAt?: Date;
                    version: number;
                    createdAt: Date;
                };
                const defaultMovableItems = [
                    "Gordijnen en rails",
                    "Inbouwapparatuur",
                    "Tuinmeubilair",
                ];
                const mkAttributes = (opts: {
                    condition?: string;
                    highlights?: string[];
                    movable?: Array<{
                        name: string;
                        category: string;
                        notes?: string;
                    }>;
                    deposit?: bigint;
                    duration?: number;
                }): Prisma.InputJsonValue => ({
                    condition: opts.condition ?? "GOOD",
                    outdoorSpace: true,
                    parking: true,
                    furnished: false,
                    petsAllowed: opts.duration ? true : false,
                    depositCents: opts.deposit
                        ? opts.deposit.toString()
                        : undefined,
                    rentalDurationMonths: opts.duration,
                    highlights: opts.highlights ?? [],
                    movableItems:
                        opts.movable?.map((m) => ({
                            id: randomUUID(),
                            name: m.name,
                            category: m.category,
                            notes: m.notes ?? "",
                        })) ??
                        defaultMovableItems.map((name) => ({
                            id: randomUUID(),
                            name,
                            category: "STAYS",
                            notes: "",
                        })),
                    // Publishing requires every applicable question to be
                    // answered. Answering all sections is a safe superset for
                    // every property type; non-applicable answers are ignored.
                    questionnaireAnswers: propertyQuestionnaireSections.flatMap(
                        (section) =>
                            section.questions.map((question) => ({
                                questionId: question.id,
                                answer: "UNKNOWN",
                                details: "",
                            })),
                    ),
                });

                const listingSpecs: ListingSpec[] = [
                    {
                        key: "gracht",
                        property: "gracht",
                        owner: "jan",
                        purpose: "SALE",
                        status: "LIVE",
                        titleNl: "Sfeervol grachtenpand op Herengracht",
                        titleEn: "Charming canal house on Herengracht",
                        descriptionNl:
                            "Monumentaal grachtenpand met authentieke details, hoge plafonds en een prachtig uitzicht over de gracht. Vijf kamers verdeeld over drie woonlagen.",
                        descriptionEn:
                            "Listed canal house with authentic details, high ceilings and a beautiful view over the canal. Five rooms spread over three floors.",
                        asking: BigInt(59500000),
                        viewingNotes:
                            "Aanmelden met legitimatie. Maximaal 4 personen per bezichtiging.",
                        attributes: mkAttributes({
                            condition: "EXCELLENT",
                            highlights: [
                                "Rijksmonument",
                                "Grachtzicht",
                                "Hoge plafonds",
                            ],
                        }),
                        biddingMethod: "OPEN",
                        minimumBid: BigInt(58500000),
                        bidIncrement: BigInt(250000),
                        bidWindowOpensAt: daysFromNow(-10),
                        bidWindowClosesAt: daysFromNow(14),
                        validatedAt: daysFromNow(-12),
                        publicationRequestedAt: daysFromNow(-11),
                        liveAt: daysFromNow(-10),
                        version: 3,
                        createdAt: daysFromNow(-20),
                    },
                    {
                        key: "watergraafsmeer",
                        property: "watergraafsmeer",
                        owner: "sanne",
                        purpose: "SALE",
                        status: "LIVE",
                        titleNl: "Ruime eengezinswoning nabij het park",
                        titleEn: "Spacious family home near the park",
                        descriptionNl:
                            "Ruime eengezinswoning met zonnige tuin, eigen garage en oprit voor twee auto's. Zeer duurzaam met warmtepomp en zonnepanelen.",
                        descriptionEn:
                            "Spacious family home with sunny garden, private garage and driveway for two cars. Very sustainable with heat pump and solar panels.",
                        asking: BigInt(79500000),
                        viewingNotes: "Bezichtiging op afspraak.",
                        attributes: mkAttributes({
                            condition: "GOOD",
                            highlights: [
                                "Duurzaam",
                                "Garage",
                                "Tuin op het zuiden",
                            ],
                        }),
                        biddingMethod: "SEALED",
                        minimumBid: BigInt(78000000),
                        bidIncrement: BigInt(500000),
                        bidWindowOpensAt: daysFromNow(-8),
                        bidWindowClosesAt: daysFromNow(10),
                        validatedAt: daysFromNow(-9),
                        publicationRequestedAt: daysFromNow(-9),
                        liveAt: daysFromNow(-8),
                        version: 2,
                        createdAt: daysFromNow(-15),
                    },
                    {
                        key: "denhaag",
                        property: "denhaag_centrum",
                        owner: "mohamed",
                        purpose: "SALE",
                        status: "LIVE",
                        titleNl: "Statig appartement aan het Lange Voorhout",
                        titleEn: "Stately apartment on Lange Voorhout",
                        descriptionNl:
                            "Representatief appartement in het hart van Den Haag, dichtbij het Binnenhof en de hofvijver. Veel originele ornamenten.",
                        descriptionEn:
                            "Representative apartment in the heart of The Hague, close to the Binnenhof and the Hofvijver. Many original ornaments.",
                        asking: BigInt(47500000),
                        viewingNotes:
                            "Alleen op afspraak, identity-verificatie vereist.",
                        attributes: mkAttributes({
                            condition: "GOOD",
                            highlights: [
                                "Centrum",
                                "Monumentaal",
                                "Veel licht",
                            ],
                        }),
                        biddingMethod: "PRIVATE",
                        minimumBid: BigInt(46500000),
                        bidIncrement: BigInt(250000),
                        bidWindowOpensAt: daysFromNow(-5),
                        bidWindowClosesAt: daysFromNow(21),
                        validatedAt: daysFromNow(-6),
                        publicationRequestedAt: daysFromNow(-5),
                        liveAt: daysFromNow(-5),
                        version: 1,
                        createdAt: daysFromNow(-10),
                    },
                    {
                        key: "parking",
                        property: "parking",
                        owner: "sanne",
                        purpose: "SALE",
                        status: "LIVE",
                        titleNl: "Parkeerplaats in eigen garage (Nieuw-West)",
                        titleEn: "Parking space in private garage (Nieuw-West)",
                        descriptionNl:
                            "Eigen parkeerplaats in een afgesloten garage, inclusief stroompunt voor elektrisch laden.",
                        descriptionEn:
                            "Private parking space in a secured garage, including a charging point for electric vehicles.",
                        asking: BigInt(3500000),
                        attributes: mkAttributes({
                            condition: "EXCELLENT",
                            highlights: ["Eigen garage", "Laadpaal"],
                        }),
                        biddingMethod: "PRIVATE",
                        minimumBid: BigInt(3400000),
                        bidIncrement: BigInt(100000),
                        bidWindowOpensAt: daysFromNow(-3),
                        bidWindowClosesAt: daysFromNow(30),
                        validatedAt: daysFromNow(-4),
                        publicationRequestedAt: daysFromNow(-3),
                        liveAt: daysFromNow(-3),
                        version: 1,
                        createdAt: daysFromNow(-6),
                    },
                    {
                        key: "land",
                        property: "land",
                        owner: "jan",
                        purpose: "SALE",
                        status: "LIVE",
                        titleNl: "Kavel landbouwgrond nabij Ammerzoden",
                        titleEn: "Plot of agricultural land near Ammerzoden",
                        descriptionNl:
                            "Ruime kavel landbouwgrond (5.000 m²) in het buitengebied, uitstekend ontsloten en geschikt voor agrarisch gebruik.",
                        descriptionEn:
                            "Spacious plot of agricultural land (5,000 m²) in the rural area, well accessible and suitable for agricultural use.",
                        asking: BigInt(6500000),
                        viewingNotes: "Bezichtiging te voet over het terrein.",
                        attributes: mkAttributes({
                            condition: "FAIR",
                            highlights: ["5000 m²", "Buitengebied"],
                        }),
                        biddingMethod: "OPEN",
                        minimumBid: BigInt(6300000),
                        bidIncrement: BigInt(100000),
                        bidWindowOpensAt: daysFromNow(-2),
                        bidWindowClosesAt: daysFromNow(45),
                        validatedAt: daysFromNow(-3),
                        publicationRequestedAt: daysFromNow(-2),
                        liveAt: daysFromNow(-2),
                        version: 1,
                        createdAt: daysFromNow(-5),
                    },
                    {
                        key: "jordaan",
                        property: "jordaan",
                        owner: "jan",
                        purpose: "RENT",
                        status: "LIVE",
                        titleNl: "Ruime huurappartement aan de Prinsengracht",
                        titleEn: "Spacious rental apartment on Prinsengracht",
                        descriptionNl:
                            "Gemeubileerd appartement aan de Prinsengracht met uitzicht op de gracht. Direct beschikbaar.",
                        descriptionEn:
                            "Furnished apartment on Prinsengracht with canal view. Available immediately.",
                        rent: BigInt(185000),
                        serviceCosts: BigInt(5000),
                        availableFrom: daysFromNow(14),
                        viewingNotes: "Inkomenstoets van toepassing.",
                        attributes: mkAttributes({
                            condition: "GOOD",
                            highlights: ["Grachtzicht", "Gemeubileerd"],
                            deposit: BigInt(185000),
                            duration: 24,
                        }),
                        biddingMethod: "OPEN",
                        minimumBid: BigInt(180000),
                        bidIncrement: BigInt(2500),
                        bidWindowOpensAt: daysFromNow(-6),
                        bidWindowClosesAt: daysFromNow(9),
                        validatedAt: daysFromNow(-7),
                        publicationRequestedAt: daysFromNow(-7),
                        liveAt: daysFromNow(-6),
                        version: 2,
                        createdAt: daysFromNow(-12),
                    },
                    {
                        key: "haarlem",
                        property: "haarlem_centrum",
                        owner: "pieter",
                        purpose: "RENT",
                        status: "LIVE",
                        titleNl: "Monumentaal huis te huur in hartje Haarlem",
                        titleEn:
                            "Listed house for rent in the heart of Haarlem",
                        descriptionNl:
                            "Karakteristiek monumentaal huis in de Vijfhoek. Ruime kamers, originele details en een kleine binnentuin.",
                        descriptionEn:
                            "Characteristic listed house in the Vijfhoek. Spacious rooms, original details and a small courtyard garden.",
                        rent: BigInt(175000),
                        serviceCosts: BigInt(4500),
                        availableFrom: daysFromNow(21),
                        viewingNotes: "Huisdiervriendelijk.",
                        attributes: mkAttributes({
                            condition: "FAIR",
                            highlights: ["Binnentuin", "Monumentaal"],
                            deposit: BigInt(175000),
                            duration: 12,
                        }),
                        biddingMethod: "PRIVATE",
                        minimumBid: BigInt(172500),
                        bidIncrement: BigInt(2500),
                        bidWindowOpensAt: daysFromNow(-4),
                        bidWindowClosesAt: daysFromNow(12),
                        validatedAt: daysFromNow(-5),
                        publicationRequestedAt: daysFromNow(-4),
                        liveAt: daysFromNow(-4),
                        version: 1,
                        createdAt: daysFromNow(-8),
                    },
                    {
                        key: "oudwijk",
                        property: "oudwijk_utrecht",
                        owner: "jan",
                        purpose: "SALE",
                        status: "UNDER_OFFER",
                        titleNl: "Fijne gezinswoning in Oudwijk",
                        titleEn: "Lovely family home in Oudwijk",
                        descriptionNl:
                            "Licht en ruim familiehuis in de gewilde wijk Oudwijk, dichtbij de singels en het Wilhelminapark.",
                        descriptionEn:
                            "Bright and spacious family home in the popular Oudwijk neighbourhood, close to the canals and Wilhelminapark.",
                        asking: BigInt(52500000),
                        viewingNotes: "Aanbiedingen via gesloten biedingen.",
                        attributes: mkAttributes({
                            condition: "GOOD",
                            highlights: ["Wilhelminapark", "Zonnige tuin"],
                        }),
                        biddingMethod: "SEALED",
                        minimumBid: BigInt(51500000),
                        bidIncrement: BigInt(250000),
                        bidWindowOpensAt: daysFromNow(-12),
                        bidWindowClosesAt: daysFromNow(-7),
                        validatedAt: daysFromNow(-13),
                        publicationRequestedAt: daysFromNow(-13),
                        liveAt: daysFromNow(-12),
                        version: 3,
                        createdAt: daysFromNow(-20),
                    },
                    {
                        key: "rotterdam",
                        property: "rotterdam_centrum",
                        owner: "sanne",
                        purpose: "SALE",
                        status: "SOLD",
                        titleNl: "Modern appartement aan de Coolsingel",
                        titleEn: "Modern apartment on Coolsingel",
                        descriptionNl:
                            "Modern appartement in het centrum van Rotterdam met airco, glasvezel en prachtig stadszicht.",
                        descriptionEn:
                            "Modern apartment in the centre of Rotterdam with air conditioning, fibre optic and beautiful city views.",
                        asking: BigInt(38500000),
                        viewingNotes: "Verkocht.",
                        attributes: mkAttributes({
                            condition: "EXCELLENT",
                            highlights: ["Airco", "Stadszicht"],
                        }),
                        biddingMethod: "PRIVATE",
                        minimumBid: BigInt(38000000),
                        bidIncrement: BigInt(250000),
                        bidWindowOpensAt: daysFromNow(-45),
                        bidWindowClosesAt: daysFromNow(-40),
                        validatedAt: daysFromNow(-46),
                        publicationRequestedAt: daysFromNow(-46),
                        liveAt: daysFromNow(-45),
                        finalizedAt: daysFromNow(-5),
                        version: 4,
                        createdAt: daysFromNow(-55),
                    },
                    {
                        key: "oudwest",
                        property: "oudwest",
                        owner: "pieter",
                        purpose: "RENT",
                        status: "RENTED",
                        titleNl: "Compacte starterswoning Kinkerstraat",
                        titleEn: "Compact starter home on Kinkerstraat",
                        descriptionNl:
                            "Compact maar compleet appartement, ideaal voor starters. Centraal gelegen in Oud-West.",
                        descriptionEn:
                            "Compact but complete apartment, ideal for starters. Centrally located in Oud-West.",
                        rent: BigInt(135000),
                        serviceCosts: BigInt(5000),
                        availableFrom: daysFromNow(-10),
                        viewingNotes: "Verhuurd.",
                        attributes: mkAttributes({
                            condition: "FAIR",
                            highlights: ["Centraal", "Compleet"],
                            deposit: BigInt(135000),
                            duration: 12,
                        }),
                        biddingMethod: "PRIVATE",
                        minimumBid: BigInt(130000),
                        bidIncrement: BigInt(2500),
                        bidWindowOpensAt: daysFromNow(-60),
                        bidWindowClosesAt: daysFromNow(-55),
                        validatedAt: daysFromNow(-61),
                        publicationRequestedAt: daysFromNow(-60),
                        liveAt: daysFromNow(-60),
                        finalizedAt: daysFromNow(-2),
                        version: 3,
                        createdAt: daysFromNow(-70),
                    },
                    {
                        key: "deuithof",
                        property: "deuithof_utrecht",
                        owner: "anouk",
                        purpose: "SALE",
                        status: "READY_FOR_VERIFICATION",
                        titleNl: "Zonnig appartement nabij de Uithof",
                        titleEn: "Sunny apartment near De Uithof",
                        descriptionNl:
                            "Gelijkvloers appartement met balkon op het zuiden, vlakbij de campus en het Science Park.",
                        descriptionEn:
                            "Ground-floor apartment with south-facing balcony, close to the campus and Science Park.",
                        asking: BigInt(31500000),
                        viewingNotes: "",
                        attributes: mkAttributes({
                            condition: "GOOD",
                            highlights: ["Balkon", "Rustig"],
                        }),
                        biddingMethod: "PRIVATE",
                        minimumBid: BigInt(30500000),
                        bidIncrement: BigInt(250000),
                        bidWindowOpensAt: daysFromNow(2),
                        bidWindowClosesAt: daysFromNow(12),
                        validatedAt: daysFromNow(-1),
                        version: 1,
                        createdAt: daysFromNow(-3),
                    },
                    {
                        key: "zuidoost_draft",
                        property: "zuidoost",
                        owner: "mohamed",
                        purpose: "SALE",
                        status: "DRAFT",
                        titleNl: null,
                        titleEn: null,
                        descriptionNl: null,
                        descriptionEn: null,
                        attributes: mkAttributes({ condition: "FAIR" }),
                        biddingMethod: "PRIVATE",
                        version: 1,
                        createdAt: daysFromNow(-1),
                    },
                    {
                        key: "feijenoord_draft",
                        property: "feijenoord",
                        owner: "mohamed",
                        purpose: "SALE",
                        status: "DRAFT",
                        titleNl: null,
                        titleEn: null,
                        descriptionNl: null,
                        descriptionEn: null,
                        attributes: mkAttributes({ condition: "POOR" }),
                        biddingMethod: "PRIVATE",
                        version: 1,
                        createdAt: daysFromNow(-1),
                    },
                    {
                        key: "eindhoven_archived",
                        property: "eindhoven",
                        owner: "anouk",
                        purpose: "SALE",
                        status: "ARCHIVED",
                        titleNl: "Vrijstaande woning in Eindhoven-Centrum",
                        titleEn: "Detached house in Eindhoven city centre",
                        descriptionNl:
                            "Inmiddels gearchiveerde verkoopadvertentie van een karakteristieke woning.",
                        descriptionEn:
                            "Now archived sales listing of a characteristic house.",
                        asking: BigInt(45500000),
                        viewingNotes: "",
                        attributes: mkAttributes({
                            condition: "GOOD",
                            highlights: ["Vrijstaand"],
                        }),
                        biddingMethod: "PRIVATE",
                        minimumBid: BigInt(44500000),
                        bidIncrement: BigInt(250000),
                        validatedAt: daysFromNow(-90),
                        publicationRequestedAt: daysFromNow(-90),
                        liveAt: daysFromNow(-90),
                        finalizedAt: daysFromNow(-30),
                        version: 2,
                        createdAt: daysFromNow(-100),
                    },
                    {
                        key: "zuidoost_expired",
                        property: "zuidoost",
                        owner: "mohamed",
                        purpose: "SALE",
                        status: "LIVE",
                        titleNl:
                            "Appartement in Amsterdam-Zuidoost (verlopen biedvenster)",
                        titleEn:
                            "Apartment in Amsterdam-Zuidoost (expired bid window)",
                        descriptionNl:
                            "Appartement met balkon en eigen parkeerplaats. Het biedvenster is inmiddels gesloten.",
                        descriptionEn:
                            "Apartment with balcony and own parking space. The bid window has now closed.",
                        asking: BigInt(33500000),
                        viewingNotes: "",
                        attributes: mkAttributes({
                            condition: "FAIR",
                            highlights: ["Balkon"],
                        }),
                        biddingMethod: "OPEN",
                        minimumBid: BigInt(32500000),
                        bidIncrement: BigInt(250000),
                        bidWindowOpensAt: daysFromNow(-20),
                        bidWindowClosesAt: daysFromNow(-3),
                        validatedAt: daysFromNow(-21),
                        publicationRequestedAt: daysFromNow(-21),
                        liveAt: daysFromNow(-20),
                        version: 2,
                        createdAt: daysFromNow(-25),
                    },
                ];

                const listings: Record<
                    string,
                    {
                        id: string;
                        owner: string;
                        version: number;
                        status: string;
                        purpose: string;
                        askingPriceCents?: bigint | null;
                        monthlyRentCents?: bigint | null;
                    }
                > = {};
                for (const spec of listingSpecs) {
                    const listing = await tx.listing.create({
                        data: {
                            ownerId: users[spec.owner].id,
                            propertyId: properties[spec.property].id,
                            purpose: spec.purpose,
                            status: spec.status,
                            publicSlug:
                                spec.status === "DRAFT" || !spec.titleNl
                                    ? null
                                    : `${spec.titleNl
                                          .toLowerCase()
                                          .replace(/[^a-z0-9]+/g, "-")
                                          .replace(/(^-|-$)/g, "")
                                          .slice(0, 60)}-${spec.key}`,
                            titleNl: spec.titleNl || null,
                            titleEn: spec.titleEn || null,
                            descriptionNl: spec.descriptionNl || null,
                            descriptionEn: spec.descriptionEn || null,
                            askingPriceCents: spec.asking,
                            monthlyRentCents: spec.rent,
                            serviceCostsCents: spec.serviceCosts,
                            availableFrom: spec.availableFrom,
                            viewingNotes: spec.viewingNotes || null,
                            attributes: spec.attributes,
                            biddingMethod: spec.biddingMethod,
                            minimumBidCents: spec.minimumBid,
                            bidIncrementCents: spec.bidIncrement,
                            allowBidConditions: spec.allowBidConditions ?? true,
                            bidWindowOpensAt: spec.bidWindowOpensAt,
                            bidWindowClosesAt: spec.bidWindowClosesAt,
                            validatedAt: spec.validatedAt,
                            publicationRequestedAt: spec.publicationRequestedAt,
                            liveAt: spec.liveAt,
                            finalizedAt: spec.finalizedAt,
                            version: spec.version,
                            createdAt: spec.createdAt,
                            updatedAt: spec.createdAt,
                        },
                    });
                    listings[spec.key] = {
                        id: listing.id,
                        owner: users[spec.owner].id,
                        version: listing.version,
                        status: listing.status,
                        purpose: listing.purpose,
                        askingPriceCents: listing.askingPriceCents,
                        monthlyRentCents: listing.monthlyRentCents,
                    };
                }

                // ---- 6. Media + floor plans ----------------------------
                // Real PNG files are generated into `public/dev/...` so the
                // `/${storageKey}` URLs used by the UI actually resolve.
                const photoNames = [
                    "woonkamer",
                    "keuken",
                    "slaapkamer",
                    "badkamer",
                    "tuin",
                    "gevel",
                    "balkon",
                    "overzicht",
                ];
                const mediaById: Record<string, string> = {};
                const mediaByListing: Record<string, string[]> = {};
                for (const key of Object.keys(listings)) {
                    const listing = listings[key];
                    const count = listing.status === "DRAFT" ? 0 : 5;
                    const list: string[] = [];
                    for (let i = 0; i < count; i++) {
                        const pngBytes = renderPhotoPng(listing.id, i);
                        const storageKey = `dev/listings/${listing.id}/photo-${i + 1}.png`;
                        await writePublicFile(storageKey, pngBytes);
                        const media = await tx.listingMedia.create({
                            data: {
                                listingId: listing.id,
                                kind: "PHOTO",
                                status: "READY",
                                storageKey,
                                mimeType: "image/png",
                                sha256: createHash("sha256")
                                    .update(pngBytes)
                                    .digest("hex"),
                                fileName: `${photoNames[i % photoNames.length]}.png`,
                                sizeBytes: BigInt(pngBytes.length),
                                width: 1600,
                                height: 1200,
                                sortOrder: i,
                                altTextNl: `Foto ${i + 1} van ${listing.id}`,
                                altTextEn: `Photo ${i + 1} of ${listing.id}`,
                                processedAt: daysFromNow(-1),
                            },
                        });
                        mediaById[media.id] = key;
                        list.push(media.id);
                    }
                    mediaByListing[key] = list;
                }

                // A static floor-plan media + FloorPlan row for the "complete" listings.
                for (const key of [
                    "gracht",
                    "watergraafsmeer",
                    "rotterdam",
                    "oudwijk",
                    "jordaan",
                    "haarlem",
                    "oudwest",
                ]) {
                    const listing = listings[key];
                    const floorPng = renderFloorPlanPng(listing.id);
                    const storageKey = `dev/listings/${listing.id}/floorplan.png`;
                    await writePublicFile(storageKey, floorPng);
                    const floorMedia = await tx.listingMedia.create({
                        data: {
                            listingId: listing.id,
                            kind: "FLOOR_PLAN_STATIC",
                            status: "READY",
                            storageKey,
                            mimeType: "image/png",
                            sha256: createHash("sha256")
                                .update(floorPng)
                                .digest("hex"),
                            fileName: "plattegrond.png",
                            sizeBytes: BigInt(floorPng.length),
                            width: 1200,
                            height: 900,
                            sortOrder: 0,
                            altTextNl: "Plattegrond",
                            altTextEn: "Floor plan",
                            processedAt: daysFromNow(-1),
                        },
                    });
                    await tx.floorPlan.create({
                        data: {
                            listingId: listing.id,
                            mode: "STATIC_UPLOAD",
                            floorName: "Begane grond",
                            staticMediaId: floorMedia.id,
                            sortOrder: 0,
                        },
                    });
                }
                // A Floorplanner-embed floor plan example.
                for (const key of ["denhaag", "eindhoven_archived"]) {
                    await tx.floorPlan.create({
                        data: {
                            listingId: listings[key].id,
                            mode: "FLOORPLANNER_EMBED",
                            floorName: "Verdieping 1",
                            floorplannerProjectId: `demo-${key}`,
                            embedUrl: `https://www.floorplanner.com/projects/demo-${key}`,
                            sortOrder: 0,
                        },
                    });
                }

                // Publishing requires the official energy-label PDF document.
                // Every publishable listing gets one (parking/land have no
                // energy label and are exempt from this rule).
                const energyLabelExemptKeys = new Set(["parking", "land"]);
                for (const key of Object.keys(listings)) {
                    const listing = listings[key];
                    if (
                        listing.status === "DRAFT" ||
                        listing.status === "ARCHIVED" ||
                        energyLabelExemptKeys.has(key)
                    ) {
                        continue;
                    }
                    const directory = path.join(
                        PUBLIC_ROOT,
                        "dev",
                        "listings",
                        listing.id,
                    );
                    const fileName = "energielabel.pdf";
                    const bytes = await writeDummyPdf(
                        directory,
                        fileName,
                        "Energielabel",
                        "Energielabelcertificaat voor deze woning.",
                    );
                    await tx.listingMedia.create({
                        data: {
                            listingId: listing.id,
                            kind: "DOCUMENT",
                            status: "READY",
                            storageKey: `dev/listings/${listing.id}/${fileName}`,
                            mimeType: "application/pdf",
                            sha256: createHash("sha256")
                                .update(bytes)
                                .digest("hex"),
                            fileName,
                            sizeBytes: BigInt(bytes.length),
                            sortOrder: 0,
                            altTextNl: "Energielabel",
                            altTextEn: "Energy label",
                            processedAt: daysFromNow(-1),
                        },
                    });
                }

                // ---- 7. Free platform publications ---------------------
                for (const listingKey of ["gracht", "watergraafsmeer", "denhaag", "parking", "land", "jordaan", "haarlem", "rotterdam", "oudwest"]) {
                    const withdrawn = listingKey === "rotterdam";
                    await tx.listingPublication.create({
                        data: {
                            listingId: listings[listingKey].id,
                            idempotencyKey: randomUUID(),
                            channel: "PLATFORM",
                            status: withdrawn ? "WITHDRAWN" : "LIVE",
                            submittedAt: daysFromNow(-11),
                            liveAt: withdrawn ? null : daysFromNow(-10),
                        },
                    });
                }

                // ---- 8. Bids + bid events (chained) --------------------
                const bidChains: Record<
                    string,
                    Array<{
                        id: string;
                        entryHash: string;
                        bidderUserId: string | null;
                        amountCents: bigint;
                    }>
                > = {};

                bidChains.gracht = await createBidChain(
                    tx,
                    listings.gracht.id,
                    [
                        {
                            bidderUserId: users.thomas.id,
                            bidderPseudonym: "Koper-4821",
                            amountCents: BigInt(59000000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "60000000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(35),
                            transferDateRequested: daysFromNow(60),
                            submittedAt: daysFromNow(-5),
                        },
                        {
                            bidderUserId: users.lisa.id,
                            bidderPseudonym: "Koper-7734",
                            amountCents: BigInt(59250000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "59250000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(32),
                            transferDateRequested: daysFromNow(55),
                            submittedAt: daysFromNow(-3),
                        },
                        {
                            bidderUserId: users.david.id,
                            bidderPseudonym: "Koper-9031",
                            amountCents: BigInt(59500000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "59500000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: true,
                                additionalConditions: [
                                    "Verkoop huidige woning",
                                ],
                            },
                            financingDeadline: daysFromNow(30),
                            transferDateRequested: daysFromNow(50),
                            submittedAt: daysFromNow(-1),
                        },
                    ],
                );

                bidChains.watergraafsmeer = await createBidChain(
                    tx,
                    listings.watergraafsmeer.id,
                    [
                        {
                            bidderUserId: users.femke.id,
                            bidderPseudonym: "Koper-1120",
                            amountCents: BigInt(79000000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "79000000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(40),
                            transferDateRequested: daysFromNow(70),
                            submittedAt: daysFromNow(-4),
                        },
                        {
                            bidderUserId: users.bram.id,
                            bidderPseudonym: "Koper-2290",
                            amountCents: BigInt(79250000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "79250000",
                                buildingInspection: true,
                                inspectionLimitCents: "750000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(38),
                            transferDateRequested: daysFromNow(65),
                            submittedAt: daysFromNow(-2),
                        },
                    ],
                );

                bidChains.jordaan = await createBidChain(
                    tx,
                    listings.jordaan.id,
                    [
                        {
                            bidderUserId: users.bram.id,
                            bidderPseudonym: "Huurder-3301",
                            amountCents: BigInt(190000),
                            resolutiveConditions: {
                                financing: false,
                                buildingInspection: false,
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            submittedAt: daysFromNow(-2),
                        },
                    ],
                );

                bidChains.haarlem = await createBidChain(
                    tx,
                    listings.haarlem.id,
                    [
                        {
                            bidderUserId: users.david.id,
                            bidderPseudonym: "Huurder-4412",
                            amountCents: BigInt(177500),
                            resolutiveConditions: {
                                financing: false,
                                buildingInspection: false,
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            submittedAt: daysFromNow(-3),
                            events: [
                                {
                                    type: "WITHDRAWN",
                                    reason: "Tweede bod uitgebracht",
                                    occurredAt: daysFromNow(-1),
                                },
                            ],
                        },
                        {
                            bidderUserId: users.femke.id,
                            bidderPseudonym: "Huurder-5523",
                            amountCents: BigInt(180000),
                            resolutiveConditions: {
                                financing: false,
                                buildingInspection: false,
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            submittedAt: daysFromNow(-1),
                        },
                    ],
                );

                bidChains.oudwijk = await createBidChain(
                    tx,
                    listings.oudwijk.id,
                    [
                        {
                            bidderUserId: users.thomas.id,
                            bidderPseudonym: "Koper-1188",
                            amountCents: BigInt(51500000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "51500000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(30),
                            transferDateRequested: daysFromNow(60),
                            submittedAt: daysFromNow(-10),
                        },
                        {
                            bidderUserId: users.lisa.id,
                            bidderPseudonym: "Koper-2211",
                            amountCents: BigInt(52000000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "52000000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(28),
                            transferDateRequested: daysFromNow(58),
                            submittedAt: daysFromNow(-8),
                        },
                        {
                            bidderUserId: users.thomas.id,
                            bidderPseudonym: "Koper-1188",
                            amountCents: BigInt(52500000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "52500000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(25),
                            transferDateRequested: daysFromNow(55),
                            submittedAt: daysFromNow(-6),
                            events: [
                                {
                                    type: "ACCEPTED",
                                    reason: "Hoogste bod",
                                    occurredAt: daysFromNow(-6),
                                },
                            ],
                        },
                    ],
                );

                bidChains.rotterdam = await createBidChain(
                    tx,
                    listings.rotterdam.id,
                    [
                        {
                            bidderUserId: users.david.id,
                            bidderPseudonym: "Koper-3355",
                            amountCents: BigInt(38000000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "38000000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(-30),
                            transferDateRequested: daysFromNow(-20),
                            submittedAt: daysFromNow(-42),
                        },
                        {
                            bidderUserId: users.lisa.id,
                            bidderPseudonym: "Koper-4422",
                            amountCents: BigInt(38500000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "38500000",
                                buildingInspection: true,
                                inspectionLimitCents: "500000",
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(-28),
                            transferDateRequested: daysFromNow(-22),
                            submittedAt: daysFromNow(-40),
                            events: [
                                {
                                    type: "ACCEPTED",
                                    reason: "Verkoop",
                                    occurredAt: daysFromNow(-40),
                                },
                            ],
                        },
                    ],
                );

                bidChains.oudwest = await createBidChain(
                    tx,
                    listings.oudwest.id,
                    [
                        {
                            bidderUserId: users.lisa.id,
                            bidderPseudonym: "Huurder-6633",
                            amountCents: BigInt(135000),
                            resolutiveConditions: {
                                financing: false,
                                buildingInspection: false,
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            submittedAt: daysFromNow(-55),
                            events: [
                                {
                                    type: "ACCEPTED",
                                    reason: "Verhuur",
                                    occurredAt: daysFromNow(-55),
                                },
                            ],
                        },
                    ],
                );

                bidChains.zuidoost_expired = await createBidChain(
                    tx,
                    listings.zuidoost_expired.id,
                    [
                        {
                            bidderUserId: users.femke.id,
                            bidderPseudonym: "Koper-7744",
                            amountCents: BigInt(33000000),
                            resolutiveConditions: {
                                financing: true,
                                financingAmountCents: "33000000",
                                buildingInspection: false,
                                saleOfCurrentHome: false,
                                additionalConditions: [],
                            },
                            financingDeadline: daysFromNow(-5),
                            transferDateRequested: daysFromNow(10),
                            submittedAt: daysFromNow(-12),
                            events: [
                                {
                                    type: "EXPIRED",
                                    reason: "Biedvenster gesloten",
                                    occurredAt: daysFromNow(-3),
                                },
                            ],
                        },
                    ],
                );

                // ---- 9. Viewing slots + bookings -----------------------
                async function addViewing(
                    listingKey: string,
                    type: ViewingType,
                    startsAt: Date,
                    capacity: number,
                    bookings: Array<
                        [keyof typeof users, ViewingAttendanceStatus]
                    >,
                ) {
                    const slot = await tx.viewingSlot.create({
                        data: {
                            listingId: listings[listingKey].id,
                            type,
                            startsAt,
                            endsAt: new Date(
                                startsAt.getTime() + 45 * 60 * 1000,
                            ),
                            capacity,
                        },
                    });
                    for (const [userKey, status] of bookings) {
                        await tx.viewingBooking.create({
                            data: {
                                slotId: slot.id,
                                userId: users[userKey].id,
                                attendanceStatus: status,
                            },
                        });
                    }
                }

                await addViewing("gracht", "APPOINTMENT", daysFromNow(3), 1, [
                    ["thomas", "SCHEDULED"],
                ]);
                await addViewing("gracht", "OPEN_HOUSE", daysFromNow(7), 6, [
                    ["lisa", "CONFIRMED"],
                    ["david", "CONFIRMED"],
                    ["femke", "SCHEDULED"],
                ]);
                await addViewing("haarlem", "APPOINTMENT", daysFromNow(4), 1, [
                    ["femke", "SCHEDULED"],
                ]);
                await addViewing("jordaan", "OPEN_HOUSE", daysFromNow(5), 4, [
                    ["bram", "CONFIRMED"],
                    ["david", "SCHEDULED"],
                ]);

                // ---- 10. Identity verification attempts ----------------
                async function identityAttempt(
                    userKey: keyof typeof users,
                    listingKey: string | null,
                    purpose: VerificationPurpose,
                    status: VerificationStatus,
                    ref: string,
                    opts?: {
                        failureCode?: string;
                        matched?: Record<string, unknown>;
                        completedDays?: number;
                        initiatedDays?: number;
                    },
                ) {
                    const requestedAt = daysFromNow(opts?.initiatedDays ?? -30);
                    await tx.identityVerificationAttempt.create({
                        data: {
                            userId: users[userKey].id,
                            listingId: listingKey
                                ? listings[listingKey].id
                                : null,
                            purpose,
                            provider: "DEVELOPMENT_IDENTITY",
                            providerReference: ref,
                            status,
                            subjectReferenceHash: sha256(`subject:${ref}`),
                            attributesMatched:
                                (opts?.matched as Prisma.InputJsonValue) ??
                                null,
                            requestedAt,
                            completedAt:
                                status === "VERIFIED"
                                    ? daysFromNow(opts?.completedDays ?? -30)
                                    : null,
                            expiresAt:
                                status === "INITIATED" ? daysFromNow(1) : null,
                            failureCode: opts?.failureCode ?? null,
                            responsePayloadHash:
                                status === "VERIFIED"
                                    ? sha256(`identity:response:${ref}`)
                                    : null,
                        },
                    });
                }

                await identityAttempt(
                    "thomas",
                    null,
                    "ACCOUNT_ACCESS",
                    "VERIFIED",
                    "identity_dev_001",
                    {
                        matched: {
                            givenName: "Thomas",
                            familyName: "Mulder",
                            dateOfBirth: "1991-04-12",
                        },
                    },
                );
                await identityAttempt(
                    "lisa",
                    null,
                    "ACCOUNT_ACCESS",
                    "VERIFIED",
                    "identity_dev_002",
                    {
                        matched: {
                            givenName: "Lisa",
                            familyName: "van Dijk",
                            dateOfBirth: "1993-08-02",
                        },
                    },
                );
                await identityAttempt(
                    "jan",
                    "gracht",
                    "LISTING_PUBLICATION",
                    "VERIFIED",
                    "identity_dev_003",
                    {
                        matched: {
                            givenName: "Jan",
                            familyName: "de Vries",
                            dateOfBirth: "1978-01-20",
                        },
                        completedDays: -15,
                    },
                );
                await identityAttempt(
                    "sanne",
                    "rotterdam",
                    "LISTING_PUBLICATION",
                    "VERIFIED",
                    "identity_dev_004",
                    {
                        matched: {
                            givenName: "Sanne",
                            familyName: "Bakker",
                            dateOfBirth: "1985-11-05",
                        },
                        completedDays: -50,
                    },
                );
                await identityAttempt(
                    "pieter",
                    "oudwest",
                    "LISTING_PUBLICATION",
                    "VERIFIED",
                    "identity_dev_005",
                    {
                        matched: {
                            givenName: "Pieter",
                            familyName: "Visser",
                            dateOfBirth: "1970-06-17",
                        },
                        completedDays: -60,
                    },
                );
                await identityAttempt(
                    "bram",
                    "watergraafsmeer",
                    "ACCOUNT_ACCESS",
                    "INITIATED",
                    "identity_dev_006",
                    {
                        initiatedDays: -1,
                    },
                );
                await identityAttempt(
                    "femke",
                    null,
                    "ACCOUNT_ACCESS",
                    "FAILED",
                    "identity_dev_007",
                    {
                        failureCode: "DEVELOPMENT_CANCELLED",
                        initiatedDays: -4,
                    },
                );

                // ---- 11. Favorites, saved searches, notifications, shortlists ----
                await tx.favoriteListing.createMany({
                    data: [
                        {
                            userId: users.thomas.id,
                            listingId: listings.gracht.id,
                            note: "Kansrijk, zeker bezichtigen",
                            priceSnapshotCents: BigInt(59500000),
                            statusSnapshot: "LIVE",
                        },
                        {
                            userId: users.thomas.id,
                            listingId: listings.denhaag.id,
                            priceSnapshotCents: BigInt(47500000),
                            statusSnapshot: "LIVE",
                        },
                        {
                            userId: users.lisa.id,
                            listingId: listings.watergraafsmeer.id,
                            priceSnapshotCents: BigInt(79500000),
                            statusSnapshot: "LIVE",
                        },
                        {
                            userId: users.lisa.id,
                            listingId: listings.gracht.id,
                            priceSnapshotCents: BigInt(59500000),
                            statusSnapshot: "LIVE",
                        },
                        {
                            userId: users.femke.id,
                            listingId: listings.haarlem.id,
                            priceSnapshotCents: BigInt(175000),
                            statusSnapshot: "LIVE",
                        },
                        {
                            userId: users.femke.id,
                            listingId: listings.jordaan.id,
                            priceSnapshotCents: BigInt(185000),
                            statusSnapshot: "LIVE",
                        },
                        {
                            userId: users.bram.id,
                            listingId: listings.watergraafsmeer.id,
                            priceSnapshotCents: BigInt(79500000),
                            statusSnapshot: "LIVE",
                        },
                        {
                            userId: users.david.id,
                            listingId: listings.gracht.id,
                            priceSnapshotCents: BigInt(59500000),
                            statusSnapshot: "LIVE",
                        },
                    ],
                });

                await tx.savedSearch.createMany({
                    data: [
                        {
                            userId: users.thomas.id,
                            name: "Appartement Amsterdam",
                            queryString:
                                "purpose=SALE&city=Amsterdam&bedroomsMin=2&type=APARTMENT",
                            lastCheckedAt: daysFromNow(-1),
                        },
                        {
                            userId: users.lisa.id,
                            name: "Utrecht onder €600k",
                            queryString:
                                "purpose=SALE&city=Utrecht&priceMax=60000000",
                            lastCheckedAt: daysFromNow(-2),
                        },
                        {
                            userId: users.femke.id,
                            name: "Huur Haarlem",
                            queryString: "purpose=RENT&city=Haarlem",
                            lastCheckedAt: daysFromNow(-1),
                        },
                        {
                            userId: users.bram.id,
                            name: "Rotterdam woningen",
                            queryString: "purpose=SALE&city=Rotterdam",
                            lastCheckedAt: daysFromNow(-3),
                        },
                        {
                            userId: users.david.id,
                            name: "Amsterdamse monumenten",
                            queryString:
                                "purpose=SALE&city=Amsterdam&monument=true",
                            lastCheckedAt: daysFromNow(-1),
                        },
                    ],
                });

                await tx.seekerNotification.createMany({
                    data: [
                        {
                            userId: users.thomas.id,
                            type: "BID_UPDATED",
                            eventKey: "bid-gracht-thomas-1",
                            title: "Bieding ontvangen",
                            body: "Je bieding op Herengracht 48 is ontvangen en verwerkt.",
                            href: `/property/${"grachtpand-op-herengracht-gracht"}`,
                            readAt: daysFromNow(-4),
                        },
                        {
                            userId: users.thomas.id,
                            type: "VIEWING_UPDATED",
                            eventKey: "viewing-gracht-thomas-1",
                            title: "Bezichtiging bevestigd",
                            body: "Je bezichtiging op Herengracht 48 is bevestigd.",
                            href: `/property/${"grachtpand-op-herengracht-gracht"}`,
                            readAt: null,
                        },
                        {
                            userId: users.lisa.id,
                            type: "NEW_LISTING",
                            eventKey: "new-watergraafsmeer",
                            title: "Nieuw in de markt",
                            body: "Hugo de Vrieslaan 22 staat nu online.",
                            href: `/property/${"ruime-eengezinswoning-nabij-het-park-watergraafsmeer"}`,
                        },
                        {
                            userId: users.lisa.id,
                            type: "PRICE_CHANGED",
                            eventKey: "price-gracht",
                            title: "Prijs gewijzigd",
                            body: "De vraagprijs van Herengracht 48 is bijgesteld.",
                            href: `/property/${"grachtpand-op-herengracht-gracht"}`,
                        },
                        {
                            userId: users.femke.id,
                            type: "DEADLINE_APPROACHING",
                            eventKey: "deadline-watergraafsmeer",
                            title: "Biedingsdeadline nadert",
                            body: "Het biedvenster voor Hugo de Vrieslaan 22 sluit binnenkort.",
                            href: `/property/${"ruime-eengezinswoning-nabij-het-park-watergraafsmeer"}`,
                        },
                        {
                            userId: users.bram.id,
                            type: "NEW_LISTING",
                            eventKey: "new-parking",
                            title: "Nieuw in de markt",
                            body: "Een parkeerplaats in Nieuw-West staat online.",
                            href: `/property/${"parkeerplaats-in-eigen-garage-nieuw-west-parking"}`,
                        },
                    ],
                });

                async function shareShortlist(
                    userKey: keyof typeof users,
                    label: string,
                    token: string,
                    expiresDays: number,
                    items: Array<[string, string | null, number]>,
                ) {
                    const share = await tx.shortlistShare.create({
                        data: {
                            ownerId: users[userKey].id,
                            label,
                            tokenHash: sha256(token),
                            expiresAt: daysFromNow(expiresDays),
                        },
                    });
                    for (const [listingKey, note, sortOrder] of items) {
                        await tx.shortlistItem.create({
                            data: {
                                shareId: share.id,
                                listingId: listings[listingKey].id,
                                note,
                                sortOrder,
                            },
                        });
                    }
                }
                await shareShortlist(
                    "thomas",
                    "Favorieten voor makelaar",
                    "share-token-thomas",
                    30,
                    [
                        ["gracht", "Sterke kans", 0],
                        ["denhaag", null, 1],
                    ],
                );
                await shareShortlist(
                    "lisa",
                    "Top 3 voor partner",
                    "share-token-lisa",
                    14,
                    [
                        ["watergraafsmeer", "Favoriet", 0],
                        ["haarlem", "Back-up", 1],
                    ],
                );

                // ---- 11c. Listing messages (zoekers ↔ eigenaren) ----------
                // Berichten tussen woningzoekers en eigenaren, zichtbaar in het
                // zoekersdashboard (tab "Berichten") en per advertentie in het
                // eigenarenportaal. Berichten van vóór een koop worden bij
                // acceptatie overgezet naar de transactiechat (zie hieronder).
                async function listingMessage(
                    listingKey: string,
                    authorKey: string,
                    seekerKey: string,
                    body: string,
                    daysAgo: number,
                    readDaysAgo: number | null = null,
                ) {
                    return tx.listingMessage.create({
                        data: {
                            listingId: listings[listingKey].id,
                            authorUserId: users[authorKey].id,
                            seekerUserId: users[seekerKey].id,
                            body,
                            createdAt: daysFromNow(-daysAgo),
                            readAt:
                                readDaysAgo === null
                                    ? null
                                    : daysFromNow(-readDaysAgo),
                        },
                    });
                }

                // Live gesprek op Herengracht 48 (eigenaar Jan de Vries).
                await listingMessage(
                    "gracht",
                    "thomas",
                    "thomas",
                    "Goedemiddag, is de woning nog beschikbaar en zijn er bezichtigingen mogelijk komend weekend?",
                    6,
                    5,
                );
                await listingMessage(
                    "gracht",
                    "jan",
                    "thomas",
                    "Dag Thomas, de woning staat nog te koop. Zaterdagochtend is er ruimte — plan gerust een bezichtiging in.",
                    5,
                    4,
                );
                await listingMessage(
                    "gracht",
                    "thomas",
                    "thomas",
                    "Dank! Ik heb zaterdag 10:00 ingepland. Kunnen we tijdens de bezichtiging ook de bouwtekeningen inzien?",
                    4,
                );
                await listingMessage(
                    "gracht",
                    "jan",
                    "thomas",
                    "Natuurlijk, ik leg de tekeningen klaar. Tot zaterdag!",
                    3,
                );

                // Live gesprek op Hugo de Vrieslaan 22 (eigenaar Sanne Bakker).
                await listingMessage(
                    "watergraafsmeer",
                    "lisa",
                    "lisa",
                    "Wat een fijne woning! Zijn de zonnepanelen eigendom van de verkoper en hoe oud zijn ze?",
                    8,
                    7,
                );
                await listingMessage(
                    "watergraafsmeer",
                    "sanne",
                    "lisa",
                    "Dag Lisa, de panelen zijn volledig eigendom van de verkoper en stammen uit 2022. Ze liggen op het zuiden.",
                    7,
                    6,
                );
                await listingMessage(
                    "watergraafsmeer",
                    "lisa",
                    "lisa",
                    "Dank voor de uitleg! We zouden graag een tweede bezichtiging plannen, is dat mogelijk?",
                    2,
                );

                // Vraag van een huurzoeker op de Haarlemse appartementen.
                await listingMessage(
                    "haarlem",
                    "femke",
                    "femke",
                    "Hallo, is huur inclusief of exclusief servicekosten? En is een huisdier toegestaan?",
                    3,
                );

                // Gesprek van vóór de koop op Kinkerstraat 74A (eigenaar
                // Pieter). Lisa huurt dit appartement uiteindelijk; deze
                // berichten worden hieronder overgezet naar de transactiechat.
                const oudwestPreMessages = [
                    await listingMessage(
                        "oudwest",
                        "lisa",
                        "lisa",
                        "Hallo, het appartement lijkt precies wat we zoeken. Is de servicekosteninformatie beschikbaar?",
                        40,
                        39,
                    ),
                    await listingMessage(
                        "oudwest",
                        "pieter",
                        "lisa",
                        "Dag Lisa, leuk om te horen! De servicekosten zijn €95 per maand. Wil je een keer langskomen?",
                        39,
                        38,
                    ),
                    await listingMessage(
                        "oudwest",
                        "lisa",
                        "lisa",
                        "Graag! Zaterdagmiddag zou perfect zijn. Kunnen we dan ook de meterstanden bekijken?",
                        38,
                    ),
                ];

                // ---- 12. Property transactions --------------------------
                // 12a. Under offer — pending sale (Oudwijk)
                const tOudwijk = await tx.propertyTransaction.create({
                    data: {
                        listingId: listings.oudwijk.id,
                        acceptedBidId: bidChains.oudwijk[2].id,
                        sellerUserId: users.jan.id,
                        buyerUserId: users.thomas.id,
                        status: "CONTRACT_PENDING",
                        purchasePriceCents: BigInt(52500000),
                        targetTransferDate: daysFromNow(56),
                        createdAt: daysFromNow(-6),
                        updatedAt: daysFromNow(-6),
                        milestones: {
                            create: [
                                {
                                    type: "PURCHASE_AGREEMENT",
                                    title: "Koopovereenkomst",
                                    status: "IN_PROGRESS",
                                    sortOrder: 1,
                                    dueAt: daysFromNow(5),
                                },
                                {
                                    type: "COOLING_OFF_PERIOD",
                                    title: "Wettelijke bedenktijd",
                                    status: "NOT_STARTED",
                                    sortOrder: 2,
                                },
                                {
                                    type: "FINANCING",
                                    title: "Financiering",
                                    status: "NOT_STARTED",
                                    sortOrder: 3,
                                },
                                {
                                    type: "BUILDING_INSPECTION",
                                    title: "Bouwkundige keuring",
                                    status: "NOT_STARTED",
                                    sortOrder: 4,
                                },
                                {
                                    type: "SECURITY_DEPOSIT",
                                    title: "Waarborgsom",
                                    status: "NOT_STARTED",
                                    sortOrder: 5,
                                },
                                {
                                    type: "NOTARY_SELECTION",
                                    title: "Kiezen notaris",
                                    status: "NOT_STARTED",
                                    sortOrder: 6,
                                },
                                {
                                    type: "DEED_OF_TRANSFER",
                                    title: "Leveringsakte",
                                    status: "NOT_STARTED",
                                    sortOrder: 7,
                                    dueAt: daysFromNow(56),
                                },
                                {
                                    type: "FINAL_INSPECTION",
                                    title: "Eindinspectie",
                                    status: "NOT_STARTED",
                                    sortOrder: 8,
                                },
                                {
                                    type: "KEY_HANDOVER",
                                    title: "Sleuteloverdracht",
                                    status: "NOT_STARTED",
                                    sortOrder: 9,
                                    dueAt: daysFromNow(56),
                                },
                            ],
                        },
                    },
                });
                // Seeded koopovereenkomst (concept klaar voor ondertekening).
                await tx.purchaseAgreement.create({
                    data: {
                        transactionId: tOudwijk.id,
                        version: 1,
                        status: "AWAITING_SIGNATURES",
                        submittedAt: daysFromNow(-1),
                        sellerCivilStatus: "Gehuwd",
                        sellerAddress: "Rubenslaan 5, 3581 EJ Utrecht",
                        sellerSpouseName: "Anna Jansen",
                        buyerCivilStatus: "Ongehuwd",
                        buyerAddress: "Oudwijkerlaan 12, 3581 TK Utrecht",
                        kadastraleOmschrijving:
                            "gemeente Utrecht, sectie B, nummer 5234",
                        movables: [],
                        movablesValueCents: BigInt(0),
                        securityType: "REQUIRED",
                        securityAmountCents: BigInt(5250000),
                        securityDueDate: daysFromNow(55),
                        financingCondition: true,
                        financingTermWeeks: 6,
                        inspectionCondition: true,
                        inspectionTermDays: 14,
                        inspectionCostCapCents: BigInt(500000),
                        nhgCondition: false,
                        nhgTermWeeks: 8,
                        foundationCondition: false,
                        foundationTermWeeks: 4,
                        transferDate: daysFromNow(56),
                        kadasterRegistration: true,
                        buyerPaysCosts: true,
                        coolingOffDays: 3,
                    },
                });
                await tx.transactionMessage.createMany({
                    data: [
                        {
                            transactionId: tOudwijk.id,
                            authorUserId: users.jan.id,
                            kind: "TEXT",
                            body: "Welkom in de transactieruimte! Fijn dat we er samen uitkomen.",
                            createdAt: daysFromNow(-6),
                        },
                        {
                            transactionId: tOudwijk.id,
                            authorUserId: users.thomas.id,
                            kind: "TEXT",
                            body: "Dank! We regelen de financiering zo snel mogelijk.",
                            createdAt: daysFromNow(-5),
                        },
                        {
                            transactionId: tOudwijk.id,
                            authorUserId: users.jan.id,
                            kind: "SYSTEM",
                            body: "Koopovereenkomst toegevoegd.",
                            createdAt: daysFromNow(-4),
                        },
                    ],
                });
                // Dummy PDFs are written to `.data/transaction-documents/` and
                // the storage key matches the pattern the download route expects.
                async function createTransactionDocument(
                    transactionId: string,
                    uploadedById: string,
                    category: TransactionDocumentCategory,
                    fileName: string,
                    title: string,
                    body: string,
                    version = 1,
                ) {
                    const directory = path.join(
                        DATA_ROOT,
                        "transaction-documents",
                        transactionId,
                    );
                    const bytes = await writeDummyPdf(
                        directory,
                        fileName,
                        title,
                        body,
                    );
                    return tx.transactionDocument.create({
                        data: {
                            transactionId,
                            uploadedById,
                            category,
                            storageKey: `${transactionId}/${fileName}`,
                            mimeType: "application/pdf",
                            sha256: createHash("sha256")
                                .update(bytes)
                                .digest("hex"),
                            fileName,
                            sizeBytes: BigInt(bytes.length),
                            version,
                        },
                    });
                }

                await createTransactionDocument(
                    tOudwijk.id,
                    users.jan.id,
                    "PURCHASE_AGREEMENT",
                    "koopovereenkomst.pdf",
                    "Koopovereenkomst - Rubenslaan 5, Utrecht",
                    "Concept koopovereenkomst voor de verkoop van de woning.",
                );
                await createTransactionDocument(
                    tOudwijk.id,
                    users.jan.id,
                    "PROPERTY_PASSPORT",
                    "woningpaspoort-v1.pdf",
                    "Woningpaspoort v1 - Rubenslaan 5, Utrecht",
                    "Vastgelegde eigenschappen van de woning op moment van aanvaarding.",
                );
                await appendTransactionEvent(
                    tx,
                    tOudwijk.id,
                    users.jan.id,
                    "ROOM_CREATED",
                    { acceptedBidId: bidChains.oudwijk[2].id },
                    daysFromNow(-6),
                );
                await appendTransactionEvent(
                    tx,
                    tOudwijk.id,
                    users.thomas.id,
                    "MESSAGE_SENT",
                    { preview: "We regelen de financiering zo snel mogelijk." },
                    daysFromNow(-5),
                );
                await appendTransactionEvent(
                    tx,
                    tOudwijk.id,
                    users.jan.id,
                    "DOCUMENT_UPLOADED",
                    {
                        category: "PURCHASE_AGREEMENT",
                        fileName: "koopovereenkomst.pdf",
                    },
                    daysFromNow(-4),
                );
                await appendTransactionEvent(
                    tx,
                    tOudwijk.id,
                    users.jan.id,
                    "MILESTONE_UPDATED",
                    { type: "PURCHASE_AGREEMENT", status: "IN_PROGRESS" },
                    daysFromNow(-4),
                );

                // 12b. Completed sale (Rotterdam)
                const tRotterdam = await tx.propertyTransaction.create({
                    data: {
                        listingId: listings.rotterdam.id,
                        acceptedBidId: bidChains.rotterdam[1].id,
                        sellerUserId: users.sanne.id,
                        buyerUserId: users.lisa.id,
                        status: "COMPLETED",
                        purchasePriceCents: BigInt(38500000),
                        targetTransferDate: daysFromNow(-20),
                        coolingOffEndsAt: daysFromNow(-33),
                        buyerContractConfirmedAt: daysFromNow(-30),
                        sellerContractConfirmedAt: daysFromNow(-30),
                        contractTerms: {
                            type: "KOOP",
                            underSuspensiveConditions: [
                                "Financiering",
                                "Bouwkundige keuring",
                            ],
                        },
                        notaryDetails: {
                            name: "Notariskantoor Rotterdam",
                            reference: "NTR-2026-0412",
                        },
                        handoverDetails: {
                            date: daysFromNow(-20).toISOString(),
                            location: "Coolsingel 15, Rotterdam",
                        },
                        completedAt: daysFromNow(-5),
                        version: 3,
                        createdAt: daysFromNow(-40),
                        updatedAt: daysFromNow(-5),
                        milestones: {
                            create: [
                                {
                                    type: "PURCHASE_AGREEMENT",
                                    title: "Koopovereenkomst",
                                    status: "COMPLETED",
                                    sortOrder: 1,
                                    dueAt: daysFromNow(-38),
                                    completedAt: daysFromNow(-34),
                                },
                                {
                                    type: "COOLING_OFF_PERIOD",
                                    title: "Wettelijke bedenktijd",
                                    status: "COMPLETED",
                                    sortOrder: 2,
                                    dueAt: daysFromNow(-37),
                                    completedAt: daysFromNow(-33),
                                },
                                {
                                    type: "FINANCING",
                                    title: "Financiering",
                                    status: "COMPLETED",
                                    sortOrder: 3,
                                    dueAt: daysFromNow(-15),
                                    completedAt: daysFromNow(-14),
                                },
                                {
                                    type: "BUILDING_INSPECTION",
                                    title: "Bouwkundige keuring",
                                    status: "COMPLETED",
                                    sortOrder: 4,
                                    dueAt: daysFromNow(-30),
                                    completedAt: daysFromNow(-25),
                                },
                                {
                                    type: "SECURITY_DEPOSIT",
                                    title: "Waarborgsom",
                                    status: "COMPLETED",
                                    sortOrder: 5,
                                    dueAt: daysFromNow(-25),
                                    completedAt: daysFromNow(-22),
                                },
                                {
                                    type: "NOTARY_SELECTION",
                                    title: "Kiezen notaris",
                                    status: "COMPLETED",
                                    sortOrder: 6,
                                    dueAt: daysFromNow(-32),
                                    completedAt: daysFromNow(-31),
                                },
                                {
                                    type: "DEED_OF_TRANSFER",
                                    title: "Leveringsakte",
                                    status: "COMPLETED",
                                    sortOrder: 7,
                                    dueAt: daysFromNow(-20),
                                    completedAt: daysFromNow(-20),
                                },
                                {
                                    type: "FINAL_INSPECTION",
                                    title: "Eindinspectie",
                                    status: "COMPLETED",
                                    sortOrder: 8,
                                    dueAt: daysFromNow(-21),
                                    completedAt: daysFromNow(-21),
                                },
                                {
                                    type: "KEY_HANDOVER",
                                    title: "Sleuteloverdracht",
                                    status: "COMPLETED",
                                    sortOrder: 9,
                                    dueAt: daysFromNow(-20),
                                    completedAt: daysFromNow(-20),
                                },
                            ],
                        },
                    },
                });
                await tx.transactionMessage.createMany({
                    data: [
                        {
                            transactionId: tRotterdam.id,
                            authorUserId: users.sanne.id,
                            kind: "TEXT",
                            body: "Gefeliciteerd Lisa! Veel woonplezier in jullie nieuwe appartement.",
                            createdAt: daysFromNow(-20),
                        },
                        {
                            transactionId: tRotterdam.id,
                            authorUserId: users.lisa.id,
                            kind: "TEXT",
                            body: "Dankjewel Sanne, we hebben er enorm veel zin in!",
                            createdAt: daysFromNow(-19),
                        },
                    ],
                });
                await createTransactionDocument(
                    tRotterdam.id,
                    users.sanne.id,
                    "PURCHASE_AGREEMENT",
                    "koopovereenkomst.pdf",
                    "Koopovereenkomst - Coolsingel 15, Rotterdam",
                    "Getekende koopovereenkomst voor het appartement.",
                    2,
                );
                await createTransactionDocument(
                    tRotterdam.id,
                    users.sanne.id,
                    "PROPERTY_PASSPORT",
                    "woningpaspoort-v1.pdf",
                    "Woningpaspoort v1 - Coolsingel 15, Rotterdam",
                    "Woningpaspoort vastgelegd bij aanvaarding van het bod.",
                );
                await createTransactionDocument(
                    tRotterdam.id,
                    users.sanne.id,
                    "FINAL_INSPECTION",
                    "eindinspectierapport.pdf",
                    "Eindinspectierapport - Coolsingel 15, Rotterdam",
                    "Rapport van de eindinspectie vóór overdracht.",
                );
                await createTransactionDocument(
                    tRotterdam.id,
                    users.sanne.id,
                    "NOTARY",
                    "leveringsakte.pdf",
                    "Leveringsakte - Coolsingel 15, Rotterdam",
                    "Notariële leveringsakte van het appartement.",
                );
                // Event timestamps must be strictly increasing (the app appends
                // with `new Date()`), so each tuple carries an explicit Date.
                const rotterdamEvents: Array<
                    [TransactionEventType, string | null, unknown, Date]
                > = [
                    [
                        "ROOM_CREATED",
                        "sanne",
                        { acceptedBidId: bidChains.rotterdam[1].id },
                        daysFromNow(-40),
                    ],
                    [
                        "DOCUMENT_UPLOADED",
                        "sanne",
                        { category: "PURCHASE_AGREEMENT" },
                        daysFromNow(-34, 1),
                    ],
                    [
                        "MILESTONE_UPDATED",
                        "sanne",
                        { type: "PURCHASE_AGREEMENT", status: "COMPLETED" },
                        daysFromNow(-34, 3),
                    ],
                    [
                        "CONTRACT_CONFIRMED",
                        "lisa",
                        { by: "buyer" },
                        daysFromNow(-30, 9),
                    ],
                    [
                        "CONTRACT_CONFIRMED",
                        "sanne",
                        { by: "seller" },
                        daysFromNow(-30, 11),
                    ],
                    [
                        "NOTARY_UPDATED",
                        "sanne",
                        { notary: "Notariskantoor Rotterdam" },
                        daysFromNow(-28, 14),
                    ],
                    [
                        "DOCUMENT_UPLOADED",
                        "sanne",
                        { category: "FINAL_INSPECTION" },
                        daysFromNow(-21, 10),
                    ],
                    [
                        "MESSAGE_SENT",
                        "sanne",
                        { preview: "Gefeliciteerd Lisa!" },
                        daysFromNow(-20, 15),
                    ],
                    [
                        "HANDOVER_UPDATED",
                        "sanne",
                        { date: daysFromNow(-20, 16).toISOString() },
                        daysFromNow(-20, 16),
                    ],
                    [
                        "MESSAGE_SENT",
                        "lisa",
                        { preview: "Dankjewel Sanne" },
                        daysFromNow(-19, 9),
                    ],
                    [
                        "TRANSACTION_COMPLETED",
                        "sanne",
                        { completedAt: daysFromNow(-5, 10).toISOString() },
                        daysFromNow(-5, 10),
                    ],
                ];
                for (const [
                    type,
                    actorKey,
                    payload,
                    occurredAt,
                ] of rotterdamEvents) {
                    await appendTransactionEvent(
                        tx,
                        tRotterdam.id,
                        actorKey ? users[actorKey].id : null,
                        type,
                        payload,
                        occurredAt,
                    );
                }

                // 12c. Completed rental (Oud-West)
                const tOudwest = await tx.propertyTransaction.create({
                    data: {
                        listingId: listings.oudwest.id,
                        acceptedBidId: bidChains.oudwest[0].id,
                        sellerUserId: users.pieter.id,
                        buyerUserId: users.lisa.id,
                        status: "COMPLETED",
                        purchasePriceCents: BigInt(135000),
                        targetTransferDate: daysFromNow(-10),
                        contractTerms: {
                            type: "HUUR",
                            monthlyRentCents: "135000",
                            depositCents: "135000",
                        },
                        handoverDetails: {
                            date: daysFromNow(-10).toISOString(),
                            location: "Kinkerstraat 74A, Amsterdam",
                        },
                        completedAt: daysFromNow(-2),
                        version: 2,
                        createdAt: daysFromNow(-55),
                        updatedAt: daysFromNow(-2),
                        milestones: {
                            create: [
                                {
                                    type: "PURCHASE_AGREEMENT",
                                    title: "Huurovereenkomst",
                                    status: "COMPLETED",
                                    sortOrder: 1,
                                    dueAt: daysFromNow(-52),
                                    completedAt: daysFromNow(-50),
                                },
                                {
                                    type: "COOLING_OFF_PERIOD",
                                    title: "Wettelijke bedenktijd",
                                    status: "WAIVED",
                                    sortOrder: 2,
                                    dueAt: daysFromNow(-52),
                                    completedAt: daysFromNow(-52),
                                },
                                {
                                    type: "FINANCING",
                                    title: "Financiering",
                                    status: "WAIVED",
                                    sortOrder: 3,
                                    dueAt: daysFromNow(-50),
                                    completedAt: daysFromNow(-50),
                                },
                                {
                                    type: "BUILDING_INSPECTION",
                                    title: "Bouwkundige keuring",
                                    status: "WAIVED",
                                    sortOrder: 4,
                                    dueAt: daysFromNow(-50),
                                    completedAt: daysFromNow(-50),
                                },
                                {
                                    type: "SECURITY_DEPOSIT",
                                    title: "Waarborgsom",
                                    status: "COMPLETED",
                                    sortOrder: 5,
                                    dueAt: daysFromNow(-45),
                                    completedAt: daysFromNow(-40),
                                },
                                {
                                    type: "NOTARY_SELECTION",
                                    title: "Kiezen notaris",
                                    status: "WAIVED",
                                    sortOrder: 6,
                                    dueAt: daysFromNow(-50),
                                    completedAt: daysFromNow(-50),
                                },
                                {
                                    type: "DEED_OF_TRANSFER",
                                    title: "Leveringsakte",
                                    status: "WAIVED",
                                    sortOrder: 7,
                                    dueAt: daysFromNow(-50),
                                    completedAt: daysFromNow(-50),
                                },
                                {
                                    type: "FINAL_INSPECTION",
                                    title: "Eindinspectie",
                                    status: "COMPLETED",
                                    sortOrder: 8,
                                    dueAt: daysFromNow(-12),
                                    completedAt: daysFromNow(-11),
                                },
                                {
                                    type: "KEY_HANDOVER",
                                    title: "Sleuteloverdracht",
                                    status: "COMPLETED",
                                    sortOrder: 9,
                                    dueAt: daysFromNow(-10),
                                    completedAt: daysFromNow(-10),
                                },
                            ],
                        },
                    },
                });
                await tx.transactionMessage.create({
                    data: {
                        transactionId: tOudwest.id,
                        authorUserId: users.pieter.id,
                        kind: "TEXT",
                        body: "Lisa, welkom in je nieuwe woning! Veel plezier in Oud-West.",
                        createdAt: daysFromNow(-10),
                    },
                });
                const oudwestEvents: Array<
                    [TransactionEventType, string | null, unknown, Date]
                > = [
                    [
                        "ROOM_CREATED",
                        "pieter",
                        { acceptedBidId: bidChains.oudwest[0].id },
                        daysFromNow(-55),
                    ],
                    [
                        "MILESTONE_UPDATED",
                        "pieter",
                        { type: "PURCHASE_AGREEMENT", status: "COMPLETED" },
                        daysFromNow(-50, 1),
                    ],
                    [
                        "DOCUMENT_UPLOADED",
                        "pieter",
                        { category: "PURCHASE_AGREEMENT" },
                        daysFromNow(-50, 2),
                    ],
                    [
                        "MESSAGE_SENT",
                        "pieter",
                        { preview: "Welkom in je nieuwe woning" },
                        daysFromNow(-10, 10),
                    ],
                    [
                        "HANDOVER_UPDATED",
                        "pieter",
                        { date: daysFromNow(-10, 12).toISOString() },
                        daysFromNow(-10, 12),
                    ],
                    [
                        "TRANSACTION_COMPLETED",
                        "pieter",
                        { completedAt: daysFromNow(-2, 10).toISOString() },
                        daysFromNow(-2, 10),
                    ],
                ];
                for (const [
                    type,
                    actorKey,
                    payload,
                    occurredAt,
                ] of oudwestEvents) {
                    await appendTransactionEvent(
                        tx,
                        tOudwest.id,
                        actorKey ? users[actorKey].id : null,
                        type,
                        payload,
                        occurredAt,
                    );
                }
                await createTransactionDocument(
                    tOudwest.id,
                    users.pieter.id,
                    "PURCHASE_AGREEMENT",
                    "huurovereenkomst.pdf",
                    "Huurovereenkomst - Kinkerstraat 74A, Amsterdam",
                    "Getekende huurovereenkomst voor het appartement.",
                );
                // Berichten van vóór de huur worden overgezet naar de chat van
                // de transactieruimte (zelfde uitkomst als de runtime-transfer
                // in transferListingMessagesToTransaction).
                for (const message of oudwestPreMessages) {
                    await tx.transactionMessage.create({
                        data: {
                            transactionId: tOudwest.id,
                            authorUserId: message.authorUserId,
                            kind: "TEXT",
                            body: message.body,
                            createdAt: message.createdAt,
                        },
                    });
                }
                await tx.transactionMessage.create({
                    data: {
                        transactionId: tOudwest.id,
                        authorUserId: users.lisa.id,
                        kind: "SYSTEM",
                        body: `${oudwestPreMessages.length} berichten van vóór de huur zijn overgezet naar deze transactiechat.`,
                        createdAt: daysFromNow(-55),
                    },
                });
                await tx.listingMessage.updateMany({
                    where: {
                        id: {
                            in: oudwestPreMessages.map((message) => message.id),
                        },
                    },
                    data: {
                        transferredToTransactionId: tOudwest.id,
                        transferredAt: daysFromNow(-55),
                    },
                });

                // ---- 13. Property passport versions ----------------------
                async function buildSnapshot(listingKey: string) {
                    const listing = listings[listingKey];
                    return {
                        titleNl: listingKey,
                        titleEn: listingKey,
                        descriptionNl: "ZelfWonen ontwikkel-seed",
                        descriptionEn: "ZelfWonen development seed",
                        askingPriceCents:
                            listing.askingPriceCents?.toString() ?? null,
                        monthlyRentCents:
                            listing.monthlyRentCents?.toString() ?? null,
                        serviceCostsCents: null,
                        availableFrom: null,
                        attributes: { condition: "GOOD" },
                        property: {
                            postcode: "1012AB",
                            houseNumber: 1,
                            city: "Amsterdam",
                            propertyType: "HOUSE",
                            livingAreaSqm: 100,
                            roomCount: 4,
                            constructionYear: 1990,
                        },
                        media: (mediaByListing[listingKey] ?? []).map(
                            (mediaId, index) => ({
                                id: mediaId,
                                kind: "PHOTO",
                                sha256: sha256(`dev:${listing.id}:${index}`),
                                fileName: `foto-${index}.jpg`,
                                mimeType: "image/jpeg",
                                sizeBytes: (
                                    1800000 +
                                    index * 100000
                                ).toString(),
                            }),
                        ),
                        floorPlans: [],
                    };
                }

                await createPassportVersion(
                    tx,
                    listings.oudwijk,
                    await buildSnapshot("oudwijk"),
                    86,
                    users.jan.id,
                    daysFromNow(-6),
                );
                await createPassportVersion(
                    tx,
                    listings.rotterdam,
                    await buildSnapshot("rotterdam"),
                    92,
                    users.sanne.id,
                    daysFromNow(-40),
                );
                await createPassportVersion(
                    tx,
                    listings.rotterdam,
                    await buildSnapshot("rotterdam"),
                    95,
                    users.sanne.id,
                    daysFromNow(-6),
                );
                await createPassportVersion(
                    tx,
                    listings.oudwest,
                    await buildSnapshot("oudwest"),
                    88,
                    users.pieter.id,
                    daysFromNow(-55),
                );

                // Bewerkbare paspoort-drafts (verkoper/verhuurder vult deze aan
                // in de transactieruimte; wijzigingen leggen automatisch een
                // nieuwe versie vast).
                await tx.propertyPassportDraft.create({
                    data: {
                        listingId: listings.oudwijk.id,
                        fields: {
                            condition: "GOOD",
                            lastInspectionAt: "2026-05-01",
                            renovationYear: 2020,
                            solarPanelWattage: 4200,
                            heatPump: true,
                            boilerYear: 2019,
                            insulation: ["DAK", "SPOUWMUUR", "HR_GLAS"],
                            features:
                                "Woonkamer met open haard, zonnepanelen en warmtepomp.",
                            notes: "De dakisolatie is in 2020 vernieuwd; de woning verkeert in een goede onderhoudsstaat.",
                        } as Prisma.InputJsonValue,
                        createdByUserId: users.jan.id,
                    },
                });
                await tx.propertyPassportDraft.create({
                    data: {
                        listingId: listings.rotterdam.id,
                        fields: {
                            condition: "EXCELLENT",
                            lastInspectionAt: "2026-03-12",
                            solarPanelWattage: 2800,
                            heatPump: false,
                            boilerYear: 2021,
                            insulation: ["DUBBEL_GLAS", "VLOER"],
                            vve: {
                                name: "VvE Coolsingel 15",
                                monthlyContributionCents: 18500,
                                reserveFundCents: 7500000,
                                contactEmail: "vve@coolsingel15.nl",
                            },
                            features: "Nieuw appartement met lift en berging.",
                        } as Prisma.InputJsonValue,
                        createdByUserId: users.sanne.id,
                    },
                });

                // ---- 14. Audit events ------------------------------------
                const auditSpecs: Array<{
                    aggregate: string;
                    listingKey: string | null;
                    actorKey: string | null;
                    eventType: string;
                    payload: unknown;
                    daysAgo: number;
                }> = [
                    {
                        aggregate: "listing:gracht",
                        listingKey: "gracht",
                        actorKey: "jan",
                        eventType: "LISTING_CREATED",
                        payload: { purpose: "SALE" },
                        daysAgo: -20,
                    },
                    {
                        aggregate: "listing:gracht",
                        listingKey: "gracht",
                        actorKey: "jan",
                        eventType: "LISTING_VERIFIED",
                        payload: { verifier: "PLATFORM" },
                        daysAgo: -12,
                    },
                    {
                        aggregate: "listing:gracht",
                        listingKey: "gracht",
                        actorKey: "jan",
                        eventType: "LISTING_PUBLISHED",
                        payload: { channels: ["PLATFORM"] },
                        daysAgo: -10,
                    },
                    {
                        aggregate: "listing:gracht",
                        listingKey: "gracht",
                        actorKey: "thomas",
                        eventType: "BID_SUBMITTED",
                        payload: { amountCents: 59000000 },
                        daysAgo: -5,
                    },
                    {
                        aggregate: "listing:gracht",
                        listingKey: "gracht",
                        actorKey: "lisa",
                        eventType: "BID_SUBMITTED",
                        payload: { amountCents: 59250000 },
                        daysAgo: -3,
                    },
                    {
                        aggregate: "listing:gracht",
                        listingKey: "gracht",
                        actorKey: "david",
                        eventType: "BID_SUBMITTED",
                        payload: { amountCents: 59500000 },
                        daysAgo: -1,
                    },
                    {
                        aggregate: "listing:oudwijk",
                        listingKey: "oudwijk",
                        actorKey: "jan",
                        eventType: "LISTING_CREATED",
                        payload: { purpose: "SALE" },
                        daysAgo: -20,
                    },
                    {
                        aggregate: "listing:oudwijk",
                        listingKey: "oudwijk",
                        actorKey: "jan",
                        eventType: "LISTING_PUBLISHED",
                        payload: { channels: ["PLATFORM"] },
                        daysAgo: -12,
                    },
                    {
                        aggregate: "listing:oudwijk",
                        listingKey: "oudwijk",
                        actorKey: "thomas",
                        eventType: "BID_SUBMITTED",
                        payload: { amountCents: 52500000 },
                        daysAgo: -6,
                    },
                    {
                        aggregate: "listing:oudwijk",
                        listingKey: "oudwijk",
                        actorKey: "jan",
                        eventType: "BID_ACCEPTED",
                        payload: { bidId: bidChains.oudwijk[2].id },
                        daysAgo: -6,
                    },
                    {
                        aggregate: "listing:oudwijk",
                        listingKey: "oudwijk",
                        actorKey: "jan",
                        eventType: "TRANSACTION_CREATED",
                        payload: { transactionId: tOudwijk.id },
                        daysAgo: -6,
                    },
                    {
                        aggregate: "listing:rotterdam",
                        listingKey: "rotterdam",
                        actorKey: "sanne",
                        eventType: "LISTING_CREATED",
                        payload: { purpose: "SALE" },
                        daysAgo: -55,
                    },
                    {
                        aggregate: "listing:rotterdam",
                        listingKey: "rotterdam",
                        actorKey: "sanne",
                        eventType: "LISTING_PUBLISHED",
                        payload: { channels: ["PLATFORM"] },
                        daysAgo: -45,
                    },
                    {
                        aggregate: "listing:rotterdam",
                        listingKey: "rotterdam",
                        actorKey: "sanne",
                        eventType: "BID_ACCEPTED",
                        payload: { bidId: bidChains.rotterdam[1].id },
                        daysAgo: -40,
                    },
                    {
                        aggregate: "listing:rotterdam",
                        listingKey: "rotterdam",
                        actorKey: "sanne",
                        eventType: "TRANSACTION_COMPLETED",
                        payload: { transactionId: tRotterdam.id },
                        daysAgo: -5,
                    },
                    {
                        aggregate: "listing:oudwest",
                        listingKey: "oudwest",
                        actorKey: "pieter",
                        eventType: "LISTING_CREATED",
                        payload: { purpose: "RENT" },
                        daysAgo: -70,
                    },
                    {
                        aggregate: "listing:oudwest",
                        listingKey: "oudwest",
                        actorKey: "pieter",
                        eventType: "TRANSACTION_COMPLETED",
                        payload: { transactionId: tOudwest.id },
                        daysAgo: -2,
                    },
                ];
                for (const spec of auditSpecs) {
                    await appendAuditEvent(tx, {
                        aggregateType: "LISTING",
                        aggregateId: spec.aggregate,
                        actorUserId: spec.actorKey
                            ? users[spec.actorKey].id
                            : null,
                        listingId: spec.listingKey
                            ? listings[spec.listingKey].id
                            : null,
                        eventType: spec.eventType,
                        payload: spec.payload,
                        occurredAt: daysFromNow(spec.daysAgo),
                    });
                }

                // ---- 15. Bid logbook exports -----------------------------
                // Matches the on-demand service layout: .data/logbooks/{listingId}/{id}.pdf
                async function createLogbookExport(
                    listingId: string,
                    exportId: string,
                    headHash: string,
                    generatedAt: Date,
                    sharedAt: Date | null,
                    recipientCount: number,
                ) {
                    const relativeKey = `logbooks/${listingId}/${exportId}.pdf`;
                    const bytes = await writeDummyPdf(
                        path.join(DATA_ROOT, "logbooks", listingId),
                        `${exportId}.pdf`,
                        "Anonymized bidding logbook",
                        "Development seed logbook (dummy PDF).",
                    );
                    return tx.bidLogbookExport.create({
                        data: {
                            listingId,
                            storageKey: relativeKey,
                            documentSha256: createHash("sha256")
                                .update(bytes)
                                .digest("hex"),
                            logbookHeadHash: headHash,
                            anonymizationVersion: "v1",
                            generatedAt,
                            sharedAt,
                            recipientCount,
                        },
                    });
                }

                await createLogbookExport(
                    listings.oudwijk.id,
                    "oudwijk-v1",
                    bidChains.oudwijk.at(-1)!.entryHash,
                    daysFromNow(-5),
                    null,
                    0,
                );
                await createLogbookExport(
                    listings.rotterdam.id,
                    "rotterdam-v1",
                    bidChains.rotterdam.at(-1)!.entryHash,
                    daysFromNow(-4),
                    daysFromNow(-3),
                    2,
                );

                // ---- 16. Estimator caches + postcode price stats ---------
                await tx.estimateCache.createMany({
                    data: [
                        {
                            inputHash: sha256("input:1012AB:48:APARTMENT:132"),
                            normalizedInput: {
                                postcode: "1012AB",
                                houseNumber: 48,
                                propertyType: "APARTMENT",
                                livingAreaSqm: 132,
                            },
                            qualitativeFeatures: {
                                condition: "EXCELLENT",
                                monument: true,
                                rooms: 5,
                            },
                            imageHashes: [],
                            tier: "MULTIMODAL_ML",
                            estimatedValueCents: BigInt(61200000),
                            lowerBoundCents: BigInt(57800000),
                            upperBoundCents: BigInt(64600000),
                            confidenceBasisPoints: 9200,
                            llmModelVersion: "gpt-4.1-mini",
                            mlModelVersion: "estimator-0.3.0",
                            publicDatasetVersion: "woningwaarde-2025",
                            explanation: {
                                summary:
                                    "Grachtpand met monumentstatus en uitstekende staat.",
                            },
                            createdAt: daysFromNow(-3),
                            expiresAt: daysFromNow(27),
                        },
                        {
                            inputHash: sha256("input:1093PN:22:HOUSE:165"),
                            normalizedInput: {
                                postcode: "1093PN",
                                houseNumber: 22,
                                propertyType: "HOUSE",
                                livingAreaSqm: 165,
                            },
                            qualitativeFeatures: {
                                condition: "GOOD",
                                energyLabel: "A",
                                rooms: 6,
                            },
                            imageHashes: [],
                            tier: "BASIC_ML",
                            estimatedValueCents: BigInt(81500000),
                            lowerBoundCents: BigInt(77500000),
                            upperBoundCents: BigInt(85500000),
                            confidenceBasisPoints: 8800,
                            mlModelVersion: "estimator-0.3.0",
                            publicDatasetVersion: "woningwaarde-2025",
                            explanation: {
                                summary:
                                    "Ruime eengezinswoning met duurzame installaties.",
                            },
                            createdAt: daysFromNow(-2),
                            expiresAt: daysFromNow(28),
                        },
                        {
                            inputHash: sha256("input:3011CC:15:APARTMENT:88"),
                            normalizedInput: {
                                postcode: "3011CC",
                                houseNumber: 15,
                                propertyType: "APARTMENT",
                                livingAreaSqm: 88,
                            },
                            tier: "POSTCODE_SQM",
                            estimatedValueCents: BigInt(39800000),
                            lowerBoundCents: BigInt(36800000),
                            upperBoundCents: BigInt(42800000),
                            confidenceBasisPoints: 7900,
                            publicDatasetVersion: "nvm-2025-q1",
                            explanation: {
                                summary:
                                    "Op basis van postcodesector en vierkante meters.",
                            },
                            createdAt: daysFromNow(-1),
                            expiresAt: daysFromNow(29),
                        },
                    ],
                });

                await tx.postcodePriceStat.createMany({
                    data: [
                        {
                            postcodeSector: "1012",
                            propertyType: "APARTMENT",
                            averagePricePerSqmCents: BigInt(858000),
                            sampleSize: 412,
                            source: "NVM_DEV",
                            datasetVersion: "2025.Q1",
                            effectiveAt: daysFromNow(-30),
                        },
                        {
                            postcodeSector: "1093",
                            propertyType: "HOUSE",
                            averagePricePerSqmCents: BigInt(745000),
                            sampleSize: 238,
                            source: "NVM_DEV",
                            datasetVersion: "2025.Q1",
                            effectiveAt: daysFromNow(-30),
                        },
                        {
                            postcodeSector: "3581",
                            propertyType: "HOUSE",
                            averagePricePerSqmCents: BigInt(622000),
                            sampleSize: 176,
                            source: "NVM_DEV",
                            datasetVersion: "2025.Q1",
                            effectiveAt: daysFromNow(-30),
                        },
                        {
                            postcodeSector: "3011",
                            propertyType: "APARTMENT",
                            averagePricePerSqmCents: BigInt(488000),
                            sampleSize: 301,
                            source: "NVM_DEV",
                            datasetVersion: "2025.Q1",
                            effectiveAt: daysFromNow(-30),
                        },
                    ],
                });

                // ---- 17. Re-enable append-only triggers ------------------
                for (const table of APPEND_ONLY_TABLES) {
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE "${table}" ENABLE TRIGGER ALL`,
                    );
                }
            },
            { timeout: 180_000, maxWait: 15_000 },
        );

        // ---- Summary ------------------------------------------------------
        const counts = {
            users: await prisma.user.count(),
            properties: await prisma.property.count(),
            listings: await prisma.listing.count(),
            bids: await prisma.bid.count(),
            bidEvents: await prisma.bidEvent.count(),
            transactions: await prisma.propertyTransaction.count(),
            passportVersions: await prisma.propertyPassportVersion.count(),
            publications: await prisma.listingPublication.count(),
            viewingSlots: await prisma.viewingSlot.count(),
        };

        console.log("");
        console.log(
            "============================================================",
        );
        console.log("  ZelfWonen dev seed completed successfully");
        console.log(
            "============================================================",
        );
        console.log(`  users:             ${counts.users}`);
        console.log(`  properties:        ${counts.properties}`);
        console.log(`  listings:          ${counts.listings}`);
        console.log(
            `  bids / events:     ${counts.bids} / ${counts.bidEvents}`,
        );
        console.log(`  transactions:      ${counts.transactions}`);
        console.log(`  passport versions: ${counts.passportVersions}`);
        console.log(`  publications:      ${counts.publications}`);
        console.log(`  viewing slots:     ${counts.viewingSlots}`);
        console.log("");
        console.log("  Login credentials (all accounts):");
        console.log(`    password: ${SEED_PASSWORD}`);
        console.log("    owners:");
        console.log(
            "      jan.devries@example.dev       Jan de Vries (listings, bids, transactions)",
        );
        console.log(
            "      sanne.bakker@example.dev      Sanne Bakker (sold listing, parking)",
        );
        console.log(
            "      mohamed.elamrani@example.dev  Mohamed El Amrani (Den Haag, drafts)",
        );
        console.log(
            "      anouk.jansen@example.dev      Anouk Jansen (ready-for-verification, archived)",
        );
        console.log(
            "      pieter.visser@example.dev     Pieter Visser (rentals)",
        );
        console.log("    seekers:");
        console.log(
            "      thomas.mulder@example.dev     Thomas Mulder (buyer in under-offer deal)",
        );
        console.log(
            "      lisa.vandijk@example.dev      Lisa van Dijk (buyer/renter, completed deals)",
        );
        console.log(
            "      david.deboer@example.dev      David de Boer (bids, shortlist)",
        );
        console.log(
            "      femke.smit@example.dev        Femke Smit (bids, failed identity attempt)",
        );
        console.log(
            "      bram.willems@example.dev      Bram Willems (EN locale, pending identity)",
        );
        console.log("");
        console.log("  2FA is disabled on all seed accounts so you can log in");
        console.log(
            "  immediately. Enable it in Account settings to test TOTP.",
        );
        console.log(
            "============================================================",
        );
    } catch (error) {
        console.error("[seed] Seeding failed:", error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
