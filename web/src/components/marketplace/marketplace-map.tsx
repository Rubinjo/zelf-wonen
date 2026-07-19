"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    DoorOpen,
    Images,
    Landmark,
    Maximize2,
    PanelRightClose,
    X,
} from "lucide-react";
import {
    divIcon,
    latLngBounds,
    type LatLngExpression,
    type LatLngTuple,
} from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type {
    MarketplaceBounds,
    MarketplaceListing,
} from "@/features/listings/marketplace-service";

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
};

function formatMarkerPrice(priceCents: string | null) {
    if (!priceCents) return "Prijs op aanvraag";
    const price = Number(priceCents) / 100;
    if (price >= 1_000_000) {
        return `€${new Intl.NumberFormat("nl-NL", {
            maximumFractionDigits: 1,
        }).format(price / 1_000_000)} mln`;
    }
    return `€${Math.round(price / 1_000)}k`;
}

function FitListings({
    positions,
    activeBounds,
}: {
    positions: LatLngTuple[];
    activeBounds: MarketplaceBounds | null;
}) {
    const map = useMap();

    useEffect(() => {
        if (activeBounds) return;
        if (positions.length === 0) return;
        if (positions.length === 1) {
            map.setView(positions[0], 13);
            return;
        }
        map.fitBounds(latLngBounds(positions), {
            padding: [42, 42],
            maxZoom: 14,
        });
    }, [activeBounds, map, positions]);

    return null;
}

function MapControls({
    activeBounds,
    onSearchBounds,
    onClearBounds,
    onCollapse,
}: {
    activeBounds: MarketplaceBounds | null;
    onSearchBounds: (bounds: MarketplaceBounds) => void;
    onClearBounds: () => void;
    onCollapse: () => void;
}) {
    const map = useMap();

    function searchCurrentArea() {
        const bounds = map.getBounds();
        onSearchBounds({
            north: bounds.getNorth(),
            east: bounds.getEast(),
            south: bounds.getSouth(),
            west: bounds.getWest(),
        });
    }

    return (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-1000 flex items-start justify-center px-3">
            <div className="pointer-events-auto flex items-center gap-2">
                <button
                    type="button"
                    onClick={searchCurrentArea}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-white/80 bg-brand px-4 text-sm font-semibold text-white shadow-[0_3px_12px_rgba(16,40,32,0.28)] transition hover:bg-brand-dark"
                >
                    <Maximize2 size={16} />
                    Filter op dit gebied
                </button>
                {activeBounds ? (
                    <button
                        type="button"
                        onClick={onClearBounds}
                        aria-label="Wis kaartgebied"
                        title="Wis kaartgebied"
                        className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted shadow-md transition hover:border-brand hover:text-brand"
                    >
                        <X size={17} />
                    </button>
                ) : null}
            </div>
            <button
                type="button"
                onClick={onCollapse}
                aria-label="Minimaliseer kaart"
                title="Minimaliseer kaart"
                className="pointer-events-auto absolute right-3 hidden size-10 place-items-center rounded-md bg-white text-brand shadow-lg transition hover:bg-background lg:grid"
            >
                <PanelRightClose size={19} />
            </button>
        </div>
    );
}

