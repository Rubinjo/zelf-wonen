"use client";

import { startTransition, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    BedDouble,
    Building2,
    DoorOpen,
    Heart,
    Images,
    Landmark,
    List,
    Map,
    Maximize2,
    PanelRightOpen,
} from "lucide-react";
import type {
    MarketplaceBounds,
    MarketplaceListing,
} from "@/features/listings/marketplace-service";

const MarketplaceMap = dynamic(
    () =>
        import("@/components/marketplace/marketplace-map").then(
            (module) => module.MarketplaceMap,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="grid h-full min-h-96 place-items-center bg-[#e9eee9] text-sm font-semibold text-muted">
                Kaart laden…
            </div>
        ),
    },
);

const energyNames: Record<string, string> = {
    A_PLUS_PLUS_PLUS_PLUS_PLUS: "A+++++",
    A_PLUS_PLUS_PLUS_PLUS: "A++++",
    A_PLUS_PLUS_PLUS: "A+++",
    A_PLUS_PLUS: "A++",
    A_PLUS: "A+",
    A: "A",
    B: "B",
    C: "C",
    D: "D",
    E: "E",
    F: "F",
    G: "G",
    UNKNOWN: "?",
};

const favoritesKey = "zelfwonen:favorites";
const favoritesEvent = "zelfwonen:favorites-changed";

function subscribeToFavorites(onStoreChange: () => void) {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(favoritesEvent, onStoreChange);
    return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(favoritesEvent, onStoreChange);
    };
}

function getFavoritesSnapshot() {
    return localStorage.getItem(favoritesKey) ?? "[]";
}

function getServerFavoritesSnapshot() {
    return "[]";
}

function formatPrice(listing: MarketplaceListing) {
    if (!listing.priceCents) return "Prijs op aanvraag";
    const price = new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(listing.priceCents) / 100);
    return listing.purpose === "RENT" ? `${price} / maand` : `${price} k.k.`;
}

function FavoriteButton({
    listingId,
    active,
    onToggle,
}: {
    listingId: string;
    active: boolean;
    onToggle: (listingId: string) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onToggle(listingId)}
            aria-label={active ? "Verwijder uit favorieten" : "Bewaar woning"}
            aria-pressed={active}
            className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-white/95 text-brand shadow-sm transition hover:scale-105"
        >
            <Heart size={20} fill={active ? "currentColor" : "none"} />
        </button>
    );
}

