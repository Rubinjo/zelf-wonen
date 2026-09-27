import { NextResponse } from "next/server";

/** Retired simulator endpoint: never verifies an account or signs an agreement. */
export function GET() {
    return NextResponse.json({ error: { code: "IDIN_RETIRED", message: "iDIN is retired. Use Didit identity verification." } }, { status: 410 });
}
export const POST = GET;
