"use client";

import {
    createContext,
    useContext,
    useLayoutEffect,
    useMemo,
    useSyncExternalStore,
} from "react";
import {
    setTheme as setStoredTheme,
    themeStore,
    type ResolvedTheme,
    type Theme,
} from "@/lib/theme-store";

interface ThemeContextValue {
    /** The user's chosen preference ("system" means "follow the browser"). */
    theme: Theme;
    /** The effective theme after resolving "system" against the browser. */
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystem(onStoreChange: () => void): () => void {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onStoreChange);
    return () => media.removeEventListener("change", onStoreChange);
}

function getSystemSnapshot(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function removeThemeSwitching(root: HTMLElement) {
    root.classList.remove("theme-switching");
}

function applyTheme(resolved: ResolvedTheme) {
    const root = document.documentElement;
    // Temporarily disable transitions so background/color changes snap
    // instead of animating (and never getting stuck mid-transition).
    root.classList.add("theme-switching");
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            removeThemeSwitching(root);
        }),
    );
    // Fallback for throttled/background tabs where requestAnimationFrame
    // may not fire promptly.
    window.setTimeout(() => removeThemeSwitching(root), 120);
}

/**
 * Provides the active theme. Defaults to the system/browser preference and
 * persists explicit user overrides in localStorage under `zelfwonen:theme`.
 * An inline script in the root layout applies the stored theme before first
 * paint to avoid a flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const theme = useSyncExternalStore(
        themeStore.subscribe,
        themeStore.getSnapshot,
        themeStore.getServerSnapshot,
    );
    const systemDark = useSyncExternalStore(
        subscribeSystem,
        getSystemSnapshot,
        () => false,
    );
    const resolvedTheme: ResolvedTheme =
        theme === "system" ? (systemDark ? "dark" : "light") : theme;

    // Keep the DOM class in sync with the resolved theme. No state updates are
    // performed here, so changes apply without cascading re-renders.
    useLayoutEffect(() => {
        applyTheme(resolvedTheme);
    }, [resolvedTheme]);

    const value = useMemo<ThemeContextValue>(
        () => ({ theme, resolvedTheme, setTheme: setStoredTheme }),
        [theme, resolvedTheme],
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
