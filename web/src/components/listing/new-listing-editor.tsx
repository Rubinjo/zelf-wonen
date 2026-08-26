"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ListingEditor } from "@/components/listing/listing-editor";
import {
    NEW_LISTING_DRAFT_KEY,
    type NewListingDraft,
} from "@/features/listings/create-listing-draft";

/**
 * Het concept staat in sessionStorage en is dus alleen aan de client bekend.
 * Lees je het tijdens de eerste render, dan wijkt de client-render af van de
 * server-HTML (server krijgt altijd null) en herstelt React de hele pagina
 * aan de clientzijde — met een hydration-error én een dev-waarschuwing over
 * het inline theme-script in de layout tot gevolg. Daarom lezen we de draft
 * via useSyncExternalStore: server en eerste client-render krijgen een neutrale
 * snapshot, daarna schakelt de component naar de echte draft.
 *
 * De client-snapshot moet gecached zijn (getSnapshot mag nooit een nieuw
 * object teruggeven), anders loopt React in een oneindige re-render.
 */
let cachedDraft: NewListingDraft | null | undefined;
let cacheValid = false;

function readDraftSnapshot(): NewListingDraft | null | undefined {
    if (!cacheValid) {
        try {
            const raw = window.sessionStorage.getItem(NEW_LISTING_DRAFT_KEY);
            cachedDraft = raw ? (JSON.parse(raw) as NewListingDraft) : null;
        } catch {
            cachedDraft = null;
        }
        cacheValid = true;
    }
    return cachedDraft;
}

function subscribeToDraft(onChange: () => void) {
    // sessionStorage verandert niet cross-tab, dus polling is overbodig;
    // invalideer de cache wanneer storage-events of navigaties plaatsvinden.
    const invalidate = () => {
        cacheValid = false;
        onChange();
    };
    window.addEventListener("storage", invalidate);
    window.addEventListener("popstate", invalidate);
    return () => {
        window.removeEventListener("storage", invalidate);
        window.removeEventListener("popstate", invalidate);
    };
}

export function NewListingEditor() {
    // undefined = nog niet gemount, null = geen draft, anders de draft.
    const draft = useSyncExternalStore(
        subscribeToDraft,
        readDraftSnapshot,
        // Server-side (en hydratie-)snapshot: nog niet bekend.
        () => undefined,
    );

    if (draft === undefined) {
        return (
            <div className="mx-auto max-w-4xl animate-pulse rounded-4xl border border-line bg-surface p-6 shadow-sm sm:p-9">
                <div className="h-7 w-56 rounded-lg bg-background" />
                <div className="mt-6 h-40 rounded-2xl bg-background" />
            </div>
        );
    }

    if (!draft) {
        return (
            <div className="mx-auto max-w-4xl rounded-4xl border border-line bg-surface p-6 shadow-sm sm:p-9">
                <h1 className="text-2xl font-semibold">Geen adres gevonden</h1>
                <p className="mt-2 text-sm leading-6 text-muted">
                    Start eerst met het invoeren van je postcode en huisnummer.
                </p>
                <Link
                    href="/dashboard/listings/new"
                    className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white"
                >
                    Adres invoeren
                </Link>
            </div>
        );
    }

    return <ListingEditor initialListing={null} draft={draft} />;
}
