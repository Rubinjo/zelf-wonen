import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, mock, test } from "node:test";
import { db } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";
import { applyDiditResult, diditBudgetWhere, DIDIT_MONTHLY_LIMIT, diditStatus, startDiditVerification } from "../src/features/identity/didit-service";
import { diditConfig, diditSessionUrl, verifyDiditWebhook } from "../src/lib/integrations/identity/didit-client";

const workflowId = "153b0cdd-ecb6-4d88-a693-a5512a8a2e93";
const sessionId = "15c23a58-e1bd-4830-b3ca-d84c1e164550";
const userId = "bf61e63c-78f7-46f7-9cdb-c262c595770b";
const listingId = "dd205eaa-657d-4c6b-a9b5-3942c579fa8d";
const restores: Array<() => void> = [];
afterEach(() => { restores.splice(0).reverse().forEach(restore => restore()); mock.restoreAll(); });

function stub<F extends (...args: never[]) => unknown>(target: object, key: string, implementation: F) {
    const original = Reflect.get(target, key);
    const fn = mock.fn(implementation);
    Reflect.set(target, key, fn);
    restores.push(() => { Reflect.set(target, key, original); });
    return fn;
}

function configure() {
    const values = {
        DIDIT_API_KEY: "test-api-key", DIDIT_WEBHOOK_SECRET: "test-secret",
        DIDIT_WORKFLOW_ID: workflowId, DIDIT_MODE: "live", NEXT_PUBLIC_APP_URL: "https://example.com",
    };
    const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    Object.assign(process.env, values);
    restores.push(() => {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) Reflect.deleteProperty(process.env, key);
            else process.env[key] = value;
        }
    });
}

type Attempt = {
    id: string; userId: string; listingId: string; provider: string; providerReference: string;
    purpose: string; status: string; attributesMatched: Prisma.JsonValue; requestedAt: Date;
    completedAt?: Date | null;
    expiresAt?: Date | null;
};

function setup(used = 0) {
    configure();
    const attempts: Attempt[] = [];
    let tail = Promise.resolve();
    // Model transaction serialization and verify that the service requests the shared DB lock.
    stub(db, "$transaction", async (fn: (tx: typeof db) => Promise<unknown>) => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try { return await fn(db); } finally { release(); }
    });
    const locks = stub(db, "$executeRaw", async () => 1);
    const listing = stub(db.listing, "findFirst", async () => ({ status: "READY_FOR_VERIFICATION" }) as unknown);
    stub(db.identityVerificationAttempt, "findFirst", async (args: Prisma.IdentityVerificationAttemptFindFirstArgs) => {
        const where = args.where!;
        if (where.id) return attempts.find(item => item.id === where.id && item.provider === where.provider) ?? null;
        if (where.status === "VERIFIED") return attempts.find(item => item.userId === where.userId && item.status === "VERIFIED") ?? null;
        return attempts.find(item => item.userId === where.userId && item.provider === where.provider && ["INITIATED", "PENDING"].includes(item.status)) ?? null;
    });
    const count = stub(db.identityVerificationAttempt, "count", async () => used + attempts.length);
    stub(db.identityVerificationAttempt, "create", async (args: Prisma.IdentityVerificationAttemptCreateArgs) => {
        const attempt = args.data as unknown as Attempt;
        attempts.push(attempt);
        return attempt;
    });
    stub(db.identityVerificationAttempt, "updateMany", async (args: Prisma.IdentityVerificationAttemptUpdateManyArgs) => {
        const attempt = attempts.find(item => item.id === args.where?.id && ["INITIATED", "PENDING"].includes(item.status));
        if (attempt) Object.assign(attempt, args.data);
        return { count: attempt ? 1 : 0 };
    });
    stub(db.identityVerificationAttempt, "update", async (args: Prisma.IdentityVerificationAttemptUpdateArgs) => {
        const attempt = attempts.find(item => item.id === args.where.id)!;
        Object.assign(attempt, args.data);
        return attempt;
    });
    const audit = stub(db.auditEvent, "create", async () => ({}));
    const fetchMock = stub(globalThis, "fetch", async (url: string, init: RequestInit) => {
        assert.equal(url, "https://verification.didit.me/v3/session/");
        const body = JSON.parse(String(init.body));
        assert.equal(body.workflow_id, workflowId);
        assert.ok(attempts.some(attempt => attempt.id === body.vendor_data), "Reservation must exist before POST");
        return Response.json({ session_id: sessionId, workflow_id: workflowId, vendor_data: body.vendor_data, status: "Not Started", url: "https://verify.didit.me/session/test" });
    });
    return { attempts, locks, listing, count, audit, fetchMock };
}

const start = (id = userId) => startDiditVerification({ listingId, userId: id, locale: "nl" });

test("at 499 the limit produces HTTP 429 and no provider call", async () => {
    const { attempts, fetchMock } = setup(499);
    await assert.rejects(start(), { code: "VERIFICATION_LIMIT_REACHED", status: 429 });
    assert.equal(attempts.length, 0);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(DIDIT_MONTHLY_LIMIT, 499);
});

