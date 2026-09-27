import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { db } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";
import { identityProvider, identityVerificationTtlMs, latestVerifiedIdentity } from "../src/features/identity/identity-service";
import { GET as retiredCallback } from "../src/app/api/idin/callback/route";
import { POST as retiredStart } from "../src/app/api/listings/[listingId]/idin/start/route";

const originalLookup = db.identityVerificationAttempt.findFirst;
const saved = { NODE_ENV: process.env.NODE_ENV, ENVIRONMENT: process.env.ENVIRONMENT, DIDIT_MODE: process.env.DIDIT_MODE, IDENTITY_VERIFICATION_TTL_DAYS: process.env.IDENTITY_VERIFICATION_TTL_DAYS };
afterEach(() => {
    Reflect.set(db.identityVerificationAttempt, "findFirst", originalLookup);
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = value;
    }
});

test("persistent cache is scoped to the user and Didit, bounded by TTL and expiry", async () => {
    Object.assign(process.env, { NODE_ENV: "production", DIDIT_MODE: "sandbox", IDENTITY_VERIFICATION_TTL_DAYS: "30" });
    const now = Date.now();
    const cached = { id: "approved", completedAt: new Date(now - 1000), expiresAt: new Date(now + 1000) };
    Reflect.set(db.identityVerificationAttempt, "findFirst", async (args: Prisma.IdentityVerificationAttemptFindFirstArgs) => {
        assert.equal(args.where?.userId, "owner");
        assert.equal(args.where?.provider, "DIDIT");
        assert.equal(args.where?.listingId, undefined, "cache must work across listings");
        assert.equal(args.where?.status, "VERIFIED");
        const completed = args.where?.completedAt as Prisma.DateTimeNullableFilter;
        assert.ok(Math.abs(new Date(completed.gte as Date).getTime() - (now - 30 * 86_400_000)) < 1000);
        assert.ok(completed.lte, "future approval dates must not verify users");
        assert.deepEqual(args.where?.OR, [{ expiresAt: null }, { expiresAt: { gt: completed.lte } }]);
        return cached;
    });
    assert.deepEqual(await latestVerifiedIdentity("owner"), cached);
});

test("sandbox cache is available only in explicitly configured nonproduction mode", () => {
    Object.assign(process.env, { NODE_ENV: "development", ENVIRONMENT: "development", DIDIT_MODE: "sandbox" });
    assert.equal(identityProvider(), "DIDIT_SANDBOX");
    process.env.ENVIRONMENT = "production";
    assert.equal(identityProvider(), "DIDIT");
    process.env.ENVIRONMENT = "development";
    process.env.DIDIT_MODE = "live";
    assert.equal(identityProvider(), "DIDIT");
});

test("invalid TTL fails closed rather than silently caching indefinitely", () => {
    delete process.env.IDENTITY_VERIFICATION_TTL_DAYS;
    assert.equal(identityVerificationTtlMs(), 365 * 86_400_000);
    for (const value of ["", "0", "-1", "NaN", "Infinity", "99999"]) {
        process.env.IDENTITY_VERIFICATION_TTL_DAYS = value;
        assert.throws(identityVerificationTtlMs);
    }
});

test("retired iDIN entry points cannot start or complete verification", async () => {
    for (const handler of [retiredCallback, retiredStart]) {
        const response = handler();
        assert.equal(response.status, 410);
        assert.equal((await response.json()).error.code, "IDIN_RETIRED");
    }
});
