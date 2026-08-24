"use client";

import { useState } from "react";
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Clock3,
    FileText,
    LoaderCircle,
    Lock,
    Pencil,
    Send,
    ShieldCheck,
    X,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";

export type Agreement = {
    id: string;
    transactionId: string;
    version: number;
    status: string;
    sellerCivilStatus: string | null;
    sellerAddress: string | null;
    sellerSpouseName: string | null;
    sellerSpouseConsentAt: string | null;
    buyerCivilStatus: string | null;
    buyerAddress: string | null;
    buyerSpouseName: string | null;
    buyerSpouseConsentAt: string | null;
    kadastraleOmschrijving: string | null;
    movables: Array<{ description: string; valueCents: string }> | null;
    movablesValueCents: string | null;
    securityType: string;
    securityAmountCents: string | null;
    securityDueDate: string | null;
    financingCondition: boolean;
    financingTermWeeks: number;
    inspectionCondition: boolean;
    inspectionTermDays: number;
    inspectionCostCapCents: string | null;
    nhgCondition: boolean;
    nhgTermWeeks: number;
    foundationCondition: boolean;
    foundationTermWeeks: number;
    transferDate: string | null;
    kadasterRegistration: boolean;
    buyerPaysCosts: boolean;
    additionalTerms: string | null;
    coolingOffDays: number;
    financingDeadline: string | null;
    inspectionDeadline: string | null;
    nhgDeadline: string | null;
    foundationDeadline: string | null;
    coolingOffEndsAt: string | null;
    sellerSignedAt: string | null;
    sellerSignatureMethod: string | null;
    buyerSignedAt: string | null;
    buyerSignatureMethod: string | null;
    submittedAt: string | null;
    signedAt: string | null;
    voidedAt: string | null;
    voidReason: string | null;
};

type AgreementRoom = {
    id: string;
    purchasePriceCents: string;
    listing: {
        purpose: string;
        property: {
            street: string;
            houseNumber: number;
            houseNumberAddition: string | null;
            postcode: string;
            city: string;
            livingAreaSqm: string | null;
            roomCount: number | null;
            constructionYear: number | null;
            energyLabels: Array<{ labelClass: string }>;
        };
    };
    seller: { id: string; name: string; email: string };
    buyer: { id: string; name: string; email: string };
    agreement: Agreement | null;
};

const statusNames: Record<string, string> = {
    DRAFT: "Concept",
    AWAITING_SIGNATURES: "Klaar voor ondertekening",
    PARTIALLY_SIGNED: "Gedeeltelijk ondertekend",
    SIGNED: "Ondertekend",
    VOID: "Ingetrokken",
};

const securityNames: Record<string, string> = {
    NONE: "Geen",
    REQUIRED: "Waarborgsom / bankgarantie",
};

// Standaard leveringsdatum voor een nieuwe conceptovereenkomst (~8 weken).
const FALLBACK_TRANSFER_DATE = new Date(Date.now() + 56 * 86_400_000)
    .toISOString()
    .slice(0, 10);

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

