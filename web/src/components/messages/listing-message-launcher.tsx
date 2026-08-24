"use client";

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { ListingMessageThread } from "./listing-message-thread";

const copy = {
    nl: {
        button: "Stuur een bericht aan de verkoper",
        close: "Sluiten",
    },
    en: {
        button: "Send a message to the seller",
        close: "Close",
    },
} as const;

export function ListingMessageLauncher({
    listingId,
    language = "nl",
}: {
    listingId: string;
    language?: "nl" | "en";
}) {
    const t = copy[language];
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mb-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 font-semibold text-white transition hover:bg-brand-dark"
            >
                <MessageSquare size={17} /> {t.button}
            </button>
            {open ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-50 grid place-items-center bg-brand-dark/55 p-4 backdrop-blur-sm"
                >
                    <div className="relative w-full max-w-2xl">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label={t.close}
                            className="absolute -top-3 right-0 z-10 grid size-10 place-items-center rounded-full border border-line bg-surface text-muted shadow-lg transition hover:text-brand"
                        >
                            <X size={18} />
                        </button>
                        <ListingMessageThread
                            listingId={listingId}
                            language={language}
                        />
                    </div>
                </div>
            ) : null}
        </>
    );
}
