import { en } from "@/lib/messages/en";
import { nl } from "@/lib/messages/nl";
import type {
    MessageKey,
    MessageValue,
    Messages,
} from "@/lib/messages/types";

type Language = "nl" | "en";

const dictionaries: Record<Language, Messages> = { nl, en };

/**
 * Synchronous translation lookup for a given language.
 *
 * Pure and dependency-free so it can be imported from both server and client
 * components (unlike `getLanguage`, which relies on `next/headers`).
 *
 * Supports dot- and bracket-notation paths, e.g. `nav.homes` or
 * `errors.notFound.title`. Falls back to the Dutch source string when the key
 * is missing in the active language so unfinished translations never break
 * the UI. Missing keys in the Dutch source return an empty string.
 *
 * Known keys resolve to the exact type declared in `Messages` (a string, or a
 * string array); dynamically built keys resolve to `string`.
 */
export function tSync<K extends MessageKey>(
    lang: Language,
    key: K,
): MessageValue<K>;
export function tSync(lang: Language, key: string): string;
export function tSync(lang: Language, key: string): string | string[] {
    return (
        resolveKey(dictionaries[lang], key) ??
        resolveKey(dictionaries.nl, key) ??
        ""
    );
}

type MessageEntry = string | string[];

function resolveKey(dict: Messages, key: string): MessageEntry | undefined {
    const path = key.split(".");
    let current: unknown = dict;
    for (const segment of path) {
        if (
            current &&
            typeof current === "object" &&
            !Array.isArray(current) &&
            segment in (current as Record<string, unknown>)
        ) {
            current = (current as Record<string, unknown>)[segment];
        } else {
            return undefined;
        }
    }
    if (typeof current === "string") return current;
    return Array.isArray(current) ? (current as string[]) : undefined;
}
