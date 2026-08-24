import Link from "next/link";
import {
    BadgeCheck,
    BedDouble,
    Building2,
    Calendar,
    Clock3,
    DoorOpen,
    ExternalLink,
    Info,
    Languages,
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
    propertyType: string;
    livingAreaSqm: number | null;
    plotAreaSqm: number | null;
    roomCount: number | null;
    bedroomCount: number | null;
    bathroomCount: number | null;
    constructionYear: number | null;
    energyLabel: string | null;
    amenities: string[];
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
}: {
    listing: AggregatedListingView;
    language: "nl" | "en";
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const title = listing.titleNl || `${listing.street} ${listing.houseNumber}`;
    const price =
        listing.purpose === "SALE"
            ? listing.askingPriceCents
            : listing.monthlyRentCents;
    const fullAddress = `${listing.street} ${listing.houseNumber}${listing.houseNumberAddition ? ` ${listing.houseNumberAddition}` : ""}, ${listing.postcode ?? ""} ${listing.city}`;
    const activeLinks = listing.platformLinks.filter(
        (link) => link.status === "ACTIVE",
    );
    const isAvailable = listing.status === "ACTIVE";

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b border-line bg-background/92 backdrop-blur-xl">
                <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 font-semibold"
                    >
                        <span className="grid size-9 place-items-center rounded-xl bg-brand text-white">
                            <Building2 size={19} />
                        </span>
                        <span className="text-lg">
                            Zelf<span className="text-brand">Wonen</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/zoeken"
                            className="hidden rounded-full px-4 py-2 text-sm font-semibold text-brand sm:inline-flex"
                        >
                            {t.backToSearch}
                        </Link>
                        <Link
                            href={`?lang=${language === "nl" ? "en" : "nl"}`}
                            className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold"
                        >
                            <Languages size={16} />{" "}
                            {language === "nl" ? "English" : "Nederlands"}
                        </Link>
                    </div>
                </div>
            </header>
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
                            <section className="mt-10">
                                <h2 className="text-2xl font-semibold">
                                    {t.details}
                                </h2>
                                <dl className="mt-5 divide-y divide-line border-y border-line">
                                    <Detail
                                        label={t.address}
                                        value={fullAddress}
                                    />
                                    <Detail
                                        label={t.propertyType}
                                        value={
                                            propertyTypeNames[language][
                                                listing.propertyType as keyof (typeof propertyTypeNames)["nl"]
                                            ] ?? listing.propertyType
                                        }
                                    />
                                    <Detail
                                        label={t.municipality}
                                        value={listing.municipality}
                                    />
                                    <Detail
                                        label={t.living}
                                        value={
                                            listing.livingAreaSqm
                                                ? `${listing.livingAreaSqm} m²`
                                                : null
                                        }
                                    />
                                    <Detail
                                        label={t.plotArea}
                                        value={
                                            listing.plotAreaSqm
                                                ? `${listing.plotAreaSqm} m²`
                                                : null
                                        }
                                    />
                                    {listing.energyLabel ? (
                                        <Detail
                                            label={t.energy}
                                            value={
                                                energyNames[
                                                    listing.energyLabel
                                                ] ?? listing.energyLabel
                                            }
                                        />
                                    ) : null}
                                    {listing.serviceCostsCents ? (
                                        <Detail
                                            label={t.serviceCosts}
                                            value={formatPrice(
                                                listing.serviceCostsCents,
                                                locale,
                                            )}
                                        />
                                    ) : null}
                                    <Detail
                                        label={t.availableFrom}
                                        value={formatDate(
                                            listing.availableFrom,
                                            locale,
                                        )}
                                    />
                                </dl>
                                {listing.amenities.length > 0 ? (
                                    <div className="mt-6 flex flex-wrap gap-2">
                                        {listing.amenities.map((amenity) => (
                                            <span
                                                key={amenity}
                                                className="rounded-full border border-line px-3 py-1 text-sm"
                                            >
                                                {amenity}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </section>
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

function Detail({
    label,
    value,
}: {
    label: string;
    value: string | null | undefined;
}) {
    if (!value) return null;
    return (
        <div className="grid gap-2 py-4 sm:grid-cols-[220px_1fr]">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
        </div>
    );
}
