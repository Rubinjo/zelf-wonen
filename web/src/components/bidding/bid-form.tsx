"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";

type BidFormProps = {
    listingId: string;
    biddingMethod: "PRIVATE" | "SEALED" | "OPEN";
    minimumBidCents: string | null;
    bidIncrementCents: string | null;
    highestBidCents: string | null;
    allowBidConditions: boolean;
    opensAt: string | null;
    closesAt: string | null;
};

const methodCopy = {
    PRIVATE: {
        title: "Breng een bod uit",
        text: "Je bod en voorwaarden blijven voor andere bieders en de verkoper verborgen tot de biedingsronde sluit.",
    },
    SEALED: {
        title: "Dien je eindbod in",
        text: "Je definitieve bod blijft voor andere bieders en de verkoper verborgen tot de inschrijving sluit.",
    },
    OPEN: {
        title: "Bied mee",
        text: "Het hoogste bod is openbaar. Je nieuwe bod moet minimaal de vereiste biedstap hoger zijn.",
    },
} as const;

function formatMoney(cents: string) {
    return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(cents) / 100);
}

export function BidForm({
    listingId,
    biddingMethod,
    minimumBidCents,
    bidIncrementCents,
    highestBidCents,
    allowBidConditions,
    opensAt,
    closesAt,
}: BidFormProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [receipt, setReceipt] = useState<{
        submittedAt: string;
        entryHash: string;
    } | null>(null);
    const nextBidCents =
        biddingMethod === "OPEN" && highestBidCents
            ? String(BigInt(highestBidCents) + BigInt(bidIncrementCents ?? "1"))
            : minimumBidCents;
    const copy = methodCopy[biddingMethod];

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
                response.status === 401 || response.status === 403
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
            className="rounded-3xl border border-line bg-surface p-6 shadow-xl sm:p-7"
        >
            <span className="grid size-11 place-items-center rounded-2xl bg-accent text-brand-dark">
                <ShieldCheck size={21} />
            </span>
            <h2 className="mt-5 text-2xl font-semibold">{copy.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
                {copy.text} Bedrag en tijdstip worden veilig en chronologisch
                vastgelegd.
            </p>
            {opensAt || closesAt ? (
                <p className="mt-3 text-xs leading-5 text-muted">
                    {opensAt
                        ? `Start: ${new Date(opensAt).toLocaleString("nl-NL")}`
                        : ""}
                    {opensAt && closesAt ? " · " : ""}
                    {closesAt
                        ? `Sluiting: ${new Date(closesAt).toLocaleString("nl-NL")}`
                        : ""}
                </p>
            ) : null}
            {biddingMethod === "OPEN" && highestBidCents ? (
                <div className="mt-5 border-y border-line py-4">
                    <p className="text-xs font-semibold uppercase text-muted">
                        Huidig hoogste bod
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                        {formatMoney(highestBidCents)}
                    </p>
                </div>
            ) : null}
            <label className="mt-6 block text-sm font-semibold">
                Bedrag (€)
                <input
                    name="amount"
                    type="number"
                    min={nextBidCents ? Number(nextBidCents) / 100 : 1}
                    step={
                        biddingMethod === "OPEN" && bidIncrementCents
                            ? Number(bidIncrementCents) / 100
                            : 1
                    }
                    required
                    className="input mt-2 text-lg font-semibold"
                />
                {nextBidCents ? (
                    <span className="mt-2 block text-xs font-normal text-muted">
                        Minimaal {formatMoney(nextBidCents)}
                    </span>
                ) : null}
            </label>
            {allowBidConditions ? (
                <>
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
                </>
            ) : (
                <div className="mt-5 bg-background p-4 text-sm text-muted">
                    De verkoper accepteert alleen biedingen zonder voorbehouden.
                </div>
            )}
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
