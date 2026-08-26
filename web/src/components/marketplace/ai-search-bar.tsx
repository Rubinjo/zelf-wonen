"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

// Roterende voorbeeldvragen die laten zien dat er in natuurlijke taal
// gezocht kan worden (plaats, straat of vrije omschrijving).
const EXAMPLE_QUERIES = [
    "Huizen te koop in Utrecht met een tuin",
    "Iets energiezuinigs in de buurt van Rotterdam",
    "Appartementen te huur in Amsterdam onder € 2.000",
    "Iets dichtbij supermarkten en scholen in Zwolle",
    "Laat me woningen zien in een rustige buurt bij het station",
];

// Snelheden voor de typ-/verwijderanimatie van de voorbeeldvragen.
const TYPE_MS_PER_CHAR = 42;
const DELETE_MS_PER_CHAR = 22;
const READ_PAUSE_MS = 1900;

/**
 * AI-eerst zoekbalk: elke zoekopdracht wordt in natuurlijke taal
 * serverzijde geïnterpreteerd en omgezet naar filters op /zoeken.
 * Zolang het veld leeg en niet gefocust is, wordt een voorbeeldvraag
 * teken voor teken getypt, kort gepauzeerd en weer verwijderd; zodra
 * de gebruiker focust of klikt stopt de animatie en is het veld
 * volledig leeg om zelf in te typen.
 */
export function AiSearchBar() {
    const router = useRouter();
    const [value, setValue] = useState("");
    const [focused, setFocused] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [exampleIndex, setExampleIndex] = useState(0);
    const [typedLength, setTypedLength] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const showExample = !focused && !value && !pending;
    const activeExample = EXAMPLE_QUERIES[exampleIndex];

    useEffect(() => {
        if (!showExample) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (!isDeleting && typedLength < activeExample.length) {
            // Typen: per teken toevoegen.
            timer = setTimeout(
                () => setTypedLength(typedLength + 1),
                TYPE_MS_PER_CHAR,
            );
        } else if (!isDeleting) {
            // Helemaal getypt: kort pauzeren zodat de vraag leesbaar is.
            timer = setTimeout(() => setIsDeleting(true), READ_PAUSE_MS);
        } else if (typedLength > 0) {
            // Verwijderen: per teken terug.
            timer = setTimeout(
                () => setTypedLength(typedLength - 1),
                DELETE_MS_PER_CHAR,
            );
        } else {
            // Voorbeeld volledig verwijderd: verder met de volgende vraag.
            timer = setTimeout(() => {
                setExampleIndex(
                    (index) => (index + 1) % EXAMPLE_QUERIES.length,
                );
                setIsDeleting(false);
            }, DELETE_MS_PER_CHAR);
        }
        return () => clearTimeout(timer);
    }, [showExample, isDeleting, typedLength, activeExample]);

    async function submitQuery() {
        const query = value.trim();
        if (!query || pending) return;
        setPending(true);
        setError(null);
        try {
            const response = await fetch("/api/ai/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });
            const payload = (await response.json()) as {
                data?: { redirectUrl?: string; degraded?: boolean };
                error?: { message?: string };
            };
            if (payload.data?.redirectUrl) {
                if (payload.data.degraded) {
                    setError(
                        "AI-zoeken is tijdelijk niet beschikbaar; er is gezocht op de tekst zelf.",
                    );
                }
                router.push(payload.data.redirectUrl);
                // Nieuwe URL-params → servercomponent herlaadt met nieuwe filters.
                router.refresh();
                return;
            }
            setError(
                payload.error?.message ??
                    "De zoekopdracht kon niet worden verwerkt.",
            );
        } catch {
            setError(
                "Er ging iets mis bij het interpreteren van je zoekopdracht.",
            );
        } finally {
            setPending(false);
        }
    }

    return (
        <form
            ref={formRef}
            onSubmit={(event) => {
                event.preventDefault();
                void submitQuery();
            }}
        >
            <label className="relative block">
                <span className="sr-only">
                    Waar ben je naar op zoek? Bijv. plaats, straat of
                    omschrijving
                </span>
                {pending ? (
                    <span className="absolute left-4 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-t-transparent" />
                ) : null}
                <input
                    name="q"
                    type="text"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onFocus={() => {
                        // Animatie stoppen en veld leeg maken om te typen.
                        setFocused(true);
                        setValue("");
                        setError(null);
                    }}
                    onBlur={() => setFocused(false)}
                    maxLength={500}
                    autoComplete="off"
                    className="h-13 w-full rounded-md border-0 bg-white pl-4 pr-14 text-foreground outline-none ring-brand focus:ring-2 dark:text-brand-dark"
                />
                {showExample && typedLength > 0 ? (
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-4 right-14 flex items-center overflow-hidden whitespace-nowrap text-muted dark:text-brand-dark/60"
                    >
                        {activeExample.slice(0, typedLength)}
                    </span>
                ) : null}
                <button
                    type="submit"
                    disabled={pending || !value.trim()}
                    aria-label="Zoekopdracht versturen"
                    title="Zoekopdracht versturen"
                    className="absolute right-1.5 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-md bg-accent text-brand-dark transition hover:bg-accent/80 disabled:opacity-60"
                >
                    {pending ? (
                        <span className="size-5 animate-spin rounded-full border-2 border-brand-dark border-t-transparent" />
                    ) : (
                        <ArrowRight size={20} strokeWidth={2.5} />
                    )}
                </button>
            </label>
            {error ? (
                <p
                    role="alert"
                    className="mt-2 flex items-center gap-2 text-sm font-medium text-accent"
                >
                    {error}
                </p>
            ) : null}
        </form>
    );
}
