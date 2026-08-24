import type {
    Prisma,
    TransactionMilestoneStatus,
} from "@/generated/prisma/client";

/**
 * Declaratieve voortgangsmotor voor transactiemijlpalen.
 *
 * Mijlpalen worden NIET meer handmatig aangevinkt door gebruikers. In plaats
 * daarvan wordt elke mijlpaal afgeleid uit de feitelijke platformstaat:
 *
 *  - PURCHASE_AGREEMENT / koop- of huurovereenkomst
 *      wordt pas "COMPLETED" als BEIDE partijen hebben ondertekend/bevestigd.
 *  - COOLING_OFF_PERIOD (wettelijke bedenktijd)
 *      loopt automatisch af zodra de einddatum is verstreken.
 *  - FINANCING / BUILDING_INSPECTION / SECURITY_DEPOSIT
 *      worden "COMPLETED" zodra het bijbehorende bewijsstuk in de
 *      documentkluis is geüpload; zonder voorbehoud zijn ze "WAIVED".
 *  - NOTARY_SELECTION
 *      wordt "COMPLETED" zodra de KOPER de notaris bevestigt; een voorstel
 *      van de verkoper zet de stap op "IN_PROGRESS".
 *  - FINAL_INSPECTION
 *      wordt "COMPLETED" zodra de eindinspectie/oplevering is vastgelegd.
 *  - DEED_OF_TRANSFER / KEY_HANDOVER
 *      worden "COMPLETED" zodra de transactie is afgerond.
 */

export type MilestoneDerivation = {
    status: TransactionMilestoneStatus;
    dueAt: Date | null;
    completedAt: Date | null;
    details?: Prisma.InputJsonValue;
};

export type MilestoneEngineState = {
    purpose: "SALE" | "RENT";
    transactionStatus: string;
    coolingOffEndsAt: Date | null;
    targetTransferDate: Date | null;
    buyerContractConfirmedAt: Date | null;
    sellerContractConfirmedAt: Date | null;
    notaryConfirmedAt: Date | null;
    notaryProposedAt: Date | null;
    handoverDetails: unknown;
    agreement: {
        status: string;
        signedAt: Date | null;
        financingCondition: boolean;
        financingDeadline: Date | null;
        inspectionCondition: boolean;
        inspectionDeadline: Date | null;
        securityType: string;
        securityDueDate: Date | null;
    } | null;
    uploadedCategories: string[];
};

