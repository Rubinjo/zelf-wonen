export type Language = "nl" | "en";

const STORAGE_KEY = "zelfwonen:lang";
const COOKIE_KEY = "zelfwonen:lang";
type Listener = () => void;

let cachedLanguage: Language | null = null;
const listeners = new Set<Listener>();

function readStoredLanguage(): Language {
    if (typeof window === "undefined") return "nl";
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "nl" || stored === "en") return stored;
    } catch {
        /* ignore storage errors */
    }
    const browser = navigator.language?.toLowerCase() ?? "";
    return browser.startsWith("en") ? "en" : "nl";
}

function getLanguageSnapshot(): Language {
    if (cachedLanguage === null) cachedLanguage = readStoredLanguage();
    return cachedLanguage;
}

function subscribeLanguage(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Persist the interface language and notify subscribers. */
export function setLanguage(next: Language): void {
    cachedLanguage = next;
    try {
        window.localStorage.setItem(STORAGE_KEY, next);
        // Mirrored to a cookie so server components can read the preference.
        document.cookie = `${COOKIE_KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
        /* ignore storage errors */
    }
    listeners.forEach((listener) => listener());
}

export const languageStore = {
    subscribe: subscribeLanguage,
    getSnapshot: getLanguageSnapshot,
    // Server-side safe snapshot so hydration matches the SSR markup.
    getServerSnapshot: (): Language => "nl",
};
