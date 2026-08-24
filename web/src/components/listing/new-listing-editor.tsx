"use client";

import { useState } from "react";
import Link from "next/link";
import { ListingEditor } from "@/components/listing/listing-editor";
import {
    readNewListingDraft,
    type NewListingDraft,
} from "@/features/listings/create-listing-draft";

export function NewListingEditor() {
    const [draft] = useState<NewListingDraft | null>(() =>
        readNewListingDraft(),
    );

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
