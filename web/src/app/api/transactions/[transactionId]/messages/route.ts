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
import { messageInputSchema } from "@/lib/schemas/transaction";

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
        const input = messageInputSchema.parse(await request.json());
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
        const message = await db.$transaction(async (tx) => {
            const created = await tx.transactionMessage.create({
                data: {
                    transactionId,
                    authorUserId: session.user.id,
                    body: input.body,
                },
                include: { author: { select: { id: true, name: true } } },
            });
            await appendTransactionEvent(
                tx,
                transactionId,
                session.user.id,
                "MESSAGE_SENT",
                { messageId: created.id },
            );
            await tx.propertyTransaction.update({
                where: { id: transactionId },
                data: { version: { increment: 1 } },
            });
            return created;
        });
        return NextResponse.json({ data: message }, { status: 201 });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "MESSAGE_SEND_FAILED");
    }
}
