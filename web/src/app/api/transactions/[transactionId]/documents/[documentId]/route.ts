import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    appendTransactionEvent,
    requireTransactionParticipant,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ transactionId: string; documentId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const params = await context.params;
        const transactionId = z.string().uuid().parse(params.transactionId);
        const documentId = z.string().uuid().parse(params.documentId);
        await requireTransactionParticipant(transactionId, session.user.id);
        const document = await db.transactionDocument.findFirst({
            where: { id: documentId, transactionId, status: "AVAILABLE" },
        });
        if (!document)
            return NextResponse.json(
                {
                    error: {
                        code: "DOCUMENT_NOT_FOUND",
                        message: "Document niet gevonden",
                    },
                },
                { status: 404 },
            );
        const expectedPrefix = `${transactionId}/`;
        if (
            !document.storageKey.startsWith(expectedPrefix) ||
            document.storageKey.includes("..")
        )
            throw new Error("Invalid document storage key");
        const absolutePath = path.join(
            process.cwd(),
            ".data",
            "transaction-documents",
            document.storageKey,
        );
        const bytes = await readFile(absolutePath);
        if (process.env.NODE_ENV !== "development") {
            await db.$transaction(async (tx) => {
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "DOCUMENT_DOWNLOADED",
                    { documentId },
                );
            });
        }
        const encodedName = encodeURIComponent(document.fileName);
        return new NextResponse(bytes, {
            headers: {
                "content-type": document.mimeType,
                "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
                "cache-control": "private, no-store",
                "x-content-type-options": "nosniff",
            },
        });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "DOCUMENT_DOWNLOAD_FAILED");
    }
}
