import { PublicHeader } from "@/components/platform/public-header";
import type { Prisma } from "@/generated/prisma/client";
import type { ReactNode } from "react";
import { PropertyLocation } from "@/components/listing/property-location";
import { DetailGroup, DetailTags } from "@/components/listing/property-detail-groups";
import { aggregatedAddress, mapAggregatedPropertyDetails } from "@/features/listings/aggregated-property-details";
import { gardenOrientationLabels } from "@/features/listings/garden";
import { erfpachtOptions, parkingOptions, propertyAmenityOptions, roofTypeOptions } from "@/lib/property-options";
import { translateListingCopy } from "@/lib/messages/listing-copy";
import {
    BadgeCheck,
    BedDouble,
    Calendar,
    Clock3,
    DoorOpen,
    ExternalLink,
    Info,
    Home,
    Layers3,
    Check,
    CircleParking,
    MapPin,
    Ruler,
} from "lucide-react";

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
    UNKNOWN: "Onbekend",
};

const propertyTypeNames = {
    nl: {
        HOUSE: "Huis",
        APARTMENT: "Appartement",
        PARKING: "Parkeerobject",
        LAND: "Bouwgrond",
        COMMERCIAL: "Bedrijfsruimte",
        OTHER: "Overig",
    },
    en: {
        HOUSE: "House",
        APARTMENT: "Apartment",
        PARKING: "Parking property",
        LAND: "Building land",
        COMMERCIAL: "Commercial property",
        OTHER: "Other",
    },
} as const;

const platformMeta = {
    FUNDA: { label: "Funda", color: "#F7A100" },
    KAMERNET: { label: "Kamernet", color: "#0A2E4D" },
} as const;

const copy = {
    nl: {
        forSale: "Te koop",
        forRent: "Te huur",
        statusOffline: "Niet meer beschikbaar",
        statusExpired: "Verlopen",
        aggregatedBadge: "Van externe platforms",
        offPlatform:
            "Dit is een geaggregeerde woning. Bieden, bezichtigingen en de transactie verlopen op het originele platform — niet via ZelfWonen.",
        viewOn: "Bekijk de originele advertentie",
        viewOnFunda: "Bekijk op Funda",
        viewOnKamernet: "Bekijk op Kamernet",
        rooms: "kamers",
        bedrooms: "slaapkamers",
        built: "Bouwjaar",
        living: "Woonoppervlak",
        energy: "Energielabel",
        about: "Over deze woning",
        details: "Kenmerken",
        address: "Adres",
        propertyType: "Woningtype",
        municipality: "Gemeente",
        serviceCosts: "Servicekosten",
        availableFrom: "Beschikbaar vanaf",
        plotArea: "Perceeloppervlak",
        amenities: "Voorzieningen",
        backToSearch: "Terug naar zoeken",
        allPhotos: "Alle foto's",
        general: "Algemeen",
        dimensions: "Oppervlakten en inhoud",
        layout: "Indeling",
        province: "Provincie",
        volume: "Inhoud",
        externalStorage: "Externe bergruimte",
        bathrooms: "Badkamers",
        floors: "Verdiepingen",
        roof: "Daktype",
        garden: "Tuin",
        gardenOrientation: "Ligging tuin",
        leasehold: "Erfpacht",
        parking: "Parkeren",
    },
    en: {
        forSale: "For sale",
        forRent: "For rent",
        statusOffline: "No longer available",
        statusExpired: "Expired",
        aggregatedBadge: "From external platforms",
        offPlatform:
            "This is an aggregated property. Bidding, viewings and the transaction happen on the original platform — not through ZelfWonen.",
        viewOn: "View the original listing",
        viewOnFunda: "View on Funda",
        viewOnKamernet: "View on Kamernet",
        rooms: "rooms",
        bedrooms: "bedrooms",
        built: "Built",
        living: "Living area",
        energy: "Energy label",
        about: "About this property",
        details: "Property details",
        address: "Address",
        propertyType: "Property type",
        municipality: "Municipality",
        serviceCosts: "Service costs",
        availableFrom: "Available from",
        plotArea: "Plot area",
        amenities: "Amenities",
        backToSearch: "Back to search",
        allPhotos: "All photos",
        general: "General",
        dimensions: "Areas and volume",
        layout: "Layout",
        province: "Province",
        volume: "Volume",
        externalStorage: "External storage",
        bathrooms: "Bathrooms",
        floors: "Floors",
        roof: "Roof type",
        garden: "Garden",
        gardenOrientation: "Garden orientation",
        leasehold: "Ground lease",
        parking: "Parking",
    },
};

