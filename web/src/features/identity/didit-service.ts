import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { createDiditSession, diditConfig, DiditError, diditSessionUrl, type DiditSession } from "@/lib/integrations/identity/didit-client";
import { identityVerificationTtlMs, latestVerifiedIdentity } from "./identity-service";

export const DIDIT_MONTHLY_LIMIT = 499;
const providers = ["DIDIT", "DIDIT_SANDBOX"];

export function diditBudgetWhere(now: Date): Prisma.IdentityVerificationAttemptWhereInput {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return {
        provider: { in: providers },
        OR: [
            { requestedAt: { gte: start } },
            { completedAt: { gte: start } },
            // Carry unfinished and uncertain sessions forward; they may execute next month.
            { status: { in: ["INITIATED", "PENDING"] } },
        ],
    };
}

function metadata(value: Prisma.JsonValue | null) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function startDiditVerification(input: { listingId: string; userId: string; locale: "nl" | "en" }) {
    const listing = await db.listing.findFirst({
        where: { id: input.listingId, ownerId: input.userId, owner: { emailVerified: true } },
        select: { status: true },
    });
    if (!listing) throw new DiditError("DIDIT_UNAVAILABLE", "Advertentie niet gevonden.", 404);
    if (!["READY_FOR_VERIFICATION", "LIVE"].includes(listing.status)) {
        throw new DiditError("DIDIT_UNAVAILABLE", "Controleer eerst of je advertentie compleet is.", 409);
    }
    const verified = await latestVerifiedIdentity(input.userId);
    if (verified) return { alreadyVerified: true, redirectUrl: null };
    const config = diditConfig();

    const reservation = await db.$transaction(async (tx) => {
        // One global database lock covers every app process, user, listing and UTC month.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('didit-session-budget'))`;
        const pending = await tx.identityVerificationAttempt.findFirst({
            where: { userId: input.userId, provider: config.provider, status: { in: ["INITIATED", "PENDING"] } },
            orderBy: { requestedAt: "desc" },
        });
        if (pending) {
            const url = metadata(pending.attributesMatched).sessionUrl;
            if (pending.status === "PENDING" && typeof url === "string") {
                return { attempt: pending, url: diditSessionUrl(url), create: false };
            }
            throw new DiditError("VERIFICATION_PENDING", "Je verificatie wordt al gestart of gecontroleerd. Probeer het later opnieuw.", 409);
        }
        const now = new Date();
        const used = await tx.identityVerificationAttempt.count({ where: diditBudgetWhere(now) });
        if (used >= DIDIT_MONTHLY_LIMIT) {
            throw new DiditError("VERIFICATION_LIMIT_REACHED", input.locale === "en"
                ? "The monthly limit for free identity checks has been reached. Please try again next month."
                : "De maandelijkse limiet voor gratis identiteitscontroles is bereikt. Probeer het volgende maand opnieuw.", 429);
        }
        const id = randomUUID();
        const attempt = await tx.identityVerificationAttempt.create({
            data: {
                id, userId: input.userId, listingId: input.listingId,
                provider: config.provider, providerReference: `didit-reserved:${id}`,
                purpose: "LISTING_PUBLICATION", status: "INITIATED", requestedAt: now,
                attributesMatched: { workflowId: config.workflowId },
            },
        });
        return { attempt, url: null, create: true };
    });
    if (!reservation.create) return { alreadyVerified: false, redirectUrl: reservation.url };

    // The reservation is committed before the external request and never refunded automatically.
    try {
        const session = await createDiditSession(reservation.attempt.id, input.locale);
        await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reservation.attempt.id}))`;
            // A webhook may have arrived before the create-session response.
            await tx.identityVerificationAttempt.updateMany({
                where: { id: reservation.attempt.id, status: { in: ["INITIATED", "PENDING"] } },
                data: {
                    providerReference: session.session_id, status: "PENDING",
                    attributesMatched: { workflowId: config.workflowId, sessionUrl: session.url },
                },
            });
        });
        return { alreadyVerified: false, redirectUrl: session.url };
    } catch {
        // Unknown remote outcome: keep INITIATED charged, and do not create another session.
        throw new DiditError("DIDIT_UNAVAILABLE", "De verificatie kon niet veilig worden gestart. Probeer het later opnieuw of neem contact op met de beheerder.");
    }
}

export function diditStatus(status: string) {
    switch (status.toLowerCase().replaceAll("_", " ")) {
        case "approved": return "VERIFIED";
        case "declined": return "FAILED";
        case "expired": return "EXPIRED";
        case "abandoned": return "CANCELLED";
        case "not started":
        case "in progress":
        case "in review":
        case "not finished": return "PENDING";
        default: throw new DiditError("INVALID_DIDIT_CALLBACK", "Unknown verification status", 400);
    }
}

export async function applyDiditResult(session: DiditSession) {
    const config = diditConfig();
    if (session.environment !== (config.provider === "DIDIT" ? "live" : "sandbox")) {
        throw new DiditError("INVALID_DIDIT_CALLBACK", "Verification environment mismatch", 400);
    }
    const status = diditStatus(session.status);
    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.vendor_data}))`;
        const attempt = await tx.identityVerificationAttempt.findFirst({
            where: { id: session.vendor_data, provider: config.provider, purpose: "LISTING_PUBLICATION" },
        });
        if (!attempt || session.workflow_id !== metadata(attempt.attributesMatched).workflowId ||
            (attempt.providerReference !== session.session_id && attempt.providerReference !== `didit-reserved:${attempt.id}`)) {
            throw new DiditError("INVALID_DIDIT_CALLBACK", "Session does not match verification attempt", 400);
        }
        // Replayed or out-of-order notifications cannot overturn a recorded terminal decision.
        if (!["INITIATED", "PENDING"].includes(attempt.status)) return attempt;
        const completedAt = status === "PENDING" ? null : new Date();
        const responsePayloadHash = createHash("sha256").update(JSON.stringify(session)).digest("hex");
        const result = await tx.identityVerificationAttempt.update({
            where: { id: attempt.id },
            data: {
                providerReference: session.session_id, status, completedAt, responsePayloadHash,
                expiresAt: status === "VERIFIED" && completedAt
                    ? new Date(completedAt.getTime() + identityVerificationTtlMs()) : null,
                failureCode: status === "FAILED" ? "DIDIT_DECLINED" : null,
                // No document, selfie, biometric template or extracted personal data is stored here.
                attributesMatched: {
                    ...metadata(attempt.attributesMatched), providerStatus: session.status,
                    ...(status === "PENDING" ? {} : { sessionUrl: null }),
                },
            },
        });
        if (completedAt) {
            // Existing generic append-only audit table avoids labelling Didit as bank iDIN.
            await tx.auditEvent.create({
                data: {
                    actorUserId: attempt.userId, listingId: attempt.listingId,
                    aggregateType: "IDENTITY_VERIFICATION", aggregateId: attempt.id,
                    eventType: `DIDIT_${status}`, occurredAt: completedAt,
                    payload: { provider: attempt.provider, sessionId: session.session_id, status },
                    entryHash: createHash("sha256").update(`${attempt.id}:${responsePayloadHash}`).digest("hex"),
                },
            });
        }
        return result;
    });
}
