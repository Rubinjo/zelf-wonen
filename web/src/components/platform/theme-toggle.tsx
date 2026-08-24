"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { useLanguage } from "@/components/providers/language-provider";

const labels = {
    nl: {
        toLight: "Schakel naar licht thema",
        toDark: "Schakel naar donker thema",
    },
    en: { toLight: "Switch to light theme", toDark: "Switch to dark theme" },
} as const;

/**
 * Compact sun/moon toggle for headers. Toggling stores an explicit override;
 * "system" preference is restored from the settings page.
 */
export function ThemeToggle({
    className = "",
    showLabel = false,
}: {
    className?: string;
    showLabel?: boolean;
}) {
    const { resolvedTheme, setTheme } = useTheme();
    const { language } = useLanguage();
    const isDark = resolvedTheme === "dark";
    const label = isDark ? labels[language].toLight : labels[language].toDark;

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-medium text-foreground transition hover:border-brand/30 hover:text-brand ${className}`}
            aria-label={label}
            title={label}
        >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
            {showLabel ? <span>{isDark ? "Licht" : "Donker"}</span> : null}
        </button>
    );
}
