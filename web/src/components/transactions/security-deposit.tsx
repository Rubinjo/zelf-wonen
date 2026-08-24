"use client";

import { useMemo, useState } from "react";
import {
    Banknote,
    Check,
    CheckCircle2,
    Clock3,
    Copy,
    FileCheck2,
    Landmark,
    LoaderCircle,
    Upload,
    Wallet,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import {
    deriveSecurityState,
    securityStatusNames,
    type SecurityState,
} from "@/features/transactions/security-state";

export type SecurityRoom = {
    id: string;
    status: string;
    completedAt: string | null;
    purchasePriceCents: string;
    securityReference: string | null;
    securityPaidAt: string | null;
    securityPaidBy: { name: string } | null;
    securityConfirmedAt: string | null;
    securityConfirmedBy: { name: string } | null;
    securityForm: "DEPOSIT" | "BANK_GUARANTEE" | null;
    securityFormChosenAt: string | null;
    securityFormChosenBy: { name: string } | null;
    notaryDetails: Record<string, string> | null;
    listing: { purpose: string };
    agreement: {
        status: string;
        securityType: string;
        securityAmountCents: string | null;
        securityDueDate: string | null;
    } | null;
};

const securityTypeNames: Record<string, string> = {
    NONE: "Geen",
    REQUIRED: "Waarborgsom / bankgarantie",
};
const formNames: Record<string, string> = {
    DEPOSIT: "Waarborgsom (depot notaris)",
    BANK_GUARANTEE: "Bankgarantie",
};

function formatEuros(cents: string | null | undefined) {
    if (!cents) return "—";
    return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(cents) / 100);
}
function formatDate(date: string | null | undefined) {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("nl-NL");
}
function formatDateTime(date: string | null | undefined) {
    if (!date) return "—";
    return new Date(date).toLocaleString("nl-NL");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error?.message ?? "De actie is mislukt");
    return payload.data as T;
}

