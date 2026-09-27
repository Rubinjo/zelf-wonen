import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export class DiditError extends Error {
    constructor(
        readonly code: "DIDIT_UNAVAILABLE" | "VERIFICATION_LIMIT_REACHED" | "VERIFICATION_PENDING" | "INVALID_DIDIT_CALLBACK",
        message: string,
        readonly status = 503,
    ) {
        super(message);
        this.name = "DiditError";
    }
}

export function diditConfig() {
    const apiKey = process.env.DIDIT_API_KEY;
    const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
    const workflowId = process.env.DIDIT_WORKFLOW_ID;
    const mode = process.env.DIDIT_MODE ?? "live";
    const production = process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "production";
    const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
    if (!apiKey || !webhookSecret || !z.uuid().safeParse(workflowId).success ||
        !["live", "sandbox"].includes(mode) ||
        (production && (mode !== "live" || appUrl.protocol !== "https:"))) {
        throw new DiditError("DIDIT_UNAVAILABLE", "Identiteitsverificatie is nog niet beschikbaar. Probeer het later opnieuw.");
    }
    return { apiKey, webhookSecret, workflowId: workflowId!, appUrl, provider: mode === "live" ? "DIDIT" : "DIDIT_SANDBOX" };
}

const sessionSchema = z.object({
    session_id: z.uuid(),
    workflow_id: z.uuid(),
    vendor_data: z.string(),
    status: z.string(),
});

const decisionSchema = sessionSchema.extend({ environment: z.enum(["live", "sandbox"]) });
export type DiditSession = z.infer<typeof decisionSchema>;

export function diditSessionUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "verify.didit.me" || url.port || url.username || url.password) {
        throw new DiditError("DIDIT_UNAVAILABLE", "De verificatielink kon niet worden gecontroleerd.");
    }
    return url.toString();
}

export async function createDiditSession(attemptId: string, locale: "nl" | "en") {
    const config = diditConfig();
    const callback = new URL("/api/identity/didit/return", config.appUrl);
    callback.searchParams.set("attempt", attemptId);
    // Never retry this POST: a timed-out response may still have created a billable session.
    const response = await fetch("https://verification.didit.me/v3/session/", {
        method: "POST",
        headers: { "x-api-key": config.apiKey, "content-type": "application/json" },
        body: JSON.stringify({
            workflow_id: config.workflowId,
            vendor_data: attemptId,
            callback: callback.toString(),
            language: locale,
        }),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
        cache: "no-store",
    });
    if (!response.ok) throw new DiditError("DIDIT_UNAVAILABLE", "De identiteitscontrole kon niet worden gestart. Probeer het later opnieuw.");
    const session = sessionSchema.extend({ url: z.string().url() }).parse(await response.json());
    if (session.vendor_data !== attemptId || session.workflow_id !== config.workflowId) {
        throw new DiditError("DIDIT_UNAVAILABLE", "De verificatiesessie kon niet worden gecontroleerd.");
    }
    return { ...session, url: diditSessionUrl(session.url) };
}

export async function retrieveDiditSession(sessionId: string) {
    const config = diditConfig();
    const response = await fetch(`https://verification.didit.me/v3/session/${z.uuid().parse(sessionId)}/decision/`, {
        headers: { "x-api-key": config.apiKey },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
        cache: "no-store",
    });
    if (!response.ok) throw new DiditError("DIDIT_UNAVAILABLE", "Het verificatieresultaat is nog niet beschikbaar.");
    const result = decisionSchema.parse(await response.json());
    if (result.session_id !== sessionId) throw new DiditError("INVALID_DIDIT_CALLBACK", "Session mismatch", 400);
    return result;
}

export function verifyDiditWebhook(raw: Buffer, headers: Headers, secret: string, now = Date.now()) {
    // Next.js exposes untouched request bytes, so use Didit's full-body HMAC signature.
    // No fallback to the simple signature, which does not protect workflow/vendor data.
    const signature = headers.get("x-signature") ?? "";
    const timestamp = headers.get("x-timestamp") ?? "";
    if (!secret || !/^[a-f0-9]{64}$/i.test(signature) || !/^\d+$/.test(timestamp) ||
        Math.abs(now / 1000 - Number(timestamp)) > 300) {
        throw new DiditError("INVALID_DIDIT_CALLBACK", "Invalid webhook signature", 401);
    }
    const expected = createHmac("sha256", secret).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
        throw new DiditError("INVALID_DIDIT_CALLBACK", "Invalid webhook signature", 401);
    }
    const body = sessionSchema.extend({ timestamp: z.number().int(), webhook_type: z.string() }).parse(JSON.parse(raw.toString("utf8")));
    // Bind freshness to the signed payload, not just the caller-controlled header.
    if (body.timestamp !== Number(timestamp)) {
        throw new DiditError("INVALID_DIDIT_CALLBACK", "Invalid webhook timestamp", 401);
    }
    return body;
}
