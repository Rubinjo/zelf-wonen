import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    appendTransactionEvent,
    getTransactionRoom,
    requireTransactionParticipant,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { transactionDetailsSchema } from "@/lib/schemas/transaction";

function accessError(error: TransactionAccessError) {
    return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
    );
}

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
        const room = await getTransactionRoom(transactionId, session.user.id);
        return NextResponse.json({
            data: JSON.parse(
                JSON.stringify(room, (_key, value) =>
                    typeof value === "bigint" ? value.toString() : value,
                ),
            ),
        });
    } catch (error) {
        if (error instanceof TransactionAccessError) return accessError(error);
        return handleApiError(error, "TRANSACTION_LOAD_FAILED");
    }
}

export async function PATCH(
    request: NextRequest,
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
        const input = transactionDetailsSchema.parse(await request.json());
        const result = await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${transactionId}))`;
            const current = await tx.propertyTransaction.findUniqueOrThrow({
                where: { id: transactionId },
                include: {
                    listing: { select: { purpose: true } },
                    milestones: true,
                },
            });
            if (["COMPLETED", "CANCELLED"].includes(current.status)) {
                throw new TransactionAccessError(
                    "TRANSACTION_CLOSED",
                    "Deze transactie is al afgesloten",
                );
            }
            if (input.section === "CONTRACT") {
                const termsChanged =
                    JSON.stringify(current.contractTerms) !==
                    JSON.stringify(input.contractTerms);
                const confirmedAt = input.confirm ? new Date() : null;
                const nextSellerConfirmation =
                    participant.sellerUserId === session.user.id
                        ? confirmedAt
                        : termsChanged
                          ? null
                          : current.sellerContractConfirmedAt;
                const nextBuyerConfirmation =
                    participant.buyerUserId === session.user.id
                        ? confirmedAt
                        : termsChanged
                          ? null
                          : current.buyerContractConfirmedAt;
                const bothConfirmed = Boolean(
                    nextSellerConfirmation && nextBuyerConfirmation,
                );
                const updated = await tx.propertyTransaction.update({
                    where: { id: transactionId },
                    data: {
                        contractTerms:
                            input.contractTerms as Prisma.InputJsonValue,
                        status: bothConfirmed
                            ? "CONDITIONS_PENDING"
                            : "CONTRACT_PENDING",
                        buyerContractConfirmedAt: nextBuyerConfirmation,
                        sellerContractConfirmedAt: nextSellerConfirmation,
                        version: { increment: 1 },
                    },
                });
                if (bothConfirmed) {
                    await tx.transactionMilestone.update({
                        where: {
                            transactionId_type: {
                                transactionId,
                                type: "PURCHASE_AGREEMENT",
                            },
                        },
                        data: { status: "COMPLETED", completedAt: new Date() },
                    });
                    await tx.transactionMilestone.update({
                        where: {
                            transactionId_type: {
                                transactionId,
                                type: "COOLING_OFF_PERIOD",
                            },
                        },
                        data: {
                            status: "IN_PROGRESS",
                            dueAt: current.coolingOffEndsAt,
                        },
                    });
                }
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "CONTRACT_CONFIRMED",
                    {
                        confirmed: input.confirm,
                        termsChanged,
                        bothConfirmed,
                        role:
                            participant.sellerUserId === session.user.id
                                ? "SELLER"
                                : "BUYER",
                    },
                );
                return updated;
            }
            if (input.section === "NOTARY") {
                const updated = await tx.propertyTransaction.update({
                    where: { id: transactionId },
                    data: {
                        notaryDetails:
                            input.notaryDetails as Prisma.InputJsonValue,
                        version: { increment: 1 },
                    },
                });
                await tx.transactionMilestone.update({
                    where: {
                        transactionId_type: {
                            transactionId,
                            type: "NOTARY_SELECTION",
                        },
                    },
                    data: {
                        status: "COMPLETED",
                        completedAt: new Date(),
                        details: input.notaryDetails as Prisma.InputJsonValue,
                    },
                });
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "NOTARY_UPDATED",
                    input.notaryDetails as Prisma.InputJsonValue,
                );
                return updated;
            }
            if (input.section === "HANDOVER") {
                const updated = await tx.propertyTransaction.update({
                    where: { id: transactionId },
                    data: {
                        handoverDetails:
                            input.handoverDetails as Prisma.InputJsonValue,
                        version: { increment: 1 },
                    },
                });
                await tx.transactionMilestone.update({
                    where: {
                        transactionId_type: {
                            transactionId,
                            type: "FINAL_INSPECTION",
                        },
                    },
                    data: {
                        status: "COMPLETED",
                        completedAt: new Date(),
                        details: input.handoverDetails as Prisma.InputJsonValue,
                    },
                });
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "HANDOVER_UPDATED",
                    input.handoverDetails as Prisma.InputJsonValue,
                );
                return updated;
            }
            if (input.status === "CANCELLED") {
                const updated = await tx.propertyTransaction.update({
                    where: { id: transactionId },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: new Date(),
                        cancellationReason: input.reason,
                        version: { increment: 1 },
                    },
                });
                await tx.listing.update({
                    where: { id: participant.listingId },
                    data: { status: "LIVE", version: { increment: 1 } },
                });
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "TRANSACTION_CANCELLED",
                    { reason: input.reason ?? null },
                );
                return updated;
            }
            const requiredMilestonesComplete = current.milestones
                .filter(
                    (milestone) =>
                        !["DEED_OF_TRANSFER", "KEY_HANDOVER"].includes(
                            milestone.type,
                        ),
                )
                .every((milestone) =>
                    ["COMPLETED", "WAIVED"].includes(milestone.status),
                );
            const notaryReady =
                current.listing.purpose === "RENT" ||
                Boolean(current.notaryDetails);
            if (
                !current.buyerContractConfirmedAt ||
                !current.sellerContractConfirmedAt ||
                !notaryReady ||
                !current.handoverDetails ||
                !requiredMilestonesComplete
            ) {
                return null;
            }
            const updated = await tx.propertyTransaction.update({
                where: { id: transactionId },
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                    version: { increment: 1 },
                },
            });
            await tx.transactionMilestone.updateMany({
                where: {
                    transactionId,
                    type: { in: ["DEED_OF_TRANSFER", "KEY_HANDOVER"] },
                },
                data: { status: "COMPLETED", completedAt: new Date() },
            });
            const listing = await tx.listing.findUniqueOrThrow({
                where: { id: participant.listingId },
                select: { purpose: true },
            });
            await tx.listing.update({
                where: { id: participant.listingId },
                data: {
                    status: listing.purpose === "SALE" ? "SOLD" : "RENTED",
                    finalizedAt: new Date(),
                    version: { increment: 1 },
                },
            });
            await appendTransactionEvent(
                tx,
                transactionId,
                session.user.id,
                "TRANSACTION_COMPLETED",
                {
                    listingStatus:
                        listing.purpose === "SALE" ? "SOLD" : "RENTED",
                },
            );
            return updated;
        });
        if (!result) {
            return NextResponse.json(
                {
                    error: {
                        code: "TRANSACTION_INCOMPLETE",
                        message:
                            "Bevestig eerst het contract en vul notaris- en oplevergegevens in",
                    },
                },
                { status: 409 },
            );
        }
        return NextResponse.json({
            data: {
                id: result.id,
                status: result.status,
                version: result.version,
            },
        });
    } catch (error) {
        if (error instanceof TransactionAccessError) {
            if (error.code === "TRANSACTION_CLOSED")
                return NextResponse.json(
                    { error: { code: error.code, message: error.message } },
                    { status: 409 },
                );
            return accessError(error);
        }
        return handleApiError(error, "TRANSACTION_UPDATE_FAILED");
    }
}
