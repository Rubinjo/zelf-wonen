import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
    BadgeCheck,
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
    KeyRound,
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
import { ListingMessageLauncher } from "@/components/messages/listing-message-launcher";
import { ListingMessageThread } from "@/components/messages/listing-message-thread";
import { PropertyLocation } from "@/components/listing/property-location";
import { AggregatedListingDetail } from "@/components/listing/aggregated-listing-detail";
import { BrandLogo } from "@/components/platform/brand-logo";
import { ViewingBooking } from "@/components/viewings/viewing-booking";
import {
    gardenOrientationLabels,
    parsePropertyLayout,
} from "@/features/listings/garden";
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

const englishGardenOrientations: Record<string, string> = {
    N: "North",
    NE: "Northeast",
    E: "East",
    SE: "Southeast",
    S: "South",
    SW: "Southwest",
    W: "West",
    NW: "Northwest",
};

const copy = {
    nl: {
        forSale: "Te koop",
        forRent: "Te huur",
        statusUnderOffer: "Onder bod",
        statusSold: "Verkocht",
        statusRented: "Verhuurd",
        statusBiddingClosed: "Bieding gesloten",
        soldFor: "Verkocht voor",
        rentedFor: "Verhuurd voor",
        rooms: "kamers",
        bedrooms: "slaapkamers",
        built: "Bouwjaar",
        living: "Woonoppervlak",
        energy: "Energielabel",
        monument: "Monumentaal pand",
        leasehold: "Erfpacht",
        leaseholdAfgekocht: "Erfpacht afgekocht",
        freehold: "Volle eigendom",
        leaseholdUnknown: "Erfpacht onbekend",
        canonPerYear: "canon per jaar",
        leaseholdEnds: "Erfpacht loopt tot",
        about: "Over deze woning",
        details: "Kenmerken",
        general: "Algemeen",
        dimensions: "Oppervlakten en inhoud",
        layout: "Indeling",
        garden: "Tuin",
        gardenOrientation: "Ligging tuin",
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
        movableItems: "Lijst van zaken en vragenlijst",
        movableItemsText:
            "Bekijk welke roerende zaken achterblijven, meegaan of ter overname worden aangeboden en welke vragen de verkoper over de woning heeft beantwoord.",
        generatedList: "Download lijst van zaken en vragenlijst (PDF)",
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
        demographics: "Bewoners en huishoudens",
        gender: "Geslacht",
        male: "Man",
        female: "Vrouw",
        householdComposition: "Huishoudenssamenstelling",
        singleHousehold: "Alleenwonend",
        coupleHousehold: "Stel (zonder kinderen thuis)",
        familyHousehold: "Met kinderen",
        averageHouseholdSize: "Gemiddelde huishoudensgrootte",
        personsPerHousehold: "personen per huishouden",
        educationLevel: "Opleidingsniveau",
        educationIntro:
            "Verdeling van de bevolking van 15 tot 75 jaar naar opleidingsniveau.",
        educationLow: "Laag",
        educationMedium: "Middelbaar",
        educationHigh: "Hoog",
        demographicsNote:
            "Buurtcijfers van CBS; percentages zijn afgerond. Huishoudtypes volgen de CBS-indeling: een stel is een huishouden zonder kinderen in het huis, ‘met kinderen’ een huishouden met kinderen thuis.",
        noise: "Geluid",
        noiseIntro:
            "Jaargemiddelde geluidsbelasting (Lden) per geluidsbron; het streepje markeert de wettelijke voorkeursgrenswaarde. Ruwe indicatie op een raster van 10 meter, geen geveltoets.",
        noiseRoad: "Wegverkeer",
        noiseRail: "Trein",
        noiseIndustry: "Industrie",
        noiseAircraft: "Luchtvaart",
        noisePreferredLimit: "voorkeursgrenswaarde",
        noiseDecibel: "dB",
        noiseNone:
            "Voor deze woning is geen geluidsbelasting geregistreerd binnen het raster van de bron.",
        foundationRisk: "Funderingsrisico",
        foundationRiskIntro:
            "Indicatie op basis van openbare bronnen, geen bouwkundige keuring. Doe de gratis funderingscheck op",
        foundationRiskCheckLink: "funderingskaartnederland.nl/check",
        foundationRiskLevelNone: "Geen aandachtsgebied",
        foundationRiskLevelLow: "Laag risico",
        foundationRiskLevelMedium: "Verhoogd risico",
        foundationRiskLevelHigh: "Hoog risico",
        foundationAreaShare: "Aandeel bebouwing in aandachtsgebied",
        foundationPre1970: "Bebouwing vóór 1970",
        foundationGround: "Ondergrond",
    },
    en: {
        forSale: "For sale",
        forRent: "For rent",
        statusUnderOffer: "Under offer",
        statusSold: "Sold",
        statusRented: "Rented",
        statusBiddingClosed: "Bidding closed",
        soldFor: "Sold for",
        rentedFor: "Rented for",
        rooms: "rooms",
        bedrooms: "bedrooms",
        built: "Built",
        living: "Living area",
        energy: "Energy label",
        monument: "Listed monument",
        leasehold: "Ground lease",
        leaseholdAfgekocht: "Ground lease (prepaid)",
        freehold: "Freehold",
        leaseholdUnknown: "Ground lease unknown",
        canonPerYear: "ground rent per year",
        leaseholdEnds: "Ground lease until",
        about: "About this property",
        details: "Property details",
        general: "General",
        dimensions: "Areas and volume",
        layout: "Layout",
        garden: "Garden",
        gardenOrientation: "Garden orientation",
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
        movableItems: "Movable items list and questionnaire",
        movableItemsText:
            "See which movable items remain, are removed, or are offered for takeover, and the seller's answers about the property.",
        generatedList: "Download movable items list and questionnaire (PDF)",
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
        demographics: "Residents and households",
        gender: "Gender",
        male: "Male",
        female: "Female",
        householdComposition: "Household composition",
        singleHousehold: "Living alone",
        coupleHousehold: "Couple (no children at home)",
        familyHousehold: "With children",
        averageHouseholdSize: "Average household size",
        personsPerHousehold: "persons per household",
        educationLevel: "Education level",
        educationIntro:
            "Distribution of the population aged 15 to 75 by education level.",
        educationLow: "Low",
        educationMedium: "Medium",
        educationHigh: "High",
        demographicsNote:
            "Neighborhood figures from Statistics Netherlands; percentages are rounded. Household types follow the CBS classification: a couple is a household without children living at home, “with children” a household with children at home.",
        noise: "Noise",
        noiseIntro:
            "Annual average noise exposure (Lden) per source; the marker shows the legal preferred limit. Rough indication on a 10-meter grid, not a facade assessment.",
        noiseRoad: "Road traffic",
        noiseRail: "Train",
        noiseIndustry: "Industry",
        noiseAircraft: "Aviation",
        noisePreferredLimit: "preferred limit",
        noiseDecibel: "dB",
        noiseNone:
            "No noise exposure is registered for this property within the grid of the source.",
        foundationRisk: "Foundation risk",
        foundationRiskIntro:
            "Indication based on public sources, not a structural survey. Do the free foundation check at",
        foundationRiskCheckLink: "funderingskaartnederland.nl/check",
        foundationRiskLevelNone: "No attention area",
        foundationRiskLevelLow: "Low risk",
        foundationRiskLevelMedium: "Elevated risk",
        foundationRiskLevelHigh: "High risk",
        foundationAreaShare: "Share of buildings in attention area",
        foundationPre1970: "Buildings before 1970",
        foundationGround: "Subsoil",
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

    // Aggregated listings (Funda/Kamernet) have their own detail view with
    // branded outbound links and no platform bidding/viewing flow.
    const aggregated = await db.aggregatedListing.findUnique({
        where: { publicSlug: (await params).slug },
        include: {
            images: { orderBy: { sortOrder: "asc" } },
            platformLinks: { orderBy: { source: "asc" } },
        },
    });
    if (aggregated) {
        return (
            <AggregatedListingDetail
                language={language}
                listing={{
                    titleNl: aggregated.titleNl,
                    descriptionNl: aggregated.descriptionNl,
                    purpose: aggregated.purpose,
                    status: aggregated.status,
                    askingPriceCents:
                        aggregated.askingPriceCents?.toString() ?? null,
                    monthlyRentCents:
                        aggregated.monthlyRentCents?.toString() ?? null,
                    serviceCostsCents:
                        aggregated.serviceCostsCents?.toString() ?? null,
                    postcode: aggregated.postcode,
                    street: aggregated.street,
                    houseNumber: aggregated.houseNumber,
                    houseNumberAddition: aggregated.houseNumberAddition,
                    city: aggregated.city,
                    municipality: aggregated.municipality,
                    propertyType: aggregated.propertyType,
                    livingAreaSqm:
                        aggregated.livingAreaSqm !== null
                            ? Number(aggregated.livingAreaSqm)
                            : null,
                    plotAreaSqm:
                        aggregated.plotAreaSqm !== null
                            ? Number(aggregated.plotAreaSqm)
                            : null,
                    roomCount: aggregated.roomCount,
                    bedroomCount: aggregated.bedroomCount,
                    bathroomCount: aggregated.bathroomCount,
                    constructionYear: aggregated.constructionYear,
                    energyLabel: aggregated.energyLabel,
                    amenities: aggregated.amenities,
                    availableFrom:
                        aggregated.availableFrom?.toISOString() ?? null,
                    images: aggregated.images,
                    platformLinks: aggregated.platformLinks.map((link) => ({
                        id: link.id,
                        source: link.source,
                        url: link.url,
                        status: link.status,
                    })),
                }}
            />
        );
    }

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
            transactions: {
                where: { status: { not: "CANCELLED" } },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { purchasePriceCents: true },
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
        listing.status === "SOLD" || listing.status === "RENTED"
            ? (listing.transactions[0]?.purchasePriceCents ??
              (listing.purpose === "SALE"
                  ? listing.askingPriceCents
                  : listing.monthlyRentCents))
            : listing.purpose === "SALE"
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
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const erfpachtType = listing.property.erfpachtType;
    const erfpachtCanonCents = listing.property.erfpachtCanonCents;
    const erfpachtEndDate = listing.property.erfpachtEndDate;
    const leaseholdSummary =
        erfpachtType === "LEASEHOLD"
            ? erfpachtCanonCents
                ? `${t.leasehold} · ${t.canonPerYear}: ${formatMoney(erfpachtCanonCents, locale)}`
                : t.leasehold
            : erfpachtType === "LEASEHOLD_AFGEKOCHT"
              ? t.leaseholdAfgekocht
              : erfpachtType === "FREEHOLD"
                ? t.freehold
                : null;
    const now = new Date();
    const biddingState =
        listing.status !== "LIVE"
            ? "unavailable"
            : listing.bidWindowOpensAt && listing.bidWindowOpensAt > now
              ? "upcoming"
              : listing.bidWindowClosesAt && listing.bidWindowClosesAt <= now
                ? "closed"
                : "open";
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
    // Gestructureerde tuininformatie uit de layout-JSON van het pand.
    const garden = parsePropertyLayout(listing.property.layout)?.garden ?? null;
    const gardenOrientationName =
        language === "en"
            ? garden?.orientation
                ? englishGardenOrientations[garden.orientation]
                : null
            : garden?.orientation
              ? (gardenOrientationLabels[garden.orientation] ?? null)
              : null;
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
    // Heeft deze zoeker al een berichtenlijn met de verkoper? Dan staat het
    // gesprek direct open; anders toont de zijbalk eerst een start-knop.
    const hasConversation = canInteract
        ? Boolean(
              await db.listingMessage.findFirst({
                  where: {
                      listingId: listing.id,
                      seekerUserId: session!.user.id,
                  },
                  select: { id: true },
              }),
          )
        : false;
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
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b border-line bg-background/92 backdrop-blur-xl">
                <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
                    <Link href="/" className="flex items-center">
                        <BrandLogo className="h-9 w-auto" />
                    </Link>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/search"
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
                            {listing.status !== "LIVE" ||
                            biddingState === "closed" ? (
                                <p
                                    className={`mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${
                                        listing.status === "UNDER_OFFER"
                                            ? "bg-amber-500 text-white"
                                            : listing.status === "SOLD"
                                              ? "bg-stone-800 text-white"
                                              : listing.status === "RENTED"
                                                ? "bg-sky-700 text-white"
                                                : "bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-200"
                                    }`}
                                >
                                    {listing.status === "UNDER_OFFER" ? (
                                        <Clock3 size={16} />
                                    ) : listing.status === "SOLD" ? (
                                        <BadgeCheck size={16} />
                                    ) : listing.status === "RENTED" ? (
                                        <KeyRound size={16} />
                                    ) : (
                                        <Clock3 size={16} />
                                    )}
                                    {listing.status === "UNDER_OFFER"
                                        ? t.statusUnderOffer
                                        : listing.status === "SOLD"
                                          ? t.statusSold
                                          : listing.status === "RENTED"
                                            ? t.statusRented
                                            : t.statusBiddingClosed}
                                </p>
                            ) : null}
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
                            {listing.status === "SOLD" ||
                            listing.status === "RENTED" ? (
                                <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">
                                    {listing.status === "SOLD"
                                        ? t.soldFor
                                        : t.rentedFor}
                                </p>
                            ) : null}
                            <p
                                className={`text-3xl font-semibold ${
                                    listing.status === "SOLD" ||
                                    listing.status === "RENTED"
                                        ? "mt-1"
                                        : "mt-5"
                                }`}
                            >
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
                            {erfpachtType === "LEASEHOLD" ||
                            erfpachtType === "LEASEHOLD_AFGEKOCHT" ? (
                                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                                    <Landmark
                                        size={16}
                                        className="text-brand"
                                    />
                                    <span className="font-semibold text-foreground">
                                        {erfpachtType === "LEASEHOLD_AFGEKOCHT"
                                            ? t.leaseholdAfgekocht
                                            : t.leasehold}
                                    </span>
                                    {erfpachtType === "LEASEHOLD" &&
                                    erfpachtCanonCents ? (
                                        <span>
                                            {t.canonPerYear}:{" "}
                                            <span className="font-semibold text-foreground">
                                                {formatMoney(
                                                    erfpachtCanonCents,
                                                    locale,
                                                )}
                                            </span>
                                        </span>
                                    ) : null}
                                    {erfpachtEndDate ? (
                                        <span>
                                            {t.leaseholdEnds}{" "}
                                            {formatDate(
                                                erfpachtEndDate,
                                                locale,
                                            )}
                                        </span>
                                    ) : null}
                                </p>
                            ) : erfpachtType === "FREEHOLD" ? (
                                <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                                    <Landmark
                                        size={16}
                                        className="text-brand"
                                    />
                                    {t.freehold}
                                </p>
                            ) : null}
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
                            {canInteract && hasConversation ? (
                                <section className="mt-10">
                                    <ListingMessageThread
                                        listingId={listing.id}
                                        language={language}
                                    />
                                </section>
                            ) : null}
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
                                            [t.leasehold, leaseholdSummary],
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
                                            // Tuin alleen tonen als de
                                            // eigenaar deze heeft opgegeven.
                                            [
                                                t.garden,
                                                garden
                                                    ? language === "en"
                                                        ? "Yes"
                                                        : "Ja"
                                                    : null,
                                            ],
                                            [
                                                t.gardenOrientation,
                                                gardenOrientationName,
                                            ],
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
                            {canInteract && !hasConversation ? (
                                <ListingMessageLauncher
                                    listingId={listing.id}
                                    language={language}
                                />
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
    noiseRoadLden: NumericValue;
    noiseRailLden: NumericValue;
    noiseIndustryLden: NumericValue;
    noiseAircraftLden: NumericValue;
    noiseGridMeters: number | null;
    noiseSource: string | null;
    noiseRetrievedAt: Date | null;
    foundationRiskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | null;
    foundationRiskAreaShare: NumericValue;
    foundationPre1970Percent: NumericValue;
    foundationGroundClass: string | null;
    foundationRiskDetail: string | null;
    foundationRiskSource: string | null;
    foundationRiskRetrievedAt: Date | null;
    malePercent: NumericValue;
    femalePercent: NumericValue;
    averageHouseholdSize: NumericValue;
    singleHouseholdPercent: NumericValue;
    coupleHouseholdPercent: NumericValue;
    familyHouseholdPercent: NumericValue;
    educationLowPercent: NumericValue;
    educationMediumPercent: NumericValue;
    educationHighPercent: NumericValue;
    educationStatisticsYear: number | null;
    demographicsSourceUrl: string | null;
    demographicsRetrievedAt: Date | null;
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
                                            NL{" "}
                                            {formatPercent(
                                                nationalValue,
                                                locale,
                                            )}
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
            <DemographicsDetails profile={profile} language={language} />
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
            <NoiseDetails profile={profile} language={language} />
            <FoundationRiskDetails profile={profile} language={language} />
            {facilities.length > 0 ? (
                <div className="mt-8">
                    <h3 className="font-semibold">{t.nearbyFacilities}</h3>
                    <div className="mt-4 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
                        {facilities.map((facility) => (
                            <div
                                key={facility.label}
                                className="flex items-start gap-3 bg-surface p-4"
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
                {profile.noiseSource && profile.noiseRetrievedAt ? (
                    <a
                        href="https://www.atlasleefomgeving.nl/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line underline-offset-4"
                    >
                        RIVM Atlas Leefomgeving (
                        {formatDate(profile.noiseRetrievedAt, locale)})
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
        good: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
        neutral: "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
        attention:
            "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
        bad: "bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300",
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

// Wettelijke voorkeursgrenswaarde (Lden) per geluidsbron uit het Omgevingsplan;
// de streepjes in de balken markeren deze waarde.
const NOISE_PREFERRED_LIMITS: Record<string, number> = {
    road: 53,
    rail: 55,
    industry: 50,
    aircraft: 58,
};

function NoiseDetails({
    profile,
    language,
}: {
    profile: NeighborhoodProfileView;
    language: "nl" | "en";
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const sources = [
        ["road", profile.noiseRoadLden, t.noiseRoad],
        ["rail", profile.noiseRailLden, t.noiseRail],
        ["industry", profile.noiseIndustryLden, t.noiseIndustry],
        ["aircraft", profile.noiseAircraftLden, t.noiseAircraft],
    ] as const;
    if (sources.every(([, value]) => value === null)) return null;

    return (
        <div className="mt-8">
            <h3 className="font-semibold">{t.noise}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {t.noiseIntro}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {sources.map(([key, value, label]) => {
                    const decibel = value === null ? null : Number(value);
                    const limit = NOISE_PREFERRED_LIMITS[key];
                    // Schaal tot 75 dB zodat stedelijke waarden leesbaar blijven.
                    const scaleMax = 75;
                    return (
                        <div key={key}>
                            <div className="flex items-baseline justify-between gap-3">
                                <p className="text-sm font-semibold">{label}</p>
                                <p className="text-sm font-semibold">
                                    {decibel === null
                                        ? "—"
                                        : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(decibel)} ${t.noiseDecibel}`}
                                </p>
                            </div>
                            <div className="relative mt-2 h-2 bg-background">
                                <div
                                    className={`h-full ${decibel !== null && decibel > limit ? "bg-red-500" : decibel !== null && decibel > limit - 5 ? "bg-amber-500" : "bg-brand"}`}
                                    style={{
                                        width: `${Math.min(100, ((decibel ?? 0) / scaleMax) * 100)}%`,
                                    }}
                                />
                                <span
                                    title={`${t.noisePreferredLimit} ${limit} ${t.noiseDecibel}`}
                                    className="absolute -top-1 h-4 w-0.5 bg-stone-800"
                                    style={{
                                        left: `${(limit / scaleMax) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted">
                {profile.noiseSource}
                {profile.noiseRetrievedAt
                    ? ` · ${formatDate(profile.noiseRetrievedAt, locale)}`
                    : ""}
            </p>
        </div>
    );
}

function FoundationRiskDetails({
    profile,
    language,
}: {
    profile: NeighborhoodProfileView;
    language: "nl" | "en";
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    if (
        profile.foundationRiskLevel === null &&
        profile.foundationPre1970Percent === null
    ) {
        return null;
    }
    const levelNames = {
        NONE: t.foundationRiskLevelNone,
        LOW: t.foundationRiskLevelLow,
        MEDIUM: t.foundationRiskLevelMedium,
        HIGH: t.foundationRiskLevelHigh,
    } as const;
    const level = profile.foundationRiskLevel;
    const toneClasses = {
        NONE: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
        LOW: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
        MEDIUM: "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
        HIGH: "bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    } as const;
    const facts = [
        [
            t.foundationAreaShare,
            formatPercent(profile.foundationRiskAreaShare, locale),
        ],
        [
            t.foundationPre1970,
            formatPercent(profile.foundationPre1970Percent, locale),
        ],
        [t.foundationGround, profile.foundationGroundClass],
    ] as const;

    return (
        <div className="mt-8 bg-background p-5">
            <div className="flex items-start gap-3">
                <Home size={20} className="mt-0.5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{t.foundationRisk}</h3>
                    {level ? (
                        <p
                            className={`mt-2 inline-flex px-3 py-1.5 text-sm font-semibold ${toneClasses[level]}`}
                        >
                            {levelNames[level]}
                        </p>
                    ) : null}
                    <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-3">
                        {facts.map(([label, value]) =>
                            value === null ? null : (
                                <div key={label}>
                                    <dt className="text-xs font-semibold text-muted">
                                        {label}
                                    </dt>
                                    <dd className="mt-1 text-sm font-medium">
                                        {value}
                                    </dd>
                                </div>
                            ),
                        )}
                    </dl>
                    {profile.foundationRiskDetail ? (
                        <p className="mt-3 text-xs text-muted">
                            {profile.foundationRiskDetail}
                        </p>
                    ) : null}
                    <p className="mt-3 text-xs leading-5 text-muted">
                        {t.foundationRiskIntro}{" "}
                        <a
                            href="https://www.funderingskaartnederland.nl/check"
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-line underline-offset-4"
                        >
                            {t.foundationRiskCheckLink}
                        </a>
                        . {profile.foundationRiskSource}
                        {profile.foundationRiskRetrievedAt
                            ? ` · ${formatDate(profile.foundationRiskRetrievedAt, locale)}`
                            : ""}
                    </p>
                </div>
            </div>
        </div>
    );
}

function DemographicsDetails({
    profile,
    language,
}: {
    profile: NeighborhoodProfileView;
    language: "nl" | "en";
}) {
    const t = copy[language];
    const locale = language === "nl" ? "nl-NL" : "en-NL";
    const genderRows = [
        [t.male, profile.malePercent],
        [t.female, profile.femalePercent],
    ] as const;
    const householdRows = [
        [t.singleHousehold, profile.singleHouseholdPercent],
        [t.coupleHousehold, profile.coupleHouseholdPercent],
        [t.familyHousehold, profile.familyHouseholdPercent],
    ] as const;
    const educationRows = [
        [t.educationLow, profile.educationLowPercent],
        [t.educationMedium, profile.educationMediumPercent],
        [t.educationHigh, profile.educationHighPercent],
    ] as const;
    const hasGender = genderRows.some(([, value]) => value !== null);
    const hasHousehold =
        householdRows.some(([, value]) => value !== null) ||
        profile.averageHouseholdSize !== null;
    const hasEducation = educationRows.some(([, value]) => value !== null);
    if (!hasGender && !hasHousehold && !hasEducation) return null;

    return (
        <div className="mt-8">
            <h3 className="font-semibold">{t.demographics}</h3>
            <div className="mt-4 grid gap-6 sm:grid-cols-3">
                {hasGender ? (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                            {t.gender}
                        </p>
                        <div className="mt-3 space-y-3">
                            {genderRows.map(([label, value]) => (
                                <DistributionBar
                                    key={label}
                                    label={label}
                                    value={value}
                                    locale={locale}
                                    colorClass="bg-brand"
                                />
                            ))}
                        </div>
                    </div>
                ) : null}
                {hasHousehold ? (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                            {t.householdComposition}
                        </p>
                        <div className="mt-3 space-y-3">
                            {householdRows.map(([label, value]) => (
                                <DistributionBar
                                    key={label}
                                    label={label}
                                    value={value}
                                    locale={locale}
                                    colorClass="bg-brand"
                                />
                            ))}
                        </div>
                        {profile.averageHouseholdSize !== null ? (
                            <p className="mt-3 text-xs text-muted">
                                {t.averageHouseholdSize}:{" "}
                                <span className="font-semibold text-foreground">
                                    {new Intl.NumberFormat(locale, {
                                        maximumFractionDigits: 1,
                                    }).format(
                                        Number(profile.averageHouseholdSize),
                                    )}{" "}
                                    {t.personsPerHousehold}
                                </span>
                            </p>
                        ) : null}
                    </div>
                ) : null}
                {hasEducation ? (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                            {t.educationLevel}
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-muted">
                            {t.educationIntro}
                        </p>
                        <div className="mt-3 space-y-3">
                            {educationRows.map(([label, value]) => (
                                <DistributionBar
                                    key={label}
                                    label={label}
                                    value={value}
                                    locale={locale}
                                    colorClass={
                                        label === t.educationHigh
                                            ? "bg-brand-dark"
                                            : "bg-brand"
                                    }
                                />
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted">
                {t.demographicsNote}
                {profile.educationStatisticsYear
                    ? ` · ${t.educationLevel} ${profile.educationStatisticsYear}`
                    : ""}
                {profile.demographicsSourceUrl ? (
                    <>
                        {" · "}
                        <a
                            href={profile.demographicsSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-line underline-offset-4"
                        >
                            CBS
                        </a>
                    </>
                ) : null}
                {profile.demographicsRetrievedAt
                    ? ` · ${formatDate(profile.demographicsRetrievedAt, locale)}`
                    : ""}
            </p>
        </div>
    );
}

function DistributionBar({
    label,
    value,
    locale,
    colorClass,
}: {
    label: string;
    value: NumericValue;
    locale: string;
    colorClass: string;
}) {
    const percentage = value === null ? null : Number(value);
    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm">{label}</p>
                <p className="text-sm font-semibold">
                    {formatPercent(value, locale) ?? "—"}
                </p>
            </div>
            <div className="mt-1 h-2 bg-background">
                <div
                    className={`h-full ${colorClass}`}
                    style={{
                        width: `${Math.min(100, percentage ?? 0)}%`,
                    }}
                />
            </div>
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
    const score =
        ratio < 0.5
            ? 1
            : ratio < 0.85
              ? 2
              : ratio <= 1.15
                ? 3
                : ratio <= 2
                  ? 4
                  : 5;
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
    if (
        value === null ||
        nationalValue === null ||
        Number(nationalValue) === 0
    ) {
        return null;
    }
    const local = Number(value);
    const national = Number(nationalValue);
    const difference =
        mode === "percentagePoints"
            ? local - national
            : ((local - national) / national) * 100;
    const absoluteDifference = Math.abs(difference);
    const isSimilar =
        absoluteDifference < (mode === "percentagePoints" ? 5 : 15);
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
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-xl sm:p-7">
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
