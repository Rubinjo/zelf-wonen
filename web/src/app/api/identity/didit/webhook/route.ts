import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { applyDiditResult } from "@/features/identity/didit-service";
import { DiditError, retrieveDiditSession, verifyDiditWebhook } from "@/lib/integrations/identity/didit-client";

export async function POST(request: NextRequest) {
    try {
        const secret = process.env.DIDIT_WEBHOOK_SECRET;
        if (!secret) return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
        const reader = request.body?.getReader();
        if (!reader) return NextResponse.json({ error: "Missing body" }, { status: 400 });
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1024 * 1024) {
                await reader.cancel();
                return NextResponse.json({ error: "Body too large" }, { status: 413 });
            }
            chunks.push(value);
        }
        const event = verifyDiditWebhook(Buffer.concat(chunks), request.headers, secret);
        if (event.webhook_type !== "status.updated") return NextResponse.json({ received: true });
        // Retrieve the authoritative decision and its live/sandbox environment.
        // The client schema discards document and biometric details before persistence.
        const decision = await retrieveDiditSession(event.session_id);
        if (decision.vendor_data !== event.vendor_data || decision.workflow_id !== event.workflow_id) {
            throw new DiditError("INVALID_DIDIT_CALLBACK", "Session mismatch", 400);
        }
        await applyDiditResult(decision);
        return NextResponse.json({ received: true });
    } catch (error) {
        if (error instanceof DiditError) return NextResponse.json({ error: error.code }, { status: error.status });
        if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
        // Do not log the verification payload or SDK errors containing personal information.
        console.error("DIDIT_WEBHOOK_PROCESSING_FAILED");
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 503 });
    }
}
