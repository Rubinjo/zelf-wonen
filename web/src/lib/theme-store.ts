export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "zelfwonen:theme";
type Listener = () => void;

let cachedTheme: Theme | null = null;
const listeners = new Set<Listener>();

function readStoredTheme(): Theme {
    if (typeof window === "undefined") return "system";
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") {
            return stored;
        }
    } catch {
        /* ignore storage errors */
    }
    return "system";
}

function getThemeSnapshot(): Theme {
    if (cachedTheme === null) cachedTheme = readStoredTheme();
    return cachedTheme;
}

function subscribeTheme(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Persist an explicit theme override and notify subscribers. */
export function setTheme(next: Theme): void {
    cachedTheme = next;
    try {
        window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
        /* ignore storage errors */
    }
    listeners.forEach((listener) => listener());
}

/** Resolve "system" against the browser's color-scheme preference. */
export function getSystemTheme(): ResolvedTheme {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export const themeStore = {
    subscribe: subscribeTheme,
    getSnapshot: getThemeSnapshot,
    // Server-side safe snapshot so hydration matches the SSR markup.
    getServerSnapshot: (): Theme => "system",
};
