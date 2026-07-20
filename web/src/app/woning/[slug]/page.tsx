import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
    BedDouble,
    Building2,
    Calendar,
    DoorOpen,
    Landmark,
    Languages,
    MapPin,
    Ruler,
    ShieldCheck,
    Zap,
} from "lucide-react";
import { BidForm } from "@/components/bidding/bid-form";
import { ViewingBooking } from "@/components/viewings/viewing-booking";
import { db } from "@/lib/db";

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
        floorplan: "Interactieve plattegrond",
        bid: "Bieden met vertrouwen",
        bidText:
            "Alle biedingen worden voorzien van tijdstip en voorwaarden en vastgelegd in een onveranderbare keten.",
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
        floorplan: "Interactive floor plan",
        bid: "Bid with confidence",
        bidText:
            "Every bid is timestamped with its conditions and recorded in an immutable chain.",
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
                where: { startsAt: { gt: new Date() } },
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
                                    </div>
                                </div>
                            ) : null}
                            <h2 className="mt-10 text-2xl font-semibold">
                                {t.about}
                            </h2>
                            <div className="mt-4 whitespace-pre-line text-base leading-8 text-foreground/80">
                                {description}
                            </div>
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
                            {listing.status === "LIVE" ? (
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
