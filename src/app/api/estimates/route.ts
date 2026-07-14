import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import { estimateProperty } from "@/features/estimator/service";
import { estimateRequestSchema } from "@/lib/schemas/estimator";

export async function POST(request: NextRequest) {
    try {
        await requireEmailVerifiedUser();
        const input = estimateRequestSchema.parse(await request.json());
        const data = await estimateProperty(input);
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof AuthenticationError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                {
                    status:
                        error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403,
                },
            );
        }
        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_ESTIMATE_INPUT",
                        message:
                            "The property details are incomplete or invalid",
                        fieldErrors: error.flatten().fieldErrors,
                    },
                },
                { status: 400 },
            );
        }
        console.error("Estimator request failed", error);
        return NextResponse.json(
            {
                error: {
                    code: "ESTIMATOR_UNAVAILABLE",
                    message: "The estimate could not be calculated",
                },
            },
            { status: 503 },
        );
    }
}
