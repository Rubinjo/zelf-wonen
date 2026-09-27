import { createHash } from "node:crypto";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import { orderHashChain } from "@/lib/hash-chain";
import { deliverVerificationEmail } from "@/lib/verification-email";

async function appendEmailVerificationAudit(userId: string) {
    await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const auditEntries = await tx.verificationAuditLog.findMany({
            where: { userId },
            select: { entryHash: true, previousHash: true },
        });
        const orderedAudit = orderHashChain(auditEntries);
        if (!orderedAudit) {
            throw new Error("Verification audit chain is invalid");
        }
        const previous = orderedAudit.at(-1) ?? null;
        const occurredAt = new Date();
        const canonical = JSON.stringify({
            userId,
            kind: "EMAIL",
            status: "VERIFIED",
            purpose: "ACCOUNT_ACCESS",
            provider: "BETTER_AUTH",
            occurredAt: occurredAt.toISOString(),
        });
        const entryHash = createHash("sha256")
            .update(`${previous?.entryHash ?? "GENESIS"}:${canonical}`)
            .digest("hex");

        await tx.verificationAuditLog.create({
            data: {
                userId,
                kind: "EMAIL",
                status: "VERIFIED",
                purpose: "ACCOUNT_ACCESS",
                provider: "BETTER_AUTH",
                occurredAt,
                previousHash: previous?.entryHash,
                entryHash,
            },
        });
    });
}

export const auth = betterAuth({
    appName: "ZelfWonen",
    logger: {
        level: process.env.NODE_ENV === "development" ? "info" : "warn",
    },
    database: prismaAdapter(db, { provider: "postgresql" }),
    advanced: {
        database: {
            generateId: "uuid",
        },
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        minPasswordLength: 10,
    },
    emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        expiresIn: 60 * 60,
        async sendVerificationEmail({ user, url }) {
            await deliverVerificationEmail({
                email: user.email,
                name: user.name,
                url,
            });
        },
        async afterEmailVerification(user) {
            await appendEmailVerificationAudit(user.id);
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
    },
    plugins: [
        twoFactor({
            issuer: "ZelfWonen",
            totpOptions: { digits: 6, period: 30 },
            backupCodeOptions: { amount: 10, length: 10 },
        }),
        nextCookies(),
    ],
});
