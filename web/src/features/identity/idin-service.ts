import {
    createHash,
    randomBytes,
    randomUUID,
    timingSafeEqual,
} from "node:crypto";
import { db } from "@/lib/db";
import { orderHashChain } from "@/lib/hash-chain";
import { requireTransactionParticipant } from "@/features/transactions/transaction-service";

export class IdinVerificationError extends Error {
    constructor(
        readonly code:
            | "LISTING_NOT_FOUND"
            | "LISTING_NOT_READY"
            | "TRANSACTION_NOT_FOUND"
            | "SIGNING_NOT_AVAILABLE"
            | "SIGNING_ALREADY_SIGNED"
            | "INVALID_CALLBACK"
            | "VERIFICATION_EXPIRED"
            | "PROVIDER_UNAVAILABLE",
        message: string,
    ) {
        super(message);
        this.name = "IdinVerificationError";
    }
}

function sha256(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function simulatedIdinEnabled() {
    const environment =
        process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
    return (
        !process.env.IDIN_PROVIDER_BASE_URL &&
        environment !== "production" &&
        (process.env.IDIN_MODE ?? "simulated") === "simulated"
    );
}

/**
 * Geldigheidsduur van een geslaagde identiteitsverificatie voor
 * toegangspoorten (bijv. publicatie van een advertentie). E-handtekeningen
 * (koopovereenkomst) gebruiken deze TTL bewust NIET: die doen altijd een verse
 * verificatie per handtekening.
 */
export const IDENTITY_VERIFICATION_TTL_MS =
    Number(process.env.IDENTITY_VERIFICATION_TTL_DAYS ?? "365") *
    24 *
    60 *
    60 *
    1000;

/**
 * Meest recente geslaagde iDIN-identiteitsverificatie van een gebruiker binnen
 * de TTL. Gebruikersniveau: onafhankelijk van een specifieke listing of
 * transactie, zodat één iDIN-voltooiing voor alle toegangspoorten geldt.
 */
export async function latestVerifiedIdentity(userId: string) {
    const cutoff = new Date(Date.now() - IDENTITY_VERIFICATION_TTL_MS);
    return db.identityVerificationAttempt.findFirst({
        where: {
            userId,
            status: "VERIFIED",
            completedAt: { not: null, gte: cutoff },
        },
        orderBy: { completedAt: "desc" },
        select: { id: true, completedAt: true, expiresAt: true },
    });
}

/** Heeft deze gebruiker een geldige (niet verlopen) iDIN-identiteitsverificatie? */
export async function hasVerifiedIdentity(userId: string) {
    return Boolean(await latestVerifiedIdentity(userId));
}

export async function startIdinVerification(input: {
    listingId: string;
    userId: string;
    locale: "nl" | "en";
}) {
    const listing = await db.listing.findFirst({
        where: { id: input.listingId, ownerId: input.userId },
        select: { id: true, status: true },
    });
    if (!listing)
        throw new IdinVerificationError(
            "LISTING_NOT_FOUND",
            "Listing not found",
        );
    if (!["READY_FOR_VERIFICATION", "LIVE"].includes(listing.status)) {
        throw new IdinVerificationError(
            "LISTING_NOT_READY",
            "Validate the listing before starting iDIN verification",
        );
    }
    if (!simulatedIdinEnabled()) {
        throw new IdinVerificationError(
            "PROVIDER_UNAVAILABLE",
            process.env.IDIN_PROVIDER_BASE_URL
                ? "The configured iDIN provider adapter has not been enabled"
                : "iDIN simulation is disabled in this environment",
        );
    }

    const verified = await latestVerifiedIdentity(input.userId);
    if (verified)
        return {
            alreadyVerified: true,
            redirectUrl: null,
            expiresAt: verified.expiresAt,
        };

    const state = randomBytes(32).toString("base64url");
    const providerReference = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.identityVerificationAttempt.create({
        data: {
            userId: input.userId,
            listingId: input.listingId,
            purpose: "LISTING_PUBLICATION",
            provider: "SIMULATED_IDIN",
            providerReference,
            status: "PENDING",
            expiresAt,
            attributesMatched: {
                stateHash: sha256(state),
                locale: input.locale,
            },
        },
    });

    // The simulator preserves the exact redirect/callback boundary used by a certified provider.
    // Production deployments must replace this URL with their signed provider transaction URL.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUrl = new URL("/api/idin/callback", appUrl);
    redirectUrl.searchParams.set("reference", providerReference);
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("result", "success");
    return {
        alreadyVerified: false,
        redirectUrl: redirectUrl.toString(),
        expiresAt,
    };
}

/**
 * Start iDIN voor het ondertekenen van een koopovereenkomst. Een geslaagde
 * verificatie levert een geavanceerde elektronische handtekening op
 * (identiteit via de bank bevestigd, Art 3:15a BW / eIDAS).
 */
export async function startAgreementSigningVerification(input: {
    transactionId: string;
    userId: string;
    locale: "nl" | "en";
}) {
    const participant = await requireTransactionParticipant(
        input.transactionId,
        input.userId,
    );
    const transaction = await db.propertyTransaction.findUniqueOrThrow({
        where: { id: input.transactionId },
        include: {
            listing: { select: { purpose: true } },
            agreement: true,
        },
    });
    if (transaction.listing.purpose !== "SALE" || !transaction.agreement) {
        throw new IdinVerificationError(
            "SIGNING_NOT_AVAILABLE",
            "Er is nog geen koopovereenkomst om te ondertekenen",
        );
    }
    const agreement = transaction.agreement;
    if (
        agreement.status !== "AWAITING_SIGNATURES" &&
        agreement.status !== "PARTIALLY_SIGNED"
    ) {
        throw new IdinVerificationError(
            "SIGNING_NOT_AVAILABLE",
            "De koopovereenkomst is op dit moment niet te ondertekenen",
        );
    }
    const isSeller = participant.sellerUserId === input.userId;
    const alreadySigned = isSeller
        ? Boolean(agreement.sellerSignedAt)
        : Boolean(agreement.buyerSignedAt);
    if (alreadySigned) {
        throw new IdinVerificationError(
            "SIGNING_ALREADY_SIGNED",
            "Je hebt de koopovereenkomst al ondertekend",
        );
    }
    if (!simulatedIdinEnabled()) {
        throw new IdinVerificationError(
            "PROVIDER_UNAVAILABLE",
            process.env.IDIN_PROVIDER_BASE_URL
                ? "The configured iDIN provider adapter has not been enabled"
                : "iDIN simulation is disabled in this environment",
        );
    }

    const state = randomBytes(32).toString("base64url");
    const providerReference = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.identityVerificationAttempt.create({
        data: {
            userId: input.userId,
            transactionId: input.transactionId,
            purpose: "AGREEMENT_SIGNING",
            provider: "SIMULATED_IDIN",
            providerReference,
            status: "PENDING",
            expiresAt,
            attributesMatched: {
                stateHash: sha256(state),
                locale: input.locale,
                agreementVersion: agreement.version,
                role: isSeller ? "SELLER" : "BUYER",
            },
        },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUrl = new URL("/api/idin/callback", appUrl);
    redirectUrl.searchParams.set("reference", providerReference);
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("result", "success");
    return {
        redirectUrl: redirectUrl.toString(),
        expiresAt,
    };
}

export async function completeSimulatedIdinVerification(input: {
    providerReference: string;
    state: string;
    result: "success" | "cancel";
}) {
    if (!simulatedIdinEnabled()) {
        throw new IdinVerificationError(
            "PROVIDER_UNAVAILABLE",
            "The simulated iDIN callback is disabled in this environment",
        );
    }
    const result = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.providerReference}))`;
        const initialAttempt = await tx.identityVerificationAttempt.findUnique({
            where: { providerReference: input.providerReference },
        });
        if (
            !initialAttempt ||
            initialAttempt.provider !== "SIMULATED_IDIN" ||
            (!initialAttempt.listingId && !initialAttempt.transactionId)
        ) {
            throw new IdinVerificationError(
                "INVALID_CALLBACK",
                "Unknown or completed iDIN transaction",
            );
        }
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${initialAttempt.userId}))`;
        const attempt = await tx.identityVerificationAttempt.findUnique({
            where: { providerReference: input.providerReference },
        });
        if (
            !attempt ||
            attempt.status !== "PENDING" ||
            (!attempt.listingId && !attempt.transactionId)
        ) {
            throw new IdinVerificationError(
                "INVALID_CALLBACK",
                "Unknown or completed iDIN transaction",
            );
        }
        const attributes = attempt.attributesMatched as {
            stateHash?: string;
        } | null;
        const supplied = Buffer.from(sha256(input.state), "hex");
        const expected = Buffer.from(attributes?.stateHash ?? "", "hex");
        if (
            supplied.length !== expected.length ||
            !timingSafeEqual(supplied, expected)
        ) {
            throw new IdinVerificationError(
                "INVALID_CALLBACK",
                "Invalid iDIN callback state",
            );
        }
        if (attempt.expiresAt && attempt.expiresAt <= new Date()) {
            await tx.identityVerificationAttempt.update({
                where: { id: attempt.id },
                data: {
                    status: "EXPIRED",
                    completedAt: new Date(),
                    failureCode: "CALLBACK_EXPIRED",
                },
            });
            return {
                userId: attempt.userId,
                listingId: attempt.listingId,
                transactionId: attempt.transactionId,
                status: "EXPIRED" as const,
            };
        }

        const completedAt = new Date();
        const status = input.result === "success" ? "VERIFIED" : "CANCELLED";
        const responsePayloadHash = sha256(
            JSON.stringify({
                providerReference: attempt.providerReference,
                status,
                completedAt: completedAt.toISOString(),
            }),
        );
        const signingContext =
            attempt.purpose === "AGREEMENT_SIGNING"
                ? {
                      agreementVersion: (
                          attempt.attributesMatched as {
                              agreementVersion?: number;
                          } | null
                      )?.agreementVersion,
                      role: (
                          attempt.attributesMatched as {
                              role?: string;
                          } | null
                      )?.role,
                  }
                : {};
        await tx.identityVerificationAttempt.update({
            where: { id: attempt.id },
            data: {
                status,
                completedAt,
                responsePayloadHash,
                subjectReferenceHash:
                    status === "VERIFIED"
                        ? sha256(
                              `${process.env.IDIN_SUBJECT_SALT ?? "development-idin-salt"}:${attempt.userId}`,
                          )
                        : null,
                attributesMatched:
                    status === "VERIFIED"
                        ? {
                              legalName: true,
                              is18OrOlder: true,
                              ...signingContext,
                          }
                        : undefined,
            },
        });

        const auditEntries = await tx.verificationAuditLog.findMany({
            where: { userId: attempt.userId },
            select: { entryHash: true, previousHash: true },
        });
        const orderedAudit = orderHashChain(auditEntries);
        if (!orderedAudit) {
            throw new IdinVerificationError(
                "INVALID_CALLBACK",
                "The verification audit chain failed its integrity check",
            );
        }
        const previous = orderedAudit.at(-1) ?? null;
        const canonical = JSON.stringify({
            userId: attempt.userId,
            listingId: attempt.listingId,
            transactionId: attempt.transactionId,
            kind: "IDIN",
            status,
            purpose: attempt.purpose,
            provider: attempt.provider,
            providerReference: attempt.providerReference,
            occurredAt: completedAt.toISOString(),
        });
        const entryHash = sha256(
            `${previous?.entryHash ?? "GENESIS"}:${canonical}`,
        );
        await tx.verificationAuditLog.create({
            data: {
                userId: attempt.userId,
                kind: "IDIN",
                status,
                purpose: attempt.purpose,
                provider: attempt.provider,
                providerReference: attempt.providerReference,
                metadata:
                    attempt.listingId && attempt.transactionId
                        ? {
                              listingId: attempt.listingId,
                              transactionId: attempt.transactionId,
                          }
                        : attempt.listingId
                          ? { listingId: attempt.listingId }
                          : { transactionId: attempt.transactionId },
                occurredAt: completedAt,
                previousHash: previous?.entryHash,
                entryHash,
            },
        });
        return {
            userId: attempt.userId,
            listingId: attempt.listingId,
            transactionId: attempt.transactionId,
            status,
        };
    });
    if (result.status === "EXPIRED") {
        throw new IdinVerificationError(
            "VERIFICATION_EXPIRED",
            "iDIN transaction expired",
        );
    }
    return result;
}