export type AggregatedListingView = {
    titleNl: string | null;
    descriptionNl: string | null;
    purpose: "SALE" | "RENT";
    status: "ACTIVE" | "EXPIRED" | "OFFLINE" | "ERROR";
    askingPriceCents: string | null;
    monthlyRentCents: string | null;
    serviceCostsCents: string | null;
    postcode: string | null;
    street: string;
    houseNumber: number;
    houseNumberAddition: string | null;
    city: string;
    municipality: string | null;
    province: string | null;
    latitude: number | null;
    longitude: number | null;
    propertyType: string;
    livingAreaSqm: number | null;
    plotAreaSqm: number | null;
    volumeCubicMeters: number | null;
    roomCount: number | null;
    bedroomCount: number | null;
    bathroomCount: number | null;
    constructionYear: number | null;
    energyLabel: string | null;
    amenities: string[];
    interior?: Prisma.JsonValue;
    availableFrom: string | null;
    images: Array<{ id: string; storageKey: string; sortOrder: number }>;
    platformLinks: Array<{
        id: string;
        source: "FUNDA" | "KAMERNET";
        url: string;
        status: string;
    }>;
};

function mediaUrl(storageKey: string): string {
    const base = process.env.AGGREGATED_MEDIA_BASE_URL ?? "/aggregated-media";
    return `${base.replace(/\/+$/, "")}/${storageKey}`;
}
function formatPrice(cents: string | null, locale: string): string {
    if (!cents) return "—";
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(cents) / 100);
}

function formatDate(iso: string | null, locale: string): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(date);
}

