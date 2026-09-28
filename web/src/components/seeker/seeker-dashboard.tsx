"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Bell,
    BellRing,
    Calculator,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronRight,
    Clock3,
    Copy,
    Euro,
    ExternalLink,
    FileText,
    Heart,
    House,
    MessageSquare,
    Search,
    Settings2,
    Share2,
    ShieldCheck,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { ListingMessageThread } from "@/components/messages/listing-message-thread";
import { useLanguage } from "@/components/providers/language-provider";

type Listing = {
    id: string;
    slug: string | null;
    purpose: string;
    status: string;
    title: string | null;
    priceCents: string | null;
    street: string;
    houseNumber: number;
    houseNumberAddition: string | null;
    postcode: string;
    city: string;
    livingAreaSqm: string | null;
    roomCount: number | null;
    energyLabel: string | null;
    imageUrl: string | null;
};
type Favorite = {
    id: string;
    note: string | null;
    createdAt: string;
    listing: Listing;
};
type SearchItem = {
    id: string;
    name: string;
    queryString: string;
    notificationsEnabled: boolean;
    updatedAt: string;
};
type Notification = {
    id: string;
    type: string;
    title: string;
    body: string;
    href: string | null;
    readAt: string | null;
    createdAt: string;
};
type Preferences = {
    newListing: boolean;
    priceChange: boolean;
    statusChange: boolean;
    viewing: boolean;
    bid: boolean;
    transaction: boolean;
    deadline: boolean;
    inAppEnabled: boolean;
};
type Viewing = {
    id: string;
    attendanceStatus: string;
    slot: { startsAt: string; endsAt: string; type: string };
    listing: Listing;
};
type Bid = {
    id: string;
    amountCents: string;
    submittedAt: string;
    financingDeadline: string | null;
    events: Array<{ type: string; occurredAt: string }>;
    transaction: { id: string; status: string } | null;
    listing: Listing;
};
type Transaction = {
    id: string;
    status: string;
    updatedAt: string;
    milestones: Array<{
        id: string;
        title: string;
        status: string;
        dueAt: string | null;
    }>;
    listing: Listing;
};
type Share = {
    id: string;
    label: string | null;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
    _count: { items: number };
};
type MessageThread = {
    listingId: string;
    listing: Listing;
    lastMessageAt: string;
    messageCount: number;
    unreadIncoming: number;
    hasTransferred: boolean;
    transaction: { id: string; status: string } | null;
};
type DashboardData = {
    favorites: Favorite[];
    searches: SearchItem[];
    notifications: Notification[];
    preferences: Preferences;
    viewings: Viewing[];
    bids: Bid[];
    transactions: Transaction[];
    shares: Share[];
    messageThreads: MessageThread[];
};
type Tab =
    | "overview"
    | "favorites"
    | "searches"
    | "viewings"
    | "bids"
    | "messages"
    | "transactions"
    | "notifications";

const tabs: Array<[Tab, string, typeof Heart]> = [
    ["overview", "Overzicht", House],
    ["favorites", "Favorieten", Heart],
    ["searches", "Zoekopdrachten", Search],
    ["viewings", "Bezichtigingen", CalendarDays],
    ["bids", "Biedingen", Euro],
    ["messages", "Berichten", MessageSquare],
    ["transactions", "Transacties", FileText],
    ["notifications", "Meldingen", Bell],
];
const statusNames: Record<string, string> = {
    LIVE: "Beschikbaar",
    UNDER_OFFER: "Onder bod",
    SOLD: "Verkocht",
    RENTED: "Verhuurd",
    SCHEDULED: "Gepland",
    CONFIRMED: "Bezocht",
    NO_SHOW: "Niet verschenen",
    SUBMITTED: "Ingediend",
    ACCEPTED: "Geaccepteerd",
    REJECTED: "Afgewezen",
    WITHDRAWN: "Ingetrokken",
    ACTIVE: "Actief",
    CONTRACT_PENDING: "Contract voorbereiden",
    CONDITIONS_PENDING: "Voorwaarden afronden",
    READY_FOR_TRANSFER: "Klaar voor overdracht",
    COMPLETED: "Afgerond",
    CANCELLED: "Geannuleerd",
};

const englishTabLabels: Record<Tab, string> = {
    overview: "Overview",
    favorites: "Favorites",
    searches: "Saved searches",
    viewings: "Viewings",
    bids: "Bids",
    messages: "Messages",
    transactions: "Transactions",
    notifications: "Notifications",
};
const englishStatusNames: Record<string, string> = {
    LIVE: "Available",
    UNDER_OFFER: "Under offer",
    SOLD: "Sold",
    RENTED: "Rented",
    SCHEDULED: "Scheduled",
    CONFIRMED: "Attended",
    NO_SHOW: "Did not attend",
    SUBMITTED: "Submitted",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    WITHDRAWN: "Withdrawn",
    ACTIVE: "Active",
    CONTRACT_PENDING: "Preparing contract",
    CONDITIONS_PENDING: "Finalising conditions",
    READY_FOR_TRANSFER: "Ready for transfer",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error?.message ?? "De actie is mislukt");
    return payload.data as T;
}

