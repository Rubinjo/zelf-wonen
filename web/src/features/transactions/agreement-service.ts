import type {
    AgreementSecurityType,
    Prisma,
    PurchaseAgreementStatus,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { reconcileMilestones } from "@/features/transactions/milestone-engine";
import {
    appendTransactionEvent,
    requireTransactionParticipant,
} from "@/features/transactions/transaction-service";

export class AgreementError extends Error {
    constructor(
        readonly code:
            | "AGREEMENT_NOT_FOUND"
            | "AGREEMENT_FORBIDDEN"
            | "AGREEMENT_SALE_ONLY"
            | "AGREEMENT_LOCKED"
            | "AGREEMENT_INVALID"
            | "AGREEMENT_ALREADY_SIGNED"
            | "AGREEMENT_SIGNING_UNAVAILABLE",
        message: string,
    ) {
        super(message);
        this.name = "AgreementError";
    }
}

/**
 * Erkende feestdagen in Nederland (2026).
 * Bevrijdingsdag (5 mei) is alleen in lustrumjaren (2020, 2025, 2030, …) een
 * vrije dag en is daarom voor 2026 niet opgenomen. Werk deze lijst bij vóór
 * productie; de berekening van de wettelijke bedenktijd hangt hiervan af.
 */
export const NL_PUBLIC_HOLIDAYS = new Set([
    "2026-01-01", // Nieuwjaarsdag
    "2026-04-03", // Goede Vrijdag
    "2026-04-05", // Eerste Paasdag
    "2026-04-06", // Tweede Paasdag
    "2026-04-27", // Koningsdag
    "2026-05-14", // Hemelvaartsdag
    "2026-05-24", // Eerste Pinksterdag
    "2026-05-25", // Tweede Pinksterdag
    "2026-12-25", // Eerste Kerstdag
    "2026-12-26", // Tweede Kerstdag
]);

/** Maximum waarborgsom: 10% van de koopsom (Art 7:26 lid 4 BW). */
export const MAX_SECURITY_PERCENT = 0.1;

/** Marktstandaard financieringsvoorbehoud: 6 weken (geen wettelijk minimum). */
export const DEFAULT_FINANCING_WEEKS = 6;
/** Gangbare termijn bouwkundige keuring: 2 weken. */
export const DEFAULT_INSPECTION_DAYS = 14;

function startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

function isWorkingDay(date: Date): boolean {
    const day = date.getDay();
    if (day === 0 || day === 6) return false;
    return !NL_PUBLIC_HOLIDAYS.has(date.toISOString().slice(0, 10));
}

/**
 * Wettelijke bedenktijd (Art 7:2 lid 2 BW): drie dagen, waarvan ten minste twee
 * werkdagen, te rekenen vanaf 00:00 van de dag na terhandstelling van de
 * ondertekende koopovereenkomst. Eindigt de termijn op een zaterdag, zondag of
 * feestdag, dan wordt verlengd tot en met de eerstvolgende werkdag. Eindigt op
 * 23:59. Een langere termijn mag worden overeengekomen, een kortere niet.
 */
export function computeCoolingOffEndsAt(receivedAt: Date, days = 3): Date {
    const safeDays = Math.max(3, Math.floor(days));
    const start = startOfDay(receivedAt);
    start.setDate(start.getDate() + 1);
    const current = new Date(start);
    let dayCount = 0;
    let workingCount = 0;
    let lastDay = new Date(start);
    for (let guard = 0; guard < 30; guard += 1) {
        if (isWorkingDay(current)) workingCount += 1;
        dayCount += 1;
        lastDay = new Date(current);
        if (
            dayCount >= safeDays &&
            workingCount >= 2 &&
            isWorkingDay(lastDay)
        ) {
            break;
        }
        current.setDate(current.getDate() + 1);
    }
    lastDay.setHours(23, 59, 59, 999);
    return lastDay;
}

export type AgreementFormData = {
    sellerCivilStatus: string;
    sellerAddress: string;
    sellerSpouseName: string | null;
    buyerCivilStatus: string;
    buyerAddress: string;
    buyerSpouseName: string | null;
    kadastraleOmschrijving: string | null;
    movables: Array<{ description: string; valueCents: string }>;
    securityType: AgreementSecurityType;
    securityAmountCents: string | null;
    securityDueDate: string | Date | null;
    financingCondition: boolean;
    financingTermWeeks: number;
    inspectionCondition: boolean;
    inspectionTermDays: number;
    inspectionCostCapCents: string | null;
    nhgCondition: boolean;
    nhgTermWeeks: number;
    foundationCondition: boolean;
    foundationTermWeeks: number;
    transferDate: string | Date;
    kadasterRegistration: boolean;
    buyerPaysCosts: boolean;
    coolingOffDays: number;
    additionalTerms: string | null;
};

const PARTICIPANT_CODES: Record<string, string> = {
    DRAFT: "AGREEMENT_INVALID",
    AWAITING_SIGNATURES: "AGREEMENT_INVALID",
    PARTIALLY_SIGNED: "AGREEMENT_INVALID",
    SIGNED: "AGREEMENT_LOCKED",
    VOID: "AGREEMENT_LOCKED",
};

/** Controleert of de conceptovereenkomst aan de wettelijke vereisten voldoet. */
export function validateAgreementData(agreement: {
    purchasePriceCents: bigint | string;
    transferDate: Date | string | null;
    coolingOffDays: number;
    financingCondition: boolean;
    financingTermWeeks: number;
    inspectionCondition: boolean;
    inspectionTermDays: number;
    securityType: AgreementSecurityType;
    securityAmountCents: bigint | string | null;
    sellerCivilStatus: string | null;
    buyerCivilStatus: string | null;
}): { ok: true } | { ok: false; error: string } {
    const price = BigInt(agreement.purchasePriceCents);
    const security = validateSecurity(
        agreement.securityType,
        agreement.securityAmountCents,
        price,
    );
    if (!security.ok) return security;
    if (
        agreement.transferDate === null ||
        agreement.transferDate === undefined ||
        String(agreement.transferDate).trim() === ""
    ) {
        return { ok: false, error: "Geef een leveringsdatum (passeren) op." };
    }
    if (!agreement.sellerCivilStatus?.trim()) {
        return {
            ok: false,
            error: "Vul de burgerlijke staat van de verkoper in.",
        };
    }
    if (!agreement.buyerCivilStatus?.trim()) {
        return {
            ok: false,
            error: "Vul de burgerlijke staat van de koper in.",
        };
    }
    if (agreement.coolingOffDays < 3) {
        return {
            ok: false,
            error: "De wettelijke bedenktijd is minimaal drie dagen.",
        };
    }
    if (agreement.financingCondition && agreement.financingTermWeeks < 1) {
        return {
            ok: false,
            error: "Geef een geldige financieringstermijn op.",
        };
    }
    if (agreement.inspectionCondition && agreement.inspectionTermDays < 1) {
        return {
            ok: false,
            error: "Geef een geldige termijn voor de bouwkundige keuring op.",
        };
    }
    return { ok: true };
}

export function validateSecurity(
    type: AgreementSecurityType,
    amountCents: bigint | string | null,
    purchasePriceCents: bigint | string,
): { ok: true } | { ok: false; error: string } {
    const price = BigInt(purchasePriceCents);
    const maximum = BigInt(Math.floor(Number(price) * MAX_SECURITY_PERCENT));
    if (type === "NONE") return { ok: true };
    if (
        amountCents === null ||
        amountCents === undefined ||
        amountCents === ""
    ) {
        return {
            ok: false,
            error: "Vul het bedrag van de waarborgsom of bankgarantie in (maximaal 10% van de koopsom).",
        };
    }
    const amount = BigInt(amountCents);
    if (amount <= BigInt(0)) {
        return { ok: false, error: "De waarborgsom moet groter zijn dan € 0." };
    }
    if (amount > maximum) {
        return {
            ok: false,
            error: `De waarborgsom mag maximaal 10% van de koopsom zijn (max. € ${(Number(maximum) / 100).toLocaleString("nl-NL")}).`,
        };
    }
    return { ok: true };
}

/** Geeft de overeenkomst terug aan een deelnemer, of null als die nog niet bestaat. */
export async function getAgreementForUser(
    transactionId: string,
    userId: string,
) {
    await requireTransactionParticipant(transactionId, userId);
    return db.purchaseAgreement.findUnique({
        where: { transactionId },
    });
}

function agreementErrorForStatus(
    code: string,
    status: PurchaseAgreementStatus,
) {
    return new AgreementError(
        code as AgreementError["code"],
        status === "SIGNED" || status === "VOID"
            ? "De koopovereenkomst is al definitief ondertekend of vervallen."
            : "De koopovereenkomst is op dit moment niet te wijzigen.",
    );
}

/** Verkoper bewaart een concept van de koopovereenkomst. */
export async function saveAgreementDraft(
    transactionId: string,
    userId: string,
    input: AgreementFormData,
) {
    const participant = await requireTransactionParticipant(
        transactionId,
        userId,
    );
    if (participant.sellerUserId !== userId) {
        throw new AgreementError(
            "AGREEMENT_FORBIDDEN",
            "Alleen de verkoper kan de koopovereenkomst opstellen.",
        );
    }
    const result = await db.$transaction(async (tx) => {
        const transaction = await tx.propertyTransaction.findUniqueOrThrow({
            where: { id: transactionId },
            include: {
                listing: { select: { purpose: true } },
                agreement: true,
            },
        });
        if (transaction.listing.purpose !== "SALE") {
            throw new AgreementError(
                "AGREEMENT_SALE_ONLY",
                "Een koopovereenkomst kan alleen voor een verkoop worden opgesteld.",
            );
        }
        const existing = transaction.agreement;
        if (
            existing &&
            (existing.status === "SIGNED" || existing.status === "VOID")
        ) {
            throw agreementErrorForStatus(
                PARTICIPANT_CODES[existing.status],
                existing.status,
            );
        }
        // Zodra een partij heeft ondertekend mag de inhoud niet meer worden
        // gewijzigd zonder dat die ondertekening vervalt.
        if (existing && (existing.sellerSignedAt || existing.buyerSignedAt)) {
            throw new AgreementError(
                "AGREEMENT_LOCKED",
                "De koopovereenkomst is al (gedeeltelijk) ondertekend en kan niet meer worden gewijzigd.",
            );
        }
        const movablesValue = input.movables.reduce(
            (sum, item) => sum + BigInt(item.valueCents || "0"),
            BigInt(0),
        );
        const data = {
            sellerCivilStatus: input.sellerCivilStatus,
            sellerAddress: input.sellerAddress,
            sellerSpouseName: input.sellerSpouseName || null,
            buyerCivilStatus: input.buyerCivilStatus,
            buyerAddress: input.buyerAddress,
            buyerSpouseName: input.buyerSpouseName || null,
            kadastraleOmschrijving: input.kadastraleOmschrijving || null,
            movables: input.movables as Prisma.InputJsonValue,
            movablesValueCents: movablesValue,
            securityType: input.securityType,
            securityAmountCents: input.securityAmountCents
                ? BigInt(input.securityAmountCents)
                : null,
            securityDueDate: input.securityDueDate
                ? new Date(input.securityDueDate)
                : null,
            financingCondition: input.financingCondition,
            financingTermWeeks: input.financingTermWeeks,
            inspectionCondition: input.inspectionCondition,
            inspectionTermDays: input.inspectionTermDays,
            inspectionCostCapCents: input.inspectionCostCapCents
                ? BigInt(input.inspectionCostCapCents)
                : null,
            nhgCondition: input.nhgCondition,
            nhgTermWeeks: input.nhgTermWeeks,
            foundationCondition: input.foundationCondition,
            foundationTermWeeks: input.foundationTermWeeks,
            transferDate: new Date(input.transferDate),
            kadasterRegistration: input.kadasterRegistration,
            buyerPaysCosts: input.buyerPaysCosts,
            coolingOffDays: input.coolingOffDays,
            additionalTerms: input.additionalTerms || null,
        } satisfies Prisma.PurchaseAgreementUpdateInput;
        const agreement = existing
            ? await tx.purchaseAgreement.update({
                  where: { transactionId },
                  data: {
                      ...data,
                      version: { increment: 1 },
                      // Een inhoudelijke wijziging laat vervroegde ondertekening vervallen.
                      sellerSignedAt: null,
                      sellerSignatureMethod: null,
                      buyerSignedAt: null,
                      buyerSignatureMethod: null,
                      status: "DRAFT",
                  },
              })
            : await tx.purchaseAgreement.create({
                  data: { transactionId, ...data },
              });
        await appendTransactionEvent(
            tx,
            transactionId,
            userId,
            "AGREEMENT_UPDATED",
            { version: agreement.version, status: agreement.status },
        );
        return agreement;
    });
    return result;
}

/** Verkoper stuurt de conceptovereenkomst ter ondertekening. */
export async function submitAgreement(transactionId: string, userId: string) {
    const participant = await requireTransactionParticipant(
        transactionId,
        userId,
    );
    if (participant.sellerUserId !== userId) {
        throw new AgreementError(
            "AGREEMENT_FORBIDDEN",
            "Alleen de verkoper kan de koopovereenkomst ter ondertekening aanbieden.",
        );
    }
    const result = await db.$transaction(async (tx) => {
        const transaction = await tx.propertyTransaction.findUniqueOrThrow({
            where: { id: transactionId },
            include: {
                listing: { select: { purpose: true } },
                agreement: true,
            },
        });
        if (transaction.listing.purpose !== "SALE") {
            throw new AgreementError(
                "AGREEMENT_SALE_ONLY",
                "Een koopovereenkomst kan alleen voor een verkoop worden opgesteld.",
            );
        }
        const agreement = transaction.agreement;
        if (!agreement) {
            throw new AgreementError(
                "AGREEMENT_NOT_FOUND",
                "Stel eerst de koopovereenkomst op.",
            );
        }
        if (agreement.status === "SIGNED" || agreement.status === "VOID") {
            throw agreementErrorForStatus(
                PARTICIPANT_CODES[agreement.status],
                agreement.status,
            );
        }
        const validation = validateAgreementData({
            purchasePriceCents: transaction.purchasePriceCents,
            transferDate: agreement.transferDate,
            coolingOffDays: agreement.coolingOffDays,
            financingCondition: agreement.financingCondition,
            financingTermWeeks: agreement.financingTermWeeks,
            inspectionCondition: agreement.inspectionCondition,
            inspectionTermDays: agreement.inspectionTermDays,
            securityType: agreement.securityType,
            securityAmountCents: agreement.securityAmountCents,
            sellerCivilStatus: agreement.sellerCivilStatus,
            buyerCivilStatus: agreement.buyerCivilStatus,
        });
        if (!validation.ok) {
            throw new AgreementError("AGREEMENT_INVALID", validation.error);
        }
        const updated = await tx.purchaseAgreement.update({
            where: { transactionId },
            data: {
                status: "AWAITING_SIGNATURES",
                submittedAt: new Date(),
            },
        });
        // De voortgangsmotor zet de mijlpaal op IN_PROGRESS zodra de
        // overeenkomst is ingediend voor ondertekening.
        await reconcileMilestones(tx, transactionId);
        await appendTransactionEvent(
            tx,
            transactionId,
            userId,
            "AGREEMENT_SUBMITTED",
            { version: updated.version, status: updated.status },
        );
        return updated;
    });
    return result;
}

/** Verkoper trekt de (concept)overeenkomst in. */
export async function voidAgreement(
    transactionId: string,
    userId: string,
    reason: string,
) {
    const participant = await requireTransactionParticipant(
        transactionId,
        userId,
    );
    if (participant.sellerUserId !== userId) {
        throw new AgreementError(
            "AGREEMENT_FORBIDDEN",
            "Alleen de verkoper kan de koopovereenkomst intrekken.",
        );
    }
    const result = await db.$transaction(async (tx) => {
        const agreement = await tx.purchaseAgreement.findUnique({
            where: { transactionId },
        });
        if (!agreement) {
            throw new AgreementError(
                "AGREEMENT_NOT_FOUND",
                "De koopovereenkomst is nog niet opgesteld.",
            );
        }
        if (agreement.status === "SIGNED") {
            throw new AgreementError(
                "AGREEMENT_LOCKED",
                "Een ondertekende koopovereenkomst kan niet worden ingetrokken. Beëindig de transactie of neem contact op met de notaris.",
            );
        }
        const updated = await tx.purchaseAgreement.update({
            where: { transactionId },
            data: {
                status: "VOID",
                voidedAt: new Date(),
                voidReason: reason || null,
            },
        });
        // De voortgangsmotor zet de overeenkomstmijlpaal terug naar
        // NOT_STARTED zolang er geen geldige overeenkomst is.
        await reconcileMilestones(tx, transactionId);
        await appendTransactionEvent(
            tx,
            transactionId,
            userId,
            "AGREEMENT_UPDATED",
            { status: updated.status, reason: reason ?? null },
        );
        return updated;
    });
    return result;
}
