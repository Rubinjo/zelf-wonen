import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export class AuthenticationError extends Error {
    constructor(
        message: string,
        readonly code:
            | "AUTHENTICATION_REQUIRED"
            | "EMAIL_VERIFICATION_REQUIRED",
    ) {
        super(message);
        this.name = "AuthenticationError";
    }
}

export async function requireEmailVerifiedUser() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        throw new AuthenticationError(
            "Authentication required",
            "AUTHENTICATION_REQUIRED",
        );
    }

    if (!session.user.emailVerified) {
        throw new AuthenticationError(
            "Verify your email address before using platform features",
            "EMAIL_VERIFICATION_REQUIRED",
        );
    }

    return session;
}