export function SeekerDashboard({
    initialData,
}: {
    initialData: DashboardData;
}) {
    const { language } = useLanguage();
    const isEn = language === "en";
    const params = useSearchParams();
    const initialTab = params.get("tab") as Tab | null;
    const [tab, setTab] = useState<Tab>(
        tabs.some(([id]) => id === initialTab) ? initialTab! : "overview",
    );
    const queryClient = useQueryClient();
    const dashboard = useQuery({
        queryKey: ["seeker-dashboard"],
        queryFn: () => api<DashboardData>("/api/seeker/dashboard"),
        initialData,
        staleTime: 15_000,
    });
    useEffect(() => {
        const ids = JSON.parse(
            localStorage.getItem("zelfwonen:favorites") ?? "[]",
        ) as string[];
        if (
            !ids.length ||
            sessionStorage.getItem("zelfwonen:favorites-migrated")
        )
            return;
        fetch("/api/seeker/favorites", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ listingIds: ids }),
        }).then((response) => {
            if (response.ok) {
                sessionStorage.setItem("zelfwonen:favorites-migrated", "1");
                void queryClient.invalidateQueries({
                    queryKey: ["seeker-dashboard"],
                });
            }
        });
    }, [queryClient]);
    useEffect(() => {
        if (sessionStorage.getItem("zelfwonen:notifications-synced")) return;
        sessionStorage.setItem("zelfwonen:notifications-synced", "1");
        fetch("/api/seeker/notifications/sync", { method: "POST" }).then(
            (response) => {
                if (response.ok)
                    void queryClient.invalidateQueries({
                        queryKey: ["seeker-dashboard"],
                    });
            },
        );
    }, [queryClient]);
    const data = dashboard.data;
    const unread = data.notifications.filter((item) => !item.readAt).length;
    const messageUnread = data.messageThreads.reduce(
        (total, thread) => total + thread.unreadIncoming,
        0,
    );
    return (
        <div className="pb-20">
            <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                        {isEn ? "Personal home seeker dashboard" : "Persoonlijk zoekersdashboard"}
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                        {isEn ? "My search" : "Mijn zoektocht"}
                    </h1>
                    <p className="mt-3 text-muted">
                        {isEn ? "Your homes, appointments and actions in one place." : "Je woningen, afspraken en acties op één plek."}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href="/mortgage-calculator"
                        className="inline-flex h-12 items-center justify-center gap-2 border border-brand px-5 font-semibold text-brand transition hover:bg-brand hover:text-white"
                    >
                        <Calculator size={18} /> {isEn ? "Maximum mortgage" : "Maximale hypotheek"}
                    </Link>
                    <Link
                        href="/search"
                        className="inline-flex h-12 items-center justify-center gap-2 bg-brand px-6 font-semibold text-white"
                    >
                        <Search size={18} /> {isEn ? "Search homes" : "Zoek woningen"}
                    </Link>
                </div>
            </header>
            <nav
                className="mt-7 flex gap-1 overflow-x-auto border-b border-line"
                aria-label={isEn ? "Home seeker dashboard" : "Zoekersdashboard"}
            >
                <>
                    {tabs.map(([id, label, Icon]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`relative inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${tab === id ? "border-brand text-brand" : "border-transparent text-muted"}`}
                        >
                            <Icon size={16} /> {isEn ? englishTabLabels[id] : label}
                            {id === "notifications" && unread > 0 && (
                                <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">
                                    {unread}
                                </span>
                            )}
                            {id === "messages" && messageUnread > 0 && (
                                <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">
                                    {messageUnread}
                                </span>
                            )}
                        </button>
                    ))}
                </>
            </nav>
            <main className="mt-6">
                {tab === "overview" && (
                    <Overview data={data} selectTab={setTab} />
                )}
                {tab === "favorites" && (
                    <Favorites
                        data={data}
                        refresh={() =>
                            queryClient.invalidateQueries({
                                queryKey: ["seeker-dashboard"],
                            })
                        }
                    />
                )}
                {tab === "searches" && (
                    <Searches
                        data={data}
                        refresh={() =>
                            queryClient.invalidateQueries({
                                queryKey: ["seeker-dashboard"],
                            })
                        }
                    />
                )}
                {tab === "viewings" && <Viewings items={data.viewings} />}
                {tab === "bids" && <Bids items={data.bids} />}
                {tab === "messages" && (
                    <Messages
                        data={data}
                        refresh={() =>
                            queryClient.invalidateQueries({
                                queryKey: ["seeker-dashboard"],
                            })
                        }
                    />
                )}
                {tab === "transactions" && (
                    <Transactions items={data.transactions} />
                )}
                {tab === "notifications" && (
                    <Notifications
                        data={data}
                        refresh={() =>
                            queryClient.invalidateQueries({
                                queryKey: ["seeker-dashboard"],
                            })
                        }
                    />
                )}
            </main>
        </div>
    );
}

