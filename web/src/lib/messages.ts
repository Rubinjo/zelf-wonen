import { getLanguage } from "@/lib/language";
import { tSync } from "@/lib/messages/translate";

/**
 * Look up a translation key for the active server-side language.
 *
 * Server-only: reads the language from cookies via `getLanguage`. Client
 * components should use `tSync` from `@/lib/messages/translate` (typically via
 * the `useTranslations` hook) instead.
 */
export async function t(key: string): Promise<string> {
    const lang = await getLanguage();
    return tSync(lang, key);
}
