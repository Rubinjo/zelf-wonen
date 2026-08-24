"use client";

import { divIcon } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import {
    BusFront,
    GraduationCap,
    HeartPulse,
    ShoppingBasket,
} from "lucide-react";

const overlayCopy = {
    nl: {
        title: "Kaartlagen",
        supermarket: "Supermarkten",
        school: "Scholen",
        care: "Zorg",
        transit: "Openbaar vervoer",
        loading: "Kaartlaag laden…",
        error: "De kaartlaag kon niet worden geladen.",
        empty: "Geen locaties gevonden in de buurt.",
    },
    en: {
        title: "Map layers",
        supermarket: "Supermarkets",
        school: "Schools",
        care: "Care",
        transit: "Public transport",
        loading: "Loading map layer…",
        error: "This map layer could not be loaded.",
        empty: "No locations found nearby.",
    },
} as const;

const overlayOptions = [
    { key: "supermarket", icon: ShoppingBasket },
    { key: "school", icon: GraduationCap },
    { key: "care", icon: HeartPulse },
    { key: "transit", icon: BusFront },
] as const;

const OVERLAY_COLORS: Record<string, string> = {
    supermarket: "#10b981",
    school: "#f59e0b",
    care: "#ef4444",
    bus: "#0ea5e9",
    tram: "#6366f1",
    metro: "#8b5cf6",
    train: "#f43f5e",
};

type OverlayPoint = {
    id: string;
    kind: string;
    lat: number;
    lon: number;
    name: string | null;
};

// Overlay-data verandert maandelijks in plaats van per minuut; per woning en
// categorie wordt het antwoord in memory bewaard zodat het opnieuw aan- en
// uitzetten van een laag direct uit de cache komt zonder nieuw verzoek.
const overlayPointCache = new Map<string, OverlayPoint[]>();
const OVERLAY_CACHE_LIMIT = 64;

// Welke puntsoorten bij een categorie horen. Transit levert meerdere
// voertuigsoorten op (bus/tram/metro/trein) die allemaal onder dezelfde laag
// vallen; de overige categorieën gebruiken hun eigen naam als soort.
const CATEGORY_KINDS: Record<string, readonly string[]> = {
    supermarket: ["supermarket"],
    school: ["school"],
    care: ["care"],
    transit: ["bus", "tram", "metro", "train"],
};

function overlayCacheKey(
    latitude: number,
    longitude: number,
    category: string,
) {
    return `${latitude.toFixed(4)},${longitude.toFixed(4)},${category}`;
}

function rememberOverlayPoints(
    latitude: number,
    longitude: number,
    category: string,
    points: OverlayPoint[],
) {
    const kinds = new Set(CATEGORY_KINDS[category] ?? [category]);
    if (overlayPointCache.size >= OVERLAY_CACHE_LIMIT) {
        const oldest = overlayPointCache.keys().next().value;
        if (oldest !== undefined) overlayPointCache.delete(oldest);
    }
    overlayPointCache.set(
        overlayCacheKey(latitude, longitude, category),
        points.filter((point) => kinds.has(point.kind)),
    );
}

