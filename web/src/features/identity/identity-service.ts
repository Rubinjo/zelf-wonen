import { db } from "@/lib/db";

/** Persisted per-user verification cache; no provider call is needed to reuse it. */
export function identityVerificationTtlMs() {
    const days = Number(process.env.IDENTITY_VERIFICATION_TTL_DAYS ?? "365");
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        throw new Error("IDENTITY_VERIFICATION_TTL_DAYS must be between 0 and 3650");
    }
    return days * 86_400_000;
}

export function identityProvider() {
    const production = process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "production";
    return !production && process.env.DIDIT_MODE === "sandbox" ? "DIDIT_SANDBOX" : "DIDIT";
}

export async function latestVerifiedIdentity(userId: string) {
    const now = new Date();
    return db.identityVerificationAttempt.findFirst({
        where: {
            userId,
            provider: identityProvider(),
            purpose: "LISTING_PUBLICATION",
            status: "VERIFIED",
            completedAt: { not: null, gte: new Date(now.getTime() - identityVerificationTtlMs()), lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { completedAt: "desc" },
        select: { id: true, completedAt: true, expiresAt: true },
    });
}

export async function hasVerifiedIdentity(userId: string) {
    return Boolean(await latestVerifiedIdentity(userId));
}
