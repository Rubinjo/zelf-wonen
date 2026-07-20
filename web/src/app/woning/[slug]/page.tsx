import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
    BedDouble,
    Building2,
    Calendar,
    Check,
    CircleParking,
    Clock3,
    DoorOpen,
    Home,
    Landmark,
    Layers3,
    Languages,
    MapPin,
    Ruler,
    ShieldCheck,
    Zap,
} from "lucide-react";
import { BidForm } from "@/components/bidding/bid-form";
import { ViewingBooking } from "@/components/viewings/viewing-booking";
import { db } from "@/lib/db";
import {
    parkingOptions,
    propertyAmenityOptions,
    roofTypeOptions,
} from "@/lib/property-options";

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

const englishAmenityNames: Record<string, string> = {
    SOLAR_PANELS: "Solar panels",
    AIR_CONDITIONING: "Air conditioning",
    FIBER_OPTIC: "Fiber optic internet",
    HEAT_PUMP: "Heat pump",
    EV_CHARGER: "EV charger",
    FIREPLACE: "Fireplace",
    MECHANICAL_VENTILATION: "Mechanical ventilation",
    ALARM_SYSTEM: "Alarm system",
};

const englishParkingNames: Record<string, string> = {
    ON_PROPERTY: "Parking on the property",
    FREE_STREET: "Free street parking",
    PAID_STREET: "Paid street parking",
    PARKING_PERMIT: "Parking permit",
    PUBLIC_GARAGE: "Public parking garage",
    PRIVATE_GARAGE: "Private garage",
    SPACE_FOR_SALE: "Parking space sold separately",
};

const englishRoofNames: Record<string, string> = {
    FLAT: "Flat roof",
    GABLE: "Gable roof",
    HIP: "Hip roof",
    MANSARD: "Mansard roof",
    SHED: "Shed roof",
    COMBINATION: "Combination roof",
    OTHER: "Other",
};

const copy = {
    nl: {
        forSale: "Te koop",
        forRent: "Te huur",
        rooms: "kamers",
        bedrooms: "slaapkamers",
        built: "Bouwjaar",
        living: "Woonoppervlak",
        energy: "Energielabel",
        monument: "Monumentaal pand",
        about: "Over deze woning",
        details: "Kenmerken",
        general: "Algemeen",
        dimensions: "Oppervlakten en inhoud",
        layout: "Indeling",
        amenities: "Voorzieningen",
        parking: "Parkeren",
        address: "Adres",
        propertyType: "Woningtype",
        municipality: "Gemeente",
        province: "Provincie",
        cadastralParcel: "Kadastraal perceel",
        landArea: "Perceeloppervlak",
        volume: "Inhoud",
        externalStorage: "Externe bergruimte",
        bathrooms: "Badkamers",
        floors: "Verdiepingen",
        roof: "Daktype",
        serviceCosts: "Servicekosten",
        availableFrom: "Beschikbaar vanaf",
        parkingPrice: "Prijs parkeerplaats",
        energyRegistered: "Geregistreerd op",
        energyValidUntil: "Geldig tot",
        viewingNotes: "Informatie over bezichtigingen",
        floorplan: "Interactieve plattegrond",
        bid: "Bieden met vertrouwen",
        bidText:
            "Alle biedingen worden voorzien van tijdstip en voorwaarden en vastgelegd in een onveranderbare keten.",
        biddingUpcoming: "De biedperiode is nog niet gestart",
        biddingUpcomingText: "Bieden is mogelijk vanaf",
        biddingClosed: "De biedperiode is gesloten",
        biddingClosedText: "De biedperiode eindigde op",
        biddingStarts: "Start biedperiode",
        biddingEnds: "Einde biedperiode",
    },
    en: {
        forSale: "For sale",
        forRent: "For rent",
        rooms: "rooms",
        bedrooms: "bedrooms",
        built: "Built",
        living: "Living area",
        energy: "Energy label",
        monument: "Listed monument",
        about: "About this property",
        details: "Property details",
        general: "General",
        dimensions: "Areas and volume",
        layout: "Layout",
        amenities: "Amenities",
        parking: "Parking",
        address: "Address",
        propertyType: "Property type",
        municipality: "Municipality",
        province: "Province",
        cadastralParcel: "Cadastral parcel",
        landArea: "Plot area",
        volume: "Volume",
        externalStorage: "External storage",
        bathrooms: "Bathrooms",
        floors: "Floors",
        roof: "Roof type",
        serviceCosts: "Service costs",
        availableFrom: "Available from",
        parkingPrice: "Parking space price",
        energyRegistered: "Registered on",
        energyValidUntil: "Valid until",
        viewingNotes: "Viewing information",
        floorplan: "Interactive floor plan",
        bid: "Bid with confidence",
        bidText:
            "Every bid is timestamped with its conditions and recorded in an immutable chain.",
        biddingUpcoming: "The bidding period has not started yet",
        biddingUpcomingText: "Bidding opens on",
        biddingClosed: "The bidding period is closed",
        biddingClosedText: "The bidding period ended on",
        biddingStarts: "Bidding starts",
        biddingEnds: "Bidding ends",
    },
};