export function Koopovereenkomst({
    room,
    isSeller,
    closed,
    refresh,
    signNotice,
}: {
    room: AgreementRoom;
    isSeller: boolean;
    closed: boolean;
    refresh: () => Promise<void>;
    signNotice?: string;
}) {
    const agreement = room.agreement;
    const signed = agreement?.status === "SIGNED";
    const anySigned = Boolean(
        agreement?.sellerSignedAt || agreement?.buyerSignedAt,
    );
    const editable =
        isSeller && !closed && !anySigned && agreement?.status !== "VOID";
    const [editing, setEditing] = useState(Boolean(editable && !agreement));
    const [noticeDismissed, setNoticeDismissed] = useState(false);
    const endpoint = `/api/transactions/${room.id}/agreement`;

    const saveMutation = useMutation({
        mutationFn: (payload: object) =>
            api(endpoint, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }),
        onSuccess: async () => {
            setEditing(false);
            await refresh();
        },
    });
    const publishMutation = useMutation({
        mutationFn: async (payload: object) => {
            const saved = await api(endpoint, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            const submitted = await api(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "SUBMIT" }),
            });
            return { saved, submitted };
        },
        onSuccess: async () => {
            setEditing(false);
            await refresh();
        },
    });
    const actionMutation = useMutation({
        mutationFn: ({ action, body }: { action: string; body?: object }) =>
            api(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action, ...body }),
            }),
        onSuccess: async () => {
            setEditing(false);
            await refresh();
        },
    });
    const idinMutation = useMutation({
        mutationFn: () =>
            api<{ redirectUrl: string | null }>(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "SIGN_IDIN" }),
            }),
        onSuccess(data) {
            if (data.redirectUrl) {
                // Volgende pagina is de (gesimuleerde) iDIN-omgeving; de
                // callback voltooit de ondertekening en keert terug.
                window.location.assign(data.redirectUrl);
            }
        },
    });
    const pdfMutation = useMutation({
        mutationFn: () =>
            api(`/api/transactions/${room.id}/generated-documents`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ type: "AGREEMENT" }),
            }),
        onSuccess: refresh,
    });

    if (!agreement || (editable && editing)) {
        return (
            <SetupForm
                room={room}
                existing={agreement}
                onSave={(payload) => saveMutation.mutateAsync(payload)}
                onPublish={(payload) => publishMutation.mutateAsync(payload)}
                onCancel={editing ? () => setEditing(false) : undefined}
                isPending={saveMutation.isPending}
                publishPending={publishMutation.isPending}
                error={saveMutation.error?.message}
                publishError={publishMutation.error?.message}
            />
        );
    }

    return (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            {signNotice && !noticeDismissed && (
                <div
                    className={`flex items-start gap-3 border p-4 text-sm lg:col-span-2 ${signNotice === "success" ? "border-brand/30 bg-brand/5 text-brand-dark" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                >
                    {signNotice === "success" ? (
                        <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                    ) : (
                        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                    )}
                    <span className="flex-1 leading-6">
                        {signNotice === "success"
                            ? "Je hebt de koopovereenkomst met iDIN ondertekend. De andere partij kan nu ondertekenen."
                            : signNotice === "cancelled"
                              ? "De iDIN-ondertekening is geannuleerd. De koopovereenkomst is niet ondertekend."
                              : "De iDIN-ondertekening kon niet worden voltooid. Probeer het opnieuw."}
                    </span>
                    <button
                        onClick={() => setNoticeDismissed(true)}
                        className="shrink-0 text-current opacity-70 hover:opacity-100"
                        aria-label="Melding sluiten"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
            <Panel
                title="Koopovereenkomst"
                description="De gestructureerde afspraken tussen koper en verkoper, gebaseerd op het gangbare model voor bestaande woningen en de wettelijke bepalingen van het Burgerlijk Wetboek."
            >
                <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-line pb-5">
                    <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${signed ? "bg-brand/10 text-brand" : agreement?.status === "VOID" ? "bg-red-50 text-red-700" : "bg-background text-muted"}`}
                    >
                        {signed ? (
                            <CheckCircle2 size={14} />
                        ) : (
                            <Clock3 size={14} />
                        )}{" "}
                        {statusNames[agreement?.status ?? "DRAFT"]} · v
                        {agreement?.version}
                    </span>
                    {agreement?.signedAt && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                            <ShieldCheck size={14} /> Ondertekend{" "}
                            {formatDateTime(agreement.signedAt)}
                        </span>
                    )}
                </div>
                <AgreementPreview room={room} agreement={agreement!} />

                {signed && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <div className="border border-brand/20 bg-brand/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                                Bedenktijd (Art 7:2 BW)
                            </p>
                            <p className="mt-2 text-sm">
                                De koper kan de koop tot{" "}
                                <strong>
                                    {formatDateTime(
                                        agreement!.coolingOffEndsAt,
                                    )}
                                </strong>{" "}
                                zonder opgaaf van reden ontbinden.
                            </p>
                        </div>
                        <div className="border border-line bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                                Volgende stap
                            </p>
                            <p className="mt-2 text-sm text-muted">
                                De ontbindende voorwaarden en de levering lopen
                                nu. Werk de stappen in het tabblad
                                &quot;Voortgang&quot; af en zorg dat de notaris
                                de leveringsakte kan passeren op{" "}
                                {formatDate(agreement!.transferDate)}.
                            </p>
                        </div>
                    </div>
                )}
                {signed && (
                    <button
                        onClick={() => pdfMutation.mutate()}
                        disabled={pdfMutation.isPending}
                        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 border border-brand text-sm font-semibold text-brand"
                    >
                        <FileText size={16} /> PDF in documentkluis zetten
                    </button>
                )}
                {pdfMutation.error && (
                    <p className="mt-3 text-sm text-red-700">
                        {pdfMutation.error.message}
                    </p>
                )}
            </Panel>

            <div className="grid content-start gap-5">
                <SigningPanel
                    room={room}
                    agreement={agreement!}
                    isSeller={isSeller}
                    onSignIdin={() => idinMutation.mutate()}
                    idinPending={idinMutation.isPending}
                    idinError={idinMutation.error?.message}
                />
                {editable && (
                    <Panel title="Beheren">
                        <div className="grid gap-2">
                            {agreement?.status !== "VOID" && (
                                <button
                                    onClick={() => setEditing(true)}
                                    className="inline-flex h-11 items-center justify-center gap-2 border border-brand px-4 text-sm font-semibold text-brand"
                                >
                                    <Pencil size={16} /> Concept bewerken
                                </button>
                            )}
                            {agreement?.status !== "SIGNED" &&
                                agreement?.status !== "VOID" && (
                                    <button
                                        onClick={() => {
                                            if (
                                                confirm(
                                                    "Wil je de koopovereenkomst intrekken? De transactie blijft bestaan.",
                                                )
                                            )
                                                actionMutation.mutate({
                                                    action: "VOID",
                                                    body: { reason: "" },
                                                });
                                        }}
                                        className="inline-flex h-11 items-center justify-center gap-2 border border-red-200 px-4 text-sm font-semibold text-red-700"
                                    >
                                        <X size={16} /> Intrekken
                                    </button>
                                )}
                            {actionMutation.error && (
                                <p className="mt-2 text-sm text-red-700">
                                    {actionMutation.error.message}
                                </p>
                            )}
                        </div>
                    </Panel>
                )}
                <Panel title="Wettelijke basis">
                    <ul className="grid gap-2 text-xs leading-5 text-muted">
                        <li>
                            <strong>Art 7:2 BW</strong> — schriftelijke koopakte
                            + wettelijke bedenktijd van drie dagen.
                        </li>
                        <li>
                            <strong>Art 7:26 lid 4 BW</strong> — waarborgsom/
                            bankgarantie van maximaal 10% van de koopsom.
                        </li>
                        <li>
                            <strong>Art 7:3 BW</strong> — optionele inschrijving
                            in de openbare registers beschermt de koper zes
                            maanden.
                        </li>
                        <li>
                            <strong>Art 1:88 BW</strong> — instemming van de
                            echtgenoot/partner is vereist bij verkoop van de
                            gezamenlijke woning.
                        </li>
                        <li>
                            <strong>Art 3:15a BW</strong> — de digitale
                            bevestiging is een platformbevestiging en geen
                            gekwalificeerde elektronische handtekening.
                        </li>
                    </ul>
                </Panel>
            </div>
        </div>
    );
}