export function PropertyLocationMap({
    latitude,
    longitude,
    address,
    language,
}: {
    latitude: number;
    longitude: number;
    address: string;
    language: "nl" | "en";
}) {
    const text = overlayCopy[language];
    const [active, setActive] = useState<string[]>([]);
    const [points, setPoints] = useState<OverlayPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    // Elke toggle laadt de geselecteerde lagen opnieuw via de serverproxy.
    // Categorieën die al in de cache zitten worden direct getoond; alleen
    // ontbrekende categorieën worden in één verzoek samen opgehaald.
    useEffect(() => {
        if (active.length === 0) {
            setTimeout(() => {
                setPoints([]);
                setError(false);
            }, 0);
            return;
        }
        const cachedPoints: OverlayPoint[] = [];
        const missing: string[] = [];
        for (const category of active) {
            const cached = overlayPointCache.get(
                overlayCacheKey(latitude, longitude, category),
            );
            if (cached) {
                cachedPoints.push(...cached);
            } else {
                missing.push(category);
            }
        }
        if (missing.length === 0) {
            setTimeout(() => {
                setPoints(cachedPoints);
                setLoading(false);
                setError(false);
            }, 0);
            return;
        }

        let cancelled = false;
        setTimeout(() => {
            setPoints(cachedPoints);
            setLoading(true);
            setError(false);
        }, 0);
        const params = new URLSearchParams({
            lat: String(latitude),
            lon: String(longitude),
            categories: missing.join(","),
        });
        fetch(`/api/map/overlays?${params.toString()}`)
            .then((response) =>
                response.ok ? response.json() : Promise.reject(),
            )
            .then((payload: { points?: OverlayPoint[] }) => {
                if (cancelled) return;
                const fetched = payload.points ?? [];
                for (const category of missing) {
                    rememberOverlayPoints(
                        latitude,
                        longitude,
                        category,
                        fetched,
                    );
                }
                setPoints([...cachedPoints, ...fetched]);
            })
            .catch(() => {
                if (cancelled) return;
                setError(true);
                setPoints(cachedPoints);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [active, latitude, longitude]);

    const toggle = (category: string) => {
        setActive((current) =>
            current.includes(category)
                ? current.filter((item) => item !== category)
                : [...current, category],
        );
    };

    const markerIcon = divIcon({
        className: "property-location-marker-shell",
        html: '<span class="property-location-marker"><span></span></span>',
        iconAnchor: [22, 44],
    });

    const overlayIcon = useMemo(() => {
        // Voertuigglyphs in dezelfde lijnstijl als de overige overlay-iconen.
        const glyphs: Record<string, string> = {
            supermarket:
                "M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2z",
            school: "M12 3L1 9l4 2.18v6L12 21l7-3.82v-6L23 9 12 3z",
            care: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
            // Bus: vooraanzicht met voorruit, koplampen en wielen.
            bus: "<rect x='4' y='3' width='16' height='15' rx='2'/><path d='M4 10h16'/><path d='M7 14.5h2.5'/><path d='M14.5 14.5H17'/><path d='M7 18v2'/><path d='M17 18v2'/>",
            // Tram: stroomafnemer op het dak, vensterband en rails onder de bak.
            tram: "<path d='M9 5l3-3 3 3'/><rect x='5' y='5' width='14' height='13' rx='2'/><path d='M5 9.5h14'/><path d='M8.5 14h1.5'/><path d='M14 14h1.5'/><path d='M5 21h14'/>",
            // Metro: afgeronde neus met brede voorruit en middenkoplamp.
            metro: "<path d='M6 20V11a6 6 0 0 1 12 0v9'/><path d='M6 12.5h12'/><path d='M10 16.5h4'/><path d='M4 20h16'/>",
            // Trein: zijaanzicht van een rijtuig met ramen en wielen op de rail.
            train: "<rect x='3' y='7' width='18' height='10' rx='2'/><path d='M7 10.5h3'/><path d='M13 10.5h3'/><circle cx='7.5' cy='18.5' r='1.5'/><circle cx='16.5' cy='18.5' r='1.5'/>",
        };
        return (kind: string) => {
            const color = OVERLAY_COLORS[kind] ?? "#64748b";
            const value = glyphs[kind] ?? glyphs.supermarket;
            const html = `<span class="property-overlay-icon" style="--overlay-color:${color}; background:${color};"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${value}</svg></span>`;
            return divIcon({
                className: "property-overlay-marker",
                html,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });
        };
    }, []);

    return (
        <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-background/95 px-4 py-3">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    {text.title}
                </span>
                {overlayOptions.map((option) => {
                    const isActive = active.includes(option.key);
                    const Icon = option.icon;
                    return (
                        <button
                            key={option.key}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => toggle(option.key)}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                                isActive
                                    ? "bg-brand text-white"
                                    : "border border-line bg-background text-foreground hover:bg-surface"
                            }`}
                        >
                            <Icon size={14} />
                            {text[option.key]}
                        </button>
                    );
                })}
                {loading ? (
                    <span className="ml-auto text-xs text-muted">
                        {text.loading}
                    </span>
                ) : error ? (
                    <span className="ml-auto text-xs font-semibold text-red-600 dark:text-red-400">
                        {text.error}
                    </span>
                ) : active.length > 0 && points.length === 0 ? (
                    <span className="ml-auto text-xs text-muted">
                        {text.empty}
                    </span>
                ) : null}
            </div>
            <div className="min-h-0 flex-1">
                <MapContainer
                    center={[latitude, longitude]}
                    zoom={15}
                    minZoom={3}
                    maxZoom={19}
                    scrollWheelZoom
                    className="h-full w-full"
                    aria-label={address}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker
                        position={[latitude, longitude]}
                        icon={markerIcon}
                        title={address}
                    />
                    {points.map((point) => (
                        <Marker
                            key={point.id}
                            position={[point.lat, point.lon]}
                            icon={overlayIcon(point.kind)}
                        >
                            {point.name ? (
                                <Tooltip direction="top" offset={[0, -12]}>
                                    {point.name}
                                </Tooltip>
                            ) : null}
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
}
