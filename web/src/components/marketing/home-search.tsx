"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";

const copy = {
    nl: {
        label: "Hoe wil jij wonen?",
        placeholder: "Een huis in Utrecht met een tuin tot € 500.000",
        submit: "Vind mijn woning",
        pending: "Je wensen worden vertaald…",
        hint: "Vertel het in je eigen woorden. AI vertaalt je wensen naar zoekfilters.",
        examples: [
            "Huurappartement in Amsterdam tot € 2.000",
            "Huis met tuin in Utrecht",
            "Energiezuinig wonen in Rotterdam",
        ],
        error: "Zoeken lukt even niet. Probeer opnieuw of bekijk het aanbod.",
        browse: "Bekijk het woningaanbod",
    },
    en: {
        label: "What does home look like to you?",
        placeholder: "A house in Utrecht with a garden under € 500,000",
        submit: "Find my home",
        pending: "Turning your wishes into filters…",
        hint: "Use your own words. AI turns your wishes into search filters.",
        examples: [
            "Apartment to rent in Amsterdam under € 2,000",
            "House with a garden in Utrecht",
            "Energy-efficient home in Rotterdam",
        ],
        error: "Search is unavailable right now. Try again or browse the listings.",
        browse: "Browse all homes",
    },
} as const;

export function HomeSearch({ language }: { language: "nl" | "en" }) {
    const t = copy[language];
    const router = useRouter();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [query, setQuery] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);

    async function search(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!query.trim() || pending) return;
        setPending(true);
        setError(false);
        try {
            const response = await fetch("/api/ai/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: query.trim() }),
            });
            const payload: { data?: { redirectUrl?: string } } =
                await response.json();
            const url = payload.data?.redirectUrl;
            if (!response.ok || !url?.startsWith("/search?"))
                throw new Error("Search failed");
            router.push(url);
        } catch {
            setError(true);
        } finally {
            setPending(false);
        }
    }

    return (
        <div>
            <form
                onSubmit={search}
                aria-busy={pending}
                className="rounded-2xl border border-brand/25 bg-surface p-4 shadow-[0_12px_40px_-20px_rgba(7,107,82,0.3)] sm:p-5"
            >
                <label
                    htmlFor="home-query"
                    className="flex items-center gap-2 text-sm font-semibold text-brand"
                >
                    <Sparkles size={17} aria-hidden="true" />
                    {t.label}
                </label>
                <textarea
                    ref={inputRef}
                    id="home-query"
                    name="query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t.placeholder}
                    required
                    maxLength={500}
                    rows={2}
                    aria-describedby="home-search-hint"
                    className="mt-3 block min-h-20 w-full resize-y rounded-md bg-transparent p-1 text-base leading-7 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <span className="text-xs text-muted">
                        {language === "nl"
                            ? "Jouw wensen. Jouw volgende thuis."
                            : "Your wishes. Your next home."}
                    </span>
                    <button
                        disabled={pending || !query.trim()}
                        type="submit"
                        className="home-primary w-full sm:w-auto"
                    >
                        {pending ? (
                            <LoaderCircle
                                size={18}
                                className="animate-spin motion-reduce:animate-none"
                                aria-hidden="true"
                            />
                        ) : (
                            <ArrowRight size={18} aria-hidden="true" />
                        )}
                        {t.submit}
                    </button>
                </div>
                <p role="status" className="sr-only">
                    {pending ? t.pending : ""}
                </p>
                {error && (
                    <p
                        role="alert"
                        className="mt-3 text-sm text-red-700 dark:text-red-300"
                    >
                        {t.error}{" "}
                        <Link href="/search" className="underline">
                            {t.browse}
                        </Link>
                    </p>
                )}
            </form>
            <p
                id="home-search-hint"
                className="mt-3 text-xs leading-5 text-muted"
            >
                {t.hint}
            </p>
            <div
                className="mt-4 flex flex-wrap gap-2"
                aria-label={
                    language === "nl"
                        ? "Voorbeeldzoekopdrachten"
                        : "Example searches"
                }
            >
                {t.examples.map((example) => (
                    <button
                        key={example}
                        type="button"
                        disabled={pending}
                        onClick={() => {
                            setQuery(example);
                            setError(false);
                            inputRef.current?.focus();
                        }}
                        className="rounded-full border border-line px-3 py-2 text-left text-xs text-muted transition hover:border-brand hover:text-brand disabled:opacity-50"
                    >
                        {example}
                        <ArrowRight
                            size={12}
                            className="ml-2 inline"
                            aria-hidden="true"
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}
