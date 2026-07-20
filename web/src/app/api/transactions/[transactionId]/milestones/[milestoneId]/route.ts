import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    appendTransactionEvent,
    requireTransactionParticipant,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { milestoneInputSchema } from "@/lib/schemas/transaction";

export async function PATCH(
    request: NextRequest,
    context: {
        params: Promise<{ transactionId: string; milestoneId: string }>;
    },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const params = await context.params;
        const transactionId = z.string().uuid().parse(params.transactionId);
        const milestoneId = z.string().uuid().parse(params.milestoneId);
        const input = milestoneInputSchema.parse(await request.json());
        await requireTransactionParticipant(transactionId, session.user.id);
        const milestone = await db.$transaction(async (tx) => {
            const existing = await tx.transactionMilestone.findFirst({
                where: { id: milestoneId, transactionId },
            });
            if (!existing) return null;
            const updated = await tx.transactionMilestone.update({
                where: { id: milestoneId },
                data: {
                    status: input.status,
                    dueAt: input.dueAt,
                    completedAt:
                        input.status === "COMPLETED" ? new Date() : null,
                    details:
                        input.details === null
                            ? Prisma.DbNull
                            : (input.details as
                                  | Prisma.InputJsonValue
                                  | undefined),
                },
            });
            await appendTransactionEvent(
                tx,
                transactionId,
                session.user.id,
                "MILESTONE_UPDATED",
                {
                    milestoneId,
                    type: existing.type,
                    status: input.status,
                    dueAt: input.dueAt?.toISOString() ?? null,
                },
            );
            await tx.propertyTransaction.update({
                where: { id: transactionId },
                data: { version: { increment: 1 } },
            });
            return updated;
        });
        if (!milestone)
            return NextResponse.json(
                {
                    error: {
                        code: "MILESTONE_NOT_FOUND",
                        message: "Mijlpaal niet gevonden",
                    },
                },
                { status: 404 },
            );
        return NextResponse.json({ data: milestone });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "MILESTONE_UPDATE_FAILED");
    }
}