test("concurrent users competing for the last reservation cannot pass 499", async () => {
    const { attempts, fetchMock, locks } = setup(498);
    const results = await Promise.allSettled([start(), start("another-user")]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(attempts.length, 1);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.ok(locks.mock.callCount() >= 2);
});

test("pending sessions are reused and concurrent duplicate starts do not spend twice", async () => {
    const { fetchMock, attempts } = setup();
    await Promise.allSettled([start(), start()]);
    const result = await start();
    assert.equal(result.redirectUrl, "https://verify.didit.me/session/test");
    assert.equal(attempts.length, 1);
    assert.equal(fetchMock.mock.callCount(), 1);
});

test("timeouts keep their reservation and block a second POST", async () => {
    const { fetchMock, attempts } = setup();
    fetchMock.mock.mockImplementation(async () => { throw new Error("timeout"); });
    await assert.rejects(start(), { code: "DIDIT_UNAVAILABLE" });
    assert.equal(attempts[0].status, "INITIATED");
    await assert.rejects(start(), { code: "VERIFICATION_PENDING" });
    assert.equal(fetchMock.mock.callCount(), 1);
});

test("quota uses UTC months and includes previous unresolved or newly completed sessions", () => {
    assert.deepEqual(diditBudgetWhere(new Date("2026-10-01T00:30:00+02:00")), {
        provider: { in: ["DIDIT", "DIDIT_SANDBOX"] },
        OR: [
            { requestedAt: { gte: new Date("2026-09-01T00:00:00Z") } },
            { completedAt: { gte: new Date("2026-09-01T00:00:00Z") } },
            { status: { in: ["INITIATED", "PENDING"] } },
        ],
    });
    assert.deepEqual(diditBudgetWhere(new Date("2026-10-01T00:00:00Z")).OR?.[0], { requestedAt: { gte: new Date("2026-10-01T00:00:00Z") } });
});

test("verified accounts bypass quota without creating a new session", async () => {
    const { attempts, count, fetchMock } = setup(499);
    attempts.push({ id: "old", userId, listingId, provider: "DIDIT", providerReference: sessionId, purpose: "LISTING_PUBLICATION", status: "VERIFIED", attributesMatched: {}, requestedAt: new Date(), completedAt: new Date() });
    assert.equal((await start()).alreadyVerified, true);
    assert.equal(count.mock.callCount(), 0);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("nonowners and incomplete listings cannot consume quota", async () => {
    const { listing, count } = setup();
    listing.mock.mockImplementationOnce(async () => null);
    await assert.rejects(start(), { status: 404 });
    listing.mock.mockImplementationOnce(async () => ({ status: "DRAFT" }));
    await assert.rejects(start(), { status: 409 });
    assert.equal(count.mock.callCount(), 0);
});

test("only a bound live decision verifies the account; repeated results are idempotent", async () => {
    const { attempts, audit, fetchMock } = setup();
    await start();
    const decision = { session_id: sessionId, workflow_id: workflowId, vendor_data: attempts[0].id, status: "Approved", environment: "live" as const };
    await assert.rejects(applyDiditResult({ ...decision, environment: "sandbox" }), { code: "INVALID_DIDIT_CALLBACK" });
    await assert.rejects(applyDiditResult({ ...decision, workflow_id: sessionId }), { code: "INVALID_DIDIT_CALLBACK" });
    await assert.rejects(applyDiditResult({ ...decision, session_id: workflowId }), { code: "INVALID_DIDIT_CALLBACK" });
    assert.equal(attempts[0].status, "PENDING");
    await applyDiditResult(decision);
    await applyDiditResult(decision);
    assert.equal(attempts[0].status, "VERIFIED");
    assert.ok(attempts[0].expiresAt && attempts[0].completedAt && attempts[0].expiresAt > attempts[0].completedAt);
    assert.equal(audit.mock.callCount(), 1);
    assert.equal((await start()).alreadyVerified, true);
    // A cached approval is independent of the listing and provider availability.
    process.env.DIDIT_API_KEY = "";
    assert.equal((await startDiditVerification({ listingId: sessionId, userId, locale: "nl" })).alreadyVerified, true);
    assert.equal(fetchMock.mock.callCount(), 1);
});

test("in-review, declined and unknown provider statuses never grant verification", () => {
    assert.equal(diditStatus("In Review"), "PENDING");
    assert.equal(diditStatus("Declined"), "FAILED");
    assert.equal(diditStatus("APPROVED"), "VERIFIED");
    assert.throws(() => diditStatus("success"));
    assert.throws(() => diditSessionUrl("https://verify.didit.me.attacker.example/session/test"));
});

test("webhook HMAC authenticates raw Unicode bytes and signed timestamp", () => {
    const timestamp = 1790812800;
    const body = Buffer.from(JSON.stringify({ session_id: sessionId, workflow_id: workflowId, vendor_data: userId, status: "Approved", timestamp, webhook_type: "status.updated", extra: "José" }));
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    const headers = new Headers({ "x-signature": signature, "x-timestamp": String(timestamp) });
    assert.equal(verifyDiditWebhook(body, headers, "secret", timestamp * 1000).status, "Approved");
    assert.throws(() => verifyDiditWebhook(Buffer.from(body.toString().replace("Approved", "Declined")), headers, "secret", timestamp * 1000));
    assert.throws(() => verifyDiditWebhook(body, headers, "secret", (timestamp + 301) * 1000));
    headers.set("x-timestamp", String(timestamp + 1));
    assert.throws(() => verifyDiditWebhook(body, headers, "secret", (timestamp + 1) * 1000));
    assert.throws(() => verifyDiditWebhook(body, new Headers(), "secret", timestamp * 1000));
});

test("missing credentials fail closed before reserving quota", async () => {
    const { count, fetchMock } = setup();
    process.env.DIDIT_API_KEY = "";
    assert.throws(() => diditConfig(), { code: "DIDIT_UNAVAILABLE" });
    await assert.rejects(start(), { code: "DIDIT_UNAVAILABLE" });
    assert.equal(count.mock.callCount(), 0);
    assert.equal(fetchMock.mock.callCount(), 0);
});