export function deriveMilestoneStatuses(
    state: MilestoneEngineState,
): Record<string, MilestoneDerivation> {
    const now = new Date();
    const agreement = state.agreement;
    const hasDocument = (category: string) =>
        state.uploadedCategories.includes(category);
    const bothConfirmed = Boolean(
        state.buyerContractConfirmedAt && state.sellerContractConfirmedAt,
    );
    const contractSigned =
        state.purpose === "SALE"
            ? agreement?.status === "SIGNED" || bothConfirmed
            : bothConfirmed;
    const contractStarted =
        state.purpose === "SALE"
            ? Boolean(
                  agreement &&
                  ["AWAITING_SIGNATURES", "PARTIALLY_SIGNED"].includes(
                      agreement.status,
                  ),
              ) ||
              Boolean(state.buyerContractConfirmedAt) ||
              Boolean(state.sellerContractConfirmedAt)
            : Boolean(
                  state.buyerContractConfirmedAt ||
                  state.sellerContractConfirmedAt,
              );
    const lastConfirmation =
        state.buyerContractConfirmedAt && state.sellerContractConfirmedAt
            ? state.buyerContractConfirmedAt.getTime() >
              state.sellerContractConfirmedAt.getTime()
                ? state.buyerContractConfirmedAt
                : state.sellerContractConfirmedAt
            : (state.buyerContractConfirmedAt ??
              state.sellerContractConfirmedAt);

    const result: Record<string, MilestoneDerivation> = {};

    // Koop-/huurovereenkomst: alleen compleet na ondertekening door beide partijen.
    if (contractSigned) {
        result.PURCHASE_AGREEMENT = {
            status: "COMPLETED",
            dueAt: null,
            completedAt:
                state.purpose === "SALE"
                    ? (agreement?.signedAt ?? now)
                    : (lastConfirmation ?? now),
            details:
                state.purpose === "SALE"
                    ? { scope: "koopovereenkomst" }
                    : { scope: "huurovereenkomst" },
        };
    } else if (contractStarted) {
        result.PURCHASE_AGREEMENT = {
            status: "IN_PROGRESS",
            dueAt: null,
            completedAt: null,
        };
    } else {
        result.PURCHASE_AGREEMENT = {
            status: "NOT_STARTED",
            dueAt: null,
            completedAt: null,
        };
    }

    // Wettelijke bedenktijd: alleen voor koop, verloopt automatisch.
    if (state.purpose === "RENT") {
        result.COOLING_OFF_PERIOD = {
            status: "WAIVED",
            dueAt: null,
            completedAt: lastConfirmation ?? null,
            details: { scope: "huur" },
        };
    } else if (state.coolingOffEndsAt) {
        const ended = state.coolingOffEndsAt.getTime() <= now.getTime();
        result.COOLING_OFF_PERIOD = {
            status: ended ? "COMPLETED" : "IN_PROGRESS",
            dueAt: state.coolingOffEndsAt,
            completedAt: ended ? state.coolingOffEndsAt : null,
            details: { rule: "Art 7:2 lid 2 BW" },
        };
    } else {
        result.COOLING_OFF_PERIOD = {
            status: "NOT_STARTED",
            dueAt: null,
            completedAt: null,
        };
    }

    // Ontbindende voorwaarden / bewijsstukken: afgerond via documentkluis.
    if (state.purpose === "RENT" || agreement?.financingCondition === false) {
        result.FINANCING = {
            status: "WAIVED",
            dueAt: null,
            completedAt: agreement?.signedAt ?? lastConfirmation ?? null,
            details: { scope: "geen financieringsvoorbehoud" },
        };
    } else if (contractSigned && hasDocument("FINANCING")) {
        result.FINANCING = {
            status: "COMPLETED",
            dueAt: null,
            completedAt: now,
            details: { evidence: "financieringsbewijs" },
        };
    } else if (contractSigned) {
        result.FINANCING = {
            status: "IN_PROGRESS",
            dueAt: agreement?.financingDeadline ?? null,
            completedAt: null,
        };
    } else {
        result.FINANCING = {
            status: "NOT_STARTED",
            dueAt: agreement?.financingDeadline ?? null,
            completedAt: null,
        };
    }

    if (state.purpose === "RENT" || agreement?.inspectionCondition === false) {
        result.BUILDING_INSPECTION = {
            status: "WAIVED",
            dueAt: null,
            completedAt: agreement?.signedAt ?? lastConfirmation ?? null,
            details: { scope: "geen keuringsvoorbehoud" },
        };
    } else if (contractSigned && hasDocument("BUILDING_INSPECTION")) {
        result.BUILDING_INSPECTION = {
            status: "COMPLETED",
            dueAt: null,
            completedAt: now,
            details: { evidence: "keuringsrapport" },
        };
    } else if (contractSigned) {
        result.BUILDING_INSPECTION = {
            status: "IN_PROGRESS",
            dueAt: agreement?.inspectionDeadline ?? null,
            completedAt: null,
        };
    } else {
        result.BUILDING_INSPECTION = {
            status: "NOT_STARTED",
            dueAt: agreement?.inspectionDeadline ?? null,
            completedAt: null,
        };
    }

    if (agreement?.securityType === "NONE") {
        result.SECURITY_DEPOSIT = {
            status: "WAIVED",
            dueAt: null,
            completedAt: agreement?.signedAt ?? null,
            details: { scope: "geen waarborgsom" },
        };
    } else if (contractSigned && hasDocument("SECURITY_DEPOSIT")) {
        result.SECURITY_DEPOSIT = {
            status: "COMPLETED",
            dueAt: null,
            completedAt: now,
            details: { evidence: "waarborgsom/borgbewijs" },
        };
    } else if (contractSigned) {
        result.SECURITY_DEPOSIT = {
            status: "IN_PROGRESS",
            dueAt: agreement?.securityDueDate ?? null,
            completedAt: null,
        };
    } else {
        result.SECURITY_DEPOSIT = {
            status: "NOT_STARTED",
            dueAt: agreement?.securityDueDate ?? null,
            completedAt: null,
        };
    }

    // Notariskiezen: voorstel van verkoper = IN_PROGRESS, bevestiging koper = COMPLETED.
    if (state.purpose === "RENT") {
        result.NOTARY_SELECTION = {
            status: "WAIVED",
            dueAt: null,
            completedAt: lastConfirmation ?? null,
            details: { scope: "huur" },
        };
    } else if (state.notaryConfirmedAt) {
        result.NOTARY_SELECTION = {
            status: "COMPLETED",
            dueAt: null,
            completedAt: state.notaryConfirmedAt,
            details: { role: "koper" },
        };
    } else if (state.notaryProposedAt) {
        result.NOTARY_SELECTION = {
            status: "IN_PROGRESS",
            dueAt: null,
            completedAt: null,
            details: { role: "verkoper voorstel" },
        };
    } else {
        result.NOTARY_SELECTION = {
            status: "NOT_STARTED",
            dueAt: null,
            completedAt: null,
        };
    }

    // Leveringsakte: bij verhuur niet van toepassing.
    if (state.purpose === "RENT") {
        result.DEED_OF_TRANSFER = {
            status: "WAIVED",
            dueAt: null,
            completedAt: lastConfirmation ?? null,
            details: { scope: "huur" },
        };
    } else if (state.transactionStatus === "COMPLETED") {
        result.DEED_OF_TRANSFER = {
            status: "COMPLETED",
            dueAt: state.targetTransferDate,
            completedAt: now,
        };
    } else {
        result.DEED_OF_TRANSFER = {
            status:
                state.transactionStatus === "READY_FOR_TRANSFER"
                    ? "IN_PROGRESS"
                    : "NOT_STARTED",
            dueAt: state.targetTransferDate,
            completedAt: null,
        };
    }

    // Eindinspectie: afgerond zodra oplevering is vastgelegd.
    result.FINAL_INSPECTION = {
        status: state.handoverDetails ? "COMPLETED" : "NOT_STARTED",
        dueAt: null,
        completedAt: null,
    };

    // Sleuteloverdracht: afgerond bij afronding van de transactie.
    result.KEY_HANDOVER = {
        status:
            state.transactionStatus === "COMPLETED"
                ? "COMPLETED"
                : "NOT_STARTED",
        dueAt: state.targetTransferDate,
        completedAt: state.transactionStatus === "COMPLETED" ? now : null,
    };

    return result;
}

