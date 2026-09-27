import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { db } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";
import { publishListing, PublicationGateError } from "../src/features/listings/publish-listing";
import { latestVerifiedIdentity } from "../src/features/identity/identity-service";
import { getQuestionnaireSections } from "../src/features/listings/property-questionnaire";
import { publishListingSchema } from "../src/lib/schemas/listing";

const restores: Array<() => void> = [];
afterEach(() => { restores.splice(0).reverse().forEach(restore => restore()); mock.restoreAll(); });

function stub<F extends (...args: never[]) => unknown>(target: object, key: string, implementation: F) {
    const original = Reflect.get(target, key);
    const fn = mock.fn(implementation);
    Reflect.set(target, key, fn);
    restores.push(() => { Reflect.set(target, key, original); });
    return fn;
}

const idempotencyKey = "e9e0f739-c6e3-44f7-91bd-111ce84ac222";

function setup() {
    const listing = {
        id: "listing", ownerId: "owner", version: 1, status: "READY_FOR_VERIFICATION",
        liveAt: null, owner: { emailVerified: true }, purpose: "SALE",
        titleNl: "Woning", descriptionNl: "Beschrijving", askingPriceCents: BigInt(10000000),
        monthlyRentCents: null, biddingMethod: "OPEN", bidIncrementCents: BigInt(10000),
        bidWindowOpensAt: null, bidWindowClosesAt: null,
        property: { propertyType: "HOUSE", livingAreaSqm: 100, roomCount: 4, constructionYear: 2000, energyLabels: [{ labelClass: "A" }] },
        attributes: {
            movableItems: [{ name: "Gordijnen" }],
            questionnaireAnswers: getQuestionnaireSections("HOUSE").flatMap(section => section.questions.map(question => ({ questionId: question.id, answer: "no" }))),
        },
        media: [
            ...Array.from({ length: 5 }, () => ({ kind: "PHOTO", status: "READY", altTextNl: null })),
            { kind: "DOCUMENT", status: "READY", altTextNl: "Energielabel" },
        ],
    };
    stub(db, "$transaction", (async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(db)) as typeof db.$transaction);
    stub(db, "$executeRaw", async () => 1);
    const lookup = stub(db.listing, "findFirst", async () => listing as unknown);
    const identity = stub(db.identityVerificationAttempt, "findFirst", async () => ({ id: "identity", completedAt: new Date() }) as unknown);
    let publication: Record<string, unknown> | null = null;
    stub(db.listingPublication, "findUnique", async () => publication as never);
    stub(db.listingPublication, "findFirst", async () => publication as never);
    const create = stub(db.listingPublication, "create", async (args: Prisma.ListingPublicationCreateArgs) => {
        publication = { id: "publication", ...args.data };
        return publication as never;
    });
    const update = stub(db.listing, "update", async () => listing as never);
    // Any attempt to resurrect checkout or contact an external portal fails the test.
    stub(db.publicationOrder, "findFirst", () => { throw new Error("Payment lookup forbidden"); });
    stub(globalThis, "fetch", () => { throw new Error("External publishing forbidden"); });
    return { listing, lookup, identity, create, update };
}

test("free publication needs no order and safely replays the request", async () => {
    const { create, update } = setup();
    const first = await publishListing("listing", "owner", { idempotencyKey });
    assert.deepEqual(first.publications, [{ channel: "PLATFORM", status: "LIVE" }]);
    assert.deepEqual(await publishListing("listing", "owner", { idempotencyKey }), first);
    assert.deepEqual(await publishListing("listing", "owner", { idempotencyKey: "another-key" }), first);
    assert.equal(create.mock.callCount(), 1);
    assert.equal(update.mock.callCount(), 1);
    const data = create.mock.calls[0].arguments[0].data;
    assert.equal(data.orderId, undefined);
    assert.equal(data.package, undefined);
});

test("publication retains ownership, email, identity and completeness gates", async () => {
    const state = setup();
    state.lookup.mock.mockImplementationOnce(async () => null);
    await assert.rejects(publishListing("listing", "other", { idempotencyKey }), { code: "LISTING_NOT_FOUND" });
    state.listing.owner.emailVerified = false;
    await assert.rejects(publishListing("listing", "owner", { idempotencyKey }), { code: "LISTING_NOT_READY" });
    state.listing.owner.emailVerified = true;
    state.identity.mock.mockImplementationOnce(async () => null);
    await assert.rejects(publishListing("listing", "owner", { idempotencyKey }), { code: "IDENTITY_VERIFICATION_REQUIRED" });
    state.listing.media = [];
    await assert.rejects(publishListing("listing", "owner", { idempotencyKey }), PublicationGateError);
    assert.equal(state.create.mock.callCount(), 0);
});

test("reusing an idempotency key for another listing is rejected", async () => {
    setup();
    await publishListing("listing", "owner", { idempotencyKey });
    await assert.rejects(publishListing("another", "owner", { idempotencyKey }), { code: "IDEMPOTENCY_CONFLICT" });
});

test("publish API rejects legacy packages and external channels", () => {
    assert.equal(publishListingSchema.safeParse({ idempotencyKey }).success, true);
    for (const extra of [{ package: "GOLD" }, { channels: ["FUNDA"] }, { channels: ["PLATFORM"] }]) {
        assert.equal(publishListingSchema.safeParse({ idempotencyKey, ...extra }).success, false);
    }
});

test("production identity lookup excludes simulated verification", async () => {
    const original = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });
    try {
        const lookup = stub(db.identityVerificationAttempt, "findFirst", async (args?: Prisma.IdentityVerificationAttemptFindFirstArgs) => {
            assert.deepEqual(args?.where?.provider, "DIDIT");
            return null;
        });
        await latestVerifiedIdentity("owner");
        assert.equal(lookup.mock.callCount(), 1);
    } finally {
        if (original === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
        else Object.assign(process.env, { NODE_ENV: original });
    }
});
