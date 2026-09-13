"use client";

import { useSyncExternalStore } from "react";
import { languageStore, type Language } from "@/lib/language-store";
import { tSync } from "@/lib/messages/translate";

/**
 * Client-side translation hook. Returns a `t(key)` function bound to the
 * current language from the language store.
 */
export function useTranslations() {
    const language = useSyncExternalStore<Language>(
        languageStore.subscribe,
        languageStore.getSnapshot,
        languageStore.getServerSnapshot,
    );

    return {
        language,
        t: (key: string) => tSync(language, key),
    };
}