function SetupForm({
    room,
    existing,
    onSave,
    onPublish,
    onCancel,
    isPending,
    publishPending,
    error,
    publishError,
}: {
    room: AgreementRoom;
    existing: Agreement | null;
    onSave: (payload: object) => Promise<unknown>;
    onPublish: (payload: object) => Promise<unknown>;
    onCancel?: () => void;
    isPending: boolean;
    publishPending: boolean;
    error?: string;
    publishError?: string;
}) {
    const priceCents = Number(room.purchasePriceCents);
    const maxSecurity = Math.floor(priceCents * 0.1);
    const defaultTransfer =
        existing?.transferDate?.slice(0, 10) ?? FALLBACK_TRANSFER_DATE;
    const [form, setForm] = useState({
        sellerCivilStatus: existing?.sellerCivilStatus ?? "",
        sellerAddress: existing?.sellerAddress ?? "",
        sellerSpouseName: existing?.sellerSpouseName ?? "",
        buyerCivilStatus: existing?.buyerCivilStatus ?? "",
        buyerAddress: existing?.buyerAddress ?? "",
        buyerSpouseName: existing?.buyerSpouseName ?? "",
        kadastraleOmschrijving: existing?.kadastraleOmschrijving ?? "",
        movables: existing?.movables ?? [],
        securityType: existing?.securityType ?? "REQUIRED",
        securityAmountCents:
            existing?.securityAmountCents ?? String(maxSecurity),
        securityDueDate:
            existing?.securityDueDate?.slice(0, 10) ?? defaultTransfer,
        financingCondition: existing?.financingCondition ?? true,
        financingTermWeeks: existing?.financingTermWeeks ?? 6,
        inspectionCondition: existing?.inspectionCondition ?? true,
        inspectionTermDays: existing?.inspectionTermDays ?? 14,
        inspectionCostCapCents:
            existing?.inspectionCostCapCents ?? String(500_000),
        nhgCondition: existing?.nhgCondition ?? false,
        nhgTermWeeks: existing?.nhgTermWeeks ?? 8,
        foundationCondition: existing?.foundationCondition ?? false,
        foundationTermWeeks: existing?.foundationTermWeeks ?? 4,
        transferDate: existing?.transferDate?.slice(0, 10) ?? defaultTransfer,
        kadasterRegistration: existing?.kadasterRegistration ?? true,
        buyerPaysCosts: existing?.buyerPaysCosts ?? true,
        coolingOffDays: existing?.coolingOffDays ?? 3,
        additionalTerms: existing?.additionalTerms ?? "",
    });
    const set = <K extends keyof typeof form>(
        key: K,
        value: (typeof form)[K],
    ) => setForm((current) => ({ ...current, [key]: value }));

    const publish = async () => {
        const payload = {
            sellerCivilStatus: form.sellerCivilStatus,
            sellerAddress: form.sellerAddress,
            sellerSpouseName: form.sellerSpouseName || null,
            buyerCivilStatus: form.buyerCivilStatus,
            buyerAddress: form.buyerAddress,
            buyerSpouseName: form.buyerSpouseName || null,
            kadastraleOmschrijving: form.kadastraleOmschrijving || null,
            movables: form.movables,
            securityType: form.securityType,
            securityAmountCents:
                form.securityType !== "NONE"
                    ? form.securityAmountCents || null
                    : null,
            securityDueDate: form.securityDueDate || null,
            financingCondition: form.financingCondition,
            financingTermWeeks: form.financingTermWeeks,
            inspectionCondition: form.inspectionCondition,
            inspectionTermDays: form.inspectionTermDays,
            inspectionCostCapCents: form.inspectionCondition
                ? form.inspectionCostCapCents || null
                : null,
            nhgCondition: form.nhgCondition,
            nhgTermWeeks: form.nhgTermWeeks,
            foundationCondition: form.foundationCondition,
            foundationTermWeeks: form.foundationTermWeeks,
            transferDate: form.transferDate,
            kadasterRegistration: form.kadasterRegistration,
            buyerPaysCosts: form.buyerPaysCosts,
            coolingOffDays: form.coolingOffDays,
            additionalTerms: form.additionalTerms || null,
        };
        await onPublish(payload);
    };

    const save = async () => {
        const payload = {
            sellerCivilStatus: form.sellerCivilStatus,
            sellerAddress: form.sellerAddress,
            sellerSpouseName: form.sellerSpouseName || null,
            buyerCivilStatus: form.buyerCivilStatus,
            buyerAddress: form.buyerAddress,
            buyerSpouseName: form.buyerSpouseName || null,
            kadastraleOmschrijving: form.kadastraleOmschrijving || null,
            movables: form.movables,
            securityType: form.securityType,
            securityAmountCents:
                form.securityType !== "NONE"
                    ? form.securityAmountCents || null
                    : null,
            securityDueDate: form.securityDueDate || null,
            financingCondition: form.financingCondition,
            financingTermWeeks: form.financingTermWeeks,
            inspectionCondition: form.inspectionCondition,
            inspectionTermDays: form.inspectionTermDays,
            inspectionCostCapCents: form.inspectionCondition
                ? form.inspectionCostCapCents || null
                : null,
            nhgCondition: form.nhgCondition,
            nhgTermWeeks: form.nhgTermWeeks,
            foundationCondition: form.foundationCondition,
            foundationTermWeeks: form.foundationTermWeeks,
            transferDate: form.transferDate,
            kadasterRegistration: form.kadasterRegistration,
            buyerPaysCosts: form.buyerPaysCosts,
            coolingOffDays: form.coolingOffDays,
            additionalTerms: form.additionalTerms || null,
        };
        await onSave(payload);
    };

    const addMovable = () =>
        set("movables", [
            ...form.movables,
            { description: "", valueCents: "0" },
        ]);
    const updateMovable = (
        index: number,
        patch: Partial<{ description: string; valueCents: string }>,
    ) =>
        set(
            "movables",
            form.movables.map((item, i) =>
                i === index ? { ...item, ...patch } : item,
            ),
        );
    const removeMovable = (index: number) =>
        set(
            "movables",
            form.movables.filter((_, i) => i !== index),
        );

    return (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            <Panel
                title="Koopovereenkomst opstellen"
                description="Vul de afspraken in. De wettelijke bepalingen en standaardclausules worden automatisch toegevoegd. De termijnen voor ontbindende voorwaarden lopen vanaf het moment van ondertekening."
            >
                <Section title="1. Partijen" step="Art 7:2 BW">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-3 border border-line bg-background p-4">
                            <p className="text-sm font-semibold text-brand">
                                Verkoper — {room.seller.name}
                            </p>
                            <Field
                                label="Burgerlijke staat"
                                value={form.sellerCivilStatus}
                                onChange={(value) =>
                                    set("sellerCivilStatus", value)
                                }
                                placeholder="bijv. ongehuwd, gehuwd, geregistreerd partnerschap"
                                required
                            />
                            <Field
                                label="Adres (domicilie)"
                                value={form.sellerAddress}
                                onChange={(value) =>
                                    set("sellerAddress", value)
                                }
                                placeholder="Straat, huisnummer, postcode, plaats"
                                required
                            />
                            <Field
                                label="Naam echtgenoot/partner (indien gehuwd)"
                                value={form.sellerSpouseName}
                                onChange={(value) =>
                                    set("sellerSpouseName", value)
                                }
                            />
                        </div>
                        <div className="grid gap-3 border border-line bg-background p-4">
                            <p className="text-sm font-semibold text-brand">
                                Koper — {room.buyer.name}
                            </p>
                            <Field
                                label="Burgerlijke staat"
                                value={form.buyerCivilStatus}
                                onChange={(value) =>
                                    set("buyerCivilStatus", value)
                                }
                                placeholder="bijv. ongehuwd, gehuwd, geregistreerd partnerschap"
                                required
                            />
                            <Field
                                label="Adres (domicilie)"
                                value={form.buyerAddress}
                                onChange={(value) => set("buyerAddress", value)}
                                placeholder="Straat, huisnummer, postcode, plaats"
                                required
                            />
                            <Field
                                label="Naam echtgenoot/partner (indien gehuwd)"
                                value={form.buyerSpouseName}
                                onChange={(value) =>
                                    set("buyerSpouseName", value)
                                }
                            />
                        </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted">
                        Bij verkoop van een gezamenlijke woning is de
                        schriftelijke instemming van de echtgenoot/partner
                        vereist (Art 1:88 BW). De notaris controleert dit bij
                        het passeren.
                    </p>
                </Section>

                <Section title="2. Woning, koopsom en roerende zaken">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Info
                            label="Adres"
                            value={`${room.listing.property.street} ${room.listing.property.houseNumber}${room.listing.property.houseNumberAddition ?? ""}`}
                        />
                        <Info
                            label="Plaats"
                            value={`${room.listing.property.postcode} ${room.listing.property.city}`}
                        />
                        <Info
                            label="Koopsom"
                            value={formatEuros(room.purchasePriceCents)}
                        />
                        <Info
                            label="Woonoppervlak"
                            value={
                                room.listing.property.livingAreaSqm
                                    ? `${room.listing.property.livingAreaSqm} m²`
                                    : "onbekend"
                            }
                        />
                    </div>
                    <Field
                        label="Kadastrale omschrijving (optioneel, indicatief)"
                        value={form.kadastraleOmschrijving}
                        onChange={(value) =>
                            set("kadastraleOmschrijving", value)
                        }
                        placeholder="bijv. gemeente Utrecht, sectie B, nummer 1234"
                    />
                    <div className="mt-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">
                                Roerende zaken (bijv. keukeninventaris)
                            </p>
                            <button
                                type="button"
                                onClick={addMovable}
                                className="text-xs font-semibold text-brand"
                            >
                                + Toevoegen
                            </button>
                        </div>
                        {form.movables.map((item, index) => (
                            <div
                                key={index}
                                className="mt-2 grid gap-2 border border-line p-2 sm:grid-cols-[1fr_140px_auto] sm:items-end"
                            >
                                <Field
                                    label="Omschrijving"
                                    value={item.description}
                                    onChange={(value) =>
                                        updateMovable(index, {
                                            description: value,
                                        })
                                    }
                                />
                                <label className="text-sm font-semibold">
                                    Waarde (€)
                                    <input
                                        type="number"
                                        min="0"
                                        value={
                                            item.valueCents
                                                ? Number(item.valueCents) / 100
                                                : ""
                                        }
                                        onChange={(event) =>
                                            updateMovable(index, {
                                                valueCents: String(
                                                    Math.round(
                                                        Number(
                                                            event.target.value,
                                                        ) * 100,
                                                    ) || 0,
                                                ),
                                            })
                                        }
                                        className="input mt-2"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => removeMovable(index)}
                                    className="grid size-10 place-items-center border border-line text-muted"
                                    aria-label="Roerende zaak verwijderen"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section
                    title="3. Waarborgsom / bankgarantie"
                    step="max. 10% (Art 7:26 lid 4 BW)"
                >
                    <p className="mb-4 text-sm leading-6 text-muted">
                        Je legt vast of de koper zekerheid moet stellen en voor
                        welk bedrag. De <strong>koper</strong> kiest na
                        ondertekening of hij die zekerheid stelt als waarborgsom
                        (storting op de kwaliteitsrekening van de notaris) of
                        als bankgarantie (Art 7:26 lid 4 BW).
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-sm font-semibold">
                            Zekerheid vereist
                            <select
                                value={form.securityType}
                                onChange={(event) =>
                                    set("securityType", event.target.value)
                                }
                                className="input mt-2"
                            >
                                <option value="REQUIRED">
                                    Ja (waarborgsom of bankgarantie)
                                </option>
                                <option value="NONE">Nee</option>
                            </select>
                        </label>
                        {form.securityType !== "NONE" && (
                            <>
                                <label className="text-sm font-semibold">
                                    Bedrag (€)
                                    <input
                                        type="number"
                                        min="0"
                                        max={maxSecurity / 100}
                                        step="100"
                                        value={
                                            form.securityAmountCents
                                                ? Number(
                                                      form.securityAmountCents,
                                                  ) / 100
                                                : ""
                                        }
                                        onChange={(event) =>
                                            set(
                                                "securityAmountCents",
                                                String(
                                                    Math.round(
                                                        Number(
                                                            event.target.value,
                                                        ) * 100,
                                                    ) || 0,
                                                ),
                                            )
                                        }
                                        className="input mt-2"
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Uiterlijk op
                                    <input
                                        type="date"
                                        value={form.securityDueDate}
                                        onChange={(event) =>
                                            set(
                                                "securityDueDate",
                                                event.target.value,
                                            )
                                        }
                                        className="input mt-2"
                                    />
                                </label>
                            </>
                        )}
                    </div>
                    {form.securityType !== "NONE" && (
                        <p className="mt-2 text-xs text-muted">
                            Maximaal toegestaan:{" "}
                            <strong>{formatEuros(String(maxSecurity))}</strong>{" "}
                            (10% van de koopsom). De koper kiest de vorm later
                            op het tabblad Waarborgsom.
                        </p>
                    )}
                </Section>

                <Section
                    title="4. Ontbindende voorwaarden"
                    step="termijnen lopen vanaf ondertekening"
                >
                    <ConditionRow
                        enabled={form.financingCondition}
                        onToggle={(value) => set("financingCondition", value)}
                        label="Voorbehoud van financiering"
                        helper="De koper mag ontbinden als hij na reële inspanning geen financiering krijgt. Termijn: marktstandaard 6 weken."
                    >
                        <label className="text-sm font-semibold">
                            Termijn (weken)
                            <input
                                type="number"
                                min="1"
                                max="26"
                                value={form.financingTermWeeks}
                                onChange={(event) =>
                                    set(
                                        "financingTermWeeks",
                                        Number(event.target.value),
                                    )
                                }
                                className="input mt-2 w-32"
                            />
                        </label>
                    </ConditionRow>
                    <ConditionRow
                        enabled={form.inspectionCondition}
                        onToggle={(value) => set("inspectionCondition", value)}
                        label="Voorbehoud bouwkundige keuring"
                        helper="De koper mag een bouwkundige keuring laten uitvoeren en ontbinden als de herstelkosten een drempel overschrijden."
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-sm font-semibold">
                                Termijn (dagen)
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={form.inspectionTermDays}
                                    onChange={(event) =>
                                        set(
                                            "inspectionTermDays",
                                            Number(event.target.value),
                                        )
                                    }
                                    className="input mt-2 w-32"
                                />
                            </label>
                            <label className="text-sm font-semibold">
                                Drempel herstelkosten (€)
                                <input
                                    type="number"
                                    min="0"
                                    step="500"
                                    value={
                                        form.inspectionCostCapCents
                                            ? Number(
                                                  form.inspectionCostCapCents,
                                              ) / 100
                                            : ""
                                    }
                                    onChange={(event) =>
                                        set(
                                            "inspectionCostCapCents",
                                            String(
                                                Math.round(
                                                    Number(event.target.value) *
                                                        100,
                                                ) || 0,
                                            ),
                                        )
                                    }
                                    className="input mt-2"
                                />
                            </label>
                        </div>
                    </ConditionRow>
                    <ConditionRow
                        enabled={form.nhgCondition}
                        onToggle={(value) => set("nhgCondition", value)}
                        label="Voorbehoud Nationale Hypotheek Garantie (NHG)"
                    >
                        <label className="text-sm font-semibold">
                            Termijn (weken)
                            <input
                                type="number"
                                min="1"
                                max="26"
                                value={form.nhgTermWeeks}
                                onChange={(event) =>
                                    set(
                                        "nhgTermWeeks",
                                        Number(event.target.value),
                                    )
                                }
                                className="input mt-2 w-32"
                            />
                        </label>
                    </ConditionRow>
                    <ConditionRow
                        enabled={form.foundationCondition}
                        onToggle={(value) => set("foundationCondition", value)}
                        label="Voorbehoud funderingsonderzoek"
                    >
                        <label className="text-sm font-semibold">
                            Termijn (weken)
                            <input
                                type="number"
                                min="1"
                                max="26"
                                value={form.foundationTermWeeks}
                                onChange={(event) =>
                                    set(
                                        "foundationTermWeeks",
                                        Number(event.target.value),
                                    )
                                }
                                className="input mt-2 w-32"
                            />
                        </label>
                    </ConditionRow>
                    <p className="mt-3 text-xs leading-5 text-muted">
                        Ontbinding op grond van een voorwaarde moet schriftelijk
                        worden meegedeeld, uiterlijk de eerstvolgende werkdag na
                        afloop van de termijn, onder bijvoeging van
                        bewijsstukken.
                    </p>
                </Section>

                <Section title="5. Levering en kosten">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-semibold">
                            Leveringsdatum (passeren notaris)
                            <input
                                type="date"
                                value={form.transferDate}
                                onChange={(event) =>
                                    set("transferDate", event.target.value)
                                }
                                className="input mt-2"
                                required
                            />
                        </label>
                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={form.buyerPaysCosts}
                                onChange={(event) =>
                                    set("buyerPaysCosts", event.target.checked)
                                }
                                className="size-4 accent-brand"
                            />{" "}
                            Kosten koper (k.k.): overdrachtsbelasting en
                            notaris-/kadasterkosten voor rekening van de koper
                        </label>
                        <label className="flex items-center gap-3 text-sm sm:col-span-2">
                            <input
                                type="checkbox"
                                checked={form.kadasterRegistration}
                                onChange={(event) =>
                                    set(
                                        "kadasterRegistration",
                                        event.target.checked,
                                    )
                                }
                                className="size-4 accent-brand"
                            />{" "}
                            Inschrijving in de openbare registers (Kadaster) —
                            beschermt de koper zes maanden tegen latere
                            vervreemding (Art 7:3 BW, kosten ca. € 200 voor de
                            koper)
                        </label>
                    </div>
                </Section>

                <Section title="6. Bedenktijd" step="wettelijk minimum 3 dagen">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-semibold">
                            Bedenktijd (dagen)
                            <input
                                type="number"
                                min="3"
                                max="14"
                                value={form.coolingOffDays}
                                onChange={(event) =>
                                    set(
                                        "coolingOffDays",
                                        Number(event.target.value),
                                    )
                                }
                                className="input mt-2 w-32"
                            />
                        </label>
                        <p className="text-xs leading-5 text-muted">
                            De koper heeft recht op een wettelijke bedenktijd
                            van drie dagen (waarvan minstens twee werkdagen), te
                            rekenen vanaf de dag na ontvangst van de
                            ondertekende akte. Een kortere termijn is niet
                            toegestaan (Art 7:2 lid 2 BW).
                        </p>
                    </div>
                </Section>

                <Section title="7. Aanvullende afspraken">
                    <textarea
                        value={form.additionalTerms}
                        onChange={(event) =>
                            set("additionalTerms", event.target.value)
                        }
                        rows={5}
                        maxLength={3000}
                        placeholder="Eventuele aanvullende afspraken tussen partijen…"
                        className="input mt-2 py-3"
                    />
                </Section>

                {error && (
                    <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </p>
                )}
                {publishError && (
                    <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {publishError}
                    </p>
                )}
                <div className="mt-6 flex flex-wrap gap-2">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="inline-flex h-11 items-center gap-2 border border-line px-4 text-sm font-semibold text-muted"
                        >
                            <X size={16} /> Annuleren
                        </button>
                    )}
                    <button
                        onClick={() => save()}
                        disabled={isPending}
                        className="inline-flex h-11 items-center gap-2 border border-brand px-4 text-sm font-semibold text-brand"
                    >
                        {isPending ? (
                            <LoaderCircle className="animate-spin" size={16} />
                        ) : (
                            <FileText size={16} />
                        )}{" "}
                        Concept opslaan
                    </button>
                    <button
                        onClick={() => publish()}
                        disabled={isPending || publishPending}
                        className="inline-flex h-11 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white"
                    >
                        {publishPending ? (
                            <LoaderCircle className="animate-spin" size={16} />
                        ) : (
                            <Send size={16} />
                        )}{" "}
                        Ter ondertekening aanbieden
                    </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted">
                    Na het aanbieden kunnen koper en verkoper de overeenkomst
                    ondertekenen. Zodra één partij heeft ondertekend, kan de
                    inhoud niet meer worden gewijzigd.
                </p>
            </Panel>

            <Panel
                title="Voorbeeldinhoud"
                description="Deze bepalingen worden automatisch aan de overeenkomst toegevoegd."
            >
                <ul className="grid gap-2 text-xs leading-5 text-muted">
                    {[
                        "Staat van de woning: verkocht in de huidige staat, inclusief zichtbare en onzichtbare gebreken",
                        "Eigendomsoverdracht vrij van lasten en beperkingen (Art 7:15 BW)",
                        "Risico gaat over bij feitelijke levering (Art 7:10 BW)",
                        "Verborgen gebreken: verkoper blijft aansprakelijk bij verzwijging (Art 7:17 BW)",
                        "Boete bij niet-nakoming: 10% van de koopsom (Art 6:74 BW)",
                        "Baten en lasten worden naar tijdsgelang verrekend",
                        "Hoofdelijke aansprakelijkheid bij meerdere kopers",
                        "Energielabel wordt verstrekt (Woningwet)",
                        "Nederlands recht is van toepassing",
                    ].map((item) => (
                        <li key={item} className="flex gap-2">
                            <Check
                                className="mt-0.5 shrink-0 text-brand"
                                size={14}
                            />{" "}
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </Panel>
        </div>
    );
}

function AgreementPreview({
    room,
    agreement,
}: {
    room: AgreementRoom;
    agreement: Agreement;
}) {
    const price = room.purchasePriceCents;
    const securityLine =
        agreement.securityType === "NONE"
            ? "Geen waarborgsom of bankgarantie"
            : `${securityNames[agreement.securityType]}: ${formatEuros(agreement.securityAmountCents)}${agreement.securityDueDate ? `, uiterlijk ${formatDate(agreement.securityDueDate)}` : ""}`;
    return (
        <div className="grid gap-5">
            <div>
                <p className="text-sm font-semibold text-brand">Partijen</p>
                <div className="mt-2 grid gap-3 border border-line p-4 text-sm sm:grid-cols-2">
                    <div>
                        <p className="font-semibold">{room.seller.name}</p>
                        <p className="mt-1 text-xs text-muted">
                            {agreement.sellerCivilStatus ??
                                "Burgerlijke staat niet opgegeven"}
                            {agreement.sellerSpouseName
                                ? ` · partner: ${agreement.sellerSpouseName}`
                                : ""}
                        </p>
                        <p className="text-xs text-muted">
                            {agreement.sellerAddress}
                        </p>
                    </div>
                    <div>
                        <p className="font-semibold">{room.buyer.name}</p>
                        <p className="mt-1 text-xs text-muted">
                            {agreement.buyerCivilStatus ??
                                "Burgerlijke staat niet opgegeven"}
                            {agreement.buyerSpouseName
                                ? ` · partner: ${agreement.buyerSpouseName}`
                                : ""}
                        </p>
                        <p className="text-xs text-muted">
                            {agreement.buyerAddress}
                        </p>
                    </div>
                </div>
            </div>
            <div>
                <p className="text-sm font-semibold text-brand">
                    Woning en koopsom
                </p>
                <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                    <Info
                        label="Adres"
                        value={`${room.listing.property.street} ${room.listing.property.houseNumber}${room.listing.property.houseNumberAddition ?? ""}, ${room.listing.property.postcode} ${room.listing.property.city}`}
                    />
                    <Info label="Koopsom" value={formatEuros(price)} />
                    <Info
                        label="Leveringsdatum"
                        value={formatDate(agreement.transferDate)}
                    />
                    <Info
                        label="Waarborgsom / bankgarantie"
                        value={securityLine}
                    />
                    {agreement.kadastraleOmschrijving && (
                        <Info
                            label="Kadastrale omschrijving"
                            value={agreement.kadastraleOmschrijving}
                        />
                    )}
                </div>
                {agreement.movables && agreement.movables.length > 0 && (
                    <div className="mt-3 border border-line p-3 text-sm">
                        <p className="font-semibold">Roerende zaken</p>
                        <ul className="mt-1 text-xs text-muted">
                            {agreement.movables.map((item, index) => (
                                <li
                                    key={index}
                                    className="flex justify-between gap-2 py-0.5"
                                >
                                    <span>{item.description}</span>
                                    <span>{formatEuros(item.valueCents)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            <div>
                <p className="text-sm font-semibold text-brand">
                    Ontbindende voorwaarden
                </p>
                <div className="mt-2 grid gap-2 text-sm">
                    <ConditionLine
                        label="Financiering"
                        active={agreement.financingCondition}
                        detail={
                            agreement.financingCondition
                                ? `${agreement.financingTermWeeks} weken${agreement.financingDeadline ? ` · tot ${formatDate(agreement.financingDeadline)}` : ""}`
                                : undefined
                        }
                    />
                    <ConditionLine
                        label="Bouwkundige keuring"
                        active={agreement.inspectionCondition}
                        detail={
                            agreement.inspectionCondition
                                ? `${agreement.inspectionTermDays} dagen${agreement.inspectionDeadline ? ` · tot ${formatDate(agreement.inspectionDeadline)}` : ""}${agreement.inspectionCostCapCents ? ` · drempel ${formatEuros(agreement.inspectionCostCapCents)}` : ""}`
                                : undefined
                        }
                    />
                    <ConditionLine
                        label="NHG"
                        active={agreement.nhgCondition}
                        detail={
                            agreement.nhgCondition
                                ? `${agreement.nhgTermWeeks} weken${agreement.nhgDeadline ? ` · tot ${formatDate(agreement.nhgDeadline)}` : ""}`
                                : undefined
                        }
                    />
                    <ConditionLine
                        label="Funderingsonderzoek"
                        active={agreement.foundationCondition}
                        detail={
                            agreement.foundationCondition
                                ? `${agreement.foundationTermWeeks} weken${agreement.foundationDeadline ? ` · tot ${formatDate(agreement.foundationDeadline)}` : ""}`
                                : undefined
                        }
                    />
                </div>
            </div>
            <div>
                <p className="text-sm font-semibold text-brand">Bedenktijd</p>
                <p className="mt-1 text-sm">
                    {agreement.coolingOffDays} dagen{" "}
                    {agreement.coolingOffEndsAt
                        ? `(eindigt ${formatDateTime(agreement.coolingOffEndsAt)})`
                        : "(start na ondertekening)"}{" "}
                    — Art 7:2 lid 2 BW
                </p>
            </div>
            {agreement.additionalTerms && (
                <div>
                    <p className="text-sm font-semibold text-brand">
                        Aanvullende afspraken
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                        {agreement.additionalTerms}
                    </p>
                </div>
            )}
        </div>
    );
}

function SigningPanel({
    room,
    agreement,
    isSeller,
    onSignIdin,
    idinPending,
    idinError,
}: {
    room: AgreementRoom;
    agreement: Agreement;
    isSeller: boolean;
    onSignIdin: () => void;
    idinPending: boolean;
    idinError?: string;
}) {
    const mySigned = isSeller
        ? Boolean(agreement.sellerSignedAt)
        : Boolean(agreement.buyerSignedAt);
    const [consent, setConsent] = useState(false);
    const signed = agreement.status === "SIGNED";
    const available =
        !signed &&
        (agreement.status === "AWAITING_SIGNATURES" ||
            agreement.status === "PARTIALLY_SIGNED");
    return (
        <Panel
            title="Ondertekening"
            description="Elke partij ondertekent dezelfde inhoud. Met iDIN wordt je identiteit via je bank bevestigd (geavanceerde elektronische handtekening)."
        >
            <div className="grid gap-3">
                <SignatureRow
                    label={room.seller.name}
                    role="Verkoper"
                    signedAt={agreement.sellerSignedAt}
                    method={agreement.sellerSignatureMethod}
                />
                <SignatureRow
                    label={room.buyer.name}
                    role="Koper"
                    signedAt={agreement.buyerSignedAt}
                    method={agreement.buyerSignatureMethod}
                />
            </div>
            {signed ? (
                <p className="mt-4 inline-flex items-center gap-2 font-semibold text-brand">
                    <CheckCircle2 size={18} /> Koopovereenkomst ondertekend
                </p>
            ) : available ? (
                mySigned ? (
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                        <Check size={16} /> Jij hebt ondertekend. We wachten op
                        de andere partij.
                    </p>
                ) : (
                    <div className="mt-5 border border-brand/20 bg-background p-4">
                        <label className="flex items-start gap-3 text-sm leading-6">
                            <input
                                type="checkbox"
                                checked={consent}
                                onChange={(event) =>
                                    setConsent(event.target.checked)
                                }
                                className="mt-1 size-4 accent-brand"
                            />{" "}
                            <span>
                                Ik verklaar dat mijn digitale bevestiging mijn
                                instemming met de inhoud van deze
                                koopovereenkomst uitdrukt en dat ik de
                                wettelijke bedenktijd en ontbindende voorwaarden
                                ken (Art 3:15a BW).
                            </span>
                        </label>
                        <button
                            onClick={onSignIdin}
                            disabled={!consent || idinPending}
                            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 bg-brand px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {idinPending ? (
                                <LoaderCircle
                                    className="animate-spin"
                                    size={17}
                                />
                            ) : (
                                <ShieldCheck size={17} />
                            )}{" "}
                            Ondertekenen met iDIN
                        </button>
                        {idinError && (
                            <p className="mt-3 text-sm text-red-700">
                                {idinError}
                            </p>
                        )}
                        <p className="mt-3 text-xs leading-5 text-muted">
                            Je wordt doorgestuurd naar je bank om je identiteit
                            te bevestigen. Daarna wordt de overeenkomst
                            automatisch ondertekend en keer je terug naar deze
                            pagina. Ondertekenen zonder iDIN is niet mogelijk.
                        </p>
                    </div>
                )
            ) : (
                <p className="mt-4 text-sm text-muted">
                    {agreement.status === "DRAFT"
                        ? "De verkoper stelt de koopovereenkomst op. Na aanbieding kun je hier ondertekenen."
                        : agreement.status === "VOID"
                          ? "Deze koopovereenkomst is ingetrokken."
                          : "Ondertekening is niet beschikbaar."}
                </p>
            )}
            <div className="mt-5 flex gap-2 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                <span>
                    Ook met iDIN blijft een notariële leveringsakte vereist voor
                    de eigendomsoverdracht. Laat de overeenkomst voor
                    ondertekening controleren door een deskundige of de notaris.
                </span>
            </div>
        </Panel>
    );
}

function methodLabel(method: string | null) {
    if (!method) return "";
    if (method === "IDIN") return "iDIN (bankidentificatie)";
    if (method === "PLATFORM_ACK") return "platformbevestiging";
    return method;
}

function SignatureRow({
    label,
    role,
    signedAt,
    method,
}: {
    label: string;
    role: string;
    signedAt: string | null;
    method: string | null;
}) {
    return (
        <div
            className={`flex items-center gap-3 border p-4 ${signedAt ? "border-brand/30 bg-brand/5" : "border-line"}`}
        >
            {signedAt ? (
                method === "IDIN" ? (
                    <ShieldCheck className="text-brand" size={21} />
                ) : (
                    <CheckCircle2 className="text-brand" size={21} />
                )
            ) : (
                <Lock className="text-muted" size={21} />
            )}
            <div>
                <p className="font-semibold">{label}</p>
                <p className="text-xs text-muted">
                    {role} ·{" "}
                    {signedAt
                        ? `ondertekend ${formatDateTime(signedAt)}${method ? ` via ${methodLabel(method)}` : ""}`
                        : "nog niet ondertekend"}
                </p>
            </div>
        </div>
    );
}

function ConditionLine({
    label,
    active,
    detail,
}: {
    label: string;
    active: boolean;
    detail?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0">
            <span
                className={active ? "font-semibold" : "text-muted line-through"}
            >
                {label}
            </span>
            <span className="text-xs text-muted">
                {active ? (detail ?? "opgenomen") : "niet van toepassing"}
            </span>
        </div>
    );
}

function Section({
    title,
    step,
    children,
}: {
    title: string;
    step?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mt-6 border-t border-line pt-5 first:mt-0 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{title}</h3>
                {step && (
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                        {step}
                    </span>
                )}
            </div>
            <div className="mt-4">{children}</div>
        </section>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    required,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
}) {
    return (
        <label className="text-sm font-semibold">
            {label}
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                required={required}
                className="input mt-2"
            />
        </label>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 border-b border-line pb-2 text-sm last:border-0">
            <span className="text-muted">{label}</span>
            <span className="text-right font-semibold">{value}</span>
        </div>
    );
}

function ConditionRow({
    enabled,
    onToggle,
    label,
    helper,
    children,
}: {
    enabled: boolean;
    onToggle: (value: boolean) => void;
    label: string;
    helper?: string;
    children?: React.ReactNode;
}) {
    return (
        <div className="border border-line p-4">
            <label className="flex items-center gap-3 text-sm font-semibold">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => onToggle(event.target.checked)}
                    className="size-4 accent-brand"
                />{" "}
                {label}
            </label>
            {helper && (
                <p className="mt-2 text-xs leading-5 text-muted">{helper}</p>
            )}
            {enabled && children && <div className="mt-3">{children}</div>}
        </div>
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
