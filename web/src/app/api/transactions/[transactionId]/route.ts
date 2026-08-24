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
import { reconcileMilestones } from "@/features/transactions/milestone-engine";
import { buildSecurityReference } from "@/features/transactions/security-state";
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
                // De voortgangsmotor leidt de mijlpaalstatussen af uit de
                // bevestigingen (bv. koop-/huurovereenkomst = compleet zodra
                // beide partijen hebben bevestigd).
                await reconcileMilestones(tx, transactionId);
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
                // Rolgebaseerd: de verkoper mag een notaris alleen voorstellen;
                // alleen de koper bevestigt de uiteindelijke notaris.
                const isSeller = participant.sellerUserId === session.user.id;
                const notaryPayload =
                    input.notaryDetails as Prisma.InputJsonValue;
                if (isSeller && input.action !== "PROPOSE") {
                    throw new TransactionAccessError(
                        "TRANSACTION_FORBIDDEN",
                        "Als verkoper kun je een notaris alleen voorstellen; de koper bevestigt de notaris.",
                    );
                }
                if (!isSeller && input.action !== "CONFIRM") {
                    throw new TransactionAccessError(
                        "TRANSACTION_FORBIDDEN",
                        "Alleen de koper bevestigt de uiteindelijke notaris.",
                    );
                }
                const updated = await tx.propertyTransaction.update({
                    where: { id: transactionId },
                    data: isSeller
                        ? {
                              notaryProposal: notaryPayload,
                              notaryProposedByUserId: session.user.id,
                              notaryProposedAt: new Date(),
                              version: { increment: 1 },
                          }
                        : {
                              notaryDetails: notaryPayload,
                              notaryConfirmedByUserId: session.user.id,
                              notaryConfirmedAt: new Date(),
                              version: { increment: 1 },
                          },
                });
                await reconcileMilestones(tx, transactionId);
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "NOTARY_UPDATED",
                    {
                        action: input.action,
                        role: isSeller ? "SELLER" : "BUYER",
                        notaryDetails: notaryPayload,
                    },
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
                await reconcileMilestones(tx, transactionId);
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "HANDOVER_UPDATED",
                    input.handoverDetails as Prisma.InputJsonValue,
                );
                return updated;
            }
            if (input.section === "SECURITY") {
                // Waarborgsom (Art 7:26 lid 4 BW). Het platform houdt zelf geen
                // geld aan: de storting loopt via de kwaliteitsrekening van de
                // notaris. Hier wordt uitsluitend de status gecoördineerd en
                // vastgelegd (append-only eventlog).
                const agreement = await tx.purchaseAgreement.findUnique({
                    where: { transactionId },
                    select: {
                        status: true,
                        securityType: true,
                        securityAmountCents: true,
                    },
                });
                if (
                    !agreement ||
                    agreement.securityType === "NONE" ||
                    agreement.status !== "SIGNED"
                ) {
                    throw new TransactionAccessError(
                        "TRANSACTION_FORBIDDEN",
                        "Er is nog geen ondertekende waarborgsom-afspraak.",
                    );
                }
                const isSeller = participant.sellerUserId === session.user.id;
                const isBuyer = participant.buyerUserId === session.user.id;
                if (input.action === "CHOOSE_FORM") {
                    // Alleen de koper kiest de vorm van zekerheid (waarborgsom
                    // of bankgarantie, Art 7:26 lid 4 BW). De verkoper heeft
                    // op de overeenkomst alleen "REQUIRED" vastgelegd.
                    if (!isBuyer) {
                        throw new TransactionAccessError(
                            "TRANSACTION_FORBIDDEN",
                            "Alleen de koper kiest de vorm van zekerheid (waarborgsom of bankgarantie).",
                        );
                    }
                    if (
                        input.form !== "DEPOSIT" &&
                        input.form !== "BANK_GUARANTEE"
                    ) {
                        throw new TransactionAccessError(
                            "TRANSACTION_FORBIDDEN",
                            "Kies waarborgsom (depot notaris) of bankgarantie.",
                        );
                    }
                    const currentSecurity =
                        await tx.propertyTransaction.findUnique({
                            where: { id: transactionId },
                            select: {
                                securityPaidAt: true,
                                securityConfirmedAt: true,
                            },
                        });
                    if (
                        currentSecurity?.securityPaidAt ||
                        currentSecurity?.securityConfirmedAt
                    ) {
                        throw new TransactionAccessError(
                            "TRANSACTION_FORBIDDEN",
                            "De vorm van zekerheid kan niet meer worden gewijzigd nadat deze is geregeld.",
                        );
                    }
                    // Bij waarborgsom wordt het betaalkenmerk direct
                    // aangemaakt, zodat de koper meteen weet waarop hij moet
                    // overmaken (geen aparte knop nodig). Bij een bankgarantie
                    // is er geen storting en dus geen kenmerk.
                    const reference =
                        input.form === "DEPOSIT"
                            ? buildSecurityReference(transactionId)
                            : null;
                    const updated = await tx.propertyTransaction.update({
                        where: { id: transactionId },
                        data: {
                            securityForm: input.form,
                            securityFormChosenAt: new Date(),
                            securityFormChosenByUserId: session.user.id,
                            // Bij wisselen van vorm worden depot-specifieke
                            // gegevens gereset (betaalkenmerk geldt alleen
                            // voor een storting op de kwaliteitsrekening).
                            securityReference: reference,
                            securityPaidAt: null,
                            securityPaidByUserId: null,
                            securityConfirmedAt: null,
                            securityConfirmedByUserId: null,
                            version: { increment: 1 },
                        },
                    });
                    await appendTransactionEvent(
                        tx,
                        transactionId,
                        session.user.id,
                        "SECURITY_FORM_CHOSEN",
                        { form: input.form },
                    );
                    if (reference) {
                        await appendTransactionEvent(
                            tx,
                            transactionId,
                            session.user.id,
                            "SECURITY_REFERENCE_CREATED",
                            { reference },
                        );
                    }
                    return updated;
                }
                if (input.action === "GENERATE_REFERENCE") {
                    // Idempotent: één betaalkenmerk per transactie.
                    const existing = await tx.propertyTransaction.findUnique({
                        where: { id: transactionId },
                        select: { securityReference: true },
                    });
                    if (!existing?.securityReference) {
                        const reference =
                            buildSecurityReference(transactionId);
                        await tx.propertyTransaction.update({
                            where: { id: transactionId },
                            data: {
                                securityReference: reference,
                                version: { increment: 1 },
                            },
                        });
                        await appendTransactionEvent(
                            tx,
                            transactionId,
                            session.user.id,
                            "SECURITY_REFERENCE_CREATED",
                            { reference },
                        );
                    }
                    return current;
                }
                if (input.action === "MARK_PAID") {
                    if (!isBuyer) {
                        throw new TransactionAccessError(
                            "TRANSACTION_FORBIDDEN",
                            "Alleen de koper kan aangeven dat de waarborgsom is overgemaakt.",
                        );
                    }
                    const updated = await tx.propertyTransaction.update({
                        where: { id: transactionId },
                        data: {
                            securityPaidAt: new Date(),
                            securityPaidByUserId: session.user.id,
                            version: { increment: 1 },
                        },
                    });
                    await appendTransactionEvent(
                        tx,
                        transactionId,
                        session.user.id,
                        "SECURITY_PAID",
                        {
                            amountCents:
                                agreement.securityAmountCents?.toString() ??
                                null,
                        },
                    );
                    return updated;
                }
                // CONFIRM: alleen de verkoper bevestigt de ontvangst (bv. nadat
                // de notaris de storting op de kwaliteitsrekening bevestigt).
                if (!isSeller) {
                    throw new TransactionAccessError(
                        "TRANSACTION_FORBIDDEN",
                        "Alleen de verkoper kan de ontvangst van de waarborgsom bevestigen.",
                    );
                }
                const updated = await tx.propertyTransaction.update({
                    where: { id: transactionId },
                    data: {
                        securityConfirmedAt: new Date(),
                        securityConfirmedByUserId: session.user.id,
                        version: { increment: 1 },
                    },
                });
                await appendTransactionEvent(
                    tx,
                    transactionId,
                    session.user.id,
                    "SECURITY_CONFIRMED",
                    {},
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
            // Een notaris geldt pas als gekozen nadat de koper heeft bevestigd;
            // sinds de rolgebaseerde flow wordt notaryDetails alleen door de
            // koper geschreven, dus aanwezigheid impliceert bevestiging.
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
            await reconcileMilestones(tx, transactionId);
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
