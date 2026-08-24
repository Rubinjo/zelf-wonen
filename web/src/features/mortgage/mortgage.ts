/**
 * ZelfWonen — Maximale hypotheek & betaalbaarheid
 *
 * Rekenmodel dat de methodiek van Nederlandse hypotheekadviseurs benadert,
 * gebaseerd op de publieke normen van Nibud / "Verantwoorde Hypotheek" en de
 * NHG-kostengrens. De uitkomsten zijn indicatief: de definitieve maximale
 * hypotheek wordt door de geldverstrekker vastgesteld op basis van de actuele
 * Nibud-tabellen, de toetsrente en de persoonlijke situatie.
 */

// ---------------------------------------------------------------------------
// Energie-label extra leenruimte (Nibud, 2025)
// ---------------------------------------------------------------------------
export const ENERGY_LABELS = [
    { value: "A_PLUS_PLUS_PLUS_PLUS_PLUS", label: "A+++++", extra: 20_000 },
    { value: "A_PLUS_PLUS_PLUS_PLUS", label: "A++++", extra: 20_000 },
    { value: "A_PLUS_PLUS_PLUS", label: "A+++", extra: 10_000 },
    { value: "A_PLUS_PLUS", label: "A++", extra: 5_000 },
    { value: "A_PLUS", label: "A+", extra: 2_500 },
    { value: "A", label: "A", extra: 0 },
    { value: "B", label: "B", extra: 0 },
    { value: "C", label: "C", extra: 0 },
    { value: "D", label: "D", extra: 0 },
    { value: "E", label: "E", extra: 0 },
    { value: "F", label: "F", extra: 0 },
    { value: "G", label: "G", extra: 0 },
] as const;

export type EnergyLabel = (typeof ENERGY_LABELS)[number]["value"];

export function energyExtraForLabel(label: EnergyLabel): number {
    return ENERGY_LABELS.find((item) => item.value === label)?.extra ?? 0;
}

// ---------------------------------------------------------------------------
// NHG-kostengrens 2026
// ---------------------------------------------------------------------------
export const NHG_LIMIT_2026 = 480_000;

// ---------------------------------------------------------------------------
// Indicatief renteaanbod (vergelijking hypotheekaanbieders)
// ---------------------------------------------------------------------------
export type MortgageOffer = {
    lender: string;
    nhg: boolean;
    fixedYears: number;
    ratePercent: number;
};

export const MORTGAGE_RATES_DATE = "augustus 2026";

export const FIXED_TERMS = [1, 5, 10, 20, 30] as const;

export const MORTGAGE_OFFERS: MortgageOffer[] = [
    // Met NHG
    { lender: "Venn Hypotheken", nhg: true, fixedYears: 1, ratePercent: 3.4 },
    { lender: "Obvion", nhg: true, fixedYears: 1, ratePercent: 3.45 },
    { lender: "Munt Hypotheken", nhg: true, fixedYears: 1, ratePercent: 3.49 },
    { lender: "Centraal Beheer", nhg: true, fixedYears: 5, ratePercent: 3.5 },
    { lender: "Nationale-Nederlanden", nhg: true, fixedYears: 5, ratePercent: 3.55 },
    { lender: "Obvion", nhg: true, fixedYears: 5, ratePercent: 3.58 },
    { lender: "ABN AMRO", nhg: true, fixedYears: 10, ratePercent: 3.6 },
    { lender: "Rabobank", nhg: true, fixedYears: 10, ratePercent: 3.66 },
    { lender: "ING", nhg: true, fixedYears: 10, ratePercent: 3.7 },
    { lender: "Moneyou", nhg: true, fixedYears: 20, ratePercent: 3.75 },
    { lender: "BLG Wonen", nhg: true, fixedYears: 20, ratePercent: 3.8 },
    { lender: "Florius", nhg: true, fixedYears: 20, ratePercent: 3.85 },
    { lender: "Hypotheek24", nhg: true, fixedYears: 30, ratePercent: 3.88 },
    { lender: "Obvion", nhg: true, fixedYears: 30, ratePercent: 3.92 },
    { lender: "Munt Hypotheken", nhg: true, fixedYears: 30, ratePercent: 3.99 },
    // Zonder NHG
    { lender: "Venn Hypotheken", nhg: false, fixedYears: 1, ratePercent: 3.7 },
    { lender: "Obvion", nhg: false, fixedYears: 1, ratePercent: 3.74 },
    { lender: "Munt Hypotheken", nhg: false, fixedYears: 1, ratePercent: 3.79 },
    { lender: "Centraal Beheer", nhg: false, fixedYears: 5, ratePercent: 3.8 },
    { lender: "Nationale-Nederlanden", nhg: false, fixedYears: 5, ratePercent: 3.85 },
    { lender: "Obvion", nhg: false, fixedYears: 5, ratePercent: 3.89 },
    { lender: "ABN AMRO", nhg: false, fixedYears: 10, ratePercent: 3.9 },
    { lender: "Rabobank", nhg: false, fixedYears: 10, ratePercent: 3.95 },
    { lender: "ING", nhg: false, fixedYears: 10, ratePercent: 4.0 },
    { lender: "Moneyou", nhg: false, fixedYears: 20, ratePercent: 4.05 },
    { lender: "BLG Wonen", nhg: false, fixedYears: 20, ratePercent: 4.1 },
    { lender: "Florius", nhg: false, fixedYears: 20, ratePercent: 4.15 },
    { lender: "Hypotheek24", nhg: false, fixedYears: 30, ratePercent: 4.2 },
    { lender: "Obvion", nhg: false, fixedYears: 30, ratePercent: 4.25 },
    { lender: "Munt Hypotheken", nhg: false, fixedYears: 30, ratePercent: 4.3 },
];

