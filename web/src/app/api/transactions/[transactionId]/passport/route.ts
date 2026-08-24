import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    requireTransactionParticipant,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";
import {
    getPassportDraftStatus,
    maybeCreatePassportVersion,
} from "@/features/transactions/passport-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
    passportDraftSchema,
    passportNoteSchema,
} from "@/lib/schemas/transaction";

type Context = { params: Promise<{ transactionId: string }> };

/** Retourneert de versiegeschiedenis én de huidige (live) paspoortstatus. */
export async function GET(_request: NextRequest, context: Context) {
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
        const [versions, draft] = await db.$transaction(async (tx) => {
            const versions = await tx.propertyPassportVersion.findMany({
                where: { listingId: participant.listingId },
                orderBy: { version: "desc" },
            });
            const draft = await getPassportDraftStatus(
                tx,
                participant.listingId,
                transactionId,
            );
            return [versions, draft];
        });
        return NextResponse.json({ data: { versions, draft } });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "PASSPORT_LOAD_FAILED");
    }
}

/** Maakt handmatig een nieuwe versie vast (alleen verkoper/verhuurder). */
export async function POST(request: NextRequest, context: Context) {
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
                            "Alleen de verkoper/verhuurder kan een paspoortversie vastleggen",
                    },
                },
                { status: 403 },
            );
        const result = await db.$transaction(async (tx) => {
            const created = await maybeCreatePassportVersion(
                tx,
                participant.listingId,
                transactionId,
                session.user.id,
                "MANUAL",
                input.changeNote,
            );
            return created;
        });
        return NextResponse.json(
            {
                data: {
                    version: result?.version ?? null,
                    entryHash: result?.entryHash ?? null,
                    unchanged: result === null,
                },
            },
            { status: result ? 201 : 200 },
        );
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "PASSPORT_CREATE_FAILED");
    }
}

/**
 * Werkt de bewerkbare paspoortvelden bij (alleen verkoper/verhuurder) en legt
 * bij een inhoudelijke wijziging automatisch een nieuwe versie vast.
 */
export async function PATCH(request: NextRequest, context: Context) {
    try {
        const session = await requireEmailVerifiedUser();
        const transactionId = z
            .string()
            .uuid()
            .parse((await context.params).transactionId);
        const input = passportDraftSchema.parse(await request.json());
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
                            "Alleen de verkoper/verhuurder kan het woningpaspoort bewerken",
                    },
                },
                { status: 403 },
            );
        const result = await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${participant.listingId}))`;
            const fields = input as Prisma.InputJsonValue;
            await tx.propertyPassportDraft.upsert({
                where: { listingId: participant.listingId },
                create: {
                    listingId: participant.listingId,
                    fields,
                    createdByUserId: session.user.id,
                },
                update: { fields },
            });
            const created = await maybeCreatePassportVersion(
                tx,
                participant.listingId,
                transactionId,
                session.user.id,
                "DRAFT_UPDATE",
                "Woningpaspoort-gegevens bijgewerkt",
            );
            return created;
        });
        return NextResponse.json({
            data: {
                draft: input,
                version: result?.version ?? null,
                entryHash: result?.entryHash ?? null,
                unchanged: result === null,
            },
        });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "PASSPORT_UPDATE_FAILED");
    }
}
