import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
    BedDouble,
    BusFront,
    Building2,
    Calendar,
    Check,
    CircleParking,
    Clock3,
    Download,
    DoorOpen,
    FileText,
    GraduationCap,
    Home,
    Landmark,
    Layers3,
    Languages,
    MapPin,
    Ruler,
    ShieldCheck,
    ShoppingBasket,
    TrainFront,
    UserRoundCheck,
    UsersRound,
    Zap,
} from "lucide-react";
import { BidForm } from "@/components/bidding/bid-form";
import { PropertyLocation } from "@/components/listing/property-location";
import { ViewingBooking } from "@/components/viewings/viewing-booking";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
    parkingOptions,
    propertyAmenityOptions,
    roofTypeOptions,
} from "@/lib/property-options";
import { listingAttributesSchema } from "@/lib/schemas/listing";

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
        movableItems: "Lijst van zaken",
        movableItemsText:
            "Bekijk welke roerende zaken achterblijven, meegaan of ter overname worden aangeboden.",
        generatedList: "Download lijst van zaken (PDF)",
        uploadedList: "Download roerende-zakenlijst",
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
        accountRequired: "Account vereist",
        accountRequiredText:
            "Maak een account aan of log in om een bezichtiging te boeken of contact op te nemen met de verkoper. Je e-mailadres moet geverifieerd zijn.",
        verifyEmail: "Verifieer je e-mailadres",
        verifyEmailText:
            "Verifieer eerst je e-mailadres om een bezichtiging te boeken of contact op te nemen met de verkoper.",
        accountLink: "Account aanmaken of inloggen",
        viewingRequired: "Bezichtiging vereist voor bieden",
        viewingRequiredText:
            "Boek eerst een bezichtiging. Nadat de verkoper heeft bevestigd dat deze heeft plaatsgevonden, kun je tijdens de biedperiode een bod uitbrengen.",
        ownListing: "Dit is jouw advertentie",
        ownListingText:
            "Je kunt hetzelfde account gebruiken om andere woningen te zoeken en erop te bieden. Beheer bezichtigingen en biedingen voor deze woning via je dashboard.",
        dashboardLink: "Naar dashboard",
        neighborhood: "Buurtinformatie",
        neighborhoodIntro:
            "Openbare gebiedscijfers bij deze woning. Cijfers kunnen door afronding of privacyregels ontbreken.",
        residents: "Inwoners",
        populationDensity: "Bevolkingsdichtheid",
        residentsPerKm2: "inwoners per km²",
        densityScore: "Dichtheidsscore",
        densityLevels: [
            "Zeer rustig bevolkt",
            "Rustig bevolkt",
            "Rond het Nederlands gemiddelde",
            "Dichtbevolkt",
            "Zeer dichtbevolkt",
        ],
        nationalAverage: "Nederlands gemiddelde",
        timesNationalAverage: "keer het Nederlands gemiddelde",
        ageStructure: "Leeftijdsopbouw",
        youngerPopulation: "Jongere bevolking dan Nederland",
        similarAgePopulation: "Leeftijdsopbouw rond het Nederlands gemiddelde",
        olderPopulation: "Oudere bevolking dan Nederland",
        ageComparisonNote:
            "Vergelijking op basis van het aandeel inwoners jonger dan 45 jaar. De markering NL toont het Nederlands gemiddelde per leeftijdsgroep.",
        corporationHousing: "In bezit van woningcorporaties",
        corporationHousingNote:
            "Dit is het aandeel woningen in bezit van woningcorporaties. Een hoog aandeel kan wijzen op relatief veel huurwoningen en sociale huur, maar is niet gelijk aan het exacte aandeel sociale huurwoningen.",
        registeredCrime: "Geregistreerde misdrijven",
        crimeScope: "per 1.000 inwoners, op gemeenteniveau",
        lowerThanNetherlands: "lager dan Nederland",
        higherThanNetherlands: "hoger dan Nederland",
        aroundNetherlands: "rond het Nederlands gemiddelde",
        percentagePoints: "procentpunt",
        comparisonMethod:
            "Groen is gunstiger, rood vraagt aandacht en blauw is een neutrale vergelijking. Dichtheid en leeftijd zijn indicaties, geen kwaliteitsoordeel.",
        nearbyFacilities: "Voorzieningen in de buurt",
        supermarket: "Grote supermarkt",
        primarySchool: "Basisschool",
        daycare: "Kinderdagverblijf",
        generalPractice: "Huisartsenpraktijk",
        busStop: "Bushalte",
        tramStop: "Tramhalte",
        metroStation: "Metrostation",
        trainStation: "Treinstation",
        averageRoadDistance: "gemiddelde afstand over de weg in de buurt",
        straightLineDistance: "hemelsbreed vanaf de woning",
        withinOneKm: "binnen 1 km",
        withinThreeKm: "binnen 3 km",
        sources: "Bronnen en peildata",
        cbsSource: "CBS Kerncijfers wijken en buurten",
        crimeSource: "CBS Geregistreerde criminaliteit",
        osmSource: "OpenStreetMap-bijdragers",
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
        movableItems: "Movable items list",
        movableItemsText:
            "See which movable items remain, are removed, or are offered for takeover.",
        generatedList: "Download movable items list (PDF)",
        uploadedList: "Download uploaded movable items list",
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
        accountRequired: "Account required",
        accountRequiredText:
            "Create an account or sign in to book a viewing or contact the seller. Your email address must be verified.",
        verifyEmail: "Verify your email address",
        verifyEmailText:
            "Verify your email address before booking a viewing or contacting the seller.",
        accountLink: "Create account or sign in",
        viewingRequired: "Viewing required before bidding",
        viewingRequiredText:
            "Book a viewing first. Once the seller confirms it took place, you can bid during the bidding period.",
        ownListing: "This is your listing",
        ownListingText:
            "You can use this same account to search and bid elsewhere. Manage viewings and bids for this home from your dashboard.",
        dashboardLink: "Go to dashboard",
        neighborhood: "Neighborhood information",
        neighborhoodIntro:
            "Public area statistics for this property. Values may be unavailable due to rounding or privacy rules.",
        residents: "Residents",
        populationDensity: "Population density",
        residentsPerKm2: "residents per km²",
        densityScore: "Density score",
        densityLevels: [
            "Very sparsely populated",
            "Sparsely populated",
            "Around the Dutch average",
            "Densely populated",
            "Very densely populated",
        ],
        nationalAverage: "Dutch average",
        timesNationalAverage: "times the Dutch average",
        ageStructure: "Age structure",
        youngerPopulation: "Younger population than the Netherlands",
        similarAgePopulation: "Age structure around the Dutch average",
        olderPopulation: "Older population than the Netherlands",
        ageComparisonNote:
            "Comparison based on the share of residents under 45. The NL marker shows the Dutch average for each age group.",
        corporationHousing: "Owned by housing corporations",
        corporationHousingNote:
            "This is the share of homes owned by housing corporations. A high share may indicate relatively many rental and social-rent homes, but it is not the exact social-rent share.",
        registeredCrime: "Registered crimes",
        crimeScope: "per 1,000 residents, at municipality level",
        lowerThanNetherlands: "lower than the Netherlands",
        higherThanNetherlands: "higher than the Netherlands",
        aroundNetherlands: "around the Dutch average",
        percentagePoints: "percentage points",
        comparisonMethod:
            "Green is more favorable, red calls for attention, and blue is a neutral comparison. Density and age are indicators, not quality judgments.",
        nearbyFacilities: "Nearby facilities",
        supermarket: "Large supermarket",
        primarySchool: "Primary school",
        daycare: "Daycare",
        generalPractice: "General practice",
        busStop: "Bus stop",
        tramStop: "Tram stop",
        metroStation: "Metro station",
        trainStation: "Train station",
        averageRoadDistance: "average road distance in the neighborhood",
        straightLineDistance: "straight-line distance from the property",
        withinOneKm: "within 1 km",
        withinThreeKm: "within 3 km",
        sources: "Sources and reference dates",
        cbsSource: "Statistics Netherlands neighborhood figures",
        crimeSource: "Statistics Netherlands registered crime",
        osmSource: "OpenStreetMap contributors",
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
                    neighborhoodProfile: true,
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
    const movableItemsDocuments = listing.media.filter(
        (item) =>
            item.kind === "DOCUMENT" && item.altTextNl === "Lijst van zaken",
    );
    const parsedAttributes = listingAttributesSchema.safeParse(
        listing.attributes ?? {},
    );
    const movableItems = parsedAttributes.success
        ? parsedAttributes.data.movableItems
        : [];
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
    const session = await auth.api.getSession({ headers: await headers() });
    const isOwner = session?.user.id === listing.ownerId;
    const canInteract = Boolean(session?.user.emailVerified) && !isOwner;
    const confirmedViewing = canInteract
        ? await db.viewingBooking.findFirst({
              where: {
                  userId: session!.user.id,
                  attendanceStatus: "CONFIRMED",
                  slot: { listingId: listing.id },
              },
              select: { id: true },
          })
        : null;

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
                            {listing.property.neighborhoodProfile ? (
                                <NeighborhoodDetails
                                    profile={
                                        listing.property.neighborhoodProfile
                                    }
                                    municipality={
                                        listing.property.municipality ??
                                        listing.property.city
                                    }
                                    language={language}
                                />
                            ) : null}
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
                            {movableItems.length > 0 ||
                            movableItemsDocuments.length > 0 ? (
                                <section className="mt-10 border-t border-line pt-8">
                                    <div className="flex items-start gap-3">
                                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-dark">
                                            <FileText size={19} />
                                        </span>
                                        <div>
                                            <h2 className="text-2xl font-semibold">
                                                {t.movableItems}
                                            </h2>
                                            <p className="mt-2 text-sm leading-6 text-muted">
                                                {t.movableItemsText}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-5 flex flex-wrap gap-3">
                                        {movableItems.length > 0 ? (
                                            <a
                                                href={`/api/listings/${listing.id}/movable-items-pdf`}
                                                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white"
                                            >
                                                <Download size={17} />
                                                {t.generatedList}
                                            </a>
                                        ) : null}
                                        {movableItemsDocuments.map(
                                            (document, index) => (
                                                <a
                                                    key={document.id}
                                                    href={`/${document.storageKey}`}
                                                    download
                                                    className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-semibold text-brand"
                                                >
                                                    <Download size={17} />
                                                    {t.uploadedList}
                                                    {movableItemsDocuments.length >
                                                    1
                                                        ? ` ${index + 1}`
                                                        : ""}
                                                </a>
                                            ),
                                        )}
                                    </div>
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
                            {!session ? (
                                <InteractionNotice
                                    title={t.accountRequired}
                                    text={t.accountRequiredText}
                                    linkLabel={t.accountLink}
                                    href="/"
                                />
                            ) : !session.user.emailVerified ? (
                                <InteractionNotice
                                    title={t.verifyEmail}
                                    text={t.verifyEmailText}
                                    linkLabel={t.accountLink}
                                    href="/"
                                />
                            ) : isOwner ? (
                                <InteractionNotice
                                    title={t.ownListing}
                                    text={t.ownListingText}
                                    linkLabel={t.dashboardLink}
                                    href="/dashboard"
                                />
                            ) : null}
                            {canInteract &&
                            listing.status === "LIVE" &&
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
                                confirmedViewing ? (
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
                                ) : canInteract ? (
                                    <InteractionNotice
                                        title={t.viewingRequired}
                                        text={t.viewingRequiredText}
                                    />
                                ) : null
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
                    <PropertyLocation
                        latitude={
                            listing.property.latitude !== null
                                ? Number(listing.property.latitude)
                                : null
                        }
                        longitude={
                            listing.property.longitude !== null
                                ? Number(listing.property.longitude)
                                : null
                        }
                        address={fullAddress}
                        language={language}
                    />
                </div>
            </main>
        </div>
    );
}

function InteractionNotice({
    title,
    text,
    linkLabel,
    href,
}: {
    title: string;
    text: string;
    linkLabel?: string;
    href?: string;
}) {
    return (
        <div className="mb-4 border border-line bg-background p-6">
            <UserRoundCheck size={24} className="text-brand" />
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
            {href && linkLabel ? (
                <Link
                    href={href}
                    className="mt-4 inline-flex h-10 items-center bg-brand px-4 text-sm font-semibold text-white"
                >
                    {linkLabel}
                </Link>
            ) : null}
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

type NumericValue = { toString(): string } | null;

type NeighborhoodProfileView = {
    neighborhoodName: string;
    districtName: string | null;
    statisticsYear: number;
    population: number | null;
    populationDensityPerKm2: number | null;
    nationalPopulationDensityPerKm2: number | null;
    age0To14Percent: NumericValue;
    age15To24Percent: NumericValue;
    age25To44Percent: NumericValue;
    age45To64Percent: NumericValue;
    age65PlusPercent: NumericValue;
    nationalAge0To14Percent: NumericValue;
    nationalAge15To24Percent: NumericValue;
    nationalAge25To44Percent: NumericValue;
    nationalAge45To64Percent: NumericValue;
    nationalAge65PlusPercent: NumericValue;
    housingCorporationPercent: NumericValue;
    nationalHousingCorporationPercent: NumericValue;
    registeredCrimesPer1000: NumericValue;
    nationalRegisteredCrimesPer1000: NumericValue;
    crimeStatisticsYear: number | null;
    supermarketDistanceKm: NumericValue;
    primarySchoolDistanceKm: NumericValue;
    daycareDistanceKm: NumericValue;
    generalPracticeDistanceKm: NumericValue;
    primarySchoolsWithin3Km: NumericValue;
    supermarketsWithin1Km: number | null;
    schoolsWithin1Km: number | null;
    busStopDistanceMeters: number | null;
    tramStopDistanceMeters: number | null;
    metroStationDistanceMeters: number | null;
    trainStationDistanceMeters: number | null;
    cbsSourceUrl: string;
    crimeSourceUrl: string | null;
    osmSourceUrl: string | null;
    osmRetrievedAt: Date | null;
};

function NeighborhoodDetails({
    profile,
    municipality,
    language,
}: {
    profile: NeighborhoodProfileView;
    municipality: string;
    language: "nl" | "en";
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const ages = [
        ["0-14", profile.age0To14Percent, profile.nationalAge0To14Percent],
        ["15-24", profile.age15To24Percent, profile.nationalAge15To24Percent],
        ["25-44", profile.age25To44Percent, profile.nationalAge25To44Percent],
        ["45-64", profile.age45To64Percent, profile.nationalAge45To64Percent],
        ["65+", profile.age65PlusPercent, profile.nationalAge65PlusPercent],
    ] as const;
    const densityComparison = getDensityComparison(
        profile.populationDensityPerKm2,
        profile.nationalPopulationDensityPerKm2,
        t,
        locale,
    );
    const housingComparison = getDifferenceComparison(
        profile.housingCorporationPercent,
        profile.nationalHousingCorporationPercent,
        t,
        locale,
        "percentagePoints",
    );
    const crimeComparison = getDifferenceComparison(
        profile.registeredCrimesPer1000,
        profile.nationalRegisteredCrimesPer1000,
        t,
        locale,
        "percent",
    );
    const ageComparison = getAgeComparison(profile, t);
    const facilities = [
        {
            icon: ShoppingBasket,
            label: t.supermarket,
            distance: formatKilometers(profile.supermarketDistanceKm, locale),
            detail:
                profile.supermarketsWithin1Km === null
                    ? null
                    : `${profile.supermarketsWithin1Km} ${t.withinOneKm}`,
            method: t.averageRoadDistance,
        },
        {
            icon: GraduationCap,
            label: t.primarySchool,
            distance: formatKilometers(profile.primarySchoolDistanceKm, locale),
            detail:
                profile.primarySchoolsWithin3Km === null
                    ? profile.schoolsWithin1Km === null
                        ? null
                        : `${profile.schoolsWithin1Km} ${t.withinOneKm}`
                    : `${formatNumber(profile.primarySchoolsWithin3Km, locale)} ${t.withinThreeKm}`,
            method: t.averageRoadDistance,
        },
        {
            icon: UsersRound,
            label: t.daycare,
            distance: formatKilometers(profile.daycareDistanceKm, locale),
            detail: null,
            method: t.averageRoadDistance,
        },
        {
            icon: Home,
            label: t.generalPractice,
            distance: formatKilometers(
                profile.generalPracticeDistanceKm,
                locale,
            ),
            detail: null,
            method: t.averageRoadDistance,
        },
        {
            icon: BusFront,
            label: t.busStop,
            distance: formatMeters(profile.busStopDistanceMeters, locale),
            detail: null,
            method: t.straightLineDistance,
        },
        {
            icon: TrainFront,
            label: t.tramStop,
            distance: formatMeters(profile.tramStopDistanceMeters, locale),
            detail: null,
            method: t.straightLineDistance,
        },
        {
            icon: TrainFront,
            label: t.metroStation,
            distance: formatMeters(profile.metroStationDistanceMeters, locale),
            detail: null,
            method: t.straightLineDistance,
        },
        {
            icon: TrainFront,
            label: t.trainStation,
            distance: formatMeters(profile.trainStationDistanceMeters, locale),
            detail: null,
            method: t.straightLineDistance,
        },
    ].filter((facility) => facility.distance !== null);

    return (
        <section className="mt-10 border-y border-line py-8">
            <p className="text-sm font-semibold uppercase text-brand">
                {profile.neighborhoodName}
                {profile.districtName ? ` · ${profile.districtName}` : ""}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{t.neighborhood}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {t.neighborhoodIntro}
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
                <div>
                    <p className="text-xs font-semibold text-muted">
                        {t.residents} · {profile.statisticsYear}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">
                        {profile.population === null
                            ? "—"
                            : new Intl.NumberFormat(locale).format(
                                  profile.population,
                              )}
                    </p>
                </div>
                <div>
                    <p className="text-xs font-semibold text-muted">
                        {t.populationDensity} · {profile.statisticsYear}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">
                        {profile.populationDensityPerKm2 === null
                            ? "—"
                            : new Intl.NumberFormat(locale).format(
                                  profile.populationDensityPerKm2,
                              )}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                        {t.residentsPerKm2}
                    </p>
                    {densityComparison ? (
                        <ComparisonBadge comparison={densityComparison} />
                    ) : null}
                </div>
                <div>
                    <p className="text-xs font-semibold text-muted">
                        {t.corporationHousing} · {profile.statisticsYear}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">
                        {formatPercent(
                            profile.housingCorporationPercent,
                            locale,
                        ) ?? "—"}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted">
                        {t.corporationHousingNote}
                    </p>
                    {housingComparison ? (
                        <ComparisonBadge comparison={housingComparison} />
                    ) : null}
                </div>
            </div>
            {ages.some(([, value]) => value !== null) ? (
                <div className="mt-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">{t.ageStructure}</h3>
                        {ageComparison ? (
                            <ComparisonBadge comparison={ageComparison} />
                        ) : null}
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-5">
                        {ages.map(([label, value, nationalValue]) => {
                            const percentage =
                                value === null ? null : Number(value);
                            const nationalPercentage =
                                nationalValue === null
                                    ? null
                                    : Number(nationalValue);
                            return (
                                <div key={label}>
                                    <div className="relative h-2 bg-background">
                                        <div
                                            className="h-full bg-brand"
                                            style={{
                                                width: `${Math.min(100, percentage ?? 0)}%`,
                                            }}
                                        />
                                        {nationalPercentage !== null ? (
                                            <span
                                                className="absolute -top-1 h-4 w-0.5 bg-stone-800"
                                                style={{
                                                    left: `${Math.min(100, nationalPercentage)}%`,
                                                }}
                                            />
                                        ) : null}
                                    </div>
                                    <p className="mt-2 text-sm font-semibold">
                                        {label}
                                    </p>
                                    <p className="mt-1 text-xs text-muted">
                                        {formatPercent(value, locale) ?? "—"}
                                    </p>
                                    {nationalValue !== null ? (
                                        <p className="mt-1 text-[10px] text-muted">
                                            NL {formatPercent(nationalValue, locale)}
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-4 text-xs leading-5 text-muted">
                        {t.ageComparisonNote}
                    </p>
                </div>
            ) : null}
            {profile.registeredCrimesPer1000 !== null ? (
                <div className="mt-8 bg-background p-5">
                    <div className="flex items-start gap-3">
                        <ShieldCheck size={20} className="mt-0.5 text-brand" />
                        <div>
                            <h3 className="font-semibold">
                                {t.registeredCrime}
                            </h3>
                            <p className="mt-2 text-lg font-semibold">
                                {formatNumber(
                                    profile.registeredCrimesPer1000,
                                    locale,
                                )}{" "}
                                {t.crimeScope}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                                {municipality}
                                {profile.crimeStatisticsYear
                                    ? ` · ${profile.crimeStatisticsYear}`
                                    : ""}
                            </p>
                            {crimeComparison ? (
                                <ComparisonBadge comparison={crimeComparison} />
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
            {facilities.length > 0 ? (
                <div className="mt-8">
                    <h3 className="font-semibold">{t.nearbyFacilities}</h3>
                    <div className="mt-4 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
                        {facilities.map((facility) => (
                            <div
                                key={facility.label}
                                className="flex items-start gap-3 bg-white p-4"
                            >
                                <facility.icon
                                    size={18}
                                    className="mt-0.5 shrink-0 text-brand"
                                />
                                <div>
                                    <p className="text-sm font-semibold">
                                        {facility.label}
                                    </p>
                                    <p className="mt-1 text-sm">
                                        {facility.distance}
                                    </p>
                                    <p className="mt-1 text-xs text-muted">
                                        {[facility.detail, facility.method]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
                <span className="font-semibold">{t.sources}:</span>
                <a
                    href={profile.cbsSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-line underline-offset-4"
                >
                    {t.cbsSource} ({profile.statisticsYear})
                </a>
                {profile.crimeSourceUrl && profile.crimeStatisticsYear ? (
                    <a
                        href={profile.crimeSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line underline-offset-4"
                    >
                        {t.crimeSource} ({profile.crimeStatisticsYear})
                    </a>
                ) : null}
                {profile.osmSourceUrl && profile.osmRetrievedAt ? (
                    <a
                        href={profile.osmSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line underline-offset-4"
                    >
                        {t.osmSource} (
                        {formatDate(profile.osmRetrievedAt, locale)})
                    </a>
                ) : null}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted">
                {t.comparisonMethod}
            </p>
        </section>
    );
}

type Comparison = {
    label: string;
    detail: string;
    tone: "good" | "neutral" | "attention" | "bad";
};

function ComparisonBadge({ comparison }: { comparison: Comparison }) {
    const toneClasses = {
        good: "bg-emerald-50 text-emerald-800",
        neutral: "bg-sky-50 text-sky-800",
        attention: "bg-amber-50 text-amber-900",
        bad: "bg-red-50 text-red-800",
    };
    return (
        <div
            className={`mt-3 inline-flex flex-wrap gap-x-2 px-3 py-2 text-xs ${toneClasses[comparison.tone]}`}
        >
            <span className="font-semibold">{comparison.label}</span>
            {comparison.detail ? <span>{comparison.detail}</span> : null}
        </div>
    );
}

function getDensityComparison(
    value: number | null,
    nationalValue: number | null,
    t: (typeof copy)["nl"],
    locale: string,
): Comparison | null {
    if (value === null || !nationalValue) return null;
    const ratio = value / nationalValue;
    const score = ratio < 0.5 ? 1 : ratio < 0.85 ? 2 : ratio <= 1.15 ? 3 : ratio <= 2 ? 4 : 5;
    const tones = ["good", "good", "neutral", "attention", "bad"] as const;
    return {
        label: `${t.densityScore} ${score}/5 · ${t.densityLevels[score - 1]}`,
        detail: `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ratio)} ${t.timesNationalAverage} (${new Intl.NumberFormat(locale).format(nationalValue)})`,
        tone: tones[score - 1],
    };
}

function getDifferenceComparison(
    value: NumericValue,
    nationalValue: NumericValue,
    t: (typeof copy)["nl"],
    locale: string,
    mode: "percentagePoints" | "percent",
): Comparison | null {
    if (value === null || nationalValue === null || Number(nationalValue) === 0) {
        return null;
    }
    const local = Number(value);
    const national = Number(nationalValue);
    const difference =
        mode === "percentagePoints"
            ? local - national
            : ((local - national) / national) * 100;
    const absoluteDifference = Math.abs(difference);
    const isSimilar = absoluteDifference < (mode === "percentagePoints" ? 5 : 15);
    const label = isSimilar
        ? t.aroundNetherlands
        : difference < 0
          ? t.lowerThanNetherlands
          : t.higherThanNetherlands;
    const nationalFormatted =
        mode === "percentagePoints"
            ? formatPercent(nationalValue, locale)
            : formatNumber(nationalValue, locale);
    return {
        label,
        detail: isSimilar
            ? `${t.nationalAverage}: ${nationalFormatted}`
            : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(absoluteDifference)}${mode === "percent" ? "%" : ` ${t.percentagePoints}`} · ${t.nationalAverage}: ${nationalFormatted}`,
        tone: isSimilar ? "neutral" : difference < 0 ? "good" : "bad",
    };
}

function getAgeComparison(
    profile: NeighborhoodProfileView,
    t: (typeof copy)["nl"],
): Comparison | null {
    const localValues = [
        profile.age0To14Percent,
        profile.age15To24Percent,
        profile.age25To44Percent,
    ];
    const nationalValues = [
        profile.nationalAge0To14Percent,
        profile.nationalAge15To24Percent,
        profile.nationalAge25To44Percent,
    ];
    if ([...localValues, ...nationalValues].some((value) => value === null)) {
        return null;
    }
    const localUnder45 = localValues.reduce<number>(
        (total, value) => total + Number(value),
        0,
    );
    const nationalUnder45 = nationalValues.reduce<number>(
        (total, value) => total + Number(value),
        0,
    );
    const difference = localUnder45 - nationalUnder45;
    if (Math.abs(difference) < 5) {
        return { label: t.similarAgePopulation, detail: "", tone: "good" };
    }
    return difference > 0
        ? { label: t.youngerPopulation, detail: "", tone: "neutral" }
        : { label: t.olderPopulation, detail: "", tone: "attention" };
}

function formatNumber(value: NumericValue, locale: string) {
    return value === null
        ? null
        : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
              Number(value),
          );
}

function formatPercent(value: NumericValue, locale: string) {
    const formatted = formatNumber(value, locale);
    return formatted === null ? null : `${formatted}%`;
}

function formatKilometers(value: NumericValue, locale: string) {
    const formatted = formatNumber(value, locale);
    return formatted === null ? null : `${formatted} km`;
}

function formatMeters(value: number | null, locale: string) {
    return value === null
        ? null
        : `${new Intl.NumberFormat(locale).format(value)} m`;
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
