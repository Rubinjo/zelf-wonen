"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowLeft,
    ArrowRight,
    CornerDownLeft,
    MessageSquare,
    Send,
    ShieldCheck,
} from "lucide-react";

type ThreadAuthor = { id: string; name: string };
type ThreadMessage = {
    id: string;
    authorUserId: string;
    author: ThreadAuthor;
    body: string;
    createdAt: string;
    readAt: string | null;
    transferredToTransactionId: string | null;
    transferredAt: string | null;
};
type ListingThreadData = {
    listingId: string;
    currentUserId: string;
    isOwner: boolean;
    canMessage: boolean;
    listing: {
        id: string;
        ownerId: string;
        purpose: string;
        status: string;
        titleNl: string | null;
        street: string;
        houseNumber: number;
        houseNumberAddition: string | null;
        postcode: string;
        city: string;
    };
    messages: ThreadMessage[];
    unreadIncoming: number;
    transaction: { id: string; status: string } | null;
};

const copy = {
    nl: {
        title: "Vragen aan de verkoper",
        intro: "Stel je vragen direct aan de verkoper. De verkoper reageert in deze berichtenlijn.",
        empty: "Nog geen berichten. Stel je eerste vraag aan de verkoper.",
        placeholder: "Typ je bericht…",
        send: "Versturen",
        back: "Terug",
        you: "Jij",
        transferred: "Verplaatst naar transactie",
        transferredBanner:
            "Deze berichten zijn overgezet naar de transactiechat.",
        openTransaction: "Open de transactiechat",
        closedNotice:
            "Voor deze woning kunnen geen berichten meer worden verstuurd.",
        errorSend: "Het bericht kon niet worden verstuurd.",
    },
    en: {
        title: "Questions for the seller",
        intro: "Ask your questions directly to the seller. The seller replies in this thread.",
        empty: "No messages yet. Ask the seller your first question.",
        placeholder: "Type your message…",
        send: "Send",
        back: "Back",
        you: "You",
        transferred: "Moved to transaction",
        transferredBanner:
            "These messages have been moved to the transaction chat.",
        openTransaction: "Open the transaction chat",
        closedNotice: "Messaging is no longer available for this property.",
        errorSend: "The message could not be sent.",
    },
} as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error?.message ?? "De actie is mislukt");
    return payload.data as T;
}

