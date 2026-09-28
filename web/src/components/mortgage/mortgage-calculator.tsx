"use client";

import { PublicHeader } from "@/components/platform/public-header";

import { useMemo, useState, type ReactNode } from "react";
import {
    Banknote,
    Briefcase,
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
import { useTranslations } from "@/lib/messages/use-translations";
import type { MessageKey } from "@/lib/messages/types";
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
                    <span className="block text-sm font-semibold">{label}</span>
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

const modeOptionsBase = [
    { value: "gross-yearly", key: "mortgage.grossYearly" },
    { value: "gross-monthly", key: "mortgage.grossMonthly" },
    { value: "net-monthly", key: "mortgage.netMonthly" },
] as const satisfies readonly { value: IncomeMode; key: MessageKey }[];

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
    const { t } = useTranslations();
    const modeOptions = modeOptionsBase.map((o) => ({
        value: o.value,
        label: t(o.key),
    }));
    const modeLabel: Record<IncomeMode, string> = {
        "gross-yearly": t("mortgage.grossYearlyIncome"),
        "gross-monthly": t("mortgage.grossMonthlyIncome"),
        "net-monthly": t("mortgage.netMonthlyIncome"),
    };
    if (isZzp) {
        return (
            <div className="grid gap-4">
                <InfoBox>{t("mortgage.zzpInfo")}</InfoBox>
                <div className="grid gap-4 sm:grid-cols-3">
                    {t("mortgage.zzpProfitLabels").map(
                        (label: string, index: number) => (
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
                                suffix={t("mortgage.zzpProfitSuffix")}
                            />
                        ),
                    )}
                </div>
                <p className="text-xs leading-5 text-muted">
                    {t("mortgage.zzpNote")}
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            <div>
                <p className="text-sm font-semibold">
                    {t("mortgage.incomeModeQuestion")}
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
                suffix={
                    value.mode === "gross-yearly"
                        ? t("mortgage.grossYearly")
                        : t("mortgage.grossMonthly")
                }
                helper={
                    value.mode === "net-monthly" ? (
                        <>{t("mortgage.netToGrossHelper")}</>
                    ) : undefined
                }
            />
            <Toggle
                checked={value.includeHolidayAllowance}
                onChange={(includeHolidayAllowance) =>
                    onChange({ ...value, includeHolidayAllowance })
                }
                label={t("mortgage.holidayAllowance")}
                helper={t("mortgage.holidayAllowanceHelper")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                    id={`${idPrefix}-fixed-bonus`}
                    label={t("mortgage.fixedBonus")}
                    value={value.fixedBonusYearly}
                    onChange={(fixedBonusYearly) =>
                        onChange({ ...value, fixedBonusYearly })
                    }
                    suffix={t("mortgage.fixedBonusSuffix")}
                    helper={t("mortgage.fixedBonusHelper")}
                />
                <NumberField
                    id={`${idPrefix}-variable-bonus`}
                    label={t("mortgage.variableBonus")}
                    value={value.variableBonusYearly}
                    onChange={(variableBonusYearly) =>
                        onChange({ ...value, variableBonusYearly })
                    }
                    suffix={t("mortgage.variableBonusSuffix")}
                />
            </div>
            <Toggle
                checked={value.variableBonusContractual}
                onChange={(variableBonusContractual) =>
                    onChange({ ...value, variableBonusContractual })
                }
                label={t("mortgage.variableBonusContractual")}
                helper={t("mortgage.variableBonusHelper")}
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
    const { t } = useTranslations();
    const affordable =
        result.monthlyPaymentForValue == null
            ? null
            : result.monthlyPaymentForValue <=
              result.maxMonthlyHousing - result.totalMonthlyObligations;
    return (
        <div className="grid gap-5">
            <section className="border border-line bg-brand-dark p-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                    {t("mortgage.maxMortgage")}
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
                    <h3 className="font-semibold">
                        {t("mortgage.resultTitle")}
                    </h3>
                    <Calculator size={19} className="text-brand" />
                </div>
                <ol className="mt-5 grid gap-5">
                    <Step
                        title={t("mortgage.resultStepIncome")}
                        value={money(result.toetsinkomen)}
                        text={
                            <>
                                {t("mortgage.resultStepIncomeText")}{" "}
                                {result.partnerGross > 0
                                    ? `Aanvrager: ${money(result.applicantGross)}, partner: ${money(result.partnerGross)}.`
                                    : `Aanvrager: ${money(result.applicantGross)}.`}
                            </>
                        }
                    />
                    <Step
                        title={t("mortgage.resultStepFinancing")}
                        value={`${pct.format(result.financingPercentage)}%`}
                        text={
                            <>
                                {t("mortgage.resultStepFinancingText")}{" "}
                                {money(result.maxMonthlyHousing)} bruto per
                                maand.
                            </>
                        }
                    />
                    <Step
                        title={t("mortgage.resultStepCapacity")}
                        value={money(result.maxMortgageIncome)}
                        text={t("mortgage.resultStepCapacityText")}
                    />
                    <Step
                        title={t("mortgage.resultStepEnergy")}
                        value={`+ ${money(result.energyExtra)}`}
                        tone={result.energyExtra > 0 ? "brand" : "muted"}
                        text={t("mortgage.resultStepEnergyText")}
                    />
                    <Step
                        title={t("mortgage.resultStepObligations")}
                        value={`− ${money(result.totalMonthlyObligations * 12)}`}
                        tone="muted"
                        text={
                            <>
                                {t("mortgage.resultStepObligationsText")}{" "}
                                {money(result.studentDebtMonthly)}/mnd,{" "}
                                {money(result.alimonyMonthly)}/mnd,{" "}
                                {money(result.otherLoansMonthly)}/mnd.
                            </>
                        }
                    />
                </ol>
            </section>

            <section className="border border-line bg-surface p-5">
                <h3 className="font-semibold">
                    {t("mortgage.monthlyTitle")}
                </h3>
                <dl className="mt-4 grid gap-3 text-sm">
                    <div className="flex items-center justify-between">
                        <dt className="text-muted">
                            {t("mortgage.monthlyGross")}
                        </dt>
                        <dd className="font-semibold">
                            {moneyCents(result.monthlyPaymentMax)}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt className="text-muted">
                            {t("mortgage.monthlyNet")}
                        </dt>
                        <dd className="font-semibold">
                            {moneyCents(result.netMonthlyEstimate)}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-line pt-3">
                        <dt className="text-muted">
                            {t("mortgage.monthlyObligations")}
                        </dt>
                        <dd className="font-semibold">
                            {moneyCents(result.totalMonthlyObligations)}
                        </dd>
                    </div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted">
                    {t("mortgage.monthlyNote")}
                </p>
            </section>

            <section className="border border-line bg-surface p-5">
                <div className="flex items-start gap-3">
                    <ShieldCheck
                        size={19}
                        className="mt-0.5 shrink-0 text-brand"
                    />
                    <div>
                        <h3 className="font-semibold">
                            {t("mortgage.nhgTitle")}
                        </h3>
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
                                    De woningwaarde ligt boven de
                                    NHG-kostengrens van {money(result.nhgLimit)}{" "}
                                    (2026). NHG is dan niet mogelijk.
                                </>
                            )}
                        </p>
                    </div>
                </div>
                {result.ltvCappedMaxMortgage !== null ? (
                    <div className="mt-4 border-t border-line pt-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted">
                                {t("mortgage.ltvMax")}
                            </span>
                            <span className="font-semibold">
                                {money(result.ltvCappedMaxMortgage)}
                            </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="text-muted">
                                {t("mortgage.ltvMonthly")}
                            </span>
                            <span className="font-semibold">
                                {moneyCents(result.monthlyPaymentForValue ?? 0)}
                            </span>
                        </div>
                        <div
                            className={`mt-3 flex items-start gap-2 text-sm ${affordable ? "text-brand" : "text-muted"}`}
                        >
                            {affordable ? (
                                <PiggyBank
                                    size={16}
                                    className="mt-0.5 shrink-0"
                                />
                            ) : (
                                <Info size={16} className="mt-0.5 shrink-0" />
                            )}
                            <span>
                                {affordable
                                    ? t("mortgage.affordableMessage")
                                    : t("mortgage.notAffordableMessage")}
                            </span>
                        </div>
                    </div>
                ) : null}
            </section>

            <p className="px-1 text-xs leading-5 text-muted">
                {t("mortgage.footerNote")}
            </p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Hoofdcomponent
// ---------------------------------------------------------------------------
export function MortgageCalculator() {
    const { t, language } = useTranslations();
    const l = (nl: string, en: string) => (language === "en" ? en : nl);
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
            <PublicHeader language={language} />

            <section className="border-b border-line bg-brand-dark text-white">
                <div className="mx-auto max-w-[1600px] px-4 py-9 sm:px-6 lg:px-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                        {t("mortgage.title")}
                    </p>
                    <h1 className="mt-2 max-w-3xl text-2xl font-semibold sm:text-4xl">
                        {t("mortgage.description")}
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75 sm:text-base">
                        {l(
                            "Bereken je leencapaciteit zoals een hypotheekadviseur dat doet: op basis van je toetsinkomen, energielabel, studieschuld en andere verplichtingen. Vul links je gegevens in en zie rechts direct het resultaat.",
                            "Calculate your borrowing capacity like a mortgage adviser would, based on your qualifying income, energy label, student debt and other commitments. Enter your details on the left and see the result immediately on the right.",
                        )}
                    </p>
                </div>
            </section>

            <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
                <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.35fr_0.65fr]">
                    <div className="grid gap-6">
                        <Section
                            icon={Users}
                            title={l("Jouw situatie", "Your situation")}
                            subtitle={l("We stellen eerst een paar vragen, zodat je alleen de velden ziet die voor jou van toepassing zijn.", "We start with a few questions so you only see the fields that apply to you.")}
                        >
                            <Toggle
                                card
                                icon={Briefcase}
                                checked={applicantIsZzp}
                                onChange={setApplicantIsZzp}
                                label={l("Ben je zelfstandig ondernemer (ZZP)?", "Are you self-employed?")}
                                helper={l("Voor ondernemers kijkt de geldverstrekker naar de nettowinst van de laatste boekjaren.", "For self-employed applicants, lenders assess the net profit from recent financial years.")}
                            />
                            <Toggle
                                card
                                icon={Users}
                                checked={hasPartner}
                                onChange={setHasPartner}
                                label={l("Koop je samen met een partner?", "Are you buying with a partner?")}
                                helper={l("Het inkomen van je partner telt voor 100% mee bij het bepalen van de leencapaciteit.", "Your partner's income counts in full when determining your borrowing capacity.")}
                            />
                            {hasPartner ? (
                                <div className="border-l-2 border-brand/30 pl-4">
                                    <Toggle
                                        card
                                        icon={Briefcase}
                                        checked={partnerIsZzp}
                                        onChange={setPartnerIsZzp}
                                        label={l("Is je partner zelfstandig ondernemer (ZZP)?", "Is your partner self-employed?")}
                                    />
                                </div>
                            ) : null}
                        </Section>

                        <Section
                            icon={Banknote}
                            title={l("Inkomen", "Income")}
                            subtitle={l("Vul hieronder je inkomen in. Je kunt kiezen tussen bruto per jaar, bruto per maand of netto per maand; we rekenen alles om naar een bruto jaarinkomen.", "Enter your income below. Choose gross yearly, gross monthly or net monthly income; we convert it to gross annual income.")}
                        >
                            <div>
                                <p className="text-sm font-semibold text-brand">
                                    {l("Jij", "You")}{applicantIsZzp ? l(" (ZZP)", " (self-employed)") : ""}
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
                                        {l("Partner", "Partner")}{partnerIsZzp ? l(" (ZZP)", " (self-employed)") : ""}
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
                            title={l("Woning & energielabel", "Home & energy label")}
                            subtitle={l("Een energiezuinige woning (label A+ of beter) geeft recht op extra leenruimte, omdat je energielasten lager zijn.", "An energy-efficient home (label A+ or better) provides extra borrowing capacity because energy costs are lower.")}
                        >
                            <div>
                                <p className="text-sm font-semibold">
                                    {l("Energielabel van de woning", "Home energy label")}
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
                                    energyLabel === "A_PLUS_PLUS_PLUS_PLUS_PLUS"
                                        ? l("Deze woning geeft extra leenruimte voor verduurzaming.", "This home provides extra borrowing capacity for sustainability improvements.")
                                        : l("Dit label geeft geen extra leenruimte. Het label telt wel mee bij je energielasten.", "This label does not provide extra borrowing capacity, but it is included in the estimated energy costs.")}
                                </p>
                            </div>
                            <NumberField
                                id="property-value"
                                label={l("Woningwaarde / koopsom (optioneel)", "Property value / purchase price (optional)")}
                                value={propertyValue}
                                onChange={setPropertyValue}
                                placeholder={l("Bijv. 400000", "E.g. 400000")}
                                helper={l("Vul je de koopsom in, dan vergelijken we je maximale hypotheek met de woning en checken we of NHG mogelijk is.", "Enter the purchase price to compare your maximum mortgage with the property and check whether NHG may be available.")}
                            />
                        </Section>

                        <Section
                            icon={Scale}
                            title={l("Leningen & verplichtingen", "Loans & commitments")}
                            subtitle={l("Studieschuld, partneralimentatie en andere leningen verlagen je maximale hypotheek, omdat ze beslag leggen op je maandbudget.", "Student debt, partner maintenance and other loans reduce your maximum mortgage because they use part of your monthly budget.")}
                        >
                            <div>
                                <NumberField
                                    id="student-outstanding"
                                    label={l("Studieschuld (totaal nog openstaand)", "Student debt (total outstanding)")}
                                    value={studentOutstanding}
                                    onChange={setStudentOutstanding}
                                    placeholder={l("Bijv. 20000", "E.g. 20000")}
                                    helper={l("Ook een studieschuld telt mee, ook al staat die niet bij het BKR.", "Student debt is included even when it is not registered with the Dutch credit bureau (BKR).")}
                                />
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    <Field
                                        label={l("Berekening maandlast", "Monthly payment calculation")}
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
                                                {l("Schuld / resterende looptijd", "Debt / remaining term")}
                                            </option>
                                            <option value="nibud">
                                                {l("Nibud-wegingsfactor", "Nibud weighting factor")}
                                            </option>
                                        </select>
                                    </Field>
                                    <Field
                                        label={l("Stelsel", "Repayment scheme")}
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
                                                {l("Oud stelsel (15 jaar)", "Old scheme (15 years)")}
                                            </option>
                                            <option value="new">
                                                {l("Nieuw stelsel (35 jaar)", "New scheme (35 years)")}
                                            </option>
                                        </select>
                                    </Field>
                                </div>
                                {studentMethod === "divide" ? (
                                    <div className="mt-4">
                                        <NumberField
                                            id="student-repayment-years"
                                            label={l("Resterende aflosperiode", "Remaining repayment period")}
                                            value={repaymentYears}
                                            onChange={setRepaymentYears}
                                            suffix={l("jaar", "years")}
                                            helper={l("De studieschuld wordt gedeeld door de resterende looptijd voor de maandlast.", "The student debt is divided by the remaining term to estimate the monthly payment.")}
                                        />
                                    </div>
                                ) : null}
                                <p className="mt-3 text-xs leading-5 text-muted">
                                    {studentMethod === "divide"
                                        ? l("Maandlast = totale schuld ÷ (resterende jaren × 12). Dit is een eenvoudige, transparante benadering.", "Monthly payment = total debt ÷ (remaining years × 12). This is a simple, transparent estimate.")
                                        : l("Maandlast = schuld × wegingsfactor: 0,75% per maand (oud stelsel) of 0,45% per maand (nieuw stelsel). Dit is de officiële Nibud-methode.", "Monthly payment = debt × weighting factor: 0.75% per month (old scheme) or 0.45% per month (new scheme). This is the official Nibud method.")}
                                </p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <NumberField
                                    id="alimony"
                                    label={l("Partneralimentatie", "Partner maintenance")}
                                    value={alimonyMonthly}
                                    onChange={setAlimonyMonthly}
                                    suffix={l("per maand", "per month")}
                                    helper={l("Kinderalimentatie telt niet mee voor de hypotheek.", "Child maintenance is not included in the mortgage calculation.")}
                                />
                                <NumberField
                                    id="other-loans"
                                    label={l("Overige leningen", "Other loans")}
                                    value={otherLoansMonthly}
                                    onChange={setOtherLoansMonthly}
                                    suffix={l("per maand", "per month")}
                                    helper={l("Persoonlijke lening, autolening of doorlopend krediet (totale maandlast).", "Personal loan, car loan or revolving credit (total monthly payment).")}
                                />
                            </div>
                        </Section>

                        <Section
                            icon={Landmark}
                            title={l("Hypotheekrente vergelijken", "Compare mortgage rates")}
                            subtitle={l("Je hypotheek loopt 30 jaar (annuïtair). Je kiest alleen hoe lang de rente vaststaat; daarvoor vergelijken we indicatief het aanbod van hypotheekaanbieders.", "Your annuity mortgage runs for 30 years. Choose the fixed-rate period and we will show an indicative comparison of mortgage providers.")}
                        >
                            <Toggle
                                checked={nhg}
                                onChange={selectNhg}
                                label={l("Ik kom in aanmerking voor NHG", "I qualify for NHG")}
                                helper={
                                    propertyValueNumber != null &&
                                    propertyValueNumber > NHG_LIMIT_2026
                                        ? l(`Let op: een woning van ${money(propertyValueNumber)} ligt boven de NHG-kostengrens van ${money(NHG_LIMIT_2026)} (2026).`, `Note: a property worth ${money(propertyValueNumber)} is above the NHG cost limit of ${money(NHG_LIMIT_2026)} (2026).`)
                                        : l(`NHG is mogelijk tot een woningwaarde van ${money(NHG_LIMIT_2026)} (2026) en geeft meestal een lagere rente.`, `NHG may be available for property values up to ${money(NHG_LIMIT_2026)} (2026) and usually gives a lower interest rate.`)
                                }
                            />
                            <div>
                                <p className="text-sm font-semibold">
                                    {l("Rentevaste periode", "Fixed-rate period")}
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
                                            {years} {l("jr", "yrs")}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-semibold">
                                    {l("Beste aanbieders", "Best providers")} ({nhg ? l("met", "with") : l("zonder", "without")}{" "}
                                    NHG, {fixedYears} {l("jaar vast", "years fixed")})
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
                                                                {
                                                                    offer.fixedYears
                                                                }{" "}
                                                                {l("jaar rentevast", "year fixed rate")}
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
                                                                {l("Beste deal", "Best deal")}
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
                                    {l("Of vul zelf een toetsrente in", "Or enter an assessment rate yourself")}
                                </summary>
                                <div className="mt-3">
                                    <NumberField
                                        id="mortgage-rate"
                                        label={l("Hypotheekrente / toetsrente", "Mortgage / assessment rate")}
                                        value={mortgageRate}
                                        onChange={setMortgageRate}
                                        suffix="%"
                                        helper={l("Gebruik de actuele toetsrente van je aanbieder.", "Use your provider's current assessment rate.")}
                                    />
                                </div>
                            </details>
                            <InfoBox>
                                {l("Indicatief aanbod, peildatum", "Indicative offers as at")} {MORTGAGE_RATES_DATE}. {l("Rentes veranderen dagelijks — controleer de actuele rente bij de aanbieder of via een onafhankelijke vergelijkingssite.", "Rates change daily—check the current rate with the provider or an independent comparison service.")}
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
                                {l("Gebaseerd op de publieke Nibud-normen voor verantwoorde hypotheken en de NHG-kostengrens van 2026.", "Based on the public Nibud standards for responsible mortgages and the 2026 NHG cost limit.")}
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <Zap
                                size={20}
                                className="mt-0.5 shrink-0 text-brand"
                            />
                            <p className="text-sm leading-6 text-muted">
                                {l("Energielabel A+ of beter geeft tot € 20.000 extra leenruimte voor een zuinige woning.", "Energy label A+ or better provides up to €20,000 in extra borrowing capacity for an efficient home.")}
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <PiggyBank
                                size={20}
                                className="mt-0.5 shrink-0 text-brand"
                            />
                            <p className="text-sm leading-6 text-muted">
                                {l("Studieschuld, alimentatie en leningen verlagen je maandbudget en daarmee je maximale hypotheek.", "Student debt, maintenance and loans reduce your monthly budget and therefore your maximum mortgage.")}
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
