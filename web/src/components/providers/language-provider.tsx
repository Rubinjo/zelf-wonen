"use client";

import {
    createContext,
    useContext,
    useMemo,
    useSyncExternalStore,
} from "react";
import {
    languageStore,
    setLanguage as setStoredLanguage,
    type Language,
} from "@/lib/language-store";

interface LanguageContextValue {
    language: Language;
    setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Provides the interface language (Dutch or English). Defaults to the browser
 * language and persists the user's choice in localStorage and a cookie
 * (`zelfwonen:lang`).
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const language = useSyncExternalStore(
        languageStore.subscribe,
        languageStore.getSnapshot,
        languageStore.getServerSnapshot,
    );

    const value = useMemo<LanguageContextValue>(
        () => ({ language, setLanguage: setStoredLanguage }),
        [language],
    );

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}