export function MarketplaceMap({
    listings,
    selectedId,
    onSelect,
    activeBounds,
    onSearchBounds,
    onClearBounds,
    onCollapse,
}: {
    listings: MarketplaceListing[];
    selectedId: string | null;
    onSelect: (listingId: string) => void;
    activeBounds: MarketplaceBounds | null;
    onSearchBounds: (bounds: MarketplaceBounds) => void;
    onClearBounds: () => void;
    onCollapse: () => void;
}) {
    const mappableListings = useMemo(
        () =>
            listings.filter(
                (listing) =>
                    listing.latitude !== null && listing.longitude !== null,
            ),
        [listings],
    );
    const positions = useMemo(
        () =>
            mappableListings.map(
                (listing) =>
                    [listing.latitude!, listing.longitude!] as LatLngTuple,
            ),
        [mappableListings],
    );

    if (mappableListings.length === 0) {
        return (
            <div className="relative grid h-full min-h-96 place-items-center bg-[#e9eee9] px-8 text-center">
                <button
                    type="button"
                    onClick={onCollapse}
                    aria-label="Minimaliseer kaart"
                    title="Minimaliseer kaart"
                    className="absolute right-3 top-3 hidden size-10 place-items-center rounded-md bg-white text-brand shadow-lg transition hover:bg-background lg:grid"
                >
                    <PanelRightClose size={19} />
                </button>
                <div>
                    <p className="font-semibold text-foreground">
                        Geen locaties op de kaart
                    </p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-muted">
                        De woningen in deze selectie hebben nog geen
                        kaartcoördinaten.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <MapContainer
            center={[52.1326, 5.2913] as LatLngExpression}
            zoom={7}
            bounds={
                activeBounds
                    ? [
                          [activeBounds.south, activeBounds.west],
                          [activeBounds.north, activeBounds.east],
                      ]
                    : undefined
            }
            scrollWheelZoom
            className="h-full min-h-96 w-full"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitListings positions={positions} activeBounds={activeBounds} />
            <MapControls
                activeBounds={activeBounds}
                onSearchBounds={onSearchBounds}
                onClearBounds={onClearBounds}
                onCollapse={onCollapse}
            />
            {mappableListings.map((listing) => {
                const selected = listing.id === selectedId;
                return (
                    <Marker
                        key={listing.id}
                        position={[listing.latitude!, listing.longitude!]}
                        icon={divIcon({
                            className: "marketplace-marker-shell",
                            html: `<span class="marketplace-marker${selected ? " is-selected" : ""}">${formatMarkerPrice(listing.priceCents)}</span>`,
                            iconAnchor: [42, 18],
                            popupAnchor: [0, -18],
                        })}
                        eventHandlers={{ click: () => onSelect(listing.id) }}
                    >
                        <Popup minWidth={260} maxWidth={280}>
                            {listing.imageUrl ? (
                                <Link
                                    href={`/woning/${listing.slug}`}
                                    className="relative mb-3 block h-32 overflow-hidden rounded-md bg-background"
                                >
                                    <Image
                                        src={listing.imageUrl}
                                        alt={listing.imageAlt}
                                        fill
                                        sizes="280px"
                                        className="object-cover"
                                    />
                                    {listing.imageUrls.length > 1 ? (
                                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-sm bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                                            <Images size={13} />
                                            {listing.imageUrls.length}
                                        </span>
                                    ) : null}
                                </Link>
                            ) : null}
                            <Link
                                href={`/woning/${listing.slug}`}
                                className="block text-base font-semibold text-foreground hover:text-brand"
                            >
                                {listing.street} {listing.houseNumber}
                            </Link>
                            {listing.isMonument ? (
                                <span className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-background px-2 py-1 text-xs font-semibold text-brand">
                                    <Landmark size={13} /> Monument
                                </span>
                            ) : null}
                            <p className="mt-1 text-sm text-muted">
                                {listing.postcode} {listing.city}
                            </p>
                            <p className="mt-2 font-semibold text-brand">
                                {formatMarkerPrice(listing.priceCents)}
                                {listing.purpose === "RENT" ? " / mnd" : ""}
                            </p>
                            <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-sm text-muted">
                                <span className="inline-flex items-center gap-1">
                                    <Maximize2 size={14} />
                                    {listing.livingAreaSqm ?? "—"} m²
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <DoorOpen size={15} />
                                    {listing.roomCount ?? "—"} kamers
                                </span>
                                {listing.energyLabel ? (
                                    <span className="ml-auto rounded-sm bg-[#dff4d8] px-2 py-0.5 text-xs font-bold text-[#1f6b2b]">
                                        {energyNames[listing.energyLabel] ??
                                            "?"}
                                    </span>
                                ) : null}
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