export function ListingMessageThread({
    listingId,
    language = "nl",
    onBack,
    onThreadChange,
    className = "",
}: {
    listingId: string;
    language?: "nl" | "en";
    onBack?: () => void;
    onThreadChange?: (unread: number) => void;
    className?: string;
}) {
    const t = copy[language];
    const queryClient = useQueryClient();
    const [body, setBody] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const thread = useQuery({
        queryKey: ["listing-thread", listingId],
        queryFn: () =>
            api<ListingThreadData>(`/api/listings/${listingId}/messages`),
        enabled: Boolean(listingId),
    });

    const unreadIncoming = thread.data?.unreadIncoming ?? 0;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "nearest" });
    }, [thread.data?.messages.length]);

    useEffect(() => {
        if (unreadIncoming <= 0) return;
        fetch(`/api/listings/${listingId}/messages/read`, {
            method: "POST",
        }).then(() => {
            queryClient.invalidateQueries({
                queryKey: ["listing-thread", listingId],
            });
            queryClient.invalidateQueries({
                queryKey: ["seeker-dashboard"],
            });
            onThreadChange?.(0);
        });
    }, [unreadIncoming, listingId, queryClient, onThreadChange]);

    const send = useMutation({
        mutationFn: () =>
            api(`/api/listings/${listingId}/messages`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ body }),
            }),
        onSuccess: () => {
            setBody("");
            queryClient.invalidateQueries({
                queryKey: ["listing-thread", listingId],
            });
            queryClient.invalidateQueries({
                queryKey: ["seeker-dashboard"],
            });
            onThreadChange?.(0);
        },
    });

    const data = thread.data;
    const transferredCount =
        data?.messages.filter((message) => message.transferredAt).length ?? 0;

    return (
        <div
            className={`rounded-2xl border border-line bg-surface ${className}`}
        >
            <div className="flex items-center justify-between gap-3 border-b border-line p-5">
                <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand-dark">
                        <MessageSquare size={18} />
                    </span>
                    <div>
                        <h2 className="font-semibold">{t.title}</h2>
                        <p className="mt-0.5 text-xs text-muted">
                            {data
                                ? `${data.listing.street} ${data.listing.houseNumber}${data.listing.houseNumberAddition ? ` ${data.listing.houseNumberAddition}` : ""} · ${data.listing.city}`
                                : "…"}
                        </p>
                    </div>
                </div>
                {onBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
                    >
                        <ArrowLeft size={14} /> {t.back}
                    </button>
                ) : null}
            </div>

            {data?.transaction &&
            data.transaction.status !== "CANCELLED" &&
            transferredCount > 0 ? (
                <div className="mx-5 mt-4 flex flex-wrap items-center gap-2 border border-brand/15 bg-accent px-4 py-3 text-xs text-brand-dark">
                    <ShieldCheck size={15} className="shrink-0" />
                    <span>{t.transferredBanner}</span>
                    <Link
                        href={`/dashboard/transactions/${data.transaction.id}`}
                        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                    >
                        {t.openTransaction} <ArrowRight size={13} />
                    </Link>
                </div>
            ) : null}

            <div className="max-h-90 min-h-40 space-y-3 overflow-y-auto bg-background p-4">
                {thread.isPending ? (
                    <p className="py-6 text-center text-sm text-muted">
                        Berichten laden…
                    </p>
                ) : !data || data.messages.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted">
                        {t.empty}
                    </p>
                ) : (
                    data.messages.map((message) => {
                        const own = message.authorUserId === data.currentUserId;
                        return (
                            <div
                                key={message.id}
                                className={`flex ${own ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[85%] p-3 text-sm sm:max-w-[75%] ${own ? "bg-brand text-white" : "border border-line bg-white"}`}
                                >
                                    <p
                                        className={`mb-1 text-[11px] font-semibold ${own ? "text-white/70" : "text-muted"}`}
                                    >
                                        {own ? t.you : message.author.name}
                                    </p>
                                    <p className="whitespace-pre-wrap leading-6">
                                        {message.body}
                                    </p>
                                    <p
                                        className={`mt-2 flex flex-wrap items-center gap-x-2 text-right text-[10px] ${own ? "text-white/60" : "text-muted"}`}
                                    >
                                        {new Date(
                                            message.createdAt,
                                        ).toLocaleString(
                                            language === "nl"
                                                ? "nl-NL"
                                                : "en-NL",
                                            {
                                                day: "2-digit",
                                                month: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            },
                                        )}
                                        {message.transferredAt ? (
                                            <span className="inline-flex items-center gap-1 font-semibold">
                                                <ShieldCheck size={11} />
                                                {t.transferred}
                                            </span>
                                        ) : null}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            <div className="border-t border-line p-4">
                {data && !data.canMessage ? (
                    <p className="px-1 text-sm text-muted">{t.closedNotice}</p>
                ) : (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!body.trim() || send.isPending) return;
                            send.mutate();
                        }}
                        className="flex items-end gap-2"
                    >
                        <textarea
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    if (body.trim() && !send.isPending) {
                                        send.mutate();
                                    }
                                }
                            }}
                            placeholder={t.placeholder}
                            rows={2}
                            maxLength={4000}
                            className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
                        />
                        <button
                            type="submit"
                            disabled={!body.trim() || send.isPending}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-40"
                        >
                            {send.isPending ? (
                                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            ) : (
                                <Send size={16} />
                            )}
                            <span className="hidden sm:inline">{t.send}</span>
                        </button>
                    </form>
                )}
                {send.isError ? (
                    <p className="mt-2 px-1 text-xs text-red-600">
                        {t.errorSend}
                    </p>
                ) : null}
                {body.trim() ? (
                    <p className="mt-2 flex items-center gap-1 px-1 text-[11px] text-muted">
                        <CornerDownLeft size={11} /> Enter om te versturen
                    </p>
                ) : null}
            </div>
        </div>
    );
}
