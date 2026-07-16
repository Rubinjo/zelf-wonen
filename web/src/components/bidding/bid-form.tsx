"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function BidForm({ listingId }: { listingId: string }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [receipt, setReceipt] = useState<{
        submittedAt: string;
        entryHash: string;
    } | null>(null);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const amount = Number(
            String(form.get("amount") ?? "").replace(",", "."),
        );
        const financing = form.get("financing") === "on";
        const inspection = form.get("inspection") === "on";
        const response = await fetch(`/api/listings/${listingId}/bids`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                amountCents: String(Math.round(amount * 100)),
                idempotencyKey: crypto.randomUUID(),
                resolutiveConditions: {
                    financing,
                    financingAmountCents: financing
                        ? String(Math.round(amount * 100))
                        : undefined,
                    buildingInspection: inspection,
                    inspectionLimitCents: inspection ? "1500000" : undefined,
                    saleOfCurrentHome: form.get("saleOfCurrentHome") === "on",
                    additionalConditions: String(
                        form.get("additionalConditions") ?? "",
                    ).trim()
                        ? [String(form.get("additionalConditions"))]
                        : [],
                },
                financingDeadline:
                    financing && form.get("financingDeadline")
                        ? new Date(
                              String(form.get("financingDeadline")),
                          ).toISOString()
                        : undefined,
                transferDateRequested: form.get("transferDate")
                    ? new Date(String(form.get("transferDate"))).toISOString()
                    : undefined,
            }),
        });
        const payload = await response.json();
        setBusy(false);
        if (!response.ok) {
            setError(
                response.status === 401
                    ? "Log eerst in met een geverifieerd account om een bod uit te brengen."
                    : (payload.error?.message ??
                          "Het bod kon niet worden vastgelegd"),
            );
            return;
        }
        setReceipt(payload.data);
    }

    if (receipt) {
        return (
            <div className="rounded-3xl bg-brand-dark p-7 text-white">
                <CheckCircle2 className="text-accent" size={30} />
                <h2 className="mt-5 text-2xl font-semibold">
                    Bod veilig vastgelegd
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/65">
                    Je bod staat onveranderbaar in het chronologische logboek.
                    Bewaar onderstaande ontvangsthash.
                </p>
                <p className="mt-5 break-all rounded-2xl bg-white/8 p-4 font-mono text-xs">
                    {receipt.entryHash}
                </p>
                <p className="mt-3 text-xs text-white/55">
                    UTC: {receipt.submittedAt}
                </p>
            </div>
        );
    }

    return (
        <form
            onSubmit={submit}
            className="rounded-3xl border border-line bg-white p-6 shadow-xl sm:p-7"
        >
            <span className="grid size-11 place-items-center rounded-2xl bg-accent text-brand-dark">
                <ShieldCheck size={21} />
            </span>
            <h2 className="mt-5 text-2xl font-semibold">Doe een bod</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
                Bedrag, tijdstip en voorwaarden worden veilig en chronologisch
                vastgelegd.
            </p>
            <label className="mt-6 block text-sm font-semibold">
                Bedrag (€)
                <input
                    name="amount"
                    type="number"
                    min="1"
                    step="1"
                    required
                    className="input mt-2 text-lg font-semibold"
                />
            </label>
            <div className="mt-5 space-y-3 text-sm">
                <label className="flex items-center gap-3">
                    <input
                        name="financing"
                        type="checkbox"
                        className="size-4 accent-brand"
                    />{" "}
                    Voorbehoud van financiering
                </label>
                <label className="flex items-center gap-3">
                    <input
                        name="inspection"
                        type="checkbox"
                        className="size-4 accent-brand"
                    />{" "}
                    Voorbehoud bouwkundige keuring
                </label>
                <label className="flex items-center gap-3">
                    <input
                        name="saleOfCurrentHome"
                        type="checkbox"
                        className="size-4 accent-brand"
                    />{" "}
                    Voorbehoud verkoop eigen woning
                </label>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                    Financiering uiterlijk
                    <input
                        name="financingDeadline"
                        type="date"
                        className="input mt-2"
                    />
                </label>
                <label className="text-sm font-semibold">
                    Gewenste overdracht
                    <input
                        name="transferDate"
                        type="date"
                        className="input mt-2"
                    />
                </label>
            </div>
            <label className="mt-5 block text-sm font-semibold">
                Aanvullende voorwaarden
                <textarea
                    name="additionalConditions"
                    maxLength={500}
                    rows={3}
                    className="input mt-2 py-3"
                />
            </label>
            {error ? (
                <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    <p>{error}</p>
                    {error.startsWith("Log eerst") ? (
                        <Link
                            href="/"
                            className="mt-2 inline-block font-semibold underline"
                        >
                            Naar inloggen
                        </Link>
                    ) : null}
                </div>
            ) : null}
            <button
                disabled={busy}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white disabled:opacity-60"
            >
                {busy ? (
                    <LoaderCircle className="animate-spin" size={17} />
                ) : (
                    <Send size={17} />
                )}{" "}
                Bod vastleggen
            </button>
            <p className="mt-4 text-center text-[11px] leading-5 text-muted">
                Een bod is geen koopovereenkomst. Definitieve afspraken worden
                afzonderlijk vastgelegd.
            </p>
        </form>
    );
}
