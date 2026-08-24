"use client";

import { useState } from "react";
import Link from "next/link";
import {
    CalendarCheck2,
    CalendarDays,
    CheckCircle2,
    LoaderCircle,
    Users,
} from "lucide-react";

type PublicViewingSlot = {
    id: string;
    type: "APPOINTMENT" | "OPEN_HOUSE";
    startsAt: string;
    endsAt: string;
    capacity: number;
    bookedCount: number;
};

const copy = {
    nl: {
        title: "Plan een bezichtiging",
        text: "Kies een beschikbaar moment. Na je boeking ontvangt de verkoper je contactgegevens.",
        appointment: "Bezichtiging",
        openHouse: "Open huis",
        places: "plaatsen vrij",
        book: "Tijdstip boeken",
        signIn: "Log eerst in met een geverifieerd account om een bezichtiging te boeken.",
        signInLink: "Naar inloggen",
        confirmed: "Bezichtiging gepland",
        confirmedText:
            "Je tijdstip staat vast. De verkoper kan dit geboekte moment niet meer wijzigen.",
    },
    en: {
        title: "Schedule a viewing",
        text: "Choose an available time. The seller receives your contact details after booking.",
        appointment: "Viewing",
        openHouse: "Open house",
        places: "places available",
        book: "Book this time",
        signIn: "Sign in with a verified account to book a viewing.",
        signInLink: "Go to sign in",
        confirmed: "Viewing scheduled",
        confirmedText:
            "Your time is confirmed. The seller can no longer change this booked slot.",
    },
} as const;

export function ViewingBooking({
    slots,
    language,
}: {
    slots: PublicViewingSlot[];
    language: "nl" | "en";
}) {
    const t = copy[language];
    const [selectedId, setSelectedId] = useState(slots[0]?.id ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const dateFormatter = new Intl.DateTimeFormat(
        language === "nl" ? "nl-NL" : "en-NL",
        {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        },
    );
    const timeFormatter = new Intl.DateTimeFormat(
        language === "nl" ? "nl-NL" : "en-NL",
        { hour: "2-digit", minute: "2-digit" },
    );

    async function book() {
        if (!selectedId) return;
        setBusy(true);
        setError("");
        const response = await fetch(`/api/viewings/${selectedId}/book`, {
            method: "POST",
        });
        const payload = await response.json().catch(() => ({}));
        setBusy(false);
        if (!response.ok) {
            setError(
                response.status === 401 || response.status === 403
                    ? t.signIn
                    : (payload.error?.message ?? "De boeking is mislukt"),
            );
            return;
        }
        setConfirmed(true);
    }

    if (confirmed) {
        return (
            <div className="rounded-3xl bg-brand-dark p-7 text-white">
                <CheckCircle2 size={30} className="text-accent" />
                <h2 className="mt-5 text-xl font-semibold">{t.confirmed}</h2>
                <p className="mt-2 text-sm leading-6 text-white/70">
                    {t.confirmedText}
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-xl sm:p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-accent text-brand-dark">
                <CalendarDays size={21} />
            </span>
            <h2 className="mt-5 text-xl font-semibold">{t.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t.text}</p>
            <div className="mt-5 space-y-2">
                {slots.map((slot) => {
                    const selected = selectedId === slot.id;
                    return (
                        <button
                            key={slot.id}
                            type="button"
                            onClick={() => setSelectedId(slot.id)}
                            className={`w-full border p-4 text-left ${selected ? "border-brand bg-brand/5" : "border-line"}`}
                        >
                            <span className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold">
                                    {slot.type === "OPEN_HOUSE"
                                        ? t.openHouse
                                        : t.appointment}
                                </span>
                                <span
                                    className={`size-4 rounded-full border-4 ${selected ? "border-brand bg-white" : "border-line"}`}
                                />
                            </span>
                            <span className="mt-2 block text-sm">
                                {dateFormatter.format(new Date(slot.startsAt))}
                                {" - "}
                                {timeFormatter.format(new Date(slot.endsAt))}
                            </span>
                            {slot.type === "OPEN_HOUSE" ? (
                                <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                                    <Users size={13} />
                                    {slot.capacity - slot.bookedCount}{" "}
                                    {t.places}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
            {error ? (
                <div className="mt-4 bg-red-50 p-4 text-sm text-red-700">
                    <p>{error}</p>
                    {error === t.signIn ? (
                        <Link
                            href="/"
                            className="mt-2 inline-block font-semibold underline"
                        >
                            {t.signInLink}
                        </Link>
                    ) : null}
                </div>
            ) : null}
            <button
                type="button"
                disabled={!selectedId || busy}
                onClick={book}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white disabled:opacity-60"
            >
                {busy ? (
                    <LoaderCircle size={17} className="animate-spin" />
                ) : (
                    <CalendarCheck2 size={17} />
                )}
                {t.book}
            </button>
        </div>
    );
}
