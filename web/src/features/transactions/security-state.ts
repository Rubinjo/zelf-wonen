/**
 * Pure statusafleiding voor de waarborgsom (Art 7:26 lid 4 BW).
 *
 * Dit bestand bevat géén database-/serverafhankelijkheden, zodat het veilig
 * in clientcomponenten kan worden gebruikt. De feitelijke mutaties (betaal-
 * kenmerk aanmaken, storting registreren, ontvangst bevestigen) staan in de
 * API-route; hier wordt alleen de weergavestatus afgeleid uit de platformstaat.
 */

export type SecurityStatus =
    | "NOT_APPLICABLE" // huur of geen zekerheid overeengekomen
    | "NOT_SIGNED" // overeenkomst nog niet ondertekend
    | "FORM_REQUIRED" // koper moet waarborgsom of bankgarantie kiezen
    | "DUE" // te betalen vóór de uiterlijke datum
    | "OVERDUE" // deadline verstreken, nog geen storting geregistreerd
    | "PAID" // koper heeft de storting geregistreerd
    | "CONFIRMED" // ontvangst bevestigd door de verkoper
    | "RELEASED"; // transactie afgerond → verrekend bij de levering

export type SecurityState = {
    applicable: boolean;
    status: SecurityStatus;
    isDeposit: boolean;
    securityType: string | null;
    securityForm: "DEPOSIT" | "BANK_GUARANTEE" | null;
    formChosenAt: string | null;
    formChosenByName: string | null;
    amountCents: string | null;
    dueDate: string | null;
    reference: string | null;
    paidAt: string | null;
    paidByName: string | null;
    confirmedAt: string | null;
    confirmedByName: string | null;
    releasedAt: string | null;
    purchasePriceCents: string;
};

/** Bouwt een uniek betaalkenmerk voor de kwaliteitsrekening van de notaris. */
export function buildSecurityReference(transactionId: string): string {
    const short = transactionId.replace(/-/g, "").slice(0, 10).toUpperCase();
    return `WZB-${short}`;
}

export type SecurityRoomInput = {
    status: string;
    completedAt: string | null;
    purchasePriceCents: bigint | string;
    securityReference: string | null;
    securityPaidAt: string | null;
    securityPaidBy: { name: string } | null;
    securityConfirmedAt: string | null;
    securityConfirmedBy: { name: string } | null;
    securityForm: "DEPOSIT" | "BANK_GUARANTEE" | null;
    securityFormChosenAt: string | null;
    securityFormChosenBy: { name: string } | null;
    listing: { purpose: string };
    agreement: {
        status: string;
        securityType: string;
        securityAmountCents: string | bigint | null;
        securityDueDate: string | null;
    } | null;
};

/** Leidt de weergavestatus van de waarborgsom af uit de feitelijke platformstaat. */
export function deriveSecurityState(room: SecurityRoomInput): SecurityState {
    const agreement = room.agreement;
    const base = {
        reference: room.securityReference,
        paidAt: room.securityPaidAt,
        paidByName: room.securityPaidBy?.name ?? null,
        confirmedAt: room.securityConfirmedAt,
        confirmedByName: room.securityConfirmedBy?.name ?? null,
        formChosenAt: room.securityFormChosenAt,
        formChosenByName: room.securityFormChosenBy?.name ?? null,
        releasedAt: room.completedAt,
        purchasePriceCents: String(room.purchasePriceCents),
    };
    if (
        room.listing.purpose !== "SALE" ||
        !agreement ||
        agreement.securityType === "NONE"
    ) {
        return {
            ...base,
            applicable: false,
            status: "NOT_APPLICABLE",
            isDeposit: false,
            securityType: agreement?.securityType ?? null,
            securityForm: null,
            amountCents: null,
            dueDate: null,
        };
    }
    const amountCents =
        agreement.securityAmountCents == null
            ? null
            : String(agreement.securityAmountCents);
    const isDeposit = room.securityForm === "DEPOSIT";
    let status: SecurityStatus;
    if (room.completedAt) status = "RELEASED";
    else if (room.securityConfirmedAt) status = "CONFIRMED";
    else if (room.securityPaidAt) status = "PAID";
    else if (agreement.status !== "SIGNED") status = "NOT_SIGNED";
    else if (!room.securityForm) status = "FORM_REQUIRED";
    else if (
        agreement.securityDueDate &&
        new Date(agreement.securityDueDate).getTime() < Date.now()
    )
        status = "OVERDUE";
    else status = "DUE";
    return {
        ...base,
        applicable: true,
        status,
        isDeposit,
        securityType: agreement.securityType,
        securityForm: room.securityForm,
        amountCents,
        dueDate: agreement.securityDueDate,
    };
}

export const securityStatusNames: Record<SecurityStatus, string> = {
    NOT_APPLICABLE: "Niet van toepassing",
    NOT_SIGNED: "Wacht op ondertekening",
    FORM_REQUIRED: "Vorm kiezen",
    DUE: "Te betalen",
    OVERDUE: "Deadline verstreken",
    PAID: "Overgemaakt",
    CONFIRMED: "Ontvangst bevestigd",
    RELEASED: "Verrekend bij levering",
};
