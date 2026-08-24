"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { useLanguage } from "@/components/providers/language-provider";
import type { Theme } from "@/lib/theme-store";

const copy = {
    nl: {
        title: "Weergave",
        description:
            "Kies zelf, of laat het thema de voorkeur van je apparaat volgen.",
        system: "Systeem",
        light: "Licht",
        dark: "Donker",
        active: "Volgt je apparaatinstelling",
        override: "Handmatig gekozen",
    },
    en: {
        title: "Appearance",
        description: "Choose yourself, or let the theme follow your device.",
        system: "System",
        light: "Light",
        dark: "Dark",
        active: "Follows your device setting",
        override: "Manually selected",
    },
} as const;

const options: { value: Theme; icon: typeof Monitor }[] = [
    { value: "system", icon: Monitor },
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
];

export function ThemeModeSelector() {
    const { theme, setTheme } = useTheme();
    const { language } = useLanguage();
    const t = copy[language];

    return (
        <div>
            <h3 className="text-base font-semibold">{t.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted">{t.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {options.map(({ value, icon: Icon }) => {
                    const selected = theme === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setTheme(value)}
                            aria-pressed={selected}
                            className={`flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition ${
                                selected
                                    ? "border-brand bg-brand/8 text-foreground"
                                    : "border-line bg-background text-muted hover:border-brand/30 hover:text-foreground"
                            }`}
                        >
                            <span
                                className={`grid size-9 place-items-center rounded-xl ${
                                    selected
                                        ? "bg-brand text-white"
                                        : "bg-surface text-brand"
                                }`}
                            >
                                <Icon size={18} />
                            </span>
                            <span className="flex w-full items-center justify-between gap-2">
                                <span className="text-sm font-semibold">
                                    {t[value]}
                                </span>
                                {selected ? (
                                    <Check size={16} className="text-brand" />
                                ) : null}
                            </span>
                            <span className="text-xs leading-5 text-muted">
                                {value === "system" ? t.active : t.override}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