export function offersFor(nhg: boolean, fixedYears: number): MortgageOffer[] {
    return MORTGAGE_OFFERS.filter(
        (offer) => offer.nhg === nhg && offer.fixedYears === fixedYears,
    ).sort((a, b) => a.ratePercent - b.ratePercent);
}

export function bestOffer(nhg: boolean, fixedYears: number): MortgageOffer {
    const list = offersFor(nhg, fixedYears);
    return (
        list[0] ?? {
            lender: "Marktgemiddelde",
            nhg,
            fixedYears,
            ratePercent: nhg ? 3.6 : 3.9,
        }
    );
}

// ---------------------------------------------------------------------------
// Studieschuld (DUO / Nibud-wegingsfactoren)
// ---------------------------------------------------------------------------
export const STUDENT_WEIGHT = {
    /** Oude stelsel (terugbetalen in 15 jaar) */
    old: 0.0075,
    /** Nieuwe stelsel (terugbetalen in 35 jaar) */
    new: 0.0045,
} as const;

export type StudentLoanMethod = "divide" | "nibud";
export type StudentLoanScheme = "old" | "new";

export type StudentLoanInput = {
    outstanding: number;
    method: StudentLoanMethod;
    scheme: StudentLoanScheme;
    /** Resterende aflosperiode in jaren (alleen gebruikt bij "divide") */
    repaymentYears: number;
};

// ---------------------------------------------------------------------------
// Inkomen
// ---------------------------------------------------------------------------
export type IncomeMode = "gross-yearly" | "gross-monthly" | "net-monthly";

export type ApplicantIncome = {
    mode: IncomeMode;
    amount: number;
    /** Vakantiegeld (8%) meetellen bovenop het opgegeven bruto inkomen */
    includeHolidayAllowance: boolean;
    /** Vaste eindejaarsuitkering / 13e maand (bruto per jaar, telt 100% mee) */
    fixedBonusYearly: number;
    /** Variabele bonus (bruto per jaar) */
    variableBonusYearly: number;
    /** Alleen meetellen als de bonus contractueel gegarandeerd is */
    variableBonusContractual: boolean;
    /** Zelfstandig ondernemer (ZZP) */
    zzpEnabled: boolean;
    /** Nettowinsten per boekjaar, meest recente eerst (max. 3) */
    zzpProfits: number[];
};

export type MortgageInput = {
    applicant: ApplicantIncome;
    hasPartner: boolean;
    partner: ApplicantIncome;
    energyLabel: EnergyLabel;
    /** Toetsrente / hypotheekrente (percentage, bv. 3.9) */
    mortgageRatePercent: number;
    /** Looptijd in jaren (annuïtair) */
    termYears: number;
    /** Woningwaarde / koopsom (optioneel, voor LTV en NHG-check) */
    propertyValue: number | null;
    studentLoan: StudentLoanInput;
    /** Partneralimentatie (bruto per maand) */
    alimonyMonthly: number;
    /** Overige leningen (persoonlijke lening, autolening, …) per maand */
    otherLoansMonthly: number;
};