export function AggregatedListingDetail({
    listing,
    language,
    neighborhood,
}: {
    listing: AggregatedListingView;
    language: "nl" | "en";
    neighborhood?: ReactNode;
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const title = listing.titleNl || `${listing.street} ${listing.houseNumber}`;
    const price =
        listing.purpose === "SALE"
            ? listing.askingPriceCents
            : listing.monthlyRentCents;
    const fullAddress = aggregatedAddress(listing);
    const activeLinks = listing.platformLinks.filter(
        (link) => link.status === "ACTIVE",
    );
    const isAvailable = listing.status === "ACTIVE";

    return (
        <div className="min-h-screen bg-background">
            <PublicHeader language={language} />
            <main>
                <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
                    {listing.images.length > 0 ? (
                        <div className="grid h-[50vh] min-h-80 gap-2 overflow-hidden rounded-4xl md:grid-cols-2">
                            <img
                                src={mediaUrl(listing.images[0].storageKey)}
                                alt={title}
                                referrerPolicy="no-referrer"
                                className="size-full object-cover"
                            />
                            <div className="hidden grid-cols-2 gap-2 md:grid">
                                {listing.images.slice(1, 5).map((image) => (
                                    <img
                                        key={image.id}
                                        src={mediaUrl(image.storageKey)}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        className="size-full object-cover"
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {listing.images.length > 1 ? (
                        <details className="mt-4 rounded-2xl border border-line p-4">
                            <summary className="cursor-pointer font-semibold">
                                {t.allPhotos} ({listing.images.length})
                            </summary>
                            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                {listing.images.map((image) => (
                                    <a key={image.id} href={mediaUrl(image.storageKey)} target="_blank" rel="noopener noreferrer">
                                        <img src={mediaUrl(image.storageKey)} alt={title} loading="lazy"
                                            className="aspect-4/3 w-full rounded-xl object-cover" />
                                    </a>
                                ))}
                            </div>
                        </details>
                    ) : null}
                    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
                        <article>
                            <p className="text-sm font-semibold uppercase tracking-wider text-brand">
                                {listing.purpose === "SALE"
                                    ? t.forSale
                                    : t.forRent}
                            </p>
                            <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-brand-dark">
                                <Info size={16} /> {t.aggregatedBadge}
                            </p>
                            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                                {title}
                            </h1>
                            <p className="mt-4 flex items-center gap-2 text-lg text-muted">
                                <MapPin size={19} className="text-brand" />{" "}
                                {listing.postcode} {listing.city}
                            </p>
                            <p className="mt-5 text-3xl font-semibold">
                                {formatPrice(price, locale)}
                                {listing.purpose === "RENT"
                                    ? " / maand"
                                    : " k.k."}
                            </p>
                            {!isAvailable ? (
                                <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-stone-200 px-3 py-1.5 text-sm font-semibold text-stone-700 dark:bg-white/10 dark:text-stone-200">
                                    <Clock3 size={16} />{" "}
                                    {listing.status === "EXPIRED"
                                        ? t.statusExpired
                                        : t.statusOffline}
                                </p>
                            ) : null}
                            <div className="mt-8 grid grid-cols-2 gap-3 border-y border-line py-6 sm:grid-cols-4">
                                <Stat
                                    icon={Ruler}
                                    value={`${listing.livingAreaSqm ?? "—"} m²`}
                                    label={t.living}
                                />
                                <Stat
                                    icon={DoorOpen}
                                    value={String(listing.roomCount ?? "—")}
                                    label={t.rooms}
                                />
                                <Stat
                                    icon={BedDouble}
                                    value={String(listing.bedroomCount ?? "—")}
                                    label={t.bedrooms}
                                />
                                <Stat
                                    icon={Calendar}
                                    value={String(
                                        listing.constructionYear ?? "—",
                                    )}
                                    label={t.built}
                                />
                            </div>
                            {listing.energyLabel ? (
                                <div className="mt-7 flex items-center gap-4 rounded-2xl bg-background p-5">
                                    <span className="grid size-12 place-items-center rounded-xl bg-brand text-lg font-bold text-white">
                                        {energyNames[listing.energyLabel] ?? listing.energyLabel}
                                    </span>
                                    <p className="font-semibold">
                                        {t.energy} {energyNames[listing.energyLabel] ?? listing.energyLabel}
                                    </p>
                                </div>
                            ) : null}
                            {listing.descriptionNl ? (
                                <>
                                    <h2 className="mt-10 text-2xl font-semibold">
                                        {t.about}
                                    </h2>
                                    <div className="mt-4 whitespace-pre-line text-base leading-8 text-foreground/80">
                                        {listing.descriptionNl}
                                    </div>
                                </>
                            ) : null}
                            <AggregatedPropertyDetails listing={listing} language={language} />
                            {neighborhood}
                        </article>
                        <aside className="h-fit lg:sticky lg:top-6">
                            <div className="mb-4 rounded-3xl bg-accent p-6 text-brand-dark">
                                <Info size={24} />
                                <h2 className="mt-4 text-xl font-semibold">
                                    {t.aggregatedBadge}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-brand-dark/70">
                                    {t.offPlatform}
                                </p>
                            </div>
                            {activeLinks.length > 0 ? (
                                <div className="rounded-3xl border border-line bg-background p-6">
                                    <h2 className="text-lg font-semibold">
                                        {t.viewOn}
                                    </h2>
                                    <div className="mt-4 flex flex-col gap-3">
                                        {activeLinks.map((link) => {
                                            const meta =
                                                platformMeta[link.source];
                                            return (
                                                <a
                                                    key={link.id}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer nofollow"
                                                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white"
                                                    style={{
                                                        backgroundColor:
                                                            meta.color,
                                                    }}
                                                >
                                                    <BadgeCheck size={17} />
                                                    {link.source === "FUNDA"
                                                        ? t.viewOnFunda
                                                        : t.viewOnKamernet}
                                                    <ExternalLink size={15} />
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}
                        </aside>
                    </div>
                    <PropertyLocation
                        latitude={listing.latitude}
                        longitude={listing.longitude}
                        address={fullAddress}
                        language={language}
                    />
                </div>
            </main>
        </div>
    );
}

function Stat({
    icon: Icon,
    value,
    label,
}: {
    icon: typeof Ruler;
    value: string;
    label: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand">
                <Icon size={18} />
            </span>
            <div>
                <p className="font-semibold">{value}</p>
                <p className="text-xs text-muted">{label}</p>
            </div>
        </div>
    );
}

export function AggregatedPropertyDetails({ listing, language }: {
    listing: AggregatedListingView;
    language: "nl" | "en";
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const details = mapAggregatedPropertyDetails(listing.interior, listing.amenities);
    const measurement = (value: number | null, unit: string) => value === null ? null
        : `${new Intl.NumberFormat(locale).format(value)} ${unit}`;
    const optionName = (options: readonly { value: string; label: string }[], value: string | null) => {
        const label = options.find(option => option.value === value)?.label;
        return label ? translateListingCopy(language, label) : null;
    };
    const serviceCosts = listing.serviceCostsCents ?? details.serviceCostsCents?.toString() ?? null;
    const isFunda = listing.platformLinks.some(link => link.source === "FUNDA");
    const rentalFact = (key: string) => {
        if (isFunda || !listing.interior || typeof listing.interior !== "object"
            || Array.isArray(listing.interior)) return null;
        const value = listing.interior[key];
        return typeof value === "string" ? value : null;
    };
    const amenities = isFunda ? details.amenities.map(value =>
        optionName(propertyAmenityOptions, value)!,
    ) : listing.amenities;
    return (
        <section className="mt-10">
            <h2 className="text-2xl font-semibold">{t.details}</h2>
            <div className="mt-5 divide-y divide-line border-y border-line">
                <DetailGroup icon={Home} title={t.general} items={[
                    [t.address, aggregatedAddress(listing)],
                    [t.propertyType, propertyTypeNames[language][
                        listing.propertyType as keyof typeof propertyTypeNames.nl
                    ] ?? listing.propertyType],
                    [t.built, listing.constructionYear],
                    [t.municipality, listing.municipality],
                    [t.province, listing.province],
                    [t.leasehold, optionName(erfpachtOptions, details.erfpachtType)],
                    [t.serviceCosts, serviceCosts === null ? null : formatPrice(serviceCosts, locale)],
                    [t.availableFrom, formatDate(listing.availableFrom, locale)],
                    ...(!isFunda ? ["Borg", "Bemiddelingskosten", "Extra internetkosten",
                        "Beschikbaar tot", "Aantal huurders", "Inclusief vaste lasten",
                        "Huisdieren toegestaan", "Roken toegestaan", "Inschrijving mogelijk",
                    ].map(label => [translateListingCopy(language, label), rentalFact(label)] as const) : []),
                ]} />
                <DetailGroup icon={Ruler} title={t.dimensions} items={[
                    [t.living, measurement(listing.livingAreaSqm, "m²")],
                    [t.plotArea, measurement(listing.plotAreaSqm, "m²")],
                    [t.volume, measurement(listing.volumeCubicMeters, "m³")],
                    [t.externalStorage, measurement(details.externalStorageAreaSqm, "m²")],
                ]} />
                <DetailGroup icon={Layers3} title={t.layout} items={[
                    [t.rooms, listing.roomCount],
                    [t.bedrooms, listing.bedroomCount],
                    [t.bathrooms, listing.bathroomCount],
                    [t.floors, details.floorCount],
                    [t.roof, optionName(roofTypeOptions, details.roofType)],
                    [translateListingCopy(language, "Inrichting"), rentalFact("Inrichting")],
                    [t.garden, details.garden ? language === "nl" ? "Ja" : "Yes" : null],
                    [t.gardenOrientation, details.garden?.orientation
                        ? translateListingCopy(language, gardenOrientationLabels[details.garden.orientation]) : null],
                ]} />
                <DetailTags icon={Check} title={t.amenities} values={amenities} />
                <DetailTags icon={CircleParking} title={t.parking} values={details.parkingOptions.map(value =>
                    optionName(parkingOptions, value)!,
                )} />
            </div>
        </section>
    );
}
