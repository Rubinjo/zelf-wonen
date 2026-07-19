"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
    divIcon,
    latLngBounds,
    type LatLngExpression,
    type LatLngTuple,
} from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { MarketplaceListing } from "@/features/listings/marketplace-service";

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

function FitListings({ positions }: { positions: LatLngTuple[] }) {
    const map = useMap();

    useEffect(() => {
        if (positions.length === 0) return;
        if (positions.length === 1) {
            map.setView(positions[0], 13);
            return;
        }
        map.fitBounds(latLngBounds(positions), {
            padding: [42, 42],
            maxZoom: 14,
        });
    }, [map, positions]);

    return null;
}

export function MarketplaceMap({
    listings,
    selectedId,
    onSelect,
}: {
    listings: MarketplaceListing[];
    selectedId: string | null;
    onSelect: (listingId: string) => void;
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
            <div className="grid h-full min-h-96 place-items-center bg-[#e9eee9] px-8 text-center">
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
            scrollWheelZoom
            className="h-full min-h-96 w-full"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitListings positions={positions} />
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
                        <Popup minWidth={220}>
                            <Link
                                href={`/woning/${listing.slug}`}
                                className="block font-semibold text-foreground"
                            >
                                {listing.street} {listing.houseNumber}
                            </Link>
                            <p className="mt-1 text-sm text-muted">
                                {listing.postcode} {listing.city}
                            </p>
                            <p className="mt-2 font-semibold text-brand">
                                {formatMarkerPrice(listing.priceCents)}
                                {listing.purpose === "RENT" ? " / mnd" : ""}
                            </p>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