export type MortgageResult = {
    applicantGross: number;
    partnerGross: number;
    toetsinkomen: number;
    financingPercentage: number;
    maxMonthlyHousing: number;
    annuityFactor: number;
    maxMortgageIncome: number;
    energyExtra: number;
    studentDebtMonthly: number;
    otherLoansMonthly: number;
    alimonyMonthly: number;
    totalMonthlyObligations: number;
    maxMortgage: number;
    monthlyPaymentMax: number;
    netMonthlyEstimate: number;
    nhgLimit: number;
    nhgEligible: boolean;
    /** Maximaal met 100% LTV t.o.v. de woningwaarde */
    ltvCappedMaxMortgage: number | null;
    monthlyPaymentForValue: number | null;
};

// ---------------------------------------------------------------------------
// Bruto-netto conversie (indicatief, tarieven 2025)
// ---------------------------------------------------------------------------
const SCHIJF_1_LIMIT = 38_441;
const SCHIJF_2_LIMIT = 76_817;

function algemeneHeffingskorting(gross: number): number {
    const k =
        3_068 -
        Math.max(0, gross - 28_406) * 0.0630;
    return Math.max(0, k);
}

function arbeidskorting(gross: number): number {
    let ak = 0;
    ak += Math.min(gross, 11_491) * 0.08425;
    ak += Math.max(0, Math.min(gross, 24_820) - 11_491) * 0.31432;
    ak += Math.max(0, Math.min(gross, 43_071) - 24_820) * 0.02471;
    ak -= Math.max(0, gross - 43_071) * 0.0651;
    return Math.max(0, ak);
}

function netFromGrossYearly(gross: number): number {
    let tax = 0;
    tax += Math.min(gross, SCHIJF_1_LIMIT) * 0.3582;
    tax += Math.max(0, Math.min(gross, SCHIJF_2_LIMIT) - SCHIJF_1_LIMIT) * 0.3748;
    tax += Math.max(0, gross - SCHIJF_2_LIMIT) * 0.495;
    const korting = algemeneHeffingskorting(gross) + arbeidskorting(gross);
    return Math.max(0, gross - tax + korting);
}

