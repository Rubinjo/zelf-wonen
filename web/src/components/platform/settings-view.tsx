"use client";

import { SlidersHorizontal } from "lucide-react";
import { TwoFactorSettings } from "@/components/auth/two-factor-settings";
import { LanguageSwitch } from "@/components/platform/language-switch";
import { ThemeModeSelector } from "@/components/platform/theme-mode-selector";
import { useLanguage } from "@/components/providers/language-provider";

const copy = {
    nl: {
        eyebrow: "Instellingen",
        title: "Settings",
        intro: "Pas de weergave en taal van het platform aan. Onder beveiliging regelt je tweestapsverificatie.",
        preferences: "Voorkeuren",
        security: "Beveiliging",
    },
    en: {
        eyebrow: "Settings",
        title: "Settings",
        intro: "Tweak the appearance and language of the platform. Under security you manage two-factor authentication.",
        preferences: "Preferences",
        security: "Security",
    },
} as const;

export function SettingsView() {
    const { language } = useLanguage();
    const t = copy[language];

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <header>
                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                    <SlidersHorizontal size={16} /> {t.eyebrow}
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                    {t.title}
                </h1>
                <p className="mt-3 max-w-2xl text-muted">{t.intro}</p>
            </header>

            <section
                aria-labelledby="settings-preferences"
                className="rounded-4xl border border-line bg-surface p-6 shadow-sm sm:p-9"
            >
                <h2
                    id="settings-preferences"
                    className="text-xs font-semibold uppercase tracking-[0.18em] text-brand"
                >
                    {t.preferences}
                </h2>
                <div className="mt-6 grid gap-10 lg:grid-cols-2">
                    <ThemeModeSelector />
                    <LanguageSwitch />
                </div>
            </section>

            <section aria-labelledby="settings-security">
                <h2
                    id="settings-security"
                    className="text-xs font-semibold uppercase tracking-[0.18em] text-brand"
                >
                    {t.security}
                </h2>
                <div className="mt-4">
                    <TwoFactorSettings />
                </div>
            </section>
        </div>
    );
}
