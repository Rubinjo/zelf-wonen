import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    appendTransactionEvent,
    canonicalJson,
    chainedHash,
    requireTransactionParticipant,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { passportNoteSchema } from "@/lib/schemas/transaction";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ transactionId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const transactionId = z
            .string()
            .uuid()
            .parse((await context.params).transactionId);
        const participant = await requireTransactionParticipant(
            transactionId,
            session.user.id,
        );
        const versions = await db.propertyPassportVersion.findMany({
            where: { listingId: participant.listingId },
            orderBy: { version: "desc" },
        });
        return NextResponse.json({ data: versions });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "PASSPORT_LOAD_FAILED");
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ transactionId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const transactionId = z
            .string()
            .uuid()
            .parse((await context.params).transactionId);
        const input = passportNoteSchema.parse(await request.json());
        const participant = await requireTransactionParticipant(
            transactionId,
            session.user.id,
        );
        if (participant.sellerUserId !== session.user.id)
            return NextResponse.json(
                {
                    error: {
                        code: "SELLER_REQUIRED",
                        message:
                            "Alleen de verkoper kan een paspoortversie vastleggen",
                    },
                },
                { status: 403 },
            );
        const version = await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${participant.listingId}))`;
            const previous = await tx.propertyPassportVersion.findFirst({
                where: { listingId: participant.listingId },
                orderBy: { version: "desc" },
            });
            const listing = await tx.listing.findUniqueOrThrow({
                where: { id: participant.listingId },
                include: {
                    property: { include: { energyLabels: true } },
                    media: {
                        where: { status: "READY" },
                        orderBy: { sortOrder: "asc" },
                    },
                    floorPlans: { orderBy: { sortOrder: "asc" } },
                },
            });
            const snapshot = JSON.parse(
                canonicalJson({
                    generatedAt: new Date().toISOString(),
                    changeNote: input.changeNote,
                    listing,
                }),
            ) as Prisma.InputJsonValue;
            const checks = [
                listing.titleNl,
                listing.descriptionNl,
                listing.property.livingAreaSqm,
                listing.property.roomCount,
                listing.property.constructionYear,
                listing.property.energyLabels.length,
                listing.media.some((item) => item.kind === "PHOTO"),
                listing.attributes,
            ];
            const completenessScore = Math.round(
                (checks.filter(Boolean).length / checks.length) * 100,
            );
            const nextVersion = (previous?.version ?? 0) + 1;
            const createdAt = new Date();
            const payload = {
                listingId: participant.listingId,
                version: nextVersion,
                listingVersionSource: listing.version,
                completenessScore,
                snapshot,
                createdByUserId: session.user.id,
                createdAt: createdAt.toISOString(),
            };
            const entryHash = chainedHash(previous?.entryHash ?? null, payload);
            const created = await tx.propertyPassportVersion.create({
                data: {
                    listingId: participant.listingId,
                    version: nextVersion,
                    listingVersionSource: listing.version,
                    snapshot,
                    completenessScore,
                    previousHash: previous?.entryHash,
                    entryHash,
                    createdByUserId: session.user.id,
                    createdAt,
                },
            });
            await appendTransactionEvent(
                tx,
                transactionId,
                session.user.id,
                "PASSPORT_VERSION_CREATED",
                {
                    version: nextVersion,
                    entryHash,
                    changeNote: input.changeNote,
                },
            );
            return created;
        });
        return NextResponse.json({ data: version }, { status: 201 });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "PASSPORT_CREATE_FAILED");
    }
}
