import { en } from "@/lib/messages/en";
import { nl } from "@/lib/messages/nl";
import type { Messages } from "@/lib/messages/types";

const dictionaries: Record<"nl" | "en", Messages> = { nl, en };

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
 */
export function tSync(lang: "nl" | "en", key: string): string {
    return (
        resolveKey(dictionaries[lang], key) ??
        resolveKey(dictionaries.nl, key) ??
        ""
    );
}

function resolveKey(dict: Messages, key: string): string | undefined {
    const path = key.split(".");
    let current: unknown = dict;
    for (const segment of path) {
        if (
            current &&
            typeof current === "object" &&
            segment in (current as Record<string, unknown>)
        ) {
            current = (current as Record<string, unknown>)[segment];
        } else {
            return undefined;
        }
    }
    return typeof current === "string" ? current : undefined;
}
