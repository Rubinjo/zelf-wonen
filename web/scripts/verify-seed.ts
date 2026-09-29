/**
 * ZelfWonen — verify the development seed.
 *
 * Connects to the LOCAL dev database and sanity-checks the seeded data:
 *   - row counts for the main models
 *   - seeded credential password actually verifies (login readiness)
 *   - every bid chain + bid event chain passes the app's own integrity checks
 *   - every transaction event chain and passport version chain re-hashes
 *
 * Run with:  npm run db:verify-seed
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { verifyPassword } from "@better-auth/utils/password";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
    verifyAndOrderBidChain,
    verifyAndOrderBidEventChain,
} from "@/features/bidding/bid-integrity";
import { chainedHash } from "@/features/transactions/transaction-service";

config({ path: ".env.local" });
config();

const SEED_PASSWORD = "DevPassw0rd!";
const SEED_EMAIL = "jan.devries@example.dev";
const DEV_FALLBACK_URL =
    "postgresql://zelfwonen:zelfwonen_dev_password@localhost:5432/zelfwonen?schema=public";

function assertLocalDb() {
    const url = process.env.DATABASE_URL ?? DEV_FALLBACK_URL;
    if (
        process.env.NODE_ENV === "production" ||
        !/localhost|127\.0\.0\.1|::1/.test(url)
    ) {
        throw new Error(
            "Refusing to verify: this script only runs against the local dev database.",
        );
    }
}

assertLocalDb();

const db = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL ?? DEV_FALLBACK_URL),
});

const PUBLIC_ROOT = path.resolve(process.cwd(), "public");
const DATA_ROOT = path.resolve(process.cwd(), ".data");

async function main() {
    const failures: string[] = [];
    const pass = (label: string) => console.log(`  ✓ ${label}`);
    const fail = (label: string, detail?: unknown) => {
        failures.push(label);
        console.log(
            `  ✗ ${label}${detail ? ` — ${JSON.stringify(detail)}` : ""}`,
        );
    };

    console.log("[verify-seed] Checking local dev database…\n");

    // ---- Row counts --------------------------------------------------
    const counts = {
        users: await db.user.count(),
        properties: await db.property.count(),
        listings: await db.listing.count(),
        bids: await db.bid.count(),
        bidEvents: await db.bidEvent.count(),
        transactions: await db.propertyTransaction.count(),
        passportVersions: await db.propertyPassportVersion.count(),
        passportDrafts: await db.propertyPassportDraft.count(),
        auditEvents: await db.auditEvent.count(),
        listingMessages: await db.listingMessage.count(),
    };
    for (const [label, value] of Object.entries(counts)) {
        if (value === 0) fail(`${label} is empty (got 0)`);
        else pass(`${label}: ${value}`);
    }

    // ---- Uniqueness / coverage sanity --------------------------------
    const slugDupes = await db.listing.groupBy({
        by: ["publicSlug"],
        where: { publicSlug: { not: null } },
        _count: { _all: true },
        having: { publicSlug: { _count: { gt: 1 } } },
    });
    if (slugDupes.length > 0) fail("duplicate publicSlug values found");
    else pass("publicSlug values are unique");

    const statusCoverage = await db.listing.groupBy({
        by: ["status"],
        _count: true,
    });
    const expectedStatuses = [
        "DRAFT",
        "READY_FOR_VERIFICATION",
        "LIVE",
        "UNDER_OFFER",
        "SOLD",
        "RENTED",
        "ARCHIVED",
    ];
    const present = new Set<string>(statusCoverage.map((s) => s.status));
    const missing = expectedStatuses.filter((s) => !present.has(s));
    if (missing.length > 0)
        fail(`listings missing statuses: ${missing.join(", ")}`);
    else pass(`all listing statuses present (${expectedStatuses.join(", ")})`);

    const purposeCoverage = await db.listing.groupBy({
        by: ["purpose"],
        _count: true,
    });
    const purposes = purposeCoverage.map((p) => p.purpose).join(", ");
    if (purposes.includes("SALE") && purposes.includes("RENT"))
        pass("both SALE and RENT listings present");
    else fail("expected both SALE and RENT listings");

    // ---- Files actually resolve -------------------------------------
    // Listing media is served from public/{storageKey} (UI uses `/${storageKey}`).
    const media = await db.listingMedia.findMany({
        where: { status: "READY" },
        select: { storageKey: true },
    });
    let missingMedia = 0;
    for (const item of media) {
        if (!existsSync(path.join(PUBLIC_ROOT, item.storageKey)))
            missingMedia += 1;
    }
    if (missingMedia > 0)
        fail(`${missingMedia} media file(s) missing on disk under public/`);
    else pass(`all ${media.length} media files resolve under public/`);

    // Transaction documents are read from .data/transaction-documents/{storageKey}.
    const documents = await db.transactionDocument.findMany({
        where: { status: "AVAILABLE" },
        select: { storageKey: true },
    });
    let missingDocs = 0;
    for (const doc of documents) {
        if (
            !existsSync(
                path.join(DATA_ROOT, "transaction-documents", doc.storageKey),
            )
        )
            missingDocs += 1;
    }
    if (missingDocs > 0)
        fail(`${missingDocs} transaction document(s) missing on disk`);
    else pass(`all ${documents.length} transaction documents resolve on disk`);

    // Logbook exports live in .data/logbooks/{storageKey}.
    const logbooks = await db.bidLogbookExport.findMany({
        select: { storageKey: true },
    });
    let missingLogbooks = 0;
    for (const book of logbooks) {
        if (!existsSync(path.join(DATA_ROOT, book.storageKey)))
            missingLogbooks += 1;
    }
    if (missingLogbooks > 0)
        fail(`${missingLogbooks} logbook export(s) missing on disk`);
    else pass(`all ${logbooks.length} logbook exports resolve on disk`);

    // ---- Credential login readiness ----------------------------------
    const account = await db.account.findFirst({
        where: {
            providerId: "credential",
            user: { email: SEED_EMAIL },
        },
        select: { password: true, user: { select: { emailVerified: true } } },
    });
    if (!account?.password) {
        fail(`no credential account for ${SEED_EMAIL}`);
    } else {
        const ok = await verifyPassword(account.password, SEED_PASSWORD);
        if (ok && account.user.emailVerified)
            pass(`credentials work for ${SEED_EMAIL}`);
        else
            fail(`credentials invalid or email not verified for ${SEED_EMAIL}`);
    }

    // ---- Bid chains ---------------------------------------------------
    const listings = await db.listing.findMany({
        where: { bids: { some: {} } },
        include: {
            bids: {
                orderBy: { submittedAt: "asc" },
                include: { events: { orderBy: { occurredAt: "asc" } } },
            },
        },
    });

    for (const listing of listings) {
        // The app always stringifies BigInt amounts and normalizes dates before
        // verifying (see submit-bid.ts and the bid decision route). Mirror that.
        const orderedBids = verifyAndOrderBidChain(
            listing.bids.map((bid) => ({
                ...bid,
                amountCents: bid.amountCents.toString(),
                financingDeadline: bid.financingDeadline?.toISOString() ?? null,
                transferDateRequested:
                    bid.transferDateRequested?.toISOString() ?? null,
                submittedAt: bid.submittedAt.toISOString(),
            })),
        );
        if (!orderedBids) {
            fail(`bid chain invalid for listing ${listing.id}`);
            continue;
        }
        pass(
            `bid chain ok: listing ${listing.id} (${orderedBids.length} bids)`,
        );

        for (const bid of listing.bids) {
            const events = verifyAndOrderBidEventChain(
                bid.events.map((event) => ({
                    ...event,
                    occurredAt: event.occurredAt.toISOString(),
                })),
                bid.entryHash,
            );
            if (!events || events[0]?.type !== "SUBMITTED") {
                fail(`bid event chain invalid for bid ${bid.id}`);
            } else {
                pass(
                    `  event chain ok: bid ${bid.id} (${events.length} events)`,
                );
            }
        }
    }

    // ---- Transaction event chains ------------------------------------
    const transactions = await db.propertyTransaction.findMany({
        include: {
            events: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] },
        },
    });
    for (const txn of transactions) {
        let previous: string | null = null;
        let ok = true;
        for (const event of txn.events) {
            const payload = {
                transactionId: event.transactionId,
                actorUserId: event.actorUserId,
                type: event.type,
                payload: event.payload,
                occurredAt: event.occurredAt.toISOString(),
            };
            const expected = chainedHash(previous, payload);
            if (
                event.previousHash !== previous ||
                event.entryHash !== expected
            ) {
                ok = false;
                break;
            }
            previous = event.entryHash;
        }
        if (ok)
            pass(
                `transaction event chain ok: ${txn.id} (${txn.events.length} events)`,
            );
        else fail(`transaction event chain invalid: ${txn.id}`);
    }

    // ---- Passport version chains -------------------------------------
    const passports = await db.propertyPassportVersion.findMany({
        orderBy: [{ listingId: "asc" }, { version: "asc" }],
    });
    const byListing = new Map<string, typeof passports>();
    for (const p of passports) {
        const list = byListing.get(p.listingId) ?? [];
        list.push(p);
        byListing.set(p.listingId, list);
    }
    for (const [listingId, versions] of byListing) {
        let previous: string | null = null;
        let ok = true;
        for (const v of versions) {
            const payload = {
                listingId: v.listingId,
                version: v.version,
                listingVersionSource: v.listingVersionSource,
                completenessScore: v.completenessScore,
                snapshot: v.snapshot,
                createdByUserId: v.createdByUserId,
                createdAt: v.createdAt.toISOString(),
            };
            const expected = chainedHash(previous, payload);
            if (v.previousHash !== previous || v.entryHash !== expected) {
                ok = false;
                break;
            }
            previous = v.entryHash;
        }
        if (ok)
            pass(
                `passport chain ok: listing ${listingId} (${versions.length} versions)`,
            );
        else fail(`passport chain invalid: listing ${listingId}`);
    }

    console.log("");
    if (failures.length === 0) {
        console.log("[verify-seed] All checks passed ✅");
    } else {
        console.log(`[verify-seed] ${failures.length} check(s) failed ❌`);
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error("[verify-seed] Failed", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.$disconnect();
    });
