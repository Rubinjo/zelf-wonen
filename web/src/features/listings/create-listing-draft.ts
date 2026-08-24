import type { PropertyData } from "@/lib/schemas/property";

export const NEW_LISTING_DRAFT_KEY = "zelfwonen:new-listing-draft";

export type NewListingDraft = {
    address: {
        postcode: string;
        houseNumber: string;
        addition: string;
        street: string;
        city: string;
    };
    property: PropertyData | null;
};

export function readNewListingDraft(): NewListingDraft | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(NEW_LISTING_DRAFT_KEY);
        return raw ? (JSON.parse(raw) as NewListingDraft) : null;
    } catch {
        return null;
    }
}

export function storeNewListingDraft(draft: NewListingDraft) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(NEW_LISTING_DRAFT_KEY, JSON.stringify(draft));
}

export function clearNewListingDraft() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(NEW_LISTING_DRAFT_KEY);
}