export function MarketplaceResults({
    listings,
    activeBounds,
}: {
    listings: MarketplaceListing[];
    activeBounds: MarketplaceBounds | null;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [mobileView, setMobileView] = useState<"list" | "map">("list");
    const [mapCollapsed, setMapCollapsed] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(
        listings[0]?.id ?? null,
    );
    const favoritesSnapshot = useSyncExternalStore(
        subscribeToFavorites,
        getFavoritesSnapshot,
        getServerFavoritesSnapshot,
    );
    let favorites: string[] = [];
    try {
        favorites = JSON.parse(favoritesSnapshot) as string[];
    } catch {
        favorites = [];
    }

    function toggleFavorite(listingId: string) {
        const next = favorites.includes(listingId)
            ? favorites.filter((id) => id !== listingId)
            : [...favorites, listingId];
        localStorage.setItem(favoritesKey, JSON.stringify(next));
        window.dispatchEvent(new Event(favoritesEvent));
    }

    function selectFromMap(listingId: string) {
        setSelectedId(listingId);
        document
            .getElementById(`listing-${listingId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function searchMapBounds(bounds: MarketplaceBounds) {
        const next = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(bounds)) {
            next.set(key, value.toFixed(6));
        }
        next.delete("page");
        startTransition(() => router.push(`/zoeken?${next.toString()}`));
    }

    function clearMapBounds() {
        const next = new URLSearchParams(searchParams.toString());
        for (const key of ["north", "east", "south", "west"]) {
            next.delete(key);
        }
        next.delete("page");
        startTransition(() =>
            router.push(`/zoeken${next.size ? `?${next.toString()}` : ""}`),
        );
    }

    if (listings.length === 0) {
        return (
            <div className="border-y border-line bg-white px-6 py-20 text-center">
                <Building2 size={36} className="mx-auto text-brand" />
                <h2 className="mt-5 text-2xl font-semibold">
                    Geen woningen gevonden
                </h2>
                <p className="mx-auto mt-3 max-w-md leading-7 text-muted">
                    Pas je zoekgebied of filters aan. Met een ruimer budget of
                    woonoppervlak verschijnt vaak meer aanbod.
                </p>
                <Link
                    href="/zoeken"
                    className="mt-7 inline-flex h-11 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white"
                >
                    Wis alle filters
                </Link>
            </div>
        );
    }

    return (
        <>
            <div className="fixed bottom-5 left-1/2 z-1000 flex -translate-x-1/2 rounded-full bg-brand p-1.5 text-white shadow-xl lg:hidden">
                <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${mobileView === "list" ? "bg-white text-brand" : ""}`}
                >
                    <List size={17} /> Lijst
                </button>
                <button
                    type="button"
                    onClick={() => setMobileView("map")}
                    className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${mobileView === "map" ? "bg-white text-brand" : ""}`}
                >
                    <Map size={17} /> Kaart
                </button>
            </div>
            <div
                className={`lg:grid ${mapCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,760px)_minmax(420px,1fr)]"}`}
            >
                <div
                    className={`${mobileView === "list" ? "block" : "hidden"} bg-background px-4 py-5 sm:px-6 lg:block lg:px-8 lg:py-8`}
                >
                    {mapCollapsed ? (
                        <div className="mb-5 hidden items-center justify-between lg:flex">
                            <span className="text-sm font-semibold text-muted">
                                Kaart geminimaliseerd
                            </span>
                            <button
                                type="button"
                                onClick={() => setMapCollapsed(false)}
                                className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-brand transition hover:border-brand"
                            >
                                <PanelRightOpen size={17} /> Kaart tonen
                            </button>
                        </div>
                    ) : null}
                    <div
                        className={`grid gap-5 sm:grid-cols-2 ${mapCollapsed ? "lg:grid-cols-3 xl:grid-cols-4" : ""}`}
                    >
                        {listings.map((listing) => (
                            <article
                                id={`listing-${listing.id}`}
                                key={listing.id}
                                onMouseEnter={() => setSelectedId(listing.id)}
                                className={`group overflow-hidden rounded-lg border bg-white transition ${selectedId === listing.id ? "border-brand shadow-[0_12px_30px_rgba(16,40,32,.1)]" : "border-line hover:border-brand/40"}`}
                            >
                                <div className="relative aspect-4/3 overflow-hidden bg-[#dde9e1]">
                                    <FavoriteButton
                                        listingId={listing.id}
                                        active={favorites.includes(listing.id)}
                                        onToggle={toggleFavorite}
                                    />
                                    {listing.isMonument ? (
                                        <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-sm bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand shadow-sm">
                                            <Landmark size={13} /> Monument
                                        </span>
                                    ) : null}
                                    <Link
                                        href={`/woning/${listing.slug}`}
                                        aria-label={`Bekijk ${listing.street} ${listing.houseNumber}`}
                                    >
                                        {listing.imageUrl ? (
                                            <Image
                                                src={listing.imageUrl}
                                                alt={listing.imageAlt}
                                                fill
                                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
                                                className="object-cover transition duration-500 group-hover:scale-[1.03]"
                                            />
                                        ) : (
                                            <div className="dot-grid grid size-full place-items-center text-brand/35">
                                                <Building2 size={54} />
                                            </div>
                                        )}
                                    </Link>
                                    <span className="absolute bottom-3 left-3 rounded-sm bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand">
                                        {listing.purpose === "SALE"
                                            ? "Te koop"
                                            : "Te huur"}
                                    </span>
                                    {listing.imageUrl ? (
                                        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-sm bg-black/65 px-2 py-1 text-xs font-medium text-white">
                                            <Images size={13} /> Foto&apos;s
                                        </span>
                                    ) : null}
                                </div>
                                <Link
                                    href={`/woning/${listing.slug}`}
                                    className="block p-5"
                                >
                                    <h2 className="truncate text-lg font-semibold group-hover:text-brand">
                                        {listing.street} {listing.houseNumber}
                                        {listing.houseNumberAddition
                                            ? ` ${listing.houseNumberAddition}`
                                            : ""}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted">
                                        {listing.postcode} {listing.city}
                                    </p>
                                    <p className="mt-4 text-xl font-semibold">
                                        {formatPrice(listing)}
                                    </p>
                                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm text-muted">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Maximize2 size={15} />
                                            {listing.livingAreaSqm ?? "—"} m²
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <DoorOpen size={16} />
                                            {listing.roomCount ?? "—"}
                                        </span>
                                        {listing.bedroomCount ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <BedDouble size={16} />
                                                {listing.bedroomCount}
                                            </span>
                                        ) : null}
                                        {listing.energyLabel ? (
                                            <span className="ml-auto rounded-sm bg-[#dff4d8] px-2 py-0.5 text-xs font-bold text-[#1f6b2b]">
                                                {energyNames[
                                                    listing.energyLabel
                                                ] ?? "?"}
                                            </span>
                                        ) : null}
                                    </div>
                                </Link>
                            </article>
                        ))}
                    </div>
                </div>
                <div
                    className={`${mobileView === "map" ? "block" : "hidden"} h-[calc(100vh-8.5rem)] overflow-hidden ${mapCollapsed ? "lg:hidden" : "lg:sticky lg:top-34 lg:block"}`}
                >
                    <MarketplaceMap
                        listings={listings}
                        selectedId={selectedId}
                        onSelect={selectFromMap}
                        activeBounds={activeBounds}
                        onSearchBounds={searchMapBounds}
                        onClearBounds={clearMapBounds}
                        onCollapse={() => setMapCollapsed(true)}
                    />
                </div>
            </div>
        </>
    );
}
