import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichAggregatedNeighborhood } from "@/features/listings/enrich-aggregated-neighborhood";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const token = process.env.AGGREGATOR_ENRICHMENT_TOKEN ??
        (process.env.NODE_ENV === "production" ? "" : "zelfwonen-local-aggregator");
    const expected = Buffer.from(`Bearer ${token}`);
    const provided = Buffer.from(request.headers.get("authorization") ?? "");
    if (!token || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const input = z.object({ listingId: z.uuid() }).safeParse(
        await request.json().catch(() => null),
    );
    if (!input.success) {
        return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
    }
    try {
        const status = await enrichAggregatedNeighborhood(input.data.listingId);
        return NextResponse.json({ status }, { status: status === "missing" ? 404 : 200 });
    } catch (error) {
        console.error("Imported neighborhood enrichment failed", error);
        return NextResponse.json({ error: "Enrichment failed" }, { status: 503 });
    }
}
