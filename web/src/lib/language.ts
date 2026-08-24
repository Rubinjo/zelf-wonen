import { cookies } from "next/headers";

export type Language = "nl" | "en";

const COOKIE_KEY = "zelfwonen:lang";

/** Read the persisted language preference (server components). Defaults to Dutch. */
export async function getLanguage(): Promise<Language> {
    const store = await cookies();
    const value = store.get(COOKIE_KEY)?.value;
    return value === "en" ? "en" : "nl";
}
