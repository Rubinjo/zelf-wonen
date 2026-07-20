"use client";

import dynamic from "next/dynamic";
import { ExternalLink, MapPin } from "lucide-react";

const PropertyLocationMap = dynamic(
    () =>
        import("@/components/listing/property-location-map").then(
            (module) => module.PropertyLocationMap,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="grid h-full place-items-center bg-[#e9eee9] text-sm font-semibold text-muted">
                Kaart laden…
            </div>
        ),
    },
);

const locationCopy = {
    nl: {
        title: "Locatie",
        description: "Bekijk de ligging van deze woning en de omgeving.",
        googleMaps: "Bekijk op Google Maps",
        unavailable: "De exacte kaartlocatie is nog niet beschikbaar.",
    },
    en: {
        title: "Location",
        description:
            "Explore the location of this property and its surroundings.",
        googleMaps: "View on Google Maps",
        unavailable: "The exact map location is not available yet.",
    },
} as const;

export function PropertyLocation({
    latitude,
    longitude,
    address,
    language,
}: {
    latitude: number | null;
    longitude: number | null;
    address: string;
    language: "nl" | "en";
}) {
    const text = locationCopy[language];
    const hasCoordinates = latitude !== null && longitude !== null;
    const googleMapsQuery = hasCoordinates
        ? `${latitude},${longitude}`
        : address;
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleMapsQuery)}`;

    return (
        <section className="mt-12 border-t border-line pt-10">
            <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                    <div className="flex items-center gap-2">
                        <MapPin size={21} className="text-brand" />
                        <h2 className="text-2xl font-semibold">{text.title}</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                        {text.description}
                    </p>
                </div>
                <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark"
                >
                    {text.googleMaps}
                    <ExternalLink size={16} />
                </a>
            </div>
            <div className="mt-5 h-[min(55vh,32rem)] min-h-80 overflow-hidden rounded-lg border border-line">
                {hasCoordinates ? (
                    <PropertyLocationMap
                        latitude={latitude}
                        longitude={longitude}
                        address={address}
                    />
                ) : (
                    <div className="grid h-full place-items-center bg-[#e9eee9] px-6 text-center text-sm font-medium text-muted">
                        {text.unavailable}
                    </div>
                )}
            </div>
        </section>
    );
}
