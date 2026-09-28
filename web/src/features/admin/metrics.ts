import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { diditBudgetWhere, DIDIT_MONTHLY_LIMIT } from "@/features/identity/didit-service";
import { isAdminUser } from "./access";

const money = z.number().finite().nonnegative();
const keyUsageSchema = z.object({ data: z.object({
    usage: money,
    usage_daily: money,
    usage_monthly: money,
    limit_remaining: money.nullable(),
}) });

async function getOpenRouterUsage() {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return { status: "unconfigured" as const };
    try {
        const response = await fetch("https://openrouter.ai/api/v1/key", {
            headers: { Authorization: "Bearer " + key },
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return { status: "unavailable" as const };
        const parsed = keyUsageSchema.safeParse(await response.json());
        if (!parsed.success) return { status: "unavailable" as const };
        return { status: "available" as const, ...parsed.data.data };
    } catch {
        return { status: "unavailable" as const };
    }
}

export async function getAdminMetrics() {
    // Authorize at the data boundary, before database queries or provider requests.
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !isAdminUser(session.user)) notFound();

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const diditWhere = { provider: { in: ["DIDIT", "DIDIT_SANDBOX"] } };
    const [totalAccounts, activeAccounts, newAccounts, verifiedAccounts, listings,
        aggregatedListings, transactions, diditStatuses, diditMonth, diditBudget, openRouter] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { sessions: { some: { expiresAt: { gt: now } } } } }),
        db.user.count({ where: { createdAt: { gte: monthStart } } }),
        db.user.count({ where: { emailVerified: true } }),
        db.listing.groupBy({ by: ["status"], _count: { _all: true } }),
        db.aggregatedListing.count({ where: { status: "ACTIVE" } }),
        db.propertyTransaction.count({ where: { status: "ACTIVE" } }),
        db.identityVerificationAttempt.groupBy({ by: ["status"], where: diditWhere, _count: { _all: true } }),
        db.identityVerificationAttempt.groupBy({ by: ["provider"], where: { ...diditWhere, requestedAt: { gte: monthStart } }, _count: { _all: true } }),
        db.identityVerificationAttempt.count({ where: diditBudgetWhere(now) }),
        getOpenRouterUsage(),
    ]);
    return { now, totalAccounts, activeAccounts, newAccounts, verifiedAccounts, listings,
        aggregatedListings, transactions, diditStatuses, diditMonth, diditBudget,
        diditLimit: DIDIT_MONTHLY_LIMIT, openRouter };
}
