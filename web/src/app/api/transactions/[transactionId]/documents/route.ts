import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TransactionMilestoneType } from "@/generated/prisma/client";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    appendTransactionEvent,
    requireTransactionParticipant,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { deleteStoredFile, storeFile } from "@/lib/storage";
import { reconcileMilestones } from "@/features/transactions/milestone-engine";
import {
    isPassportDocumentCategory,
    maybeCreatePassportVersion,
    PASSPORT_DOCUMENT_CATEGORY_LABELS,
} from "@/features/transactions/passport-service";
import { documentCategorySchema } from "@/lib/schemas/transaction";

const allowedTypes = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
} as const;
const maxBytes = 20 * 1024 * 1024;

/** Documentcategorieën die een voorwaarde-mijlpaal kunnen afronden. */
const conditionCategoryToMilestone: Partial<
    Record<string, TransactionMilestoneType>
> = {
    FINANCING: "FINANCING",
    BUILDING_INSPECTION: "BUILDING_INSPECTION",
    SECURITY_DEPOSIT: "SECURITY_DEPOSIT",
};

function hasExpectedSignature(bytes: Buffer, mimeType: string) {
    if (mimeType === "application/pdf")
        return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    if (mimeType === "image/jpeg")
        return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (mimeType === "image/png")
        return bytes
            .subarray(0, 8)
            .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            );
    if (mimeType === "image/webp")
        return (
            bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
            bytes.subarray(8, 12).toString("ascii") === "WEBP"
        );
    return false;
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ transactionId: string }> },
) {
    let target: string | null = null;
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
        if (["COMPLETED", "CANCELLED"].includes(participant.status)) {
            return NextResponse.json(
                {
                    error: {
                        code: "TRANSACTION_CLOSED",
                        message: "Deze transactieruimte is gesloten",
                    },
                },
                { status: 409 },
            );
        }
        const form = await request.formData();
        const file = form.get("file");
        const category = documentCategorySchema.parse(
            form.get("category") ?? "OTHER",
        );
        const messageId = z
            .string()
            .uuid()
            .optional()
            .parse(form.get("messageId") || undefined);
        if (!(file instanceof File)) {
            return NextResponse.json(
                {
                    error: {
                        code: "FILE_REQUIRED",
                        message: "Selecteer een document",
                    },
                },
                { status: 400 },
            );
        }
        if (
            !(file.type in allowedTypes) ||
            file.size <= 0 ||
            file.size > maxBytes
        ) {
            return NextResponse.json(
                {
                    error: {
                        code: "UNSUPPORTED_FILE",
                        message:
                            "Gebruik een PDF, JPG, PNG of WebP-bestand tot 20 MB",
                    },
                },
                { status: 415 },
            );
        }
        if (messageId) {
            const message = await db.transactionMessage.findFirst({
                where: { id: messageId, transactionId },
                select: { id: true },
            });
            if (!message)
                return NextResponse.json(
                    {
                        error: {
                            code: "MESSAGE_NOT_FOUND",
                            message: "Chatbericht niet gevonden",
                        },
                    },
                    { status: 404 },
                );
        }
        const bytes = Buffer.from(await file.arrayBuffer());
        if (!hasExpectedSignature(bytes, file.type)) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_FILE_CONTENT",
                        message:
                            "De bestandsinhoud komt niet overeen met het bestandstype",
                    },
                },
                { status: 415 },
            );
        }
        const id = randomUUID();
        const extension = allowedTypes[file.type as keyof typeof allowedTypes];
        const storageKey = `${transactionId}/${id}${extension}`;
        await storeFile("transaction-documents", storageKey, bytes);
        target = storageKey;
        const document = await db.$transaction(async (tx) => {
            const created = await tx.transactionDocument.create({
                data: {
                    id,
                    transactionId,
                    messageId,
                    uploadedById: session.user.id,
                    category,
                    storageKey,
                    mimeType: file.type,
                    sha256: createHash("sha256").update(bytes).digest("hex"),
                    fileName:
                        file.name
                            .replace(/[\u0000-\u001f]/g, "")
                            .slice(0, 255) || `document${extension}`,
                    sizeBytes: BigInt(file.size),
                },
                include: { uploadedBy: { select: { id: true, name: true } } },
            });
            await appendTransactionEvent(
                tx,
                transactionId,
                session.user.id,
                "DOCUMENT_UPLOADED",
                {
                    documentId: created.id,
                    category,
                    sha256: created.sha256,
                    sizeBytes: created.sizeBytes.toString(),
                },
            );
            // Een woningpaspoort-document (bv. energielabel, plattegrond, VvE)
            // leidt tot een nieuwe, automatische paspoortversie wanneer de
            // dossierinhoud daadwerkelijk verandert.
            if (isPassportDocumentCategory(category)) {
                const label = PASSPORT_DOCUMENT_CATEGORY_LABELS[category] ?? category;
                await maybeCreatePassportVersion(
                    tx,
                    participant.listingId,
                    transactionId,
                    session.user.id,
                    "DOCUMENT_UPLOAD",
                    `Document toegevoegd: ${label}`,
                );
            }
            // Een bewijsstuk kan een voorwaarde-stap automatisch afronden
            // (bv. financiering, bouwkundige keuring, waarborgsom/borg).
            await reconcileMilestones(tx, transactionId);
            const stepType = conditionCategoryToMilestone[category as string];
            if (stepType) {
                const step = await tx.transactionMilestone.findUnique({
                    where: {
                        transactionId_type: { transactionId, type: stepType },
                    },
                    select: { status: true, title: true },
                });
                if (step?.status === "COMPLETED") {
                    await tx.transactionMessage.create({
                        data: {
                            transactionId,
                            authorUserId: session.user.id,
                            kind: "SYSTEM",
                            body: `De stap "${step.title}" is automatisch afgerond op basis van het geüploade bewijsstuk.`,
                        },
                    });
                }
            }
            await tx.propertyTransaction.update({
                where: { id: transactionId },
                data: { version: { increment: 1 } },
            });
            return created;
        });
        target = null;
        return NextResponse.json(
            {
                data: JSON.parse(
                    JSON.stringify(document, (_key, value) =>
                        typeof value === "bigint" ? value.toString() : value,
                    ),
                ),
            },
            { status: 201 },
        );
    } catch (error) {
        if (target) await deleteStoredFile("transaction-documents", target).catch(() => undefined);
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "DOCUMENT_UPLOAD_FAILED");
    }
}
