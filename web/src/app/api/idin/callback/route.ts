import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    completeSimulatedIdinVerification,
    IdinVerificationError,
} from "@/features/identity/idin-service";
import { completeAgreementSigningWithIdin } from "@/features/transactions/agreement-service";

export async function GET(request: NextRequest) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    try {
        const input = z
            .object({
                reference: z.string().uuid(),
                state: z.string().min(32),
                result: z.enum(["success", "cancel"]).default("success"),
            })
            .parse(Object.fromEntries(request.nextUrl.searchParams));
        const result = await completeSimulatedIdinVerification({
            providerReference: input.reference,
            state: input.state,
            result: input.result,
        });

        // Koopovereenkomst-ondertekening: voltooi de handtekening bij succes.
        if (result.transactionId) {
            const signStatus =
                result.status === "VERIFIED"
                    ? "success"
                    : result.status.toLowerCase();
            if (result.status === "VERIFIED") {
                try {
                    await completeAgreementSigningWithIdin(
                        result.transactionId,
                        result.userId!,
                        input.reference,
                    );
                } catch (error) {
                    console.error("AGREEMENT_SIGNING_AFTER_IDIN_FAILED", error);
                    const failed = new URL(
                        `/dashboard/transacties/${result.transactionId}`,
                        appUrl,
                    );
                    failed.searchParams.set("sign", "failed");
                    return NextResponse.redirect(failed);
                }
            }
            const redirect = new URL(
                `/dashboard/transacties/${result.transactionId}`,
                appUrl,
            );
            redirect.searchParams.set("sign", signStatus);
            return NextResponse.redirect(redirect);
        }

        const redirect = new URL(
            `/dashboard/listings/${result.listingId}`,
            appUrl,
        );
        redirect.searchParams.set("idin", result.status.toLowerCase());
        return NextResponse.redirect(redirect);
    } catch (error) {
        console.error("IDIN_CALLBACK_FAILED", error);
        const redirect = new URL("/dashboard", appUrl);
        redirect.searchParams.set(
            "idin",
            error instanceof IdinVerificationError
                ? error.code.toLowerCase()
                : "failed",
        );
        return NextResponse.redirect(redirect);
    }
}