export function SecurityDeposit({
    room,
    isSeller,
    closed,
    refresh,
}: {
    room: SecurityRoom;
    isSeller: boolean;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const state = useMemo(() => deriveSecurityState(room), [room]);
    const [file, setFile] = useState<File | null>(null);
    const [copied, setCopied] = useState(false);
    const isBuyer = !isSeller;

    const patch = useMutation({
        mutationFn: (payload: {
            action:
                | "CHOOSE_FORM"
                | "GENERATE_REFERENCE"
                | "MARK_PAID"
                | "CONFIRM";
            form?: "DEPOSIT" | "BANK_GUARANTEE";
        }) =>
            api(`/api/transactions/${room.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ section: "SECURITY", ...payload }),
            }),
        onSuccess: refresh,
    });
    const upload = useMutation({
        mutationFn: async (fileToUpload: File) => {
            const form = new FormData();
            form.set("file", fileToUpload);
            form.set("category", "SECURITY_DEPOSIT");
            return api(`/api/transactions/${room.id}/documents`, {
                method: "POST",
                body: form,
            });
        },
        onSuccess: async () => {
            setFile(null);
            await refresh();
        },
    });

    const copyReference = async () => {
        if (!state.reference) return;
        await navigator.clipboard.writeText(state.reference);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!state.applicable) {
        return (
            <Panel
                title="Waarborgsom / bankgarantie"
                description="Er is geen waarborgsom of bankgarantie overeengekomen in de koopovereenkomst."
            >
                <div className="flex items-start gap-3 border border-line bg-background p-4 text-sm leading-6 text-muted">
                    <Banknote
                        className="mt-0.5 shrink-0 text-brand"
                        size={18}
                    />
                    <p>
                        De mijlpaal “Waarborgsom” is daardoor niet van
                        toepassing en wordt niet verder gevolgd.
                    </p>
                </div>
            </Panel>
        );
    }

    const overdue = state.status === "OVERDUE";
    const isDeposit = state.isDeposit;
    const signed = state.status !== "NOT_SIGNED";
    const formChosen = Boolean(state.securityForm);
    const canChooseForm =
        isBuyer && signed && !closed && state.status === "DUE";
    const canMarkPaid =
        isBuyer && formChosen && isDeposit && !closed && state.status === "DUE";
    const canConfirm =
        isSeller &&
        formChosen &&
        !closed &&
        (state.status === "PAID" || state.status === "CONFIRMED");
    const notary = room.notaryDetails;

    return (
        <div className="grid gap-5">
            <Panel
                title="Waarborgsom / bankgarantie"
                description="De afspraak uit de koopovereenkomst en de actuele status van de zekerheid. Het platform houdt zelf geen geld aan: de storting loopt via de kwaliteitsrekening van de notaris."
            >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Summary
                        label="Zekerheid"
                        value={securityTypeNames[state.securityType ?? "NONE"]}
                    />
                    <Summary
                        label="Bedrag"
                        value={formatEuros(state.amountCents)}
                    />
                    <Summary
                        label="Uiterlijk op"
                        value={formatDate(state.dueDate)}
                        alert={overdue}
                    />
                    <Summary
                        label="Vorm"
                        value={
                            state.securityForm
                                ? formNames[state.securityForm]
                                : "Nog kiezen"
                        }
                    />
                    <Summary
                        label="Status"
                        value={securityStatusNames[state.status]}
                    />
                </div>

                {state.reference && (
                    <div className="mt-4 flex flex-wrap items-center gap-3 border border-line bg-background p-4">
                        <div className="min-w-0">
                            <p className="text-xs text-muted">
                                Betaalkenmerk (vermeld bij de overboeking)
                            </p>
                            <p className="truncate font-mono text-sm font-semibold text-brand">
                                {state.reference}
                            </p>
                        </div>
                        <button
                            onClick={copyReference}
                            className="inline-flex h-10 items-center gap-2 border border-line bg-surface px-3 text-sm font-semibold text-brand"
                        >
                            {copied ? <Check size={15} /> : <Copy size={15} />}
                            {copied ? "Gekopieerd" : "Kopieer"}
                        </button>
                    </div>
                )}

                {state.status === "PAID" && (
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                        <CheckCircle2 size={17} /> De koper heeft op{" "}
                        {formatDateTime(state.paidAt)} aangegeven dat de{" "}
                        {isDeposit
                            ? "storting is gedaan"
                            : "garantie is geregeld"}
                        .
                    </p>
                )}
                {state.status === "CONFIRMED" && (
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                        <FileCheck2 size={17} /> De ontvangst is bevestigd door{" "}
                        {state.confirmedByName ?? "de verkoper"} op{" "}
                        {formatDateTime(state.confirmedAt)}.
                    </p>
                )}
                {state.status === "RELEASED" && (
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                        <CheckCircle2 size={17} /> De waarborgsom is bij de
                        levering verrekend of vrijgegeven.
                    </p>
                )}

                <div className="mt-6">
                    <DepositTimeline state={state} />
                </div>
            </Panel>

            {state.status === "NOT_SIGNED" && (
                <Panel
                    title="Wacht op ondertekening"
                    description="De waarborgsom wordt pas bindend en opeisbaar nadat de koopovereenkomst door beide partijen is ondertekend."
                >
                    <div className="flex items-start gap-3 border border-line bg-background p-4 text-sm leading-6 text-muted">
                        <Clock3
                            className="mt-0.5 shrink-0 text-brand"
                            size={18}
                        />
                        <p>
                            Het afgesproken bedrag (
                            {formatEuros(state.amountCents)}
                            {state.dueDate
                                ? `, uiterlijk ${formatDate(state.dueDate)}`
                                : ""}
                            ) wordt hier automatisch actief zodra de
                            koopovereenkomst is ondertekend.
                        </p>
                    </div>
                </Panel>
            )}

            {state.status === "FORM_REQUIRED" && (
                <Panel
                    title="Kies de vorm van zekerheid"
                    description="De koper kiest hoe hij de zekerheid stelt (Art 7:26 lid 4 BW)."
                >
                    {isBuyer ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <FormChoice
                                title="Waarborgsom (depot notaris)"
                                description="Je stort het bedrag op de kwaliteitsrekening van de notaris. Het geld blijft daar in depot tot de levering."
                                icon={<Banknote size={22} />}
                                pending={patch.isPending}
                                onClick={() =>
                                    patch.mutate({
                                        action: "CHOOSE_FORM",
                                        form: "DEPOSIT",
                                    })
                                }
                            />
                            <FormChoice
                                title="Bankgarantie"
                                description="Je regelt een bankgarantie bij je bank. Je legt geen geld vast; het garantiebewijs dient als bewijsstuk."
                                icon={<Landmark size={22} />}
                                pending={patch.isPending}
                                onClick={() =>
                                    patch.mutate({
                                        action: "CHOOSE_FORM",
                                        form: "BANK_GUARANTEE",
                                    })
                                }
                            />
                        </div>
                    ) : (
                        <div className="flex items-start gap-3 border border-line bg-background p-4 text-sm leading-6 text-muted">
                            <Clock3
                                className="mt-0.5 shrink-0 text-brand"
                                size={18}
                            />
                            <p>
                                De koper kiest nog of hij de zekerheid (
                                {formatEuros(state.amountCents)}
                                {state.dueDate
                                    ? `, uiterlijk ${formatDate(state.dueDate)}`
                                    : ""}
                                ) stelt als waarborgsom of als bankgarantie.
                            </p>
                        </div>
                    )}
                    {patch.error && (
                        <p className="mt-4 text-sm text-red-700">
                            {patch.error.message}
                        </p>
                    )}
                </Panel>
            )}

            {signed && !closed && formChosen && (
                <Panel
                    title={
                        isDeposit ? "Storting regelen" : "Bankgarantie regelen"
                    }
                    description={
                        isDeposit
                            ? "Maak het bedrag vóór de uiterlijke datum over naar de kwaliteitsrekening van de notaris en vermeld daarbij het betaalkenmerk. De notaris houdt het bedrag in depot tot de levering."
                            : "Regel de bankgarantie bij je bank. De bank stelt de garantie af voor het afgesproken bedrag; upload daarna het garantiebewijs als bewijsstuk."
                    }
                >
                    {overdue && (
                        <div className="mb-5 flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            <Banknote className="mt-0.5 shrink-0" size={18} />
                            <p>
                                <strong>Deadline verstreken.</strong> De{" "}
                                {isDeposit ? "storting" : "garantie"} had
                                uiterlijk {formatDate(state.dueDate)} geregeld
                                moeten zijn. Regel dit zo snel mogelijk en neem
                                bij vertraging contact op met de andere partij.
                            </p>
                        </div>
                    )}

                    {canChooseForm && (
                        <div className="mb-5 border border-line bg-background p-4">
                            <p className="text-xs text-muted">
                                Vorm van zekerheid (wijzigen kan tot de{" "}
                                {isDeposit ? "storting" : "garantie"} is
                                geregeld)
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        patch.mutate({
                                            action: "CHOOSE_FORM",
                                            form: "DEPOSIT",
                                        })
                                    }
                                    disabled={patch.isPending}
                                    className={`inline-flex h-10 items-center gap-2 border px-3 text-sm font-semibold ${isDeposit ? "border-brand bg-brand text-white" : "border-line text-brand"}`}
                                >
                                    <Banknote size={15} /> Waarborgsom
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        patch.mutate({
                                            action: "CHOOSE_FORM",
                                            form: "BANK_GUARANTEE",
                                        })
                                    }
                                    disabled={patch.isPending}
                                    className={`inline-flex h-10 items-center gap-2 border px-3 text-sm font-semibold ${!isDeposit ? "border-brand bg-brand text-white" : "border-line text-brand"}`}
                                >
                                    <Landmark size={15} /> Bankgarantie
                                </button>
                            </div>
                        </div>
                    )}

                    {isDeposit && (
                        <div className="grid gap-3 border border-line p-4 sm:grid-cols-2">
                            <div>
                                <p className="text-xs text-muted">
                                    Notariskantoor
                                </p>
                                <p className="font-semibold">
                                    {notary?.officeName ??
                                        "Nog niet vastgelegd"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted">
                                    Rekeninghouder
                                </p>
                                <p className="break-words font-semibold">
                                    {notary?.clientAccountHolder ?? "—"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted">
                                    IBAN (kwaliteitsrekening)
                                </p>
                                <p className="break-words font-mono font-semibold">
                                    {notary?.clientAccountIban ?? "—"}
                                </p>
                            </div>
                            <div className="flex items-end">
                                {state.reference ? (
                                    <div className="w-full border border-brand/30 bg-brand/5 p-3">
                                        <p className="text-xs text-muted">
                                            Betaalkenmerk (vermeld bij de
                                            overboeking)
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <p className="min-w-0 truncate font-mono text-sm font-semibold text-brand">
                                                {state.reference}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={copyReference}
                                                className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-line bg-surface px-2 text-xs font-semibold text-brand"
                                            >
                                                {copied ? (
                                                    <Check size={13} />
                                                ) : (
                                                    <Copy size={13} />
                                                )}
                                                {copied
                                                    ? "Gekopieerd"
                                                    : "Kopieer"}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            patch.mutate({
                                                action: "GENERATE_REFERENCE",
                                            })
                                        }
                                        disabled={patch.isPending}
                                        className="inline-flex h-10 items-center gap-2 border border-brand px-3 text-sm font-semibold text-brand"
                                    >
                                        {patch.isPending ? (
                                            <LoaderCircle
                                                className="animate-spin"
                                                size={15}
                                            />
                                        ) : (
                                            <Wallet size={15} />
                                        )}{" "}
                                        {patch.isPending
                                            ? "Bezig…"
                                            : "Betaalkenmerk aanmaken"}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        {!notary?.clientAccountIban && isDeposit && (
                            <p className="w-full text-xs leading-5 text-muted">
                                De IBAN van de kwaliteitsrekening wordt nog niet
                                getoond. Vraag deze op bij het notariskantoor op
                                het tabblad Notaris (of laat de verkoper de
                                rekeninggegevens aanvullen).
                            </p>
                        )}
                        {isDeposit && canMarkPaid && (
                            <button
                                onClick={() =>
                                    patch.mutate({ action: "MARK_PAID" })
                                }
                                disabled={patch.isPending}
                                className="inline-flex h-11 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white"
                            >
                                {patch.isPending ? (
                                    <LoaderCircle
                                        className="animate-spin"
                                        size={16}
                                    />
                                ) : (
                                    <Banknote size={16} />
                                )}{" "}
                                Ik heb de waarborgsom overgemaakt
                            </button>
                        )}
                        {canConfirm && (
                            <button
                                onClick={() =>
                                    patch.mutate({ action: "CONFIRM" })
                                }
                                disabled={patch.isPending}
                                className="inline-flex h-11 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white"
                            >
                                {patch.isPending ? (
                                    <LoaderCircle
                                        className="animate-spin"
                                        size={16}
                                    />
                                ) : (
                                    <FileCheck2 size={16} />
                                )}{" "}
                                Ontvangst bevestigen
                            </button>
                        )}
                    </div>

                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (file) upload.mutate(file);
                        }}
                        className="mt-5 grid gap-3 border border-dashed border-brand/30 bg-background p-4 sm:grid-cols-[1fr_auto] sm:items-end"
                    >
                        <label className="text-sm font-semibold">
                            Bewijsstuk uploaden
                            <span className="block text-xs font-normal text-muted">
                                {isDeposit
                                    ? "Bijvoorbeeld de overboekingsbevestiging of de depotbevestiging van de notaris."
                                    : "Het garantiebewijs van de bank."}{" "}
                                Hiermee wordt de stap automatisch afgerond.
                            </span>
                            <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                onChange={(event) =>
                                    setFile(event.target.files?.[0] ?? null)
                                }
                                className="mt-2 block w-full text-sm"
                                required
                            />
                        </label>
                        <button
                            disabled={upload.isPending || !file}
                            className="inline-flex h-12 items-center justify-center gap-2 bg-brand px-5 text-sm font-semibold text-white"
                        >
                            {upload.isPending ? (
                                <LoaderCircle
                                    className="animate-spin"
                                    size={16}
                                />
                            ) : (
                                <Upload size={16} />
                            )}{" "}
                            Uploaden
                        </button>
                    </form>
                    {patch.error && (
                        <p className="mt-4 text-sm text-red-700">
                            {patch.error.message}
                        </p>
                    )}
                    {upload.error && (
                        <p className="mt-4 text-sm text-red-700">
                            {upload.error.message}
                        </p>
                    )}
                </Panel>
            )}

            {closed && state.status !== "RELEASED" && (
                <Panel
                    title="Transactie gesloten"
                    description="Deze transactieruimte is afgesloten; de waarborgsom kan niet meer worden gewijzigd."
                >
                    <p className="text-sm leading-6 text-muted">
                        De uiteindelijke verrekening van de waarborgsom loopt
                        via de notaris bij de levering.
                    </p>
                </Panel>
            )}

            <Panel
                title="Hoe werkt de waarborgsom?"
                description="Een korte toelichting op de regels rondom de waarborgsom en bankgarantie."
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <Guidance
                        title="Maximaal 10% van de koopsom"
                        text="De waarborgsom of bankgarantie is wettelijk gemaximeerd op 10% van de koopsom (Art 7:26 lid 4 BW). Dit platform controleert dat bij het opstellen van de koopovereenkomst."
                    />
                    <Guidance
                        title="Waarborgsom als depot bij de notaris"
                        text="De koper stort het bedrag op de kwaliteitsrekening van de notaris. De notaris houdt het bedrag in depot en verrekent het bij de levering met de koopsom."
                    />
                    <Guidance
                        title="Bankgarantie als alternatief"
                        text="In plaats van een storting kan de koper een bankgarantie stellen. De bank garandeert dan dat het bedrag beschikbaar is; het garantiebewijs dient als bewijsstuk."
                    />
                    <Guidance
                        title="Vrijgave bij de levering"
                        text="Bij het passeren van de leveringsakte wordt de waarborgsom verrekend of terugbetaald. Zolang de transactie loopt, houdt de notaris het bedrag veilig vast."
                    />
                </div>
            </Panel>
        </div>
    );
}

function FormChoice({
    title,
    description,
    icon,
    pending,
    onClick,
}: {
    title: string;
    description: string;
    icon: React.ReactNode;
    pending: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={pending}
            className="flex items-start gap-3 border border-dashed border-brand/40 bg-background p-4 text-left hover:border-brand"
        >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                {icon}
            </span>
            <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted">
                    {description}
                </span>
            </span>
        </button>
    );
}

function Panel({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border border-line bg-surface p-5 sm:p-7">
            <h2 className="text-xl font-semibold">{title}</h2>
            {description && (
                <p className="mt-1 text-sm leading-6 text-muted">
                    {description}
                </p>
            )}
            <div className="mt-5">{children}</div>
        </section>
    );
}

function Summary({
    label,
    value,
    alert,
}: {
    label: string;
    value: string;
    alert?: boolean;
}) {
    return (
        <div className="border border-line p-4">
            <p className="text-xs text-muted">{label}</p>
            <p
                className={`mt-1 break-words font-semibold ${alert ? "text-red-700" : ""}`}
            >
                {value}
            </p>
        </div>
    );
}

function Guidance({ title, text }: { title: string; text: string }) {
    return (
        <div className="flex items-start gap-3 border border-line bg-background p-4 text-sm leading-6">
            <Landmark className="mt-0.5 shrink-0 text-brand" size={17} />
            <div>
                <p className="font-semibold">{title}</p>
                <p className="text-muted">{text}</p>
            </div>
        </div>
    );
}

function DepositTimeline({ state }: { state: SecurityState }) {
    const isDeposit = state.isDeposit;
    const steps = [
        {
            label: "Overeengekomen",
            detail: `Vastgelegd in de koopovereenkomst: ${formatEuros(state.amountCents)}.`,
            done: state.status !== "NOT_SIGNED",
        },
        {
            label: "Vorm gekozen",
            detail: state.securityForm
                ? isDeposit
                    ? "De koper koos voor waarborgsom (depot notaris)."
                    : "De koper koos voor bankgarantie."
                : "De koper kiest of hij de zekerheid als waarborgsom of als bankgarantie stelt.",
            done: Boolean(state.securityForm),
        },
        {
            label: isDeposit ? "Storting gedaan" : "Garantie geregeld",
            detail: isDeposit
                ? "De koper maakt het bedrag over naar de kwaliteitsrekening van de notaris."
                : "De koper stelt de bankgarantie en uploadt het garantiebewijs.",
            done: ["PAID", "CONFIRMED", "RELEASED"].includes(state.status),
        },
        {
            label: "Ontvangst bevestigd",
            detail: "De verkoper bevestigt dat de storting is ontvangen.",
            done: ["CONFIRMED", "RELEASED"].includes(state.status),
        },
        {
            label: "Verrekend bij levering",
            detail: "Bij het passeren van de leveringsakte wordt de waarborgsom verrekend.",
            done: state.status === "RELEASED",
        },
    ];
    return (
        <ol className="grid gap-4">
            {steps.map((step, index) => (
                <li key={step.label} className="flex items-start gap-4">
                    <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full border ${
                            step.done
                                ? "border-brand bg-brand text-white"
                                : index === 0
                                  ? "border-brand/40 bg-brand/5 text-brand"
                                  : "border-line bg-background text-muted"
                        }`}
                    >
                        {step.done ? <Check size={15} /> : <Clock3 size={15} />}
                    </span>
                    <div className="min-w-0 pt-1">
                        <p
                            className={`text-sm font-semibold ${step.done ? "" : "text-muted"}`}
                        >
                            {step.label}
                        </p>
                        <p className="text-xs leading-5 text-muted">
                            {step.detail}
                        </p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
