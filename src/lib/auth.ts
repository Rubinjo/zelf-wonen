import { createHash } from "node:crypto";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

async function deliverVerificationEmail(input: {
    email: string;
    name: string;
    url: string;
}) {
    const endpoint = process.env.EMAIL_DELIVERY_WEBHOOK_URL;
    if (!endpoint) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("EMAIL_DELIVERY_WEBHOOK_URL is not configured");
        }

        console.info(
            `[ZelfWonen] Verification link for ${input.email}: ${input.url}`,
        );
        return;
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(process.env.EMAIL_DELIVERY_TOKEN
                ? {
                      authorization: `Bearer ${process.env.EMAIL_DELIVERY_TOKEN}`,
                  }
                : {}),
        },
        body: JSON.stringify({
            template: "verify-email",
            to: input.email,
            variables: { name: input.name, verificationUrl: input.url },
        }),
    });

    if (!response.ok) {
        throw new Error(
            `Verification email provider returned ${response.status}`,
        );
    }
}

async function appendEmailVerificationAudit(userId: string) {
    await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const previous = await tx.verificationAuditLog.findFirst({
            where: { userId },
            orderBy: { occurredAt: "desc" },
            select: { entryHash: true },
        });
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
    database: prismaAdapter(db, { provider: "postgresql" }),
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
    plugins: [nextCookies()],
});
