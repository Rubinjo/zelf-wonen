"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowRight,
    CornerDownLeft,
    MessageSquare,
    Send,
    ShieldCheck,
    Users,
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
type OwnerConversation = {
    seekerUserId: string;
    seekerName: string;
    messages: ThreadMessage[];
    unreadIncoming: number;
    lastMessageAt: string | null;
};
type OwnerMessagesView = {
    isOwner: true;
    listingId: string;
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
    conversations: OwnerConversation[];
    transaction: { id: string; status: string } | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error?.message ?? "De actie is mislukt");
    return payload.data as T;
}

export function OwnerListingMessages({
    listingId,
    onUnreadChange,
}: {
    listingId: string;
    onUnreadChange?: (unread: number) => void;
}) {
    const queryClient = useQueryClient();
    const [selectedSeekerId, setSelectedSeekerId] = useState<string | null>(
        null,
    );
    const [body, setBody] = useState("");
    const view = useQuery({
        queryKey: ["owner-listing-messages", listingId],
        queryFn: () =>
            api<OwnerMessagesView>(`/api/listings/${listingId}/messages`),
        enabled: Boolean(listingId),
    });
    const data = view.data;
    const totalUnread =
        data?.conversations.reduce(
            (total, conversation) => total + conversation.unreadIncoming,
            0,
        ) ?? 0;

    useEffect(() => {
        if (totalUnread <= 0) return;
        fetch(`/api/listings/${listingId}/messages/read`, {
            method: "POST",
        }).then(() => {
            queryClient.invalidateQueries({
                queryKey: ["owner-listing-messages", listingId],
            });
            onUnreadChange?.(0);
        });
    }, [totalUnread, listingId, queryClient, onUnreadChange]);

    const conversations = data?.conversations ?? [];
    const selected =
        conversations.find(
            (conversation) => conversation.seekerUserId === selectedSeekerId,
        ) ??
        conversations[0] ??
        null;

    const send = useMutation({
        mutationFn: () =>
            api(`/api/listings/${listingId}/messages`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    body,
                    seekerUserId: selected?.seekerUserId,
                }),
            }),
        onSuccess: () => {
            setBody("");
            queryClient.invalidateQueries({
                queryKey: ["owner-listing-messages", listingId],
            });
        },
    });

    const transferredCount =
        selected?.messages.filter((message) => message.transferredAt).length ??
        0;

    return (
        <div className="rounded-2xl border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand-dark">
                    <MessageSquare size={18} />
                </span>
                <div>
                    <h2 className="font-semibold">Berichten op deze woning</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        {data
                            ? `${data.listing.street} ${data.listing.houseNumber}${data.listing.houseNumberAddition ? ` ${data.listing.houseNumberAddition}` : ""} · ${data.listing.city}`
                            : "…"}
                    </p>
                </div>
            </div>

            {data?.transaction && transferredCount > 0 ? (
                <div className="mx-5 mt-4 flex flex-wrap items-center gap-2 border border-brand/15 bg-accent px-4 py-3 text-xs text-brand-dark">
                    <ShieldCheck size={15} className="shrink-0" />
                    <span>
                        De berichten van vóór de koop zijn overgezet naar de
                        transactiechat.
                    </span>
                    <Link
                        href={`/dashboard/transactions/${data.transaction.id}`}
                        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                    >
                        Open de transactiechat <ArrowRight size={13} />
                    </Link>
                </div>
            ) : null}

            {view.isPending ? (
                <p className="p-8 text-center text-sm text-muted">
                    Berichten laden…
                </p>
            ) : conversations.length === 0 ? (
                <p className="grid min-h-40 place-items-center p-6 text-center text-sm text-muted">
                    <span className="flex flex-col items-center gap-3">
                        <Users size={24} className="text-brand/40" />
                        Nog geen gesprekken. Woningzoekers kunnen je hier
                        berichten sturen.
                    </span>
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2 border-b border-line p-4">
                        {conversations.map((conversation) => (
                            <button
                                key={conversation.seekerUserId}
                                type="button"
                                onClick={() =>
                                    setSelectedSeekerId(
                                        conversation.seekerUserId,
                                    )
                                }
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    selected?.seekerUserId ===
                                    conversation.seekerUserId
                                        ? "border-brand bg-brand text-white"
                                        : "border-line bg-background hover:border-brand/40"
                                }`}
                            >
                                {conversation.seekerName}
                                {conversation.unreadIncoming > 0 ? (
                                    <span
                                        className={`grid size-4 place-items-center rounded-full text-[9px] ${
                                            selected?.seekerUserId ===
                                            conversation.seekerUserId
                                                ? "bg-surface text-brand"
                                                : "bg-brand text-white"
                                        }`}
                                    >
                                        {conversation.unreadIncoming}
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </div>

                    {selected ? (
                        <>
                            <div className="max-h-80 min-h-40 space-y-3 overflow-y-auto bg-background p-4">
                                {selected.messages.map((message) => {
                                    const own =
                                        message.authorUserId ===
                                        data!.listing.ownerId;
                                    return (
                                        <div
                                            key={message.id}
                                            className={`flex ${own ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[85%] p-3 text-sm sm:max-w-[75%] ${own ? "bg-brand text-white" : "border border-line bg-surface"}`}
                                            >
                                                <p
                                                    className={`mb-1 text-[11px] font-semibold ${own ? "text-white/70" : "text-muted"}`}
                                                >
                                                    {own
                                                        ? "Jij"
                                                        : message.author.name}
                                                </p>
                                                <p className="whitespace-pre-wrap leading-6">
                                                    {message.body}
                                                </p>
                                                <p
                                                    className={`mt-2 flex flex-wrap items-center gap-x-2 text-right text-[10px] ${own ? "text-white/60" : "text-muted"}`}
                                                >
                                                    {new Date(
                                                        message.createdAt,
                                                    ).toLocaleString("nl-NL", {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                    {message.transferredAt ? (
                                                        <span className="inline-flex items-center gap-1 font-semibold">
                                                            <ShieldCheck
                                                                size={11}
                                                            />
                                                            Verplaatst naar
                                                            transactie
                                                        </span>
                                                    ) : null}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="border-t border-line p-4">
                                {data && data.listing.status !== "LIVE" ? (
                                    <p className="px-1 text-sm text-muted">
                                        Voor deze woning kunnen geen berichten
                                        meer worden verstuurd.
                                    </p>
                                ) : (
                                    <form
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            if (
                                                !body.trim() ||
                                                send.isPending
                                            ) {
                                                return;
                                            }
                                            send.mutate();
                                        }}
                                        className="flex items-end gap-2"
                                    >
                                        <textarea
                                            value={body}
                                            onChange={(event) =>
                                                setBody(event.target.value)
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === "Enter" &&
                                                    !event.shiftKey
                                                ) {
                                                    event.preventDefault();
                                                    if (
                                                        body.trim() &&
                                                        !send.isPending
                                                    ) {
                                                        send.mutate();
                                                    }
                                                }
                                            }}
                                            placeholder={`Antwoord aan ${selected.seekerName}…`}
                                            rows={2}
                                            maxLength={4000}
                                            className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
                                        />
                                        <button
                                            type="submit"
                                            disabled={
                                                !body.trim() || send.isPending
                                            }
                                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-40"
                                        >
                                            {send.isPending ? (
                                                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                            ) : (
                                                <Send size={16} />
                                            )}
                                            <span className="hidden sm:inline">
                                                Versturen
                                            </span>
                                        </button>
                                    </form>
                                )}
                                {send.isError ? (
                                    <p className="mt-2 px-1 text-xs text-red-600">
                                        Het bericht kon niet worden verstuurd.
                                    </p>
                                ) : null}
                                {body.trim() ? (
                                    <p className="mt-2 flex items-center gap-1 px-1 text-[11px] text-muted">
                                        <CornerDownLeft size={11} /> Enter om te
                                        versturen
                                    </p>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}
