"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Bell,
    BellRing,
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
    Search,
    Settings2,
    Share2,
    Trash2,
    Users,
    X,
} from "lucide-react";

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
type DashboardData = {
    favorites: Favorite[];
    searches: SearchItem[];
    notifications: Notification[];
    preferences: Preferences;
    viewings: Viewing[];
    bids: Bid[];
    transactions: Transaction[];
    shares: Share[];
};
type Tab =
    | "overview"
    | "favorites"
    | "searches"
    | "viewings"
    | "bids"
    | "transactions"
    | "notifications";

const tabs: Array<[Tab, string, typeof Heart]> = [
    ["overview", "Overzicht", House],
    ["favorites", "Favorieten", Heart],
    ["searches", "Zoekopdrachten", Search],
    ["viewings", "Bezichtigingen", CalendarDays],
    ["bids", "Biedingen", Euro],
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
    return (
        <div className="pb-20">
            <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                        Persoonlijk zoekersdashboard
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                        Mijn zoektocht
                    </h1>
                    <p className="mt-3 text-muted">
                        Je woningen, afspraken en acties op één plek.
                    </p>
                </div>
                <Link
                    href="/zoeken"
                    className="inline-flex h-12 items-center justify-center gap-2 bg-brand px-6 font-semibold text-white"
                >
                    <Search size={18} /> Zoek woningen
                </Link>
            </header>
            <nav
                className="mt-7 flex gap-1 overflow-x-auto border-b border-line"
                aria-label="Zoekersdashboard"
            >
                <>
                    {tabs.map(([id, label, Icon]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`relative inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${tab === id ? "border-brand text-brand" : "border-transparent text-muted"}`}
                        >
                            <Icon size={16} /> {label}
                            {id === "notifications" && unread > 0 && (
                                <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">
                                    {unread}
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
            <section className="border border-line bg-white p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                            Volgende acties
                        </p>
                        <h2 className="mt-1 text-xl font-semibold">
                            Wat vraagt je aandacht?
                        </h2>
                    </div>
                    <BellRing className="text-brand" size={26} />
                </div>
                <div className="mt-5 grid gap-3">
                    {nextViewing && (
                        <Action
                            icon={CalendarDays}
                            title="Aankomende bezichtiging"
                            text={`${nextViewing.listing.street} ${nextViewing.listing.houseNumber} · ${new Date(nextViewing.slot.startsAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}`}
                            onClick={() => selectTab("viewings")}
                        />
                    )}
                    {activeTransaction && (
                        <Action
                            icon={FileText}
                            title="Actieve transactie"
                            text={`${activeTransaction.listing.street} ${activeTransaction.listing.houseNumber} · ${statusNames[activeTransaction.status]}`}
                            href={`/dashboard/transacties/${activeTransaction.id}`}
                        />
                    )}
                    {deadlines[0] && (
                        <Action
                            icon={Clock3}
                            title="Eerstvolgende deadline"
                            text={`${deadlines[0].title} · ${new Date(deadlines[0].dueAt!).toLocaleDateString("nl-NL")}`}
                            href={`/dashboard/transacties/${deadlines[0].transactionId}`}
                        />
                    )}
                    {!nextViewing &&
                        !activeTransaction &&
                        !deadlines.length && (
                            <div className="bg-background p-5 text-sm text-muted">
                                Er staan geen urgente acties open.
                            </div>
                        )}
                </div>
            </section>
            <section className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line">
                <Metric
                    value={data.favorites.length}
                    label="Favorieten"
                    onClick={() => selectTab("favorites")}
                />
                <Metric
                    value={data.searches.length}
                    label="Zoekopdrachten"
                    onClick={() => selectTab("searches")}
                />
                <Metric
                    value={data.viewings.length}
                    label="Bezichtigingen"
                    onClick={() => selectTab("viewings")}
                />
                <Metric
                    value={data.bids.length}
                    label="Biedingen"
                    onClick={() => selectTab("bids")}
                />
            </section>
            <section className="border border-line bg-white p-6 lg:col-span-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Recent bewaard</h2>
                    <button
                        onClick={() => selectTab("favorites")}
                        className="text-sm font-semibold text-brand"
                    >
                        Alle favorieten
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
                            title="Nog geen favorieten"
                            text="Bewaar woningen vanuit de zoekresultaten om ze hier terug te vinden."
                            href="/zoeken"
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
            className="bg-white p-6 text-left hover:bg-background"
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
                <div className="mt-5 flex flex-col gap-2 border border-brand/25 bg-white p-4 sm:flex-row sm:items-center">
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
                        href="/zoeken"
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
            href={`/woning/${favorite.listing.slug}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
        >
            Bekijk woning <ChevronRight size={15} />
        </Link>
    ) : (
        <span className="text-sm text-muted">Woning niet meer beschikbaar</span>
    );
    return (
        <article
            className={`overflow-hidden border bg-white ${checked ? "border-brand ring-2 ring-brand/10" : "border-line"}`}
        >
            <div className="relative aspect-video bg-background">
                <button
                    onClick={onCheck}
                    aria-label="Selecteer voor shortlist"
                    className={`absolute left-3 top-3 z-10 grid size-9 place-items-center border shadow-sm ${checked ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"}`}
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
                        className="flex items-center gap-3 border border-line bg-white p-3"
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
                    href="/zoeken"
                    className="inline-flex h-11 items-center gap-2 border border-brand px-4 text-sm font-semibold text-brand"
                >
                    <Search size={16} /> Nieuwe zoekopdracht
                </Link>
            </div>
            <div className="mt-6 grid gap-3">
                {data.searches.map((search) => (
                    <div
                        key={search.id}
                        className="flex flex-col gap-4 border border-line bg-white p-5 sm:flex-row sm:items-center"
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
                            href={`/zoeken?${search.queryString}`}
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
                        href="/zoeken"
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
    return (
        <ListSection
            title="Bezichtigingen"
            text="Je afspraken en bevestigde aanwezigheid."
            empty={
                <Empty
                    icon={CalendarDays}
                    title="Geen bezichtigingen"
                    text="Open een woning en kies een beschikbaar tijdslot."
                    href="/zoeken"
                />
            }
        >
            {items.map((item) => (
                <div
                    key={item.id}
                    className="flex flex-col gap-4 border border-line bg-white p-5 sm:flex-row sm:items-center"
                >
                    <DateTile date={item.slot.startsAt} />
                    <div className="flex-1">
                        <ListingHeading listing={item.listing} />
                        <p className="mt-2 text-sm text-muted">
                            {new Date(item.slot.startsAt).toLocaleString(
                                "nl-NL",
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
                                ? `/woning/${item.listing.slug}`
                                : "#"
                        }
                        className="inline-flex h-10 items-center justify-center border border-line px-3 text-sm font-semibold text-brand"
                    >
                        Woning
                    </Link>
                </div>
            ))}
        </ListSection>
    );
}
function Bids({ items }: { items: Bid[] }) {
    return (
        <ListSection
            title="Mijn biedingen"
            text="Bedrag, voorwaarden en de actuele beslissing per woning."
            empty={
                <Empty
                    icon={Euro}
                    title="Nog geen biedingen"
                    text="Na een bevestigde bezichtiging kun je tijdens de biedperiode een bod vastleggen."
                    href="/zoeken"
                />
            }
        >
            {items.map((bid) => {
                const state = bid.events.at(-1)?.type ?? "SUBMITTED";
                return (
                    <div
                        key={bid.id}
                        className="border border-line bg-white p-5"
                    >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex-1">
                                <ListingHeading listing={bid.listing} />
                                <p className="mt-3 text-xl font-semibold">
                                    {money(bid.amountCents)}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                    Ingediend{" "}
                                    {new Date(bid.submittedAt).toLocaleString(
                                        "nl-NL",
                                    )}
                                </p>
                            </div>
                            <Status value={state} />
                            {bid.transaction ? (
                                <Link
                                    href={`/dashboard/transacties/${bid.transaction.id}`}
                                    className="inline-flex h-10 items-center justify-center gap-1 bg-brand px-4 text-sm font-semibold text-white"
                                >
                                    Transactieruimte <ChevronRight size={14} />
                                </Link>
                            ) : (
                                <Link
                                    href={
                                        bid.listing.slug
                                            ? `/woning/${bid.listing.slug}`
                                            : "#"
                                    }
                                    className="inline-flex h-10 items-center justify-center border border-line px-4 text-sm font-semibold text-brand"
                                >
                                    Woning
                                </Link>
                            )}
                        </div>
                        {bid.financingDeadline && (
                            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                                Financieringsdeadline:{" "}
                                {new Date(
                                    bid.financingDeadline,
                                ).toLocaleDateString("nl-NL")}
                            </p>
                        )}
                    </div>
                );
            })}
        </ListSection>
    );
}
function Transactions({ items }: { items: Transaction[] }) {
    return (
        <ListSection
            title="Aankoop- en huurtransacties"
            text="Openstaande acties na een geaccepteerd bod."
            empty={
                <Empty
                    icon={FileText}
                    title="Geen transacties"
                    text="Na acceptatie van een bod verschijnt hier automatisch je beveiligde transactieruimte."
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
                        href={`/dashboard/transacties/${transaction.id}`}
                        className="group flex flex-col gap-4 border border-line bg-white p-5 hover:border-brand/40 sm:flex-row sm:items-center"
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
                                    ? `${done} van ${transaction.milestones.length} stappen afgerond`
                                    : "Stappen worden voorbereid"}
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
                        <h2 className="text-2xl font-semibold">Meldingen</h2>
                        <p className="mt-1 text-sm text-muted">
                            Nieuwe woningen, wijzigingen en deadlines.
                        </p>
                    </div>
                    {data.notifications.some((item) => !item.readAt) && (
                        <button
                            onClick={() => read.mutate(undefined)}
                            className="text-sm font-semibold text-brand"
                        >
                            Alles gelezen
                        </button>
                    )}
                </div>
                <div className="mt-5 divide-y divide-line border border-line bg-white">
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
                                        ).toLocaleString("nl-NL")}
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
                            Je hebt nog geen meldingen.
                        </div>
                    )}
                </div>
            </section>
            <section className="h-fit border border-line bg-white p-5">
                <div className="flex items-center gap-2">
                    <Settings2 className="text-brand" size={19} />
                    <h3 className="font-semibold">Meldingsvoorkeuren</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                    Kies wat in je persoonlijke inbox verschijnt.
                </p>
                <div className="mt-5 grid gap-3">
                    {(
                        [
                            ["newListing", "Nieuw aanbod"],
                            ["priceChange", "Prijswijzigingen"],
                            ["statusChange", "Statuswijzigingen"],
                            ["viewing", "Bezichtigingen"],
                            ["bid", "Biedingen"],
                            ["transaction", "Transacties"],
                            ["deadline", "Deadlines"],
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
                    <span>In-app meldingen</span>
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
            href={`/woning/${listing.slug}`}
            className="group overflow-hidden border border-line bg-white hover:border-brand/40"
        >
            {content}
        </Link>
    ) : (
        <div className="overflow-hidden border border-line bg-white opacity-70">
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
    const positive = [
        "LIVE",
        "CONFIRMED",
        "ACCEPTED",
        "COMPLETED",
        "READY_FOR_TRANSFER",
    ].includes(value);
    return (
        <span
            className={`inline-flex shrink-0 items-center ${compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-xs"} font-semibold ${positive ? "bg-green-50 text-green-800" : "bg-background text-muted"}`}
        >
            {statusNames[value] ?? value}
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
        <div className="col-span-full grid min-h-56 place-items-center border border-dashed border-brand/25 bg-white p-8 text-center">
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
