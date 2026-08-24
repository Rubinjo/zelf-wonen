import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    IdinVerificationError,
    startAgreementSigningVerification,
} from "@/features/identity/idin-service";
import {
    AgreementError,
    getAgreementForUser,
    saveAgreementDraft,
    submitAgreement,
    voidAgreement,
} from "@/features/transactions/agreement-service";
import { TransactionAccessError } from "@/features/transactions/transaction-service";
import { handleApiError } from "@/lib/api-response";
import { agreementFormSchema } from "@/lib/schemas/agreement";

const actionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("SUBMIT") }),
    z.object({ action: z.literal("SIGN_IDIN") }),
    z.object({
        action: z.literal("VOID"),
        reason: z.string().trim().max(1000).optional(),
    }),
]);

function serialize(value: unknown) {
    return JSON.parse(
        JSON.stringify(value, (_key, item) =>
            typeof item === "bigint" ? item.toString() : item,
        ),
    );
}

function agreementErrorResponse(error: AgreementError) {
    const status =
        error.code === "AGREEMENT_NOT_FOUND"
            ? 404
            : error.code === "AGREEMENT_FORBIDDEN"
              ? 403
              : 409;
    return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
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
        const agreement = await getAgreementForUser(
            transactionId,
            session.user.id,
        );
        return NextResponse.json({ data: serialize(agreement) });
    } catch (error) {
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "AGREEMENT_LOAD_FAILED");
    }
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ transactionId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const transactionId = z
            .string()
            .uuid()
            .parse((await context.params).transactionId);
        const input = agreementFormSchema.parse(await request.json());
        const agreement = await saveAgreementDraft(
            transactionId,
            session.user.id,
            {
                ...input,
                sellerSpouseName: input.sellerSpouseName ?? null,
                buyerSpouseName: input.buyerSpouseName ?? null,
                kadastraleOmschrijving: input.kadastraleOmschrijving ?? null,
                additionalTerms: input.additionalTerms ?? null,
                securityAmountCents: input.securityAmountCents ?? null,
                securityDueDate: input.securityDueDate ?? null,
                inspectionCostCapCents: input.inspectionCostCapCents ?? null,
            },
        );
        return NextResponse.json(
            { data: serialize(agreement) },
            { status: 200 },
        );
    } catch (error) {
        if (error instanceof AgreementError)
            return agreementErrorResponse(error);
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "AGREEMENT_SAVE_FAILED");
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
        const input = actionSchema.parse(await request.json());
        if (input.action === "SIGN_IDIN") {
            const signing = await startAgreementSigningVerification({
                transactionId,
                userId: session.user.id,
                locale: "nl",
            });
            return NextResponse.json({
                data: {
                    redirectUrl: signing.redirectUrl,
                    expiresAt: signing.expiresAt,
                },
            });
        }
        let agreement;
        if (input.action === "SUBMIT") {
            agreement = await submitAgreement(transactionId, session.user.id);
        } else {
            agreement = await voidAgreement(
                transactionId,
                session.user.id,
                input.reason ?? "",
            );
        }
        return NextResponse.json({ data: serialize(agreement) });
    } catch (error) {
        if (error instanceof IdinVerificationError) {
            const status =
                error.code === "PROVIDER_UNAVAILABLE"
                    ? 503
                    : error.code === "SIGNING_ALREADY_SIGNED"
                      ? 409
                      : 409;
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status },
            );
        }
        if (error instanceof AgreementError)
            return agreementErrorResponse(error);
        if (error instanceof TransactionAccessError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: error.code === "TRANSACTION_NOT_FOUND" ? 404 : 403 },
            );
        return handleApiError(error, "AGREEMENT_ACTION_FAILED");
    }
}
