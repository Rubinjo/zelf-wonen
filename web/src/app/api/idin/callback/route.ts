import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    completeSimulatedIdinVerification,
    IdinVerificationError,
} from "@/features/identity/idin-service";

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