/**
 * Schrijft de afgeleide mijlpaalstatussen naar de database binnen een
 * transactie. Roep dit aan na elke mutatie die de mijlpaalstatus kan
 * beïnvloeden (ondertekening, bevestiging, document-upload, notaris, oplevering).
 *
 * completedAt wordt bevroren zodra een mijlpaal eenmaal COMPLETED is, zodat
 * herberekeningen de datum niet telkens opnieuw naar "nu" zetten.
 */
export async function reconcileMilestones(
    tx: Prisma.TransactionClient,
    transactionId: string,
) {
    const transaction = await tx.propertyTransaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: {
            listing: { select: { purpose: true } },
            agreement: {
                select: {
                    status: true,
                    signedAt: true,
                    financingCondition: true,
                    financingDeadline: true,
                    inspectionCondition: true,
                    inspectionDeadline: true,
                    securityType: true,
                    securityDueDate: true,
                },
            },
            documents: {
                where: { status: "AVAILABLE" },
                select: { category: true },
            },
        },
    });
    const derived = deriveMilestoneStatuses({
        purpose: transaction.listing.purpose,
        transactionStatus: transaction.status,
        coolingOffEndsAt: transaction.coolingOffEndsAt,
        targetTransferDate: transaction.targetTransferDate,
        buyerContractConfirmedAt: transaction.buyerContractConfirmedAt,
        sellerContractConfirmedAt: transaction.sellerContractConfirmedAt,
        notaryConfirmedAt: transaction.notaryConfirmedAt,
        notaryProposedAt: transaction.notaryProposedAt,
        handoverDetails: transaction.handoverDetails,
        agreement: transaction.agreement,
        uploadedCategories: transaction.documents.map(
            (document) => document.category,
        ),
    });
    const milestones = await tx.transactionMilestone.findMany({
        where: { transactionId },
    });
    for (const milestone of milestones) {
        const target = derived[milestone.type];
        if (!target) continue;
        const completedNow =
            target.status === "COMPLETED" && milestone.status !== "COMPLETED";
        const completedBefore =
            milestone.status === "COMPLETED" && target.status === "COMPLETED";
        const dueAtChanged =
            (target.dueAt?.getTime() ?? null) !==
            (milestone.dueAt?.getTime() ?? null);
        if (
            target.status === milestone.status &&
            !dueAtChanged &&
            !completedNow &&
            !(completedBefore && milestone.completedAt === null)
        ) {
            continue;
        }
        await tx.transactionMilestone.update({
            where: { id: milestone.id },
            data: {
                status: target.status,
                dueAt: target.dueAt,
                completedAt: completedNow
                    ? (target.completedAt ?? new Date())
                    : completedBefore
                      ? (milestone.completedAt ?? target.completedAt)
                      : target.status === "COMPLETED"
                        ? (milestone.completedAt ?? target.completedAt)
                        : null,
                ...(target.details
                    ? { details: target.details as Prisma.InputJsonValue }
                    : {}),
            },
        });
    }
}
