"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { tSync } from "@/lib/messages/translate";
import type { MessageKey, MessageValue } from "@/lib/messages/types";

/**
 * Client-side translation hook. Returns a `t(key)` function bound to the
 * current language from the language store. Keys are type-checked against the
 * message dictionary, so typos are caught at compile time.
 */
export function useTranslations() {
    const { language } = useLanguage();

    return {
        language,
        t: <K extends MessageKey>(key: K): MessageValue<K> =>
            tSync(language, key),
    };
}