/** Converteert netto maandinkomen naar bruto jaarinkomen (indicatief). */
export function netMonthlyToGrossYearly(netMonthly: number): number {
    const target = netMonthly * 12;
    let lo = 0;
    let hi = netMonthly * 24;
    while (netFromGrossYearly(hi) < target && hi < 10_000_000) hi *= 2;
    for (let i = 0; i < 80; i += 1) {
        const mid = (lo + hi) / 2;
        if (netFromGrossYearly(mid) < target) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// ZZP: stabiel inkomen uit nettowinsten
// ---------------------------------------------------------------------------
const ZZP_STABILITY: Record<number, number> = {
    1: 0.75,
    2: 0.85,
    3: 0.9,
};

/** Brutering van nettowinst naar bruto toetsinkomen (indicatief). */
const ZZP_BRUTERING = 1.25;

export function zzpGrossYearly(profits: number[]): number {
    const valid = profits.filter((profit) => profit > 0).slice(0, 3);
    if (!valid.length) return 0;
    const average = valid.reduce((total, profit) => total + profit, 0) / valid.length;
    const stability = ZZP_STABILITY[Math.min(valid.length, 3)] ?? 0.9;
    return average * ZZP_BRUTERING * stability;
}

// ---------------------------------------------------------------------------
// Financieringslastpercentage (Nibud-benadering)
// ---------------------------------------------------------------------------
const FLP_REFERENCE: Array<[number, number]> = [
    [25_000, 21.2],
    [30_000, 22.1],
    [35_000, 22.9],
    [40_000, 23.8],
    [45_000, 24.6],
    [50_000, 25.5],
    [60_000, 26.1],
    [70_000, 26.6],
    [80_000, 27.2],
    [90_000, 27.5],
];

function interpolate(table: Array<[number, number]>, x: number): number {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i += 1) {
        if (x <= table[i][0]) {
            const [x0, y0] = table[i - 1];
            const [x1, y1] = table[i];
            return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        }
    }
    return table[table.length - 1][1];
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Percentage van het bruto jaarinkomen dat maximaal aan bruto woonlasten
 * besteed mag worden, afhankelijk van inkomen en toetsrente.
 *
 * De referentietabel komt overeen met een leencapaciteit van ca. 3,7× tot
 * 4,8× het bruto jaarinkomen bij een toetsrente van 4% (Nibud-normen).
 * Bij een hogere toetsrente stijgt het percentage licht (het rentedeel is
 * fiscaal aftrekbaar), waardoor de maximale hypotheek maar beperkt schommelt
 * als de rentevaste periode verandert.
 */
export function financingPercentage(
    income: number,
    ratePercent: number,
): number {
    const base = interpolate(FLP_REFERENCE, income);
    return clamp(base + (ratePercent - 4.0) * 0.5, 14, 34);
}

// ---------------------------------------------------------------------------
// Annuïteit
// ---------------------------------------------------------------------------
export function annuityFactor(ratePercent: number, termYears: number): number {
    const r = ratePercent / 100 / 12;
    const n = termYears * 12;
    if (r === 0) return 1 / n;
    return r / (1 - Math.pow(1 + r, -n));
}

// ---------------------------------------------------------------------------
// Studieschuld maandlast
// ---------------------------------------------------------------------------
export function studentDebtMonthly(loan: StudentLoanInput): number {
    if (!loan.outstanding || loan.outstanding <= 0) return 0;
    if (loan.method === "divide") {
        const years = Math.max(
            1,
            loan.repaymentYears || (loan.scheme === "old" ? 15 : 35),
        );
        return loan.outstanding / (years * 12);
    }
    return loan.outstanding * STUDENT_WEIGHT[loan.scheme];
}

// ---------------------------------------------------------------------------
// Hoofdberekening
// ---------------------------------------------------------------------------
function applicantGrossYearly(inc: ApplicantIncome): number {
    if (inc.zzpEnabled) return zzpGrossYearly(inc.zzpProfits);

    let gross: number;
    switch (inc.mode) {
        case "gross-yearly":
            gross = inc.amount;
            break;
        case "gross-monthly":
            gross = inc.amount * 12;
            break;
        case "net-monthly":
            gross = netMonthlyToGrossYearly(inc.amount);
            break;
    }

    if (inc.includeHolidayAllowance) gross *= 1.08;
    gross += inc.fixedBonusYearly;
    if (inc.variableBonusContractual) gross += inc.variableBonusYearly;
    return Math.max(0, gross);
}

export function calculateMortgage(input: MortgageInput): MortgageResult {
    const applicantGross = applicantGrossYearly(input.applicant);
    const partnerGross = input.hasPartner
        ? applicantGrossYearly(input.partner)
        : 0;
    const toetsinkomen = applicantGross + partnerGross;

    const pct = financingPercentage(toetsinkomen, input.mortgageRatePercent);
    const maxMonthlyHousing = (pct / 100) * (toetsinkomen / 12);
    const factor = annuityFactor(input.mortgageRatePercent, input.termYears);
    const maxMortgageIncome = maxMonthlyHousing / factor;

    const energyExtra = energyExtraForLabel(input.energyLabel);

    const studentMonthly = studentDebtMonthly(input.studentLoan);
    const otherLoansMonthly = input.otherLoansMonthly;
    const alimonyMonthly = input.alimonyMonthly;
    const totalMonthlyObligations =
        studentMonthly + otherLoansMonthly + alimonyMonthly;

    const obligationsEquivalent = totalMonthlyObligations / factor;
    const maxMortgage = Math.max(
        0,
        maxMortgageIncome + energyExtra - obligationsEquivalent,
    );

    const monthlyPaymentMax = maxMortgage * factor;

    // Indicatieve netto maandlast: bruto annuïteit minus hypotheekrenteaftrek
    // (37% over het rentedeel, eerste maand).
    const interestFirstMonth = maxMortgage * (input.mortgageRatePercent / 100 / 12);
    const netMonthlyEstimate = Math.max(
        0,
        monthlyPaymentMax - interestFirstMonth * 0.37,
    );

    const nhgEligible =
        input.propertyValue == null || input.propertyValue <= NHG_LIMIT_2026;

    const ltvCappedMaxMortgage =
        input.propertyValue == null
            ? null
            : Math.min(maxMortgage, input.propertyValue);

    const monthlyPaymentForValue =
        ltvCappedMaxMortgage == null ? null : ltvCappedMaxMortgage * factor;

    return {
        applicantGross,
        partnerGross,
        toetsinkomen,
        financingPercentage: pct,
        maxMonthlyHousing,
        annuityFactor: factor,
        maxMortgageIncome,
        energyExtra,
        studentDebtMonthly: studentMonthly,
        otherLoansMonthly,
        alimonyMonthly,
        totalMonthlyObligations,
        maxMortgage,
        monthlyPaymentMax,
        netMonthlyEstimate,
        nhgLimit: NHG_LIMIT_2026,
        nhgEligible,
        ltvCappedMaxMortgage,
        monthlyPaymentForValue,
    };
}
