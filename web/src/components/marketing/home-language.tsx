"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Languages } from "lucide-react";
import { setLanguage } from "@/lib/language-store";

const STORAGE_KEY = "zelfwonen:lang";

/**
 * Header language toggle for the marketing page. Persists the choice so it
 * also applies to the platform (see Settings).
 */
export function HomeLanguageLink({
    current,
    className,
}: {
    current: "nl" | "en";
    className?: string;
}) {
    const next = current === "nl" ? "en" : "nl";
    const label =
        current === "nl" ? "Switch to English" : "Wissel naar Nederlands";

    return (
        <Link
            href={`/?lang=${next}`}
            onClick={() => setLanguage(next)}
            className={className}
            aria-label={label}
        >
            <Languages size={17} /> {current === "nl" ? "EN" : "NL"}
        </Link>
    );
}

/**
 * Keeps the marketing page in sync with a persisted language preference
 * (e.g. chosen from Settings). On first visit it seeds the preference with
 * the currently shown language so the toggle and platform stay consistent.
 * Renders nothing.
 */
export function HomeLanguageSync({ current }: { current: "nl" | "en" }) {
    const router = useRouter();

    useEffect(() => {
        let preferred: "nl" | "en" | null = null;
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (stored === "nl" || stored === "en") {
                preferred = stored;
            } else {
                setLanguage(current); // seed from the page being viewed
            }
        } catch {
            /* ignore storage errors */
        }
        if (preferred && preferred !== current) {
            router.replace(`/?lang=${preferred}`);
        }
    }, [current, router]);

    return null;
}
