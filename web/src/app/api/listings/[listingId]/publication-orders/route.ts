import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { createPublicationOrderSchema } from "@/lib/schemas/listing";

const packagePrices = {
    BRONZE: 9_900,
    SILVER: 19_900,
    GOLD: 29_900,
} as const;

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const input = createPublicationOrderSchema.parse(await request.json());
        const paymentReference = `simulated:${input.idempotencyKey}`;
        const simulated = !process.env.PAYMENT_PROVIDER_BASE_URL;
        const result = await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
            const listing = await tx.listing.findFirst({
                where: { id: listingId, ownerId: session.user.id },
                select: { id: true },
            });
            if (!listing) return { kind: "not-found" as const };

            const existing = await tx.publicationOrder.findUnique({
                where: { paymentReference },
            });
            if (existing) {
                const matches =
                    existing.listingId === listingId &&
                    existing.userId === session.user.id &&
                    existing.package === input.package &&
                    existing.amountCents ===
                        BigInt(packagePrices[input.package]);
                return matches
                    ? { kind: "existing" as const, order: existing }
                    : { kind: "conflict" as const };
            }

            // This development adapter models a successful PSP checkout. A production
            // adapter must create a hosted checkout and mark PAID only from a signed webhook.
            const order = await tx.publicationOrder.create({
                data: {
                    listingId,
                    userId: session.user.id,
                    package: input.package,
                    amountCents: BigInt(packagePrices[input.package]),
                    status: simulated ? "PAID" : "PAYMENT_PENDING",
                    paymentProvider: simulated ? "SIMULATED" : "CONFIGURED_PSP",
                    paymentReference,
                    paidAt: simulated ? new Date() : null,
                },
            });
            return { kind: "created" as const, order };
        });
        if (result.kind === "not-found") {
            return NextResponse.json(
                {
                    error: {
                        code: "LISTING_NOT_FOUND",
                        message: "Listing not found",
                    },
                },
                { status: 404 },
            );
        }
        if (result.kind === "conflict") {
            return NextResponse.json(
                {
                    error: {
                        code: "IDEMPOTENCY_CONFLICT",
                        message:
                            "This idempotency key was already used for another order request",
                    },
                },
                { status: 409 },
            );
        }
        if (result.kind === "existing") {
            return NextResponse.json({ data: serializeOrder(result.order) });
        }
        return NextResponse.json(
            {
                data: {
                    ...serializeOrder(result.order),
                    checkoutUrl: simulated
                        ? null
                        : process.env.PAYMENT_PROVIDER_BASE_URL,
                    simulated,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        return handleApiError(error, "PUBLICATION_ORDER_FAILED");
    }
}

function serializeOrder(order: {
    id: string;
    package: string;
    status: string;
    amountCents: bigint;
    paidAt: Date | null;
}) {
    return {
        id: order.id,
        package: order.package,
        status: order.status,
        amountCents: order.amountCents.toString(),
        paidAt: order.paidAt?.toISOString() ?? null,
    };
}