function Overview({
    data,
    selectTab,
}: {
    data: DashboardData;
    selectTab: (tab: Tab) => void;
}) {
    const { language } = useLanguage();
    const isEn = language === "en";
    const locale = isEn ? "en-NL" : "nl-NL";
    const nextViewing = data.viewings
        .filter((item) => new Date(item.slot.startsAt) > new Date())
        .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt))[0];
    const activeTransaction = data.transactions.find(
        (item) => !["COMPLETED", "CANCELLED"].includes(item.status),
    );
    const deadlines = data.transactions
        .flatMap((item) =>
            item.milestones
                .filter(
                    (milestone) =>
                        milestone.dueAt &&
                        !["COMPLETED", "WAIVED"].includes(milestone.status),
                )
                .map((milestone) => ({
                    ...milestone,
                    transactionId: item.id,
                    listing: item.listing,
                })),
        )
        .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
    return (
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <section className="border border-line bg-surface p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                            {isEn ? "Next actions" : "Volgende acties"}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold">
                            {isEn ? "What needs your attention?" : "Wat vraagt je aandacht?"}
                        </h2>
                    </div>
                    <BellRing className="text-brand" size={26} />
                </div>
                <div className="mt-5 grid gap-3">
                    {nextViewing && (
                        <Action
                            icon={CalendarDays}
                            title={isEn ? "Upcoming viewing" : "Aankomende bezichtiging"}
                            text={`${nextViewing.listing.street} ${nextViewing.listing.houseNumber} · ${new Date(nextViewing.slot.startsAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}`}
                            onClick={() => selectTab("viewings")}
                        />
                    )}
                    {activeTransaction && (
                        <Action
                            icon={FileText}
                            title={isEn ? "Active transaction" : "Actieve transactie"}
                            text={`${activeTransaction.listing.street} ${activeTransaction.listing.houseNumber} · ${(isEn ? englishStatusNames : statusNames)[activeTransaction.status]}`}
                            href={`/dashboard/transactions/${activeTransaction.id}`}
                        />
                    )}
                    {deadlines[0] && (
                        <Action
                            icon={Clock3}
                            title={isEn ? "Next deadline" : "Eerstvolgende deadline"}
                            text={`${deadlines[0].title} · ${new Date(deadlines[0].dueAt!).toLocaleDateString(locale)}`}
                            href={`/dashboard/transactions/${deadlines[0].transactionId}`}
                        />
                    )}
                    {!nextViewing &&
                        !activeTransaction &&
                        !deadlines.length && (
                            <div className="bg-background p-5 text-sm text-muted">
                                {isEn ? "There are no urgent actions." : "Er staan geen urgente acties open."}
                            </div>
                        )}
                </div>
            </section>
            <section className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line">
                <Metric
                    value={data.favorites.length}
                    label={isEn ? "Favorites" : "Favorieten"}
                    onClick={() => selectTab("favorites")}
                />
                <Metric
                    value={data.searches.length}
                    label={isEn ? "Saved searches" : "Zoekopdrachten"}
                    onClick={() => selectTab("searches")}
                />
                <Metric
                    value={data.viewings.length}
                    label={isEn ? "Viewings" : "Bezichtigingen"}
                    onClick={() => selectTab("viewings")}
                />
                <Metric
                    value={data.bids.length}
                    label={isEn ? "Bids" : "Biedingen"}
                    onClick={() => selectTab("bids")}
                />
            </section>
            <section className="border border-line bg-surface p-6 lg:col-span-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">{isEn ? "Recently saved" : "Recent bewaard"}</h2>
                    <button
                        onClick={() => selectTab("favorites")}
                        className="text-sm font-semibold text-brand"
                    >
                        {isEn ? "All favorites" : "Alle favorieten"}
                    </button>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.favorites.slice(0, 3).map((favorite) => (
                        <ListingCard
                            key={favorite.id}
                            listing={favorite.listing}
                            note={favorite.note}
                        />
                    ))}
                    {!data.favorites.length && (
                        <Empty
                            icon={Heart}
                            title={isEn ? "No favorites yet" : "Nog geen favorieten"}
                            text={isEn ? "Save homes from the search results to find them here." : "Bewaar woningen vanuit de zoekresultaten om ze hier terug te vinden."}
                            href="/search"
                        />
                    )}
                </div>
            </section>
        </div>
    );
}
function Metric({
    value,
    label,
    onClick,
}: {
    value: number;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="bg-surface p-6 text-left hover:bg-background"
        >
            <span className="text-3xl font-semibold text-brand">{value}</span>
            <span className="mt-1 block text-sm text-muted">{label}</span>
        </button>
    );
}
function Action({
    icon: Icon,
    title,
    text,
    href,
    onClick,
}: {
    icon: typeof Heart;
    title: string;
    text: string;
    href?: string;
    onClick?: () => void;
}) {
    const content = (
        <>
            <span className="grid size-10 shrink-0 place-items-center bg-background text-brand">
                <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
                <strong className="block text-sm">{title}</strong>
                <span className="mt-1 block truncate text-xs text-muted">
                    {text}
                </span>
            </span>
            <ChevronRight className="text-muted" size={17} />
        </>
    );
    return href ? (
        <Link
            href={href}
            className="flex items-center gap-3 border border-line p-3 hover:border-brand/40"
        >
            {content}
        </Link>
    ) : (
        <button
            onClick={onClick}
            className="flex items-center gap-3 border border-line p-3 text-left hover:border-brand/40"
        >
            {content}
        </button>
    );
}