export default async function PublicListingPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ lang?: string }>;
}) {
    const language = (await searchParams).lang === "en" ? "en" : "nl";
    const t = copy[language];
    const listing = await db.listing.findFirst({
        where: {
            publicSlug: (await params).slug,
            status: { in: ["LIVE", "UNDER_OFFER", "SOLD", "RENTED"] },
        },
        include: {
            property: {
                include: {
                    energyLabels: {
                        orderBy: { registeredAt: "desc" },
                        take: 1,
                    },
                },
            },
            media: {
                where: { status: "READY" },
                orderBy: { sortOrder: "asc" },
            },
            floorPlans: { orderBy: { sortOrder: "asc" } },
            viewingSlots: {
                where: {
                    startsAt: { gt: new Date() },
                    publishedAt: { lte: new Date() },
                },
                include: { _count: { select: { bookings: true } } },
                orderBy: { startsAt: "asc" },
            },
            bids: {
                orderBy: { amountCents: "desc" },
                take: 1,
                select: { amountCents: true },
            },
        },
    });
    if (!listing) notFound();
    const photos = listing.media.filter((item) => item.kind === "PHOTO");
    const floorPlanFiles = listing.media.filter(
        (item) => item.kind === "FLOOR_PLAN_STATIC",
    );
    const price =
        listing.purpose === "SALE"
            ? listing.askingPriceCents
            : listing.monthlyRentCents;
    const description =
        language === "en"
            ? listing.descriptionEn || listing.descriptionNl
            : listing.descriptionNl;
    const title =
        language === "en"
            ? listing.titleEn || listing.titleNl
            : listing.titleNl;
    const energy = listing.property.energyLabels[0];
    const now = new Date();
    const biddingState =
        listing.status !== "LIVE"
            ? "unavailable"
            : listing.bidWindowOpensAt && listing.bidWindowOpensAt > now
              ? "upcoming"
              : listing.bidWindowClosesAt && listing.bidWindowClosesAt <= now
                ? "closed"
                : "open";
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const fullAddress = `${listing.property.street} ${listing.property.houseNumber}${listing.property.houseNumberAddition ? ` ${listing.property.houseNumberAddition}` : ""}, ${listing.property.postcode} ${listing.property.city}`;
    const roofName = listing.property.roofType
        ? language === "en"
            ? englishRoofNames[listing.property.roofType]
            : roofTypeOptions.find(
                  (option) => option.value === listing.property.roofType,
              )?.label
        : null;
    const amenityNames = listing.property.amenities.map((amenity) =>
        language === "en"
            ? englishAmenityNames[amenity]
            : (propertyAmenityOptions.find((option) => option.value === amenity)
                  ?.label ?? amenity),
    );
    const selectedParkingNames = listing.property.parkingOptions.map(
        (parking) =>
            language === "en"
                ? englishParkingNames[parking]
                : (parkingOptions.find((option) => option.value === parking)
                      ?.label ?? parking),
    );
    const embed = safeFloorplannerUrl(
        listing.floorPlans.find((item) => item.mode === "FLOORPLANNER_EMBED")
            ?.embedUrl ?? null,
    );
    const viewingSlots = listing.viewingSlots
        .filter((slot) => slot._count.bookings < slot.capacity)
        .map((slot) => ({
            id: slot.id,
            type: slot.type,
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
            capacity: slot.capacity,
            bookedCount: slot._count.bookings,
        }));

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b border-line bg-white">
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
                            {language === "nl"
                                ? "Woning zoeken"
                                : "Find a home"}
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
                    {photos.length > 0 ? (
                        <div className="grid h-[55vh] min-h-96 gap-2 overflow-hidden rounded-4xl md:grid-cols-2">
                            <Image
                                src={`/${photos[0].storageKey}`}
                                alt={title ?? "Woning"}
                                width={1600}
                                height={1000}
                                priority
                                className="size-full object-cover"
                            />
                            <div className="hidden grid-cols-2 gap-2 md:grid">
                                {photos.slice(1, 5).map((photo) => (
                                    <Image
                                        key={photo.id}
                                        src={`/${photo.storageKey}`}
                                        alt=""
                                        width={800}
                                        height={500}
                                        className="size-full object-cover"
                                    />
                                ))}
                                {photos.length === 1 ? (
                                    <div className="col-span-2 grid size-full place-items-center bg-background text-brand/30">
                                        <Building2 size={60} />
                                    </div>
                                ) : null}
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
                            {listing.property.isMonument ? (
                                <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-background px-3 py-1.5 text-sm font-semibold text-brand">
                                    <Landmark size={16} /> {t.monument}
                                </p>
                            ) : null}
                            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                                {title ||
                                    `${listing.property.street} ${listing.property.houseNumber}`}
                            </h1>
                            <p className="mt-4 flex items-center gap-2 text-lg text-muted">
                                <MapPin size={19} className="text-brand" />{" "}
                                {listing.property.postcode}{" "}
                                {listing.property.city}
                            </p>
                            <p className="mt-5 text-3xl font-semibold">
                                {price
                                    ? new Intl.NumberFormat(
                                          language === "nl" ? "nl-NL" : "en-NL",
                                          {
                                              style: "currency",
                                              currency: "EUR",
                                              maximumFractionDigits: 0,
                                          },
                                      ).format(Number(price) / 100)
                                    : "—"}
                                {listing.purpose === "RENT"
                                    ? " / maand"
                                    : " k.k."}
                            </p>
                            <div className="mt-8 grid grid-cols-2 gap-3 border-y border-line py-6 sm:grid-cols-4">
                                <PropertyStat
                                    icon={Ruler}
                                    value={`${listing.property.livingAreaSqm ?? "—"} m²`}
                                    label={t.living}
                                />
                                <PropertyStat
                                    icon={DoorOpen}
                                    value={String(
                                        listing.property.roomCount ?? "—",
                                    )}
                                    label={t.rooms}
                                />
                                <PropertyStat
                                    icon={BedDouble}
                                    value={String(
                                        listing.property.bedroomCount ?? "—",
                                    )}
                                    label={t.bedrooms}
                                />
                                <PropertyStat
                                    icon={Calendar}
                                    value={String(
                                        listing.property.constructionYear ??
                                            "—",
                                    )}
                                    label={t.built}
                                />
                            </div>
                            {energy ? (
                                <div className="mt-7 flex items-center gap-4 rounded-2xl bg-background p-5">
                                    <span className="grid size-12 place-items-center rounded-xl bg-brand text-lg font-bold text-white">
                                        {energyNames[energy.labelClass]}
                                    </span>
                                    <div>
                                        <p className="font-semibold">
                                            {t.energy}{" "}
                                            {energyNames[energy.labelClass]}
                                        </p>
                                        {energy.primaryFossilEnergyKwhSqmYear ? (
                                            <p className="mt-1 text-xs text-muted">
                                                <Zap
                                                    size={12}
                                                    className="mr-1 inline"
                                                />
                                                {Number(
                                                    energy.primaryFossilEnergyKwhSqmYear,
                                                )}{" "}
                                                kWh/m² per jaar
                                            </p>
                                        ) : null}
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                                            {energy.registeredAt ? (
                                                <span>
                                                    {t.energyRegistered}:{" "}
                                                    {formatDate(
                                                        energy.registeredAt,
                                                        locale,
                                                    )}
                                                </span>
                                            ) : null}
                                            {energy.validUntil ? (
                                                <span>
                                                    {t.energyValidUntil}:{" "}
                                                    {formatDate(
                                                        energy.validUntil,
                                                        locale,
                                                    )}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            <h2 className="mt-10 text-2xl font-semibold">
                                {t.about}
                            </h2>
                            <div className="mt-4 whitespace-pre-line text-base leading-8 text-foreground/80">
                                {description}
                            </div>
                            <section className="mt-10">
                                <h2 className="text-2xl font-semibold">
                                    {t.details}
                                </h2>
                                <div className="mt-5 divide-y divide-line border-y border-line">
                                    <DetailGroup
                                        icon={Home}
                                        title={t.general}
                                        items={[
                                            [t.address, fullAddress],
                                            [
                                                t.propertyType,
                                                propertyTypeNames[language][
                                                    listing.property
                                                        .propertyType
                                                ],
                                            ],
                                            [
                                                t.built,
                                                listing.property
                                                    .constructionYear,
                                            ],
                                            [
                                                t.municipality,
                                                listing.property.municipality,
                                            ],
                                            [
                                                t.province,
                                                listing.property.province,
                                            ],
                                            [
                                                t.cadastralParcel,
                                                listing.property
                                                    .cadastralParcelId,
                                            ],
                                            [
                                                t.serviceCosts,
                                                listing.serviceCostsCents
                                                    ? `${formatMoney(listing.serviceCostsCents, locale)}${listing.purpose === "RENT" ? (language === "nl" ? " per maand" : " per month") : ""}`
                                                    : null,
                                            ],
                                            [
                                                t.availableFrom,
                                                listing.availableFrom
                                                    ? formatDate(
                                                          listing.availableFrom,
                                                          locale,
                                                      )
                                                    : null,
                                            ],
                                        ]}
                                    />
                                    <DetailGroup
                                        icon={Ruler}
                                        title={t.dimensions}
                                        items={[
                                            [
                                                t.living,
                                                formatMeasurement(
                                                    listing.property
                                                        .livingAreaSqm,
                                                    "m²",
                                                    locale,
                                                ),
                                            ],
                                            [
                                                t.landArea,
                                                formatMeasurement(
                                                    listing.property
                                                        .officialLandAreaSqm,
                                                    "m²",
                                                    locale,
                                                ),
                                            ],
                                            [
                                                t.volume,
                                                formatMeasurement(
                                                    listing.property
                                                        .volumeCubicMeters,
                                                    "m³",
                                                    locale,
                                                ),
                                            ],
                                            [
                                                t.externalStorage,
                                                formatMeasurement(
                                                    listing.property
                                                        .externalStorageAreaSqm,
                                                    "m²",
                                                    locale,
                                                ),
                                            ],
                                        ]}
                                    />
                                    <DetailGroup
                                        icon={Layers3}
                                        title={t.layout}
                                        items={[
                                            [
                                                t.rooms,
                                                listing.property.roomCount,
                                            ],
                                            [
                                                t.bedrooms,
                                                listing.property.bedroomCount,
                                            ],
                                            [
                                                t.bathrooms,
                                                listing.property.bathroomCount,
                                            ],
                                            [
                                                t.floors,
                                                listing.property.floorCount,
                                            ],
                                            [t.roof, roofName],
                                        ]}
                                    />
                                    <DetailTags
                                        icon={Check}
                                        title={t.amenities}
                                        values={amenityNames}
                                    />
                                    <DetailTags
                                        icon={CircleParking}
                                        title={t.parking}
                                        values={selectedParkingNames}
                                        extra={
                                            listing.property
                                                .parkingSpacePriceCents
                                                ? `${t.parkingPrice}: ${formatMoney(listing.property.parkingSpacePriceCents, locale)}`
                                                : null
                                        }
                                    />
                                </div>
                            </section>
                            {listing.viewingNotes ? (
                                <section className="mt-10 rounded-2xl bg-background p-6">
                                    <h2 className="font-semibold">
                                        {t.viewingNotes}
                                    </h2>
                                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-foreground/75">
                                        {listing.viewingNotes}
                                    </p>
                                </section>
                            ) : null}
                            {floorPlanFiles.length > 0 ? (
                                <div className="mt-10">
                                    <h2 className="text-2xl font-semibold">
                                        Plattegronden
                                    </h2>
                                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                        {floorPlanFiles.map((item) =>
                                            item.mimeType ===
                                            "application/pdf" ? (
                                                <a
                                                    key={item.id}
                                                    href={`/${item.storageKey}`}
                                                    target="_blank"
                                                    className="grid h-48 place-items-center rounded-2xl border border-line bg-background font-semibold text-brand"
                                                >
                                                    Open PDF-plattegrond
                                                </a>
                                            ) : (
                                                <Image
                                                    key={item.id}
                                                    src={`/${item.storageKey}`}
                                                    alt="Plattegrond"
                                                    width={1200}
                                                    height={900}
                                                    className="w-full rounded-2xl border border-line"
                                                />
                                            ),
                                        )}
                                    </div>
                                </div>
                            ) : null}
                            {embed ? (
                                <div className="mt-10">
                                    <h2 className="text-2xl font-semibold">
                                        {t.floorplan}
                                    </h2>
                                    <iframe
                                        src={embed}
                                        title={t.floorplan}
                                        loading="lazy"
                                        sandbox="allow-scripts allow-same-origin allow-popups"
                                        className="mt-5 h-140 w-full rounded-2xl border border-line"
                                    />
                                </div>
                            ) : null}
                        </article>
                        <aside className="h-fit lg:sticky lg:top-6">
                            {listing.status === "LIVE" &&
                            viewingSlots.length > 0 ? (
                                <div className="mb-4">
                                    <ViewingBooking
                                        slots={viewingSlots}
                                        language={language}
                                    />
                                </div>
                            ) : null}
                            <div className="mb-4 rounded-3xl bg-accent p-6 text-brand-dark">
                                <ShieldCheck size={24} />
                                <h2 className="mt-4 text-xl font-semibold">
                                    {t.bid}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-brand-dark/70">
                                    {t.bidText}
                                </p>
                            </div>
                            {biddingState === "open" ? (
                                <BidForm
                                    listingId={listing.id}
                                    biddingMethod={listing.biddingMethod}
                                    minimumBidCents={
                                        listing.minimumBidCents?.toString() ??
                                        null
                                    }
                                    bidIncrementCents={
                                        listing.bidIncrementCents?.toString() ??
                                        null
                                    }
                                    highestBidCents={
                                        listing.biddingMethod === "OPEN"
                                            ? (listing.bids[0]?.amountCents.toString() ??
                                              null)
                                            : null
                                    }
                                    allowBidConditions={
                                        listing.allowBidConditions
                                    }
                                    opensAt={
                                        listing.bidWindowOpensAt?.toISOString() ??
                                        null
                                    }
                                    closesAt={
                                        listing.bidWindowClosesAt?.toISOString() ??
                                        null
                                    }
                                />
                            ) : biddingState === "upcoming" ||
                              biddingState === "closed" ? (
                                <BidWindowStatus
                                    state={biddingState}
                                    opensAt={listing.bidWindowOpensAt}
                                    closesAt={listing.bidWindowClosesAt}
                                    language={language}
                                />
                            ) : (
                                <div className="rounded-3xl bg-background p-6">
                                    <p className="font-semibold">
                                        Deze woning is{" "}
                                        {listing.status === "UNDER_OFFER"
                                            ? "onder bod"
                                            : "niet meer beschikbaar"}
                                        .
                                    </p>
                                </div>
                            )}
                        </aside>
                    </div>
                </div>
            </main>
        </div>
    );
}

function DetailGroup({
    icon: Icon,
    title,
    items,
}: {
    icon: typeof Ruler;
    title: string;
    items: (readonly [string, string | number | null | undefined])[];
}) {
    const availableItems = items.filter(([, value]) => value !== null);
    if (availableItems.length === 0) return null;

    return (
        <div className="grid gap-5 py-6 sm:grid-cols-[180px_1fr]">
            <h3 className="flex items-center gap-2 font-semibold">
                <Icon size={18} className="text-brand" /> {title}
            </h3>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {availableItems.map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs font-semibold text-muted">
                            {label}
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                            {value ?? "—"}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function DetailTags({
    icon: Icon,
    title,
    values,
    extra,
}: {
    icon: typeof Ruler;
    title: string;
    values: string[];
    extra?: string | null;
}) {
    if (values.length === 0 && !extra) return null;

    return (
        <div className="grid gap-5 py-6 sm:grid-cols-[180px_1fr]">
            <h3 className="flex items-center gap-2 font-semibold">
                <Icon size={18} className="text-brand" /> {title}
            </h3>
            <div>
                <div className="flex flex-wrap gap-2">
                    {values.map((value) => (
                        <span
                            key={value}
                            className="rounded-md bg-background px-3 py-2 text-sm"
                        >
                            {value}
                        </span>
                    ))}
                </div>
                {extra ? (
                    <p className="mt-3 text-sm font-medium">{extra}</p>
                ) : null}
            </div>
        </div>
    );
}

function BidWindowStatus({
    state,
    opensAt,
    closesAt,
    language,
}: {
    state: "upcoming" | "closed";
    opensAt: Date | null;
    closesAt: Date | null;
    language: "nl" | "en";
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const relevantDate = state === "upcoming" ? opensAt : closesAt;

    return (
        <div className="rounded-3xl border border-line bg-white p-6 shadow-xl sm:p-7">
            <span className="grid size-11 place-items-center rounded-2xl bg-background text-brand">
                <Clock3 size={21} />
            </span>
            <h2 className="mt-5 text-xl font-semibold">
                {state === "upcoming" ? t.biddingUpcoming : t.biddingClosed}
            </h2>
            {relevantDate ? (
                <p className="mt-3 text-sm leading-6 text-muted">
                    {state === "upcoming"
                        ? t.biddingUpcomingText
                        : t.biddingClosedText}{" "}
                    <time dateTime={relevantDate.toISOString()}>
                        {formatDateTime(relevantDate, locale)}
                    </time>
                    .
                </p>
            ) : null}
            <dl className="mt-5 grid gap-3 border-t border-line pt-5 text-sm">
                {opensAt ? (
                    <div className="flex items-start justify-between gap-4">
                        <dt className="text-muted">{t.biddingStarts}</dt>
                        <dd className="text-right font-semibold">
                            {formatDateTime(opensAt, locale)}
                        </dd>
                    </div>
                ) : null}
                {closesAt ? (
                    <div className="flex items-start justify-between gap-4">
                        <dt className="text-muted">{t.biddingEnds}</dt>
                        <dd className="text-right font-semibold">
                            {formatDateTime(closesAt, locale)}
                        </dd>
                    </div>
                ) : null}
            </dl>
        </div>
    );
}

function PropertyStat({
    icon: Icon,
    value,
    label,
}: {
    icon: typeof Ruler;
    value: string;
    label: string;
}) {
    return (
        <div>
            <Icon size={18} className="text-brand" />
            <p className="mt-2 font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
        </div>
    );
}

function formatMeasurement(
    value: { toString(): string } | null,
    unit: string,
    locale: string,
) {
    if (value === null) return null;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value))} ${unit}`;
}

function formatMoney(value: bigint, locale: string) {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(value) / 100);
}

function formatDate(value: Date, locale: string) {
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Amsterdam",
    }).format(value);
}

function formatDateTime(value: Date, locale: string) {
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Amsterdam",
        timeZoneName: "short",
    }).format(value);
}
function safeFloorplannerUrl(value: string | null) {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" &&
            (url.hostname === "floorplanner.com" ||
                url.hostname.endsWith(".floorplanner.com"))
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}
