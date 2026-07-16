import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError } from "@/features/auth/guards";

export function handleApiError(
    error: unknown,
    fallbackCode = "INTERNAL_ERROR",
) {
    if (error instanceof AuthenticationError) {
        return NextResponse.json(
            { error: { code: error.code, message: error.message } },
            { status: error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403 },
        );
    }
    if (error instanceof ZodError) {
        return NextResponse.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Check the submitted fields",
                    fieldErrors: error.flatten().fieldErrors,
                },
            },
            { status: 400 },
        );
    }
    console.error(fallbackCode, error);
    return NextResponse.json(
        {
            error: {
                code: fallbackCode,
                message: "The request could not be completed",
            },
        },
        { status: 500 },
    );
}
