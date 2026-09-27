"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { translateListingCopy } from "@/lib/messages/listing-copy";

export function useListingCopy() {
    const { language } = useLanguage();
    return {
        language,
        locale: language === "en" ? "en-NL" : "nl-NL",
        t: (text: string) => translateListingCopy(language, text),
    };
}
