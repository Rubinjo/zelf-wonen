import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    requireTransactionParticipant,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";
import { generateTransactionPdf, PassportNotFoundError } from "@/features/transactions/transaction-pdf";
import { handleApiError } from "@/lib/api-response";

const inputSchema = z.object({ type: z.enum(["AGREEMENT", "PASSPORT"]) });

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
        const input = inputSchema.parse(await request.json());
        await requireTransactionParticipant(transactionId, session.user.id);
        const document = await generateTransactionPdf(
            transactionId,
            session.user.id,
            input.type,
        );
        return NextResponse.json(
            {
                data: {
                    id: document.id,
                    fileName: document.fileName,
                    sha256: document.sha256,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        if (error instanceof PassportNotFoundError)
            return NextResponse.json(
                {
                    error: {
                        code: "PASSPORT_NOT_FOUND",
                        message: error.message,
                    },
                },
                { status: 409 },
            );
        if (
            error instanceof Error &&
            error.message.startsWith("Beide partijen")
        )
            return NextResponse.json(
                {
                    error: {
                        code: "CONTRACT_NOT_CONFIRMED",
                        message: error.message,
                    },
                },
                { status: 409 },
            );
        return handleApiError(error, "TRANSACTION_PDF_FAILED");
    }
}
