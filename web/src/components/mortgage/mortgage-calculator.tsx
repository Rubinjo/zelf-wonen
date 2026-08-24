"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
    Banknote,
    Briefcase,
    Building2,
    Calculator,
    Home,
    Info,
    Landmark,
    Leaf,
    PiggyBank,
    Scale,
    ShieldCheck,
    TrendingUp,
    Users,
    Zap,
} from "lucide-react";
import { AuthActions } from "@/components/auth/auth-actions";
import {
    ENERGY_LABELS,
    FIXED_TERMS,
    MORTGAGE_RATES_DATE,
    NHG_LIMIT_2026,
    bestOffer,
    calculateMortgage,
    offersFor,
    type ApplicantIncome,
    type EnergyLabel,
    type IncomeMode,
    type MortgageInput,
    type MortgageOffer,
    type MortgageResult,
    type StudentLoanMethod,
    type StudentLoanScheme,
} from "@/features/mortgage/mortgage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
});
const eur2 = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const pct = new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
});

function toNumber(value: string): number {
    const cleaned = value.trim().replace(/\s/g, "");
    if (!cleaned) return 0;

    let normalized = cleaned;
    if (cleaned.includes(",")) {
        // Nederlandse notatie: komma is decimaalteken, punten zijn duizendtallen.
        normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
        const dotCount = (cleaned.match(/\./g) ?? []).length;
        if (dotCount > 1) {
            // Meerdere punten: duizendtallen.
            normalized = cleaned.replace(/\./g, "");
        } else if (dotCount === 1) {
            const decimals = cleaned.split(".")[1];
            // Eén punt gevolgd door precies 3 cijfers: duizendtal (60.000 → 60000).
            if (decimals.length === 3) normalized = cleaned.replace(".", "");
        }
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function money(value: number): string {
    return eur.format(Math.round(value));
}

function moneyCents(value: number): string {
    return eur2.format(value);
}

// ---------------------------------------------------------------------------
// Kleine UI-bouwstenen
// ---------------------------------------------------------------------------
function Section({
    icon: Icon,
    title,
    subtitle,
    children,
}: {
    icon: typeof Home;
    title: string;
    subtitle?: string;
    children: ReactNode;
}) {
    return (
        <section className="border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand text-white">
                    <Icon size={19} />
                </span>
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    {subtitle ? (
                        <p className="mt-1 text-sm leading-6 text-muted">
                            {subtitle}
                        </p>
                    ) : null}
                </div>
            </div>
            <div className="mt-5 grid gap-4">{children}</div>
        </section>
    );
}

function Field({
    label,
    htmlFor,
    children,
    helper,
}: {
    label: string;
    htmlFor: string;
    children: ReactNode;
    helper?: ReactNode;
}) {
    return (
        <div>
            <label
                htmlFor={htmlFor}
                className="block text-sm font-semibold text-foreground"
            >
                {label}
            </label>
            {children}
            {helper ? (
                <p className="mt-1.5 text-xs leading-5 text-muted">{helper}</p>
            ) : null}
        </div>
    );
}

function NumberField({
    id,
    label,
    value,
    onChange,
    suffix,
    placeholder,
    helper,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    suffix?: string;
    placeholder?: string;
    helper?: ReactNode;
}) {
    const suffixWidth = suffix ? suffix.length * 0.5 + 1.6 : 0;
    return (
        <Field label={label} htmlFor={id} helper={helper}>
            <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                    €
                </span>
                <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="input"
                    style={{
                        paddingLeft: "2.75rem",
                        paddingRight: suffix ? `${suffixWidth}rem` : undefined,
                    }}
                />
                {suffix ? (
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                        {suffix}
                    </span>
                ) : null}
            </div>
        </Field>
    );
}

function Toggle({
    checked,
    onChange,
    label,
    helper,
    icon: Icon,
    card = false,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    helper?: ReactNode;
    icon?: typeof Home;
    card?: boolean;
}) {
    const thumb = (
        <span
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
                checked ? "bg-brand" : "bg-line"
            }`}
        >
            <span
                className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                    checked ? "translate-x-5" : "translate-x-0"
                }`}
            />
        </span>
    );

    if (card) {
        return (
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-4 text-left transition ${
                    checked
                        ? "border-brand bg-brand/5"
                        : "border-line bg-background hover:border-brand/40"
                }`}
            >
                {Icon ? (
                    <span
                        className={`grid size-10 shrink-0 place-items-center rounded-lg transition ${
                            checked
                                ? "bg-brand text-white"
                                : "bg-surface text-muted"
                        }`}
                    >
                        <Icon size={19} />
                    </span>
                ) : null}
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                        {label}
                    </span>
                    {helper ? (
                        <span className="mt-0.5 block text-xs leading-5 text-muted">
                            {helper}
                        </span>
                    ) : null}
                </span>
                {thumb}
            </button>
        );
    }

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="flex w-full cursor-pointer items-start gap-3 text-left"
        >
            {thumb}
            <span>
                <span className="block text-sm font-semibold">{label}</span>
                {helper ? (
                    <span className="mt-0.5 block text-xs leading-5 text-muted">
                        {helper}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

function InfoBox({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-start gap-2.5 border border-brand/20 bg-brand/4 p-3.5 text-sm leading-6 text-muted">
            <Info size={16} className="mt-1 shrink-0 text-brand" />
            <div>{children}</div>
        </div>
    );
}

function Segmented<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (value: T) => void;
    options: readonly { value: T; label: string }[];
}) {
    return (
        <div className="mt-1.5 grid gap-1 rounded-lg border border-line bg-background p-1 sm:grid-cols-3">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`h-10 rounded-md px-2 text-sm font-semibold transition ${value === option.value ? "bg-brand text-white" : "text-muted hover:bg-surface"}`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Inkomen-sectie (per persoon)
// ---------------------------------------------------------------------------
type IncomeState = {
    mode: IncomeMode;
    amount: string;
    includeHolidayAllowance: boolean;
    fixedBonusYearly: string;
    variableBonusYearly: string;
    variableBonusContractual: boolean;
    zzpProfits: [string, string, string];
};

const emptyIncome: IncomeState = {
    mode: "gross-yearly",
    amount: "",
    includeHolidayAllowance: true,
    fixedBonusYearly: "",
    variableBonusYearly: "",
    variableBonusContractual: false,
    zzpProfits: ["", "", ""],
};

const modeOptions = [
    { value: "gross-yearly", label: "Bruto per jaar" },
    { value: "gross-monthly", label: "Bruto per maand" },
    { value: "net-monthly", label: "Netto per maand" },
] as const;

const modeLabel: Record<IncomeMode, string> = {
    "gross-yearly": "Bruto jaarinkomen",
    "gross-monthly": "Bruto maandinkomen",
    "net-monthly": "Netto maandinkomen",
};

function IncomeFields({
    value,
    onChange,
    idPrefix,
    isZzp,
}: {
    value: IncomeState;
    onChange: (value: IncomeState) => void;
    idPrefix: string;
    isZzp: boolean;
}) {
    if (isZzp) {
        return (
            <div className="grid gap-4">
                <InfoBox>
                    Vul de <strong>nettowinst</strong> per boekjaar in (meest
                    recente jaar eerst). We middelen de winsten, passen een
                    brutering toe en rekenen een bestendigheidskorting
                    afhankelijk van het aantal jaren dat je ondernemer bent.
                </InfoBox>
                <div className="grid gap-4 sm:grid-cols-3">
                    {(["Laatste jaar", "Jaar ervoor", "2 jaar terug"] as const).map(
                        (label, index) => (
                            <NumberField
                                key={label}
                                id={`${idPrefix}-profit-${index}`}
                                label={label}
                                value={value.zzpProfits[index]}
                                onChange={(profit) => {
                                    const zzpProfits = [
                                        ...value.zzpProfits,
                                    ] as [string, string, string];
                                    zzpProfits[index] = profit;
                                    onChange({ ...value, zzpProfits });
                                }}
                                suffix="nettowinst"
                            />
                        ),
                    )}
                </div>
                <p className="text-xs leading-5 text-muted">
                    Bij minder dan 3 boekjaren gebruiken we het beschikbare
                    gemiddelde met een lagere bestendigheidsfactor. Banken
                    baseren zich uiteindelijk op een inkomensverklaring (bijv.
                    Verklaring Inkomen Ondernemer).
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            <div>
                <p className="text-sm font-semibold">
                    Hoe wil je je inkomen invullen?
                </p>
                <Segmented
                    value={value.mode}
                    onChange={(mode) => onChange({ ...value, mode })}
                    options={modeOptions}
                />
            </div>
            <NumberField
                id={`${idPrefix}-amount`}
                label={modeLabel[value.mode]}
                value={value.amount}
                onChange={(amount) => onChange({ ...value, amount })}
                placeholder="0"
                suffix={value.mode === "gross-yearly" ? "per jaar" : "per maand"}
                helper={
                    value.mode === "net-monthly" ? (
                        <>
                            We rekenen je netto inkomen indicatief terug naar
                            bruto, inclusief loonheffingskorting (tarieven
                            2025). Het bruto jaarinkomen is altijd de meest
                            betrouwbare invoer.
                        </>
                    ) : undefined
                }
            />
            <Toggle
                checked={value.includeHolidayAllowance}
                onChange={(includeHolidayAllowance) =>
                    onChange({ ...value, includeHolidayAllowance })
                }
                label="Vakantiegeld (8%) meetellen"
                helper="Zet dit uit als je bruto jaarinkomen al inclusief vakantiegeld is."
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                    id={`${idPrefix}-fixed-bonus`}
                    label="13e maand / vaste bonus"
                    value={value.fixedBonusYearly}
                    onChange={(fixedBonusYearly) =>
                        onChange({ ...value, fixedBonusYearly })
                    }
                    suffix="per jaar"
                    helper="Telt voor 100% mee als het contractueel is vastgelegd."
                />
                <NumberField
                    id={`${idPrefix}-variable-bonus`}
                    label="Variabele bonus"
                    value={value.variableBonusYearly}
                    onChange={(variableBonusYearly) =>
                        onChange({ ...value, variableBonusYearly })
                    }
                    suffix="per jaar"
                />
            </div>
            <Toggle
                checked={value.variableBonusContractual}
                onChange={(variableBonusContractual) =>
                    onChange({ ...value, variableBonusContractual })
                }
                label="Variabele bonus is contractueel gegarandeerd"
                helper="Alleen een gegarandeerde bonus telt mee. Een niet-structurele bonus telt meestal niet mee voor de maximale hypotheek."
            />
        </div>
    );
}

function toApplicant(state: IncomeState, isZzp: boolean): ApplicantIncome {
    return {
        mode: state.mode,
        amount: toNumber(state.amount),
        includeHolidayAllowance: state.includeHolidayAllowance,
        fixedBonusYearly: toNumber(state.fixedBonusYearly),
        variableBonusYearly: toNumber(state.variableBonusYearly),
        variableBonusContractual: state.variableBonusContractual,
        zzpEnabled: isZzp,
        zzpProfits: state.zzpProfits.map((profit) => toNumber(profit)),
    };
}

// ---------------------------------------------------------------------------
// Resultaat-paneel
// ---------------------------------------------------------------------------
function Step({
    title,
    text,
    value,
    tone = "neutral",
}: {
    title: string;
    text: ReactNode;
    value?: ReactNode;
    tone?: "neutral" | "brand" | "muted" | "accent";
}) {
    const toneClass = {
        neutral: "text-foreground",
        brand: "text-brand",
        muted: "text-muted",
        accent: "text-brand-dark dark:text-accent",
    }[tone];
    return (
        <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold">{title}</p>
                    {value !== undefined ? (
                        <span className={`text-sm font-bold ${toneClass}`}>
                            {value}
                        </span>
                    ) : null}
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted">{text}</p>
            </div>
        </li>
    );
}

function Results({ result }: { result: MortgageResult }) {
    const affordable =
        result.monthlyPaymentForValue == null
            ? null
            : result.monthlyPaymentForValue <=
              result.maxMonthlyHousing - result.totalMonthlyObligations;
    return (
        <div className="grid gap-5">
            <section className="border border-line bg-brand-dark p-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Maximale hypotheek
                </p>
                <p className="mt-2 text-4xl font-semibold sm:text-5xl">
                    {money(result.maxMortgage)}
                </p>
                <p className="mt-2 text-sm text-white/75">
                    Indicatief, op basis van de Nibud-normen en een
                    annuïteitenhypotheek.
                </p>
            </section>

            <section className="border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Hoe is dit opgebouwd?</h3>
                    <Calculator size={19} className="text-brand" />
                </div>
                <ol className="mt-5 grid gap-5">
                    <Step
                        title="Toetsinkomen"
                        value={money(result.toetsinkomen)}
                        text={
                            <>
                                Bruto jaarinkomen(s) na vakantiegeld, vaste
                                bonussen en ZZP-correcties.{" "}
                                {result.partnerGross > 0
                                    ? `Aanvrager: ${money(result.applicantGross)}, partner: ${money(result.partnerGross)}.`
                                    : `Aanvrager: ${money(result.applicantGross)}.`}
                            </>
                        }
                    />
                    <Step
                        title="Financieringslast"
                        value={`${pct.format(result.financingPercentage)}%`}
                        text={
                            <>
                                Percentage van het inkomen dat aan bruto
                                woonlasten besteed mag worden. Maximaal{" "}
                                {money(result.maxMonthlyHousing)} bruto per
                                maand.
                            </>
                        }
                    />
                    <Step
                        title="Leencapaciteit uit inkomen"
                        value={money(result.maxMortgageIncome)}
                        text="Het maximale annuïtaire leenbedrag bij dit inkomen en deze toetsrente."
                    />
                    <Step
                        title="Energielabel"
                        value={`+ ${money(result.energyExtra)}`}
                        tone={result.energyExtra > 0 ? "brand" : "muted"}
                        text="Bij label A+ of beter mag je extra lenen voor een zuinige woning."
                    />
                    <Step
                        title="Verplichtingen"
                        value={`− ${money(result.totalMonthlyObligations * 12)}`}
                        tone="muted"
                        text={
                            <>
                                Studieschuld {money(result.studentDebtMonthly)}
                                /mnd, alimentatie {money(result.alimonyMonthly)}
                                /mnd en overige leningen{" "}
                                {money(result.otherLoansMonthly)}/mnd verlagen
                                de ruimte.
                            </>
                        }
                    />
                </ol>
            </section>

            <section className="border border-line bg-surface p-5">
                <h3 className="font-semibold">Maandlasten</h3>
                <dl className="mt-4 grid gap-3 text-sm">
                    <div className="flex items-center justify-between">
                        <dt className="text-muted">Bruto per maand (maximaal)</dt>
                        <dd className="font-semibold">
                            {moneyCents(result.monthlyPaymentMax)}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt className="text-muted">Netto per maand (indicatief)</dt>
                        <dd className="font-semibold">
                            {moneyCents(result.netMonthlyEstimate)}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-line pt-3">
                        <dt className="text-muted">Verplichtingen</dt>
                        <dd className="font-semibold">
                            {moneyCents(result.totalMonthlyObligations)}
                        </dd>
                    </div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted">
                    De netto maandlast is een indicatie: we schatten het
                    voordeel van hypotheekrenteaftrek (37% over het rentedeel).
                    Dit hangt af van je werkelijke rente en belastingsituatie.
                </p>
            </section>

            <section className="border border-line bg-surface p-5">
                <div className="flex items-start gap-3">
                    <ShieldCheck size={19} className="mt-0.5 shrink-0 text-brand" />
                    <div>
                        <h3 className="font-semibold">NHG</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">
                            {result.nhgEligible ? (
                                <>
                                    NHG is mogelijk: de kostengrens is{" "}
                                    {money(result.nhgLimit)} in 2026. Met NHG
                                    geldt meestal een lagere rente en een
                                    vangnet bij gedwongen verkoop.
                                </>
                            ) : (
                                <>
                                    De woningwaarde ligt boven de NHG-kostengrens
                                    van {money(result.nhgLimit)} (2026). NHG is
                                    dan niet mogelijk.
                                </>
                            )}
                        </p>
                    </div>
                </div>
                {result.ltvCappedMaxMortgage !== null ? (
                    <div className="mt-4 border-t border-line pt-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted">
                                Maximaal voor deze woning (100% van de waarde)
                            </span>
                            <span className="font-semibold">
                                {money(result.ltvCappedMaxMortgage)}
                            </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="text-muted">
                                Bijbehorende maandlast
                            </span>
                            <span className="font-semibold">
                                {moneyCents(result.monthlyPaymentForValue ?? 0)}
                            </span>
                        </div>
                        <div
                            className={`mt-3 flex items-start gap-2 text-sm ${affordable ? "text-brand" : "text-muted"}`}
                        >
                            {affordable ? (
                                <PiggyBank size={16} className="mt-0.5 shrink-0" />
                            ) : (
                                <Info size={16} className="mt-0.5 shrink-0" />
                            )}
                            <span>
                                {affordable
                                    ? "Deze woning past binnen je maximale leencapaciteit."
                                    : "Deze woning is duurder dan je maximale leencapaciteit; je hebt extra eigen geld nodig of een lagere prijs."}
                            </span>
                        </div>
                    </div>
                ) : null}
            </section>

            <p className="px-1 text-xs leading-5 text-muted">
                Deze berekening is indicatief en gebaseerd op de publieke
                Nibud-normen, de NHG-kostengrens 2026 en een
                annuïteitenhypotheek van 30 jaar. De definitieve maximale
                hypotheek stelt je geldverstrekker vast. Aan deze berekening
                kunnen geen rechten worden ontleend.
            </p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Hoofdcomponent
// ---------------------------------------------------------------------------
export function MortgageCalculator() {
    const [applicantIsZzp, setApplicantIsZzp] = useState(false);
    const [hasPartner, setHasPartner] = useState(false);
    const [partnerIsZzp, setPartnerIsZzp] = useState(false);
    const [applicant, setApplicant] = useState<IncomeState>(emptyIncome);
    const [partner, setPartner] = useState<IncomeState>(emptyIncome);
    const [energyLabel, setEnergyLabel] = useState<EnergyLabel>("A");
    const [propertyValue, setPropertyValue] = useState("");
    const [nhg, setNhg] = useState(true);
    const [fixedYears, setFixedYears] = useState<number>(10);
    const [mortgageRate, setMortgageRate] = useState(
        String(bestOffer(true, 10).ratePercent),
    );
    const [studentOutstanding, setStudentOutstanding] = useState("");
    const [studentMethod, setStudentMethod] =
        useState<StudentLoanMethod>("divide");
    const [studentScheme, setStudentScheme] =
        useState<StudentLoanScheme>("new");
    const [repaymentYears, setRepaymentYears] = useState("35");
    const [alimonyMonthly, setAlimonyMonthly] = useState("");
    const [otherLoansMonthly, setOtherLoansMonthly] = useState("");

    const propertyValueNumber = toNumber(propertyValue) || null;
    const offers = offersFor(nhg, fixedYears);
    const ratePercent =
        toNumber(mortgageRate) || bestOffer(nhg, fixedYears).ratePercent;

    const selectNhg = (value: boolean) => {
        setNhg(value);
        setMortgageRate(String(bestOffer(value, fixedYears).ratePercent));
    };
    const selectFixedYears = (years: number) => {
        setFixedYears(years);
        setMortgageRate(String(bestOffer(nhg, years).ratePercent));
    };
    const selectOffer = (offer: MortgageOffer) => {
        setFixedYears(offer.fixedYears);
        setMortgageRate(String(offer.ratePercent));
    };

    const input: MortgageInput = useMemo(
        () => ({
            applicant: toApplicant(applicant, applicantIsZzp),
            hasPartner,
            partner: toApplicant(partner, partnerIsZzp),
            energyLabel,
            mortgageRatePercent: ratePercent,
            termYears: 30,
            propertyValue: propertyValueNumber,
            studentLoan: {
                outstanding: toNumber(studentOutstanding),
                method: studentMethod,
                scheme: studentScheme,
                repaymentYears: toNumber(repaymentYears) || 35,
            },
            alimonyMonthly: toNumber(alimonyMonthly),
            otherLoansMonthly: toNumber(otherLoansMonthly),
        }),
        [
            applicant,
            applicantIsZzp,
            hasPartner,
            partner,
            partnerIsZzp,
            energyLabel,
            propertyValueNumber,
            ratePercent,
            studentOutstanding,
            studentMethod,
            studentScheme,
            repaymentYears,
            alimonyMonthly,
            otherLoansMonthly,
        ],
    );

    const result = useMemo(() => calculateMortgage(input), [input]);

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-line bg-background/92 backdrop-blur-xl">
                <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 font-semibold"
                        aria-label="ZelfWonen home"
                    >
                        <span className="grid size-9 place-items-center rounded-lg bg-brand text-white">
                            <Building2 size={19} />
                        </span>
                        <span className="text-lg sm:text-xl">
                            Zelf<span className="text-brand">Wonen</span>
                        </span>
                    </Link>
                    <nav className="flex items-center gap-1.5 sm:gap-2">
                        <Link
                            href="/zoeken"
                            className="hidden px-3 py-2 text-sm font-semibold text-muted transition hover:text-brand lg:block"
                        >
                            Woning zoeken
                        </Link>
                        <Link
                            href="/mortgage-calculator"
                            className="hidden px-3 py-2 text-sm font-semibold text-brand lg:block"
                        >
                            Hypotheek berekenen
                        </Link>
                        <AuthActions
                            language="nl"
                            dashboardHref="/dashboard/zoeker"
                            dashboardLabel="Mijn dashboard"
                        />
                    </nav>
                </div>
            </header>

            <section className="border-b border-line bg-brand-dark text-white">
                <div className="mx-auto max-w-[1600px] px-4 py-9 sm:px-6 lg:px-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                        Maximale hypotheek & betaalbaarheid
                    </p>
                    <h1 className="mt-2 max-w-3xl text-2xl font-semibold sm:text-4xl">
                        Wat kun je maximaal lenen voor je volgende woning?
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75 sm:text-base">
                        Bereken je leencapaciteit zoals een hypotheekadviseur
                        dat doet: op basis van je toetsinkomen, energielabel,
                        studieschuld en andere verplichtingen. Vul links je
                        gegevens in en zie rechts direct het resultaat.
                    </p>
                </div>
            </section>

            <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
                <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.35fr_0.65fr]">
                    <div className="grid gap-6">
                        <Section
                            icon={Users}
                            title="Jouw situatie"
                            subtitle="We stellen eerst een paar vragen, zodat je alleen de velden ziet die voor jou van toepassing zijn."
                        >
                            <Toggle
                                card
                                icon={Briefcase}
                                checked={applicantIsZzp}
                                onChange={setApplicantIsZzp}
                                label="Ben je zelfstandig ondernemer (ZZP)?"
                                helper="Voor ondernemers kijkt de geldverstrekker naar de nettowinst van de laatste boekjaren."
                            />
                            <Toggle
                                card
                                icon={Users}
                                checked={hasPartner}
                                onChange={setHasPartner}
                                label="Koop je samen met een partner?"
                                helper="Het inkomen van je partner telt voor 100% mee bij het bepalen van de leencapaciteit."
                            />
                            {hasPartner ? (
                                <div className="border-l-2 border-brand/30 pl-4">
                                    <Toggle
                                        card
                                        icon={Briefcase}
                                        checked={partnerIsZzp}
                                        onChange={setPartnerIsZzp}
                                        label="Is je partner zelfstandig ondernemer (ZZP)?"
                                    />
                                </div>
                            ) : null}
                        </Section>

                        <Section
                            icon={Banknote}
                            title="Inkomen"
                            subtitle="Vul hieronder je inkomen in. Je kunt kiezen tussen bruto per jaar, bruto per maand of netto per maand; we rekenen alles om naar een bruto jaarinkomen."
                        >
                            <div>
                                <p className="text-sm font-semibold text-brand">
                                    Jij{applicantIsZzp ? " (ZZP)" : ""}
                                </p>
                                <div className="mt-3">
                                    <IncomeFields
                                        value={applicant}
                                        onChange={setApplicant}
                                        idPrefix="applicant"
                                        isZzp={applicantIsZzp}
                                    />
                                </div>
                            </div>
                            {hasPartner ? (
                                <div className="border-t border-line pt-4">
                                    <p className="text-sm font-semibold text-brand">
                                        Partner{partnerIsZzp ? " (ZZP)" : ""}
                                    </p>
                                    <div className="mt-3">
                                        <IncomeFields
                                            value={partner}
                                            onChange={setPartner}
                                            idPrefix="partner"
                                            isZzp={partnerIsZzp}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </Section>

                        <Section
                            icon={Leaf}
                            title="Woning & energielabel"
                            subtitle="Een energiezuinige woning (label A+ of beter) geeft recht op extra leenruimte, omdat je energielasten lager zijn."
                        >
                            <div>
                                <p className="text-sm font-semibold">
                                    Energielabel van de woning
                                </p>
                                <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                                    {ENERGY_LABELS.map((label) => (
                                        <button
                                            key={label.value}
                                            type="button"
                                            onClick={() =>
                                                setEnergyLabel(label.value)
                                            }
                                            className={`h-11 rounded-md border text-sm font-bold transition ${
                                                energyLabel === label.value
                                                    ? "border-brand bg-brand text-white"
                                                    : "border-line bg-surface text-foreground hover:border-brand/50"
                                            }`}
                                        >
                                            {label.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs leading-5 text-muted">
                                    {energyLabel === "A_PLUS" ||
                                    energyLabel === "A_PLUS_PLUS" ||
                                    energyLabel === "A_PLUS_PLUS_PLUS" ||
                                    energyLabel === "A_PLUS_PLUS_PLUS_PLUS" ||
                                    energyLabel ===
                                        "A_PLUS_PLUS_PLUS_PLUS_PLUS"
                                        ? "Deze woning geeft extra leenruimte voor verduurzaming."
                                        : "Dit label geeft geen extra leenruimte. Het label telt wel mee bij je energielasten."}
                                </p>
                            </div>
                            <NumberField
                                id="property-value"
                                label="Woningwaarde / koopsom (optioneel)"
                                value={propertyValue}
                                onChange={setPropertyValue}
                                placeholder="Bijv. 400000"
                                helper="Vul je de koopsom in, dan vergelijken we je maximale hypotheek met de woning en checken we of NHG mogelijk is."
                            />
                        </Section>

                        <Section
                            icon={Scale}
                            title="Leningen & verplichtingen"
                            subtitle="Studieschuld, partneralimentatie en andere leningen verlagen je maximale hypotheek, omdat ze beslag leggen op je maandbudget."
                        >
                            <div>
                                <NumberField
                                    id="student-outstanding"
                                    label="Studieschuld (totaal nog openstaand)"
                                    value={studentOutstanding}
                                    onChange={setStudentOutstanding}
                                    placeholder="Bijv. 20000"
                                    helper="Ook een studieschuld telt mee, ook al staat die niet bij het BKR."
                                />
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    <Field
                                        label="Berekening maandlast"
                                        htmlFor="student-method"
                                    >
                                        <select
                                            id="student-method"
                                            value={studentMethod}
                                            onChange={(event) =>
                                                setStudentMethod(
                                                    event.target
                                                        .value as StudentLoanMethod,
                                                )
                                            }
                                            className="input mt-1.5"
                                        >
                                            <option value="divide">
                                                Schuld / resterende looptijd
                                            </option>
                                            <option value="nibud">
                                                Nibud-wegingsfactor
                                            </option>
                                        </select>
                                    </Field>
                                    <Field
                                        label="Stelsel"
                                        htmlFor="student-scheme"
                                    >
                                        <select
                                            id="student-scheme"
                                            value={studentScheme}
                                            onChange={(event) =>
                                                setStudentScheme(
                                                    event.target
                                                        .value as StudentLoanScheme,
                                                )
                                            }
                                            className="input mt-1.5"
                                        >
                                            <option value="old">
                                                Oud stelsel (15 jaar)
                                            </option>
                                            <option value="new">
                                                Nieuw stelsel (35 jaar)
                                            </option>
                                        </select>
                                    </Field>
                                </div>
                                {studentMethod === "divide" ? (
                                    <div className="mt-4">
                                        <NumberField
                                            id="student-repayment-years"
                                            label="Resterende aflosperiode"
                                            value={repaymentYears}
                                            onChange={setRepaymentYears}
                                            suffix="jaar"
                                            helper="De studieschuld wordt gedeeld door de resterende looptijd voor de maandlast."
                                        />
                                    </div>
                                ) : null}
                                <p className="mt-3 text-xs leading-5 text-muted">
                                    {studentMethod === "divide"
                                        ? "Maandlast = totale schuld ÷ (resterende jaren × 12). Dit is een eenvoudige, transparante benadering."
                                        : "Maandlast = schuld × wegingsfactor: 0,75% per maand (oud stelsel) of 0,45% per maand (nieuw stelsel). Dit is de officiële Nibud-methode."}
                                </p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <NumberField
                                    id="alimony"
                                    label="Partneralimentatie"
                                    value={alimonyMonthly}
                                    onChange={setAlimonyMonthly}
                                    suffix="per maand"
                                    helper="Kinderalimentatie telt niet mee voor de hypotheek."
                                />
                                <NumberField
                                    id="other-loans"
                                    label="Overige leningen"
                                    value={otherLoansMonthly}
                                    onChange={setOtherLoansMonthly}
                                    suffix="per maand"
                                    helper="Persoonlijke lening, autolening of doorlopend krediet (totale maandlast)."
                                />
                            </div>
                        </Section>

                        <Section
                            icon={Landmark}
                            title="Hypotheekrente vergelijken"
                            subtitle="Je hypotheek loopt 30 jaar (annuïtair). Je kiest alleen hoe lang de rente vaststaat; daarvoor vergelijken we indicatief het aanbod van hypotheekaanbieders."
                        >
                            <Toggle
                                checked={nhg}
                                onChange={selectNhg}
                                label="Ik kom in aanmerking voor NHG"
                                helper={
                                    propertyValueNumber != null &&
                                    propertyValueNumber > NHG_LIMIT_2026
                                        ? `Let op: een woning van ${money(propertyValueNumber)} ligt boven de NHG-kostengrens van ${money(NHG_LIMIT_2026)} (2026).`
                                        : `NHG is mogelijk tot een woningwaarde van ${money(NHG_LIMIT_2026)} (2026) en geeft meestal een lagere rente.`
                                }
                            />
                            <div>
                                <p className="text-sm font-semibold">
                                    Rentevaste periode
                                </p>
                                <div className="mt-1.5 grid grid-cols-5 gap-1 rounded-lg border border-line bg-background p-1">
                                    {FIXED_TERMS.map((years) => (
                                        <button
                                            key={years}
                                            type="button"
                                            onClick={() =>
                                                selectFixedYears(years)
                                            }
                                            className={`h-10 rounded-md text-sm font-semibold transition ${fixedYears === years ? "bg-brand text-white" : "text-muted hover:bg-surface"}`}
                                        >
                                            {years} jr
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-semibold">
                                    Beste aanbieders ({nhg ? "met" : "zonder"}{" "}
                                    NHG, {fixedYears} jaar vast)
                                </p>
                                <ul className="mt-2 grid gap-2">
                                    {offers.map((offer, index) => {
                                        const selected =
                                            Math.abs(
                                                toNumber(mortgageRate) -
                                                    offer.ratePercent,
                                            ) < 0.005;
                                        return (
                                            <li
                                                key={`${offer.lender}-${offer.fixedYears}-${offer.nhg}`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        selectOffer(offer)
                                                    }
                                                    className={`flex w-full items-center justify-between gap-3 border p-3 text-left transition ${selected ? "border-brand bg-brand/5 ring-1 ring-brand/20" : "border-line hover:border-brand/50"}`}
                                                >
                                                    <span className="flex items-center gap-3">
                                                        <span className="grid size-9 place-items-center rounded-md bg-background text-xs font-bold text-brand">
                                                            {index === 0
                                                                ? "★"
                                                                : "·"}
                                                        </span>
                                                        <span>
                                                            <span className="block text-sm font-semibold">
                                                                {offer.lender}
                                                            </span>
                                                            <span className="block text-xs text-muted">
                                                                {offer.fixedYears}{" "}
                                                                jaar rentevast
                                                            </span>
                                                        </span>
                                                    </span>
                                                    <span className="text-right">
                                                        <span className="block text-lg font-bold text-brand">
                                                            {pct.format(
                                                                offer.ratePercent,
                                                            )}
                                                            %
                                                        </span>
                                                        {index === 0 ? (
                                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                                                                Beste deal
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                            <details>
                                <summary className="cursor-pointer text-sm font-semibold text-brand">
                                    Of vul zelf een toetsrente in
                                </summary>
                                <div className="mt-3">
                                    <NumberField
                                        id="mortgage-rate"
                                        label="Hypotheekrente / toetsrente"
                                        value={mortgageRate}
                                        onChange={setMortgageRate}
                                        suffix="%"
                                        helper="Gebruik de actuele toetsrente van je aanbieder."
                                    />
                                </div>
                            </details>
                            <InfoBox>
                                Indicatief aanbod, peildatum{" "}
                                {MORTGAGE_RATES_DATE}. Rentes veranderen
                                dagelijks — controleer de actuele rente bij de
                                aanbieder of via een onafhankelijke
                                vergelijkingssite.
                            </InfoBox>
                        </Section>
                    </div>

                    <aside className="lg:sticky lg:top-24 lg:self-start">
                        <Results result={result} />
                    </aside>
                </div>
            </main>

            <section className="border-t border-line bg-surface">
                <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-6 lg:px-8">
                    <div className="grid gap-6 md:grid-cols-3">
                        <div className="flex items-start gap-3">
                            <TrendingUp
                                size={20}
                                className="mt-0.5 shrink-0 text-brand"
                            />
                            <p className="text-sm leading-6 text-muted">
                                Gebaseerd op de publieke Nibud-normen voor
                                verantwoorde hypotheken en de NHG-kostengrens
                                van 2026.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <Zap
                                size={20}
                                className="mt-0.5 shrink-0 text-brand"
                            />
                            <p className="text-sm leading-6 text-muted">
                                Energielabel A+ of beter geeft tot € 20.000
                                extra leenruimte voor een zuinige woning.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <PiggyBank
                                size={20}
                                className="mt-0.5 shrink-0 text-brand"
                            />
                            <p className="text-sm leading-6 text-muted">
                                Studieschuld, alimentatie en leningen verlagen
                                je maandbudget en daarmee je maximale hypotheek.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
