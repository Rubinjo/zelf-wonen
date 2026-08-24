"use client";

import { Check, Languages } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import type { Language } from "@/lib/language-store";

const copy = {
    nl: {
        title: "Taal",
        description:
            "Kies de taal voor de platform-interface. Nederlands of Engels.",
        dutch: "Nederlands",
        english: "English",
    },
    en: {
        title: "Language",
        description: "Choose the interface language. Dutch or English.",
        dutch: "Nederlands",
        english: "English",
    },
} as const;

const options: {
    value: Language;
    label: (t: (typeof copy)[Language]) => string;
}[] = [
    { value: "nl", label: (t) => t.dutch },
    { value: "en", label: (t) => t.english },
];

export function LanguageSwitch() {
    const { language, setLanguage } = useLanguage();
    const t = copy[language];

    return (
        <div>
            <h3 className="text-base font-semibold">{t.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted">{t.description}</p>
            <div className="mt-4 flex w-fit rounded-2xl border border-line bg-background p-1">
                {options.map(({ value, label }) => {
                    const selected = language === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setLanguage(value)}
                            aria-pressed={selected}
                            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                                selected
                                    ? "bg-brand text-white shadow-sm"
                                    : "text-muted hover:text-foreground"
                            }`}
                        >
                            {selected ? (
                                <Check size={15} />
                            ) : (
                                <Languages size={15} />
                            )}
                            {label(t)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