function Favorites({
    data,
    refresh,
}: {
    data: DashboardData;
    refresh: () => Promise<unknown>;
}) {
    const [selected, setSelected] = useState<string[]>([]);
    const [shareUrl, setShareUrl] = useState("");
    const [includeNotes, setIncludeNotes] = useState(false);
    const remove = useMutation({
        mutationFn: (id: string) =>
            api(`/api/seeker/favorites/${id}`, { method: "DELETE" }),
        onSuccess: refresh,
    });
    const share = useMutation({
        mutationFn: () =>
            api<{ token: string }>("/api/seeker/shortlists", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    listingIds: selected,
                    expiresInDays: 30,
                    label: "Gedeelde shortlist",
                    includeNotes,
                }),
            }),
        onSuccess: (result) =>
            setShareUrl(`${window.location.origin}/shortlist/${result.token}`),
    });
    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold">Favorieten</h2>
                    <p className="mt-1 text-sm text-muted">
                        Voeg privénotities toe of deel een selectie met iemand
                        die met je meekijkt.
                    </p>
                </div>
                {selected.length > 0 && (
                    <button
                        onClick={() => share.mutate()}
                        disabled={share.isPending}
                        className="inline-flex h-11 items-center gap-2 bg-brand px-5 text-sm font-semibold text-white"
                    >
                        <Share2 size={16} /> Deel {selected.length} woningen
                    </button>
                )}
            </div>
            {shareUrl && (
                <div className="mt-5 flex flex-col gap-2 border border-brand/25 bg-surface p-4 sm:flex-row sm:items-center">
                    <CheckCircle2 className="text-brand" size={19} />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                            Shortlist-link is 30 dagen geldig
                        </p>
                        <p className="truncate text-xs text-muted">
                            {shareUrl}
                        </p>
                    </div>
                    <button
                        onClick={() => navigator.clipboard.writeText(shareUrl)}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-line px-4 text-sm font-semibold text-brand"
                    >
                        <Copy size={15} /> Kopieer
                    </button>
                    <button
                        onClick={() => setShareUrl("")}
                        aria-label="Melding sluiten"
                    >
                        <X size={17} />
                    </button>
                </div>
            )}
            {selected.length > 0 && (
                <label className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
                    <input
                        type="checkbox"
                        checked={includeNotes}
                        onChange={(event) =>
                            setIncludeNotes(event.target.checked)
                        }
                        className="size-4 accent-brand"
                    />{" "}
                    Deel ook mijn privénotities met iedereen die de link heeft
                </label>
            )}
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {data.favorites.map((favorite) => (
                    <FavoriteCard
                        key={favorite.id}
                        favorite={favorite}
                        checked={selected.includes(favorite.listing.id)}
                        onCheck={() =>
                            setSelected((current) =>
                                current.includes(favorite.listing.id)
                                    ? current.filter(
                                          (id) => id !== favorite.listing.id,
                                      )
                                    : [...current, favorite.listing.id],
                            )
                        }
                        onRemove={() => remove.mutate(favorite.listing.id)}
                        refresh={refresh}
                    />
                ))}
                {!data.favorites.length && (
                    <Empty
                        icon={Heart}
                        title="Bewaar je eerste woning"
                        text="Tik in de zoekresultaten op het hart. Je favorieten synchroniseren daarna automatisch tussen apparaten."
                        href="/search"
                    />
                )}
            </div>
            {data.shares.length > 0 && (
                <Shares shares={data.shares} refresh={refresh} />
            )}
        </div>
    );
}
function FavoriteCard({
    favorite,
    checked,
    onCheck,
    onRemove,
    refresh,
}: {
    favorite: Favorite;
    checked: boolean;
    onCheck: () => void;
    onRemove: () => void;
    refresh: () => Promise<unknown>;
}) {
    const [note, setNote] = useState(favorite.note ?? "");
    const save = useMutation({
        mutationFn: () =>
            api(`/api/seeker/favorites/${favorite.listing.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ note }),
            }),
        onSuccess: refresh,
    });
    const listingLink = favorite.listing.slug ? (
        <Link
            href={`/property/${favorite.listing.slug}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
        >
            Bekijk woning <ChevronRight size={15} />
        </Link>
    ) : (
        <span className="text-sm text-muted">Woning niet meer beschikbaar</span>
    );
    return (
        <article
            className={`overflow-hidden border bg-surface ${checked ? "border-brand ring-2 ring-brand/10" : "border-line"}`}
        >
            <div className="relative aspect-video bg-background">
                <button
                    onClick={onCheck}
                    aria-label="Selecteer voor shortlist"
                    className={`absolute left-3 top-3 z-10 grid size-9 place-items-center border shadow-sm ${checked ? "border-brand bg-brand text-white" : "border-line bg-surface text-brand"}`}
                >
                    {checked ? <Check size={17} /> : <Share2 size={16} />}
                </button>
                {favorite.listing.imageUrl ? (
                    <Image
                        src={favorite.listing.imageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 100vw, 420px"
                        className="object-cover"
                    />
                ) : (
                    <div className="dot-grid grid size-full place-items-center text-brand/30">
                        <House size={42} />
                    </div>
                )}
            </div>
            <div className="p-5">
                <ListingHeading listing={favorite.listing} />
                <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    onBlur={() => {
                        if (note !== (favorite.note ?? "")) save.mutate();
                    }}
                    rows={2}
                    maxLength={1000}
                    placeholder="Privénotitie, bijvoorbeeld vragen voor de bezichtiging"
                    className="mt-4 w-full resize-none border border-line bg-background p-3 text-sm outline-none focus:border-brand"
                />
                <div className="mt-4 flex items-center justify-between">
                    {listingLink}
                    <button
                        onClick={onRemove}
                        className="grid size-9 place-items-center text-muted hover:text-red-700"
                        aria-label="Verwijder favoriet"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
                {save.isPending && (
                    <p className="mt-2 text-xs text-muted">Notitie opslaan…</p>
                )}
            </div>
        </article>
    );
}
function Shares({
    shares,
    refresh,
}: {
    shares: Share[];
    refresh: () => Promise<unknown>;
}) {
    const revoke = useMutation({
        mutationFn: (id: string) =>
            api(`/api/seeker/shortlists/${id}`, { method: "DELETE" }),
        onSuccess: refresh,
    });
    return (
        <section className="mt-10 border-t border-line pt-7">
            <h3 className="text-lg font-semibold">Eerder gedeelde links</h3>
            <div className="mt-3 grid gap-2">
                {shares.map((share) => (
                    <div
                        key={share.id}
                        className="flex items-center gap-3 border border-line bg-surface p-3"
                    >
                        <Users className="text-brand" size={18} />
                        <div className="flex-1">
                            <p className="text-sm font-semibold">
                                {share.label ?? "Shortlist"} ·{" "}
                                {share._count.items} woningen
                            </p>
                            <p className="text-xs text-muted">
                                {share.revokedAt
                                    ? "Ingetrokken"
                                    : new Date(share.expiresAt) < new Date()
                                      ? "Verlopen"
                                      : `Geldig tot ${new Date(share.expiresAt).toLocaleDateString("nl-NL")}`}
                            </p>
                        </div>
                        {!share.revokedAt &&
                            new Date(share.expiresAt) > new Date() && (
                                <button
                                    onClick={() => revoke.mutate(share.id)}
                                    className="text-xs font-semibold text-red-700"
                                >
                                    Trek in
                                </button>
                            )}
                    </div>
                ))}
            </div>
        </section>
    );
}

function Searches({
    data,
    refresh,
}: {
    data: DashboardData;
    refresh: () => Promise<unknown>;
}) {
    const toggle = useMutation({
        mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
            api(`/api/seeker/saved-searches/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ notificationsEnabled: enabled }),
            }),
        onSuccess: refresh,
    });
    const remove = useMutation({
        mutationFn: (id: string) =>
            api(`/api/seeker/saved-searches/${id}`, { method: "DELETE" }),
        onSuccess: refresh,
    });
    return (
        <section>
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold">
                        Opgeslagen zoekopdrachten
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                        Krijg een melding wanneer nieuw aanbod bij je filters
                        past.
                    </p>
                </div>
                <Link
                    href="/search"
                    className="inline-flex h-11 items-center gap-2 border border-brand px-4 text-sm font-semibold text-brand"
                >
                    <Search size={16} /> Nieuwe zoekopdracht
                </Link>
            </div>
            <div className="mt-6 grid gap-3">
                {data.searches.map((search) => (
                    <div
                        key={search.id}
                        className="flex flex-col gap-4 border border-line bg-surface p-5 sm:flex-row sm:items-center"
                    >
                        <span className="grid size-11 shrink-0 place-items-center bg-background text-brand">
                            <Search size={19} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold">{search.name}</p>
                            <p className="mt-1 truncate text-xs text-muted">
                                {describeSearch(search.queryString)}
                            </p>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={search.notificationsEnabled}
                                onChange={(event) =>
                                    toggle.mutate({
                                        id: search.id,
                                        enabled: event.target.checked,
                                    })
                                }
                                className="size-4 accent-brand"
                            />{" "}
                            Meldingen
                        </label>
                        <Link
                            href={`/search?${search.queryString}`}
                            className="inline-flex h-10 items-center justify-center gap-1 border border-line px-3 text-sm font-semibold text-brand"
                        >
                            Open <ExternalLink size={14} />
                        </Link>
                        <button
                            onClick={() => remove.mutate(search.id)}
                            className="grid size-10 place-items-center text-muted hover:text-red-700"
                            aria-label="Zoekopdracht verwijderen"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
                {!data.searches.length && (
                    <Empty
                        icon={Search}
                        title="Nog geen zoekopdrachten"
                        text="Stel filters in bij Woning zoeken en kies ‘Bewaar deze zoekopdracht’."
                        href="/search"
                    />
                )}
            </div>
        </section>
    );
}
function describeSearch(query: string) {
    const params = new URLSearchParams(query);
    return [
        params.get("purpose") === "RENT" ? "Huur" : "Koop",
        params.get("q"),
        params.get("priceMax")
            ? `tot € ${Number(params.get("priceMax")).toLocaleString("nl-NL")}`
            : null,
        params.get("livingAreaMin")
            ? `vanaf ${params.get("livingAreaMin")} m²`
            : null,
        params.get("roomsMin") ? `${params.get("roomsMin")}+ kamers` : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

function Viewings({ items }: { items: Viewing[] }) {
    const { language } = useLanguage();
    const isEn = language === "en";
    const locale = isEn ? "en-NL" : "nl-NL";
    return (
        <ListSection
            title={isEn ? "Viewings" : "Bezichtigingen"}
            text={isEn ? "Your appointments and confirmed attendance." : "Je afspraken en bevestigde aanwezigheid."}
            empty={
                <Empty
                    icon={CalendarDays}
                    title={isEn ? "No viewings" : "Geen bezichtigingen"}
                    text={isEn ? "Open a home and choose an available time slot." : "Open een woning en kies een beschikbaar tijdslot."}
                    href="/search"
                />
            }
        >
            {items.map((item) => (
                <div
                    key={item.id}
                    className="flex flex-col gap-4 border border-line bg-surface p-5 sm:flex-row sm:items-center"
                >
                    <DateTile date={item.slot.startsAt} />
                    <div className="flex-1">
                        <ListingHeading listing={item.listing} />
                        <p className="mt-2 text-sm text-muted">
                            {new Date(item.slot.startsAt).toLocaleString(
                                    locale,
                                { dateStyle: "full", timeStyle: "short" },
                            )}{" "}
                            -{" "}
                            {new Date(item.slot.endsAt).toLocaleTimeString(
                                "nl-NL",
                                { hour: "2-digit", minute: "2-digit" },
                            )}
                        </p>
                    </div>
                    <Status value={item.attendanceStatus} />
                    <Link
                        href={
                            item.listing.slug
                                ? `/property/${item.listing.slug}`
                                : "#"
                        }
                        className="inline-flex h-10 items-center justify-center border border-line px-3 text-sm font-semibold text-brand"
                    >
                        {isEn ? "Home" : "Woning"}
                    </Link>
                </div>
            ))}
        </ListSection>
    );
}
function Bids({ items }: { items: Bid[] }) {
    const { language } = useLanguage();
    const isEn = language === "en";
    const locale = isEn ? "en-NL" : "nl-NL";
    return (
        <ListSection
            title={isEn ? "My bids" : "Mijn biedingen"}
            text={isEn ? "Amount, conditions and the current decision for each home." : "Bedrag, voorwaarden en de actuele beslissing per woning."}
            empty={
                <Empty
                    icon={Euro}
                    title={isEn ? "No bids yet" : "Nog geen biedingen"}
                    text={isEn ? "After a confirmed viewing, you can place a bid during the bidding period." : "Na een bevestigde bezichtiging kun je tijdens de biedperiode een bod vastleggen."}
                    href="/search"
                />
            }
        >
            {items.map((bid) => {
                const state = bid.events.at(-1)?.type ?? "SUBMITTED";
                return (
                    <div
                        key={bid.id}
                        className="border border-line bg-surface p-5"
                    >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex-1">
                                <ListingHeading listing={bid.listing} />
                                <p className="mt-3 text-xl font-semibold">
                                    {money(bid.amountCents)}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                    {isEn ? "Submitted" : "Ingediend"}{" "}
                                    {new Date(bid.submittedAt).toLocaleString(
                                        locale,
                                    )}
                                </p>
                            </div>
                            <Status value={state} />
                            {bid.transaction ? (
                                <Link
                                    href={`/dashboard/transactions/${bid.transaction.id}`}
                                    className="inline-flex h-10 items-center justify-center gap-1 bg-brand px-4 text-sm font-semibold text-white"
                                >
                                    {isEn ? "Transaction room" : "Transactieruimte"} <ChevronRight size={14} />
                                </Link>
                            ) : (
                                <Link
                                    href={
                                        bid.listing.slug
                                            ? `/property/${bid.listing.slug}`
                                            : "#"
                                    }
                                    className="inline-flex h-10 items-center justify-center border border-line px-4 text-sm font-semibold text-brand"
                                >
                                    {isEn ? "Home" : "Woning"}
                                </Link>
                            )}
                        </div>
                        {bid.financingDeadline && (
                            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                                {isEn ? "Financing deadline:" : "Financieringsdeadline:"}{" "}
                                {new Date(
                                    bid.financingDeadline,
                                ).toLocaleDateString(locale)}
                            </p>
                        )}
                    </div>
                );
            })}
        </ListSection>
    );
}
function Messages({
    data,
    refresh,
}: {
    data: DashboardData;
    refresh: () => void;
}) {
    const { language } = useLanguage();
    const isEn = language === "en";
    const locale = isEn ? "en-NL" : "nl-NL";
    const [openListingId, setOpenListingId] = useState<string | null>(null);
    if (openListingId) {
        return (
            <div className="mx-auto max-w-2xl">
                <ListingMessageThread
                    listingId={openListingId}
                    onBack={() => setOpenListingId(null)}
                    onThreadChange={refresh}
                />
            </div>
        );
    }
    return (
        <ListSection
            title={isEn ? "Messages" : "Berichten"}
            text={isEn ? "Your conversations with sellers, directly within the platform." : "Jouw gesprekken met verkopers, rechtstreeks binnen het platform."}
            empty={
                <Empty
                    icon={MessageSquare}
                    title={isEn ? "No messages yet" : "Nog geen berichten"}
                    text={isEn ? "Open a home and send the seller a message." : "Open een woning en stuur een bericht aan de verkoper."}
                    href="/search"
                />
            }
        >
            {data.messageThreads.map((thread) => (
                <button
                    key={thread.listingId}
                    type="button"
                    onClick={() => setOpenListingId(thread.listingId)}
                    className="group flex flex-col gap-4 border border-line bg-surface p-5 text-left transition hover:border-brand/40 sm:flex-row sm:items-center"
                >
                    <div className="flex-1">
                        <ListingHeading listing={thread.listing} />
                        <p className="mt-2 text-xs text-muted">
                            {thread.messageCount} {isEn ? (thread.messageCount === 1 ? "message" : "messages") : `bericht${thread.messageCount === 1 ? "" : "en"}`} · {isEn ? "last on" : "laatste op"}{" "}
                            {new Date(thread.lastMessageAt).toLocaleString(
                                locale,
                                { dateStyle: "medium", timeStyle: "short" },
                            )}
                        </p>
                    </div>
                    {thread.unreadIncoming > 0 ? (
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
                            {thread.unreadIncoming}
                        </span>
                    ) : null}
                    {thread.transaction && thread.hasTransferred ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-brand-dark">
                            <ShieldCheck size={12} /> {isEn ? "Moved to transaction" : "Verplaatst naar transactie"}
                        </span>
                    ) : null}
                    <ChevronRight
                        className="text-brand transition group-hover:translate-x-1"
                        size={19}
                    />
                </button>
            ))}
        </ListSection>
    );
}

function Transactions({ items }: { items: Transaction[] }) {
    const { language } = useLanguage();
    const isEn = language === "en";
    return (
        <ListSection
            title={isEn ? "Purchase and rental transactions" : "Aankoop- en huurtransacties"}
            text={isEn ? "Outstanding actions after an accepted bid." : "Openstaande acties na een geaccepteerd bod."}
            empty={
                <Empty
                    icon={FileText}
                    title={isEn ? "No transactions" : "Geen transacties"}
                    text={isEn ? "After a bid is accepted, your secure transaction room will appear here automatically." : "Na acceptatie van een bod verschijnt hier automatisch je beveiligde transactieruimte."}
                />
            }
        >
            {items.map((transaction) => {
                const done = transaction.milestones.filter((item) =>
                    ["COMPLETED", "WAIVED"].includes(item.status),
                ).length;
                const progress = transaction.milestones.length
                    ? Math.round((done / transaction.milestones.length) * 100)
                    : 0;
                return (
                    <Link
                        key={transaction.id}
                        href={`/dashboard/transactions/${transaction.id}`}
                        className="group flex flex-col gap-4 border border-line bg-surface p-5 hover:border-brand/40 sm:flex-row sm:items-center"
                    >
                        <div className="flex-1">
                            <ListingHeading listing={transaction.listing} />
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
                                <div
                                    className="h-full bg-brand"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="mt-2 text-xs text-muted">
                                {transaction.milestones.length
                                    ? isEn ? `${done} of ${transaction.milestones.length} steps completed` : `${done} van ${transaction.milestones.length} stappen afgerond`
                                    : isEn ? "Steps are being prepared" : "Stappen worden voorbereid"}
                            </p>
                        </div>
                        <Status value={transaction.status} />
                        <ChevronRight
                            className="text-brand transition group-hover:translate-x-1"
                            size={19}
                        />
                    </Link>
                );
            })}
        </ListSection>
    );
}

function Notifications({
    data,
    refresh,
}: {
    data: DashboardData;
    refresh: () => Promise<unknown>;
}) {
    const { language } = useLanguage();
    const isEn = language === "en";
    const locale = isEn ? "en-NL" : "nl-NL";
    const read = useMutation({
        mutationFn: (notificationId?: string) =>
            api("/api/seeker/notifications", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(
                    notificationId ? { notificationId } : { all: true },
                ),
            }),
        onSuccess: refresh,
    });
    const prefs = useMutation({
        mutationFn: (preferences: Preferences) =>
            api("/api/seeker/preferences", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(preferences),
            }),
        onSuccess: refresh,
    });
    return (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <section>
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold">{isEn ? "Notifications" : "Meldingen"}</h2>
                        <p className="mt-1 text-sm text-muted">
                            {isEn ? "New homes, changes and deadlines." : "Nieuwe woningen, wijzigingen en deadlines."}
                        </p>
                    </div>
                    {data.notifications.some((item) => !item.readAt) && (
                        <button
                            onClick={() => read.mutate(undefined)}
                            className="text-sm font-semibold text-brand"
                        >
                            {isEn ? "Mark all as read" : "Alles gelezen"}
                        </button>
                    )}
                </div>
                <div className="mt-5 divide-y divide-line border border-line bg-surface">
                    {data.notifications.map((item) => {
                        const content = (
                            <div
                                className={`flex gap-3 p-4 ${item.readAt ? "opacity-60" : "bg-brand/3"}`}
                            >
                                <span
                                    className={`mt-1 size-2 shrink-0 rounded-full ${item.readAt ? "bg-line" : "bg-brand"}`}
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">
                                        {item.title}
                                    </p>
                                    <p className="mt-1 text-sm leading-6 text-muted">
                                        {item.body}
                                    </p>
                                    <p className="mt-2 text-[11px] text-muted">
                                        {new Date(
                                            item.createdAt,
                                        ).toLocaleString(locale)}
                                    </p>
                                </div>
                                {item.href && (
                                    <ChevronRight
                                        className="mt-1 shrink-0 text-muted"
                                        size={17}
                                    />
                                )}
                            </div>
                        );
                        return item.href ? (
                            <Link
                                key={item.id}
                                href={item.href}
                                onClick={() => {
                                    if (!item.readAt) read.mutate(item.id);
                                }}
                            >
                                {content}
                            </Link>
                        ) : (
                            <button
                                key={item.id}
                                onClick={() => {
                                    if (!item.readAt) read.mutate(item.id);
                                }}
                                className="block w-full text-left"
                            >
                                {content}
                            </button>
                        );
                    })}
                    {!data.notifications.length && (
                        <div className="p-10 text-center text-sm text-muted">
                            {isEn ? "You do not have any notifications yet." : "Je hebt nog geen meldingen."}
                        </div>
                    )}
                </div>
            </section>
            <section className="h-fit border border-line bg-surface p-5">
                <div className="flex items-center gap-2">
                    <Settings2 className="text-brand" size={19} />
                    <h3 className="font-semibold">{isEn ? "Notification preferences" : "Meldingsvoorkeuren"}</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                    {isEn ? "Choose what appears in your personal inbox." : "Kies wat in je persoonlijke inbox verschijnt."}
                </p>
                <div className="mt-5 grid gap-3">
                    {(
                        [
                            ["newListing", isEn ? "New listings" : "Nieuw aanbod"],
                            ["priceChange", isEn ? "Price changes" : "Prijswijzigingen"],
                            ["statusChange", isEn ? "Status changes" : "Statuswijzigingen"],
                            ["viewing", isEn ? "Viewings" : "Bezichtigingen"],
                            ["bid", isEn ? "Bids" : "Biedingen"],
                            ["transaction", isEn ? "Transactions" : "Transacties"],
                            ["deadline", isEn ? "Deadlines" : "Deadlines"],
                        ] as Array<[keyof Preferences, string]>
                    ).map(([key, label]) => (
                        <label
                            key={key}
                            className="flex items-center justify-between gap-3 text-sm"
                        >
                            <span>{label}</span>
                            <input
                                type="checkbox"
                                checked={data.preferences[key]}
                                disabled={
                                    !data.preferences.inAppEnabled ||
                                    prefs.isPending
                                }
                                onChange={(event) =>
                                    prefs.mutate({
                                        ...data.preferences,
                                        [key]: event.target.checked,
                                    })
                                }
                                className="size-4 accent-brand"
                            />
                        </label>
                    ))}
                </div>
                <label className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm font-semibold">
                    <span>{isEn ? "In-app notifications" : "In-app meldingen"}</span>
                    <input
                        type="checkbox"
                        checked={data.preferences.inAppEnabled}
                        onChange={(event) =>
                            prefs.mutate({
                                ...data.preferences,
                                inAppEnabled: event.target.checked,
                            })
                        }
                        className="size-4 accent-brand"
                    />
                </label>
            </section>
        </div>
    );
}

function ListSection({
    title,
    text,
    children,
    empty,
}: {
    title: string;
    text: string;
    children: React.ReactNode;
    empty: React.ReactNode;
}) {
    const hasChildren = Array.isArray(children)
        ? children.length > 0
        : Boolean(children);
    return (
        <section>
            <h2 className="text-2xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
            <div className="mt-6 grid gap-3">
                {hasChildren ? children : empty}
            </div>
        </section>
    );
}
function ListingCard({
    listing,
    note,
}: {
    listing: Listing;
    note?: string | null;
}) {
    const content = (
        <>
            <div className="relative aspect-video bg-background">
                {listing.imageUrl ? (
                    <Image
                        src={listing.imageUrl}
                        alt=""
                        fill
                        sizes="400px"
                        className="object-cover"
                    />
                ) : (
                    <div className="dot-grid grid size-full place-items-center text-brand/30">
                        <House size={36} />
                    </div>
                )}
            </div>
            <div className="p-4">
                <ListingHeading listing={listing} />
                {note && (
                    <p className="mt-3 line-clamp-2 text-xs italic text-muted">
                        “{note}”
                    </p>
                )}
            </div>
        </>
    );
    return listing.slug ? (
        <Link
            href={`/property/${listing.slug}`}
            className="group overflow-hidden border border-line bg-surface hover:border-brand/40"
        >
            {content}
        </Link>
    ) : (
        <div className="overflow-hidden border border-line bg-surface opacity-70">
            {content}
        </div>
    );
}
function ListingHeading({ listing }: { listing: Listing }) {
    return (
        <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold">
                    {listing.street} {listing.houseNumber}
                    {listing.houseNumberAddition}
                </h3>
                <Status value={listing.status} compact />
            </div>
            <p className="mt-1 text-xs text-muted">
                {listing.postcode} {listing.city}
            </p>
            {listing.priceCents && (
                <p className="mt-2 font-semibold text-brand">
                    {money(listing.priceCents)}
                    {listing.purpose === "RENT" ? " / maand" : " k.k."}
                </p>
            )}
        </div>
    );
}
function Status({
    value,
    compact = false,
}: {
    value: string;
    compact?: boolean;
}) {
    const { language } = useLanguage();
    const positive = [
        "LIVE",
        "CONFIRMED",
        "ACCEPTED",
        "COMPLETED",
        "READY_FOR_TRANSFER",
    ].includes(value);
    return (
        <span
            className={`inline-flex shrink-0 items-center ${compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-xs"} font-semibold ${positive ? "bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-300" : "bg-background text-muted"}`}
        >
            {(language === "en" ? englishStatusNames : statusNames)[value] ?? value}
        </span>
    );
}
function DateTile({ date }: { date: string }) {
    const value = new Date(date);
    return (
        <div className="grid size-14 shrink-0 place-items-center bg-brand text-center text-white">
            <span className="text-[10px] uppercase">
                {value.toLocaleDateString("nl-NL", { month: "short" })}
            </span>
            <strong className="-mt-2 text-xl">{value.getDate()}</strong>
        </div>
    );
}
function Empty({
    icon: Icon,
    title,
    text,
    href,
}: {
    icon: typeof Heart;
    title: string;
    text: string;
    href?: string;
}) {
    return (
        <div className="col-span-full grid min-h-56 place-items-center border border-dashed border-brand/25 bg-surface p-8 text-center">
            <div className="max-w-md">
                <Icon className="mx-auto text-brand" size={30} />
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
                {href && (
                    <Link
                        href={href}
                        className="mt-5 inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white"
                    >
                        Ga verder <ChevronRight size={15} />
                    </Link>
                )}
            </div>
        </div>
    );
}
function money(cents: string) {
    return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(cents) / 100);
}
