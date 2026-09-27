import { PublicHeader } from "@/components/platform/public-header";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import {
    ChevronLeft,
    ChevronRight,
    Heart,
    LayoutDashboard,
} from "lucide-react";
import { AiSearchBar } from "@/components/marketplace/ai-search-bar";
import { ErfpachtToggle } from "@/components/marketplace/erfpacht-toggle";
import { MarketplaceResults } from "@/components/marketplace/marketplace-results";
import { MonumentToggle } from "@/components/marketplace/monument-toggle";
import { PurposeToggle } from "@/components/marketplace/purpose-toggle";
import { gardenOrientationLabels } from "@/features/listings/garden";
import {
    searchMarketplaceListings,
    type MarketplaceSearchParams,
} from "@/features/listings/marketplace-service";
import { auth } from "@/lib/auth";
import { getLanguage } from "@/lib/language";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    const lang = await getLanguage();
    return lang === "en"
        ? {
              title: "Houses for sale and for rent",
              description:
                  "Search houses and apartments for sale or rent on ZelfWonen. Filter by price, living area, rooms, energy label and amenities.",
          }
        : {
              title: "Huizen te koop en te huur",
              description:
                  "Zoek huizen en appartementen te koop of te huur op ZelfWonen. Filter op prijs, woonoppervlak, kamers, energielabel en voorzieningen.",
          };
}

const propertyTypeOptions = (lang: "nl" | "en") =>
    [
        ["HOUSE", lang === "en" ? "House" : "Huis"],
        ["APARTMENT", lang === "en" ? "Apartment" : "Appartement"],
        ["LAND", lang === "en" ? "Land" : "Bouwgrond"],
        ["PARKING", lang === "en" ? "Parking" : "Parkeerplaats"],
        ["COMMERCIAL", lang === "en" ? "Commercial" : "Bedrijfsruimte"],
    ] as const;
function statusOptions(purpose: "SALE" | "RENT", lang: "nl" | "en") {
    const isEn = lang === "en";
    const options: (readonly [string, string])[] = [
        [
            "LIVE",
            isEn
                ? purpose === "SALE"
                    ? "For sale"
                    : "For rent"
                : purpose === "SALE"
                  ? "Te koop"
                  : "Te huur",
        ],
        ["UNDER_OFFER", isEn ? "Under offer" : "Onder bod"],
    ];
    if (purpose === "SALE") options.push(["SOLD", isEn ? "Sold" : "Verkocht"]);
    else options.push(["RENTED", isEn ? "Rented" : "Verhuurd"]);
    return options;
}
const amenityOptions = (lang: "nl" | "en") =>
    [
        ["SOLAR_PANELS", lang === "en" ? "Solar panels" : "Zonnepanelen"],
        ["HEAT_PUMP", lang === "en" ? "Heat pump" : "Warmtepomp"],
        [
            "AIR_CONDITIONING",
            lang === "en" ? "Air conditioning" : "Airconditioning",
        ],
        ["FIBER_OPTIC", lang === "en" ? "Fibre optic" : "Glasvezel"],
        ["EV_CHARGER", lang === "en" ? "EV charger" : "Laadpaal"],
        ["FIREPLACE", lang === "en" ? "Fireplace" : "Open haard"],
        [
            "MECHANICAL_VENTILATION",
            lang === "en" ? "Mechanical ventilation" : "Mechanische ventilatie",
        ],
        ["ALARM_SYSTEM", lang === "en" ? "Alarm system" : "Alarmsysteem"],
    ] as const;
const parkingOptions = (lang: "nl" | "en") =>
    [
        ["ON_PROPERTY", lang === "en" ? "On property" : "Op eigen terrein"],
        [
            "FREE_STREET",
            lang === "en" ? "Free street parking" : "Gratis parkeren",
        ],
        [
            "PARKING_PERMIT",
            lang === "en" ? "Parking permit" : "Parkeervergunning",
        ],
        ["PRIVATE_GARAGE", lang === "en" ? "Private garage" : "Eigen garage"],
        ["PUBLIC_GARAGE", lang === "en" ? "Public garage" : "Openbare garage"],
        [
            "PAID_STREET",
            lang === "en" ? "Paid street parking" : "Betaald parkeren",
        ],
        [
            "SPACE_FOR_SALE",
            lang === "en" ? "Parking for sale" : "Parkeerplaats te koop",
        ],
    ] as const;
const energyLabelOptions = [
    ["A_PLUS_PLUS_PLUS_PLUS_PLUS", "A+++++"],
    ["A_PLUS_PLUS_PLUS_PLUS", "A++++"],
    ["A_PLUS_PLUS_PLUS", "A+++"],
    ["A_PLUS_PLUS", "A++"],
    ["A_PLUS", "A+"],
    ["A", "A"],
    ["B", "B"],
    ["C", "C"],
    ["D", "D"],
    ["E", "E"],
    ["F", "F"],
    ["G", "G"],
] as const;

function values(value: string | string[] | undefined) {
    return Array.isArray(value) ? value : value ? [value] : [];
}

function pageHref(searchParams: MarketplaceSearchParams, page: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
        if (key === "page" || value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
            query.append(key, item);
        }
    }
    if (page > 1) query.set("page", String(page));
    return `/search${query.size ? `?${query.toString()}` : ""}`;
}

function FilterChecks({
    name,
    options,
    selected,
}: {
    name: string;
    options: readonly (readonly [string, string])[];
    selected: string[];
}) {
    return (
        <div className="grid gap-2.5">
            {options.map(([value, label]) => (
                <label
                    key={value}
                    className="flex cursor-pointer items-center gap-3 text-sm"
                >
                    <input
                        type="checkbox"
                        name={name}
                        value={value}
                        defaultChecked={selected.includes(value)}
                        className="size-4 accent-brand"
                    />
                    {label}
                </label>
            ))}
        </div>
    );
}

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<MarketplaceSearchParams>;
}) {
    const params = await searchParams;
    const language = await getLanguage();
    const isEn = language === "en";
    const ui = isEn
        ? {
              navSearch: "Find a home",
              mortgageCalc: "Mortgage calculator",
              favorites: "Favorites",
              myHomes: "My homes",
              offerProperty: "List a property",
              eyebrow: "Listings from private owners",
              h1: "Find a place that fits you",
              welcomeBack: "Welcome back, ",
              welcomeBody:
                  "Your favorites, searches, viewings and bids are in My search.",
              openMySearch: "Open My search",
              apply: "Apply",
              propertyType: "Property type",
              price: "Price",
              status: "Status",
              availability: "Availability",
              areaRooms: "Area & rooms",
              energyLabel: "Energy label",
              amenities: "Amenities",
              garden: "Garden",
              neighborhood: "Neighborhood",
              erfpacht: "Ground lease",
              noPreference: "No preference",
              anyHome: "Any home",
              from: "From",
              to: "To",
              noMax: "No maximum",
              saleOrRent: "Sale or rent",
              immediate: "Immediately available",
              within1m: "Within 1 month",
              within3m: "Within 3 months",
              minLivingArea: "Minimum living area",
              minPlot: "Minimum plot",
              rooms: "Rooms",
              bedrooms: "Bedrooms",
              bathrooms: "Bathrooms",
              gardenOrientation: "Garden orientation",
              monumentStatus: "Monument status",
              availableFrom: "Available from",
              neighborhoodFacilities: "Neighborhood facilities",
              sale: "For sale",
              rent: "For rent",
          }
        : {
              navSearch: "Woning zoeken",
              mortgageCalc: "Hypotheek berekenen",
              favorites: "Favorieten",
              myHomes: "Mijn woningen",
              offerProperty: "Woning aanbieden",
              eyebrow: "Aanbod van particuliere verkopers",
              h1: "Vind een plek die bij je past",
              welcomeBack: "Welkom terug, ",
              welcomeBody:
                  "Je favorieten, zoekopdrachten, bezichtigingen en biedingen staan bij Mijn zoektocht.",
              openMySearch: "Open Mijn zoektocht",
              apply: "Toepassen",
              propertyType: "Woningtype",
              price: "Prijs",
              status: "Status",
              availability: "Beschikbaarheid",
              areaRooms: "Oppervlakte & kamers",
              energyLabel: "Energielabel",
              amenities: "Voorzieningen",
              garden: "Tuin",
              neighborhood: "Buurt",
              erfpacht: "Erfpacht",
              noPreference: "Geen voorkeur",
              anyHome: "Alle woningen",
              from: "Van",
              to: "Tot",
              noMax: "Geen maximum",
              saleOrRent: "Koop of huur",
              immediate: "Direct beschikbaar",
              within1m: "Binnen 1 maand",
              within3m: "Binnen 3 maanden",
              minLivingArea: "Minimaal woonoppervlak",
              minPlot: "Minimaal perceel",
              rooms: "Kamers",
              bedrooms: "Slaapkamers",
              bathrooms: "Badkamers",
              gardenOrientation: "Tuinoorientatie",
              monumentStatus: "Monumentstatus",
              availableFrom: "Beschikbaar vanaf",
              neighborhoodFacilities: "Voorzieningen in de buurt",
              sale: "Te koop",
              rent: "Te huur",
          };
    const [result, session] = await Promise.all([
        searchMarketplaceListings(params),
        auth.api.getSession({ headers: await headers() }),
    ]);
    const selectedPropertyTypes = values(params.propertyType);
    const selectedStatuses = values(params.status);
    const statusFilterOptions = statusOptions(result.filters.purpose, language);
    const activeStatusValues = statusFilterOptions.map(([value]) => value);
    const visibleSelectedStatuses = selectedStatuses.filter((value) =>
        activeStatusValues.includes(value),
    );
    const selectedEnergyLabels = values(params.energyLabel);
    const selectedAmenities = values(params.amenity);
    const selectedParking = values(params.parking);
    const buildingFilterCount =
        Number(
            result.filters.constructionYearMin !== null ||
                result.filters.constructionYearMax !== null,
        ) + Number(result.filters.monumentFilter !== "all");
    const erfpachtFilterCount = Number(result.filters.erfpachtFilter !== "all");
    const neighborhoodFilterCount =
        Number(result.filters.populationDensityPerKm2Max !== null) +
        Number(result.filters.housingCorporationPercentMax !== null) +
        Number(result.filters.supermarketDistanceKmMax !== null) +
        Number(result.filters.primarySchoolDistanceKmMax !== null) +
        Number(result.filters.busStopDistanceMetersMax !== null) +
        Number(result.filters.trainStationDistanceMetersMax !== null) +
        Number(result.filters.registeredCrimesPer1000Max !== null) +
        Number(result.filters.foundationRiskFilter !== "all") +
        Number(result.filters.noiseRoadLdenMax !== null);
    const availabilityFilterCount = Number(
        result.filters.availableFrom !== "any",
    );
    const gardenFilterCount =
        Number(result.filters.hasGarden === true) +
        Number(result.filters.gardenOrientation !== null);
    return (
        <div className="min-h-screen bg-background">
            <PublicHeader language={language} />

            <section className="border-b border-line bg-brand-dark text-white">
                <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">
                    <div className="mb-5">
                        <div>
                            <p className="text-xs font-semibold uppercase text-accent">
                                {ui.eyebrow}
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
                                {ui.h1}
                            </h1>
                        </div>
                    </div>
                    <AiSearchBar />
                    {session ? (
                        <div className="mt-5 flex flex-col gap-3 border-t border-white/20 pt-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-brand-dark">
                                    <LayoutDashboard size={19} />
                                </span>
                                <div>
                                    <p className="font-semibold">
                                        {ui.welcomeBack}{" "}
                                        {session.user.name.split(" ")[0]}
                                    </p>
                                    <p className="mt-0.5 text-sm text-white/75">
                                        {ui.welcomeBody}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/dashboard/seeker"
                                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-brand-dark transition hover:bg-accent"
                            >
                                <Heart size={16} /> {ui.openMySearch}
                            </Link>
                        </div>
                    ) : null}
                </div>
            </section>

            <form
                action="/search"
                className="sticky top-0 z-900 border-b border-line bg-surface"
            >
                <input type="hidden" name="q" value={result.filters.query} />
                {result.filters.bounds
                    ? Object.entries(result.filters.bounds).map(
                          ([key, value]) => (
                              <input
                                  key={key}
                                  type="hidden"
                                  name={key}
                                  value={value}
                              />
                          ),
                      )
                    : null}
                <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:overflow-visible lg:px-8">
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Koop of huur
                        </summary>
                        <div className="marketplace-filter-panel w-56">
                            <PurposeToggle value={result.filters.purpose} />
                            <p className="mt-3 text-xs leading-5 text-muted">
                                Bepaalt of je koop- of huurwoningen zoekt en
                                welke prijzen worden getoond.
                            </p>
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Prijs
                        </summary>
                        <div className="marketplace-filter-panel grid w-72 grid-cols-2 gap-3">
                            <label className="text-xs font-semibold text-muted">
                                Van
                                <input
                                    type="number"
                                    name="priceMin"
                                    min="0"
                                    step="25000"
                                    defaultValue={result.filters.priceMin ?? ""}
                                    placeholder={isEn ? "€0" : "€ 0"}
                                    className="marketplace-filter-input mt-1.5"
                                />
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                Tot
                                <input
                                    type="number"
                                    name="priceMax"
                                    min="0"
                                    step="25000"
                                    defaultValue={result.filters.priceMax ?? ""}
                                    placeholder={ui.noMax}
                                    className="marketplace-filter-input mt-1.5"
                                />
                            </label>
                            <button className="col-span-2 h-10 rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Status
                            {visibleSelectedStatuses.length
                                ? ` · ${visibleSelectedStatuses.length}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel w-60">
                            <FilterChecks
                                name="status"
                                options={statusFilterOptions}
                                selected={visibleSelectedStatuses}
                            />
                            <p className="mt-3 text-xs leading-5 text-muted">
                                {result.filters.purpose === "SALE"
                                    ? '{isEn ? "Also shows sold homes with their final price." : "Toont ook verkochte woningen met de uiteindelijke prijs."}'
                                    : '{isEn ? "Also shows rented homes with their final rent." : "Toont ook verhuurde woningen met de uiteindelijke huurprijs."}'}
                            </p>
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Beschikbaarheid
                            {availabilityFilterCount
                                ? ` · ${availabilityFilterCount}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel w-64">
                            <label className="text-xs font-semibold text-muted">
                                Beschikbaar vanaf
                                <select
                                    name="availableFrom"
                                    defaultValue={
                                        result.filters.availableFrom === "any"
                                            ? ""
                                            : result.filters.availableFrom
                                    }
                                    className="marketplace-filter-input mt-1.5"
                                >
                                    <option value="">{ui.anyHome}</option>
                                    <option value="now">
                                        Direct beschikbaar
                                    </option>
                                    <option value="1m">{ui.within1m}</option>
                                    <option value="3m">{ui.within3m}</option>
                                </select>
                            </label>
                            <p className="mt-3 text-xs leading-5 text-muted">
                                Handig voor huurwoningen: toont woningen die
                                binnen de gekozen periode beschikbaar komen.
                            </p>
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Woningtype
                            {selectedPropertyTypes.length
                                ? ` · ${selectedPropertyTypes.length}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel w-60">
                            <FilterChecks
                                name="propertyType"
                                options={propertyTypeOptions(language)}
                                selected={selectedPropertyTypes}
                            />
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Oppervlakte & kamers
                        </summary>
                        <div className="marketplace-filter-panel grid w-80 gap-3">
                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs font-semibold text-muted">
                                    Minimaal woonoppervlak
                                    <select
                                        name="livingAreaMin"
                                        defaultValue={
                                            result.filters.livingAreaMin ?? ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">
                                            {ui.noPreference}
                                        </option>
                                        {[50, 75, 100, 125, 150, 200].map(
                                            (area) => (
                                                <option key={area} value={area}>
                                                    {area} m² of meer
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </label>
                                <label className="text-xs font-semibold text-muted">
                                    Minimaal perceel
                                    <select
                                        name="plotAreaMin"
                                        defaultValue={
                                            result.filters.plotAreaMin ?? ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">
                                            {ui.noPreference}
                                        </option>
                                        {[100, 250, 500, 1000, 2500].map(
                                            (area) => (
                                                <option key={area} value={area}>
                                                    {area.toLocaleString(
                                                        "nl-NL",
                                                    )}{" "}
                                                    m² of meer
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </label>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <label className="text-xs font-semibold text-muted">
                                    Kamers
                                    <select
                                        name="roomsMin"
                                        defaultValue={
                                            result.filters.roomsMin ?? ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">
                                            {isEn ? "Any" : "Alle"}
                                        </option>
                                        {[1, 2, 3, 4, 5].map((count) => (
                                            <option key={count} value={count}>
                                                {count}+
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="text-xs font-semibold text-muted">
                                    Slaapkamers
                                    <select
                                        name="bedroomsMin"
                                        defaultValue={
                                            result.filters.bedroomsMin ?? ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">
                                            {isEn ? "Any" : "Alle"}
                                        </option>
                                        {[1, 2, 3, 4, 5].map((count) => (
                                            <option key={count} value={count}>
                                                {count}+
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="text-xs font-semibold text-muted">
                                    Badkamers
                                    <select
                                        name="bathroomsMin"
                                        defaultValue={
                                            result.filters.bathroomsMin ?? ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">
                                            {isEn ? "Any" : "Alle"}
                                        </option>
                                        {[1, 2, 3, 4].map((count) => (
                                            <option key={count} value={count}>
                                                {count}+
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <button className="h-10 rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Energielabel
                            {selectedEnergyLabels.length
                                ? ` · ${selectedEnergyLabels.length}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel w-56">
                            <FilterChecks
                                name="energyLabel"
                                options={energyLabelOptions}
                                selected={selectedEnergyLabels}
                            />
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Voorzieningen
                            {selectedAmenities.length
                                ? ` · ${selectedAmenities.length}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel w-60">
                            <FilterChecks
                                name="amenity"
                                options={amenityOptions(language)}
                                selected={selectedAmenities}
                            />
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Tuin
                            {gardenFilterCount ? ` · ${gardenFilterCount}` : ""}
                        </summary>
                        <div className="marketplace-filter-panel w-64">
                            <label className="flex cursor-pointer items-center gap-3 text-sm">
                                <input
                                    type="checkbox"
                                    name="hasGarden"
                                    value="true"
                                    defaultChecked={
                                        result.filters.hasGarden === true
                                    }
                                    className="size-4 accent-brand"
                                />
                                Alleen woningen met een tuin
                            </label>
                            <label className="mt-4 block text-xs font-semibold text-muted">
                                Tuinoriëntatie
                                <select
                                    name="gardenOrientation"
                                    defaultValue={
                                        result.filters.gardenOrientation ?? ""
                                    }
                                    className="marketplace-filter-input mt-1.5"
                                >
                                    <option value="">{ui.noPreference}</option>
                                    {Object.entries(
                                        gardenOrientationLabels,
                                    ).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <p className="mt-3 text-xs leading-5 text-muted">
                                De oriëntatie wordt door de eigenaar opgegeven;
                                woningen zonder bekende oriëntatie blijven bij
                                een voorkeur zichtbaar als de tuin elders
                                expliciet genoemd wordt.
                            </p>
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Parkeren
                            {selectedParking.length
                                ? ` · ${selectedParking.length}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel marketplace-filter-panel-right w-64">
                            <FilterChecks
                                name="parking"
                                options={parkingOptions(language)}
                                selected={selectedParking}
                            />
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Gebouwd vanaf
                            {buildingFilterCount
                                ? ` · ${buildingFilterCount}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel marketplace-filter-panel-right grid w-72 gap-3">
                            <label className="text-xs font-semibold text-muted">
                                Minimaal bouwjaar
                                <input
                                    type="number"
                                    name="constructionYearMin"
                                    min="1000"
                                    max="2100"
                                    defaultValue={
                                        result.filters.constructionYearMin ?? ""
                                    }
                                    placeholder="Bijv. 2000"
                                    className="marketplace-filter-input mt-1.5"
                                />
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                Maximaal bouwjaar
                                <input
                                    type="number"
                                    name="constructionYearMax"
                                    min="1000"
                                    max="2200"
                                    defaultValue={
                                        result.filters.constructionYearMax ?? ""
                                    }
                                    placeholder="Bijv. 2000"
                                    className="marketplace-filter-input mt-1.5"
                                />
                            </label>
                            <div>
                                <p className="text-xs font-semibold text-muted">
                                    Monumentstatus
                                </p>
                                <div className="mt-1.5">
                                    <MonumentToggle
                                        value={result.filters.monumentFilter}
                                    />
                                </div>
                            </div>
                            <button className="h-10 rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Buurt
                            {neighborhoodFilterCount
                                ? ` · ${neighborhoodFilterCount}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel marketplace-filter-panel-right grid w-80 gap-4">
                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs font-semibold text-muted">
                                    Bevolkingsdichtheid
                                    <select
                                        name="populationDensityPerKm2Max"
                                        defaultValue={
                                            result.filters
                                                .populationDensityPerKm2Max ??
                                            ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">
                                            {ui.noPreference}
                                        </option>
                                        <option value="1000">
                                            Rustig (max 1.000/km²)
                                        </option>
                                        <option value="2500">
                                            Niet te druk (max 2.500/km²)
                                        </option>
                                    </select>
                                </label>
                                <label className="text-xs font-semibold text-muted">
                                    Sociale huur
                                    <select
                                        name="housingCorporationPercentMax"
                                        defaultValue={
                                            result.filters
                                                .housingCorporationPercentMax ??
                                            ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">
                                            {ui.noPreference}
                                        </option>
                                        <option value="25">
                                            Weinig (max 25%)
                                        </option>
                                        <option value="50">
                                            Gematigd (max 50%)
                                        </option>
                                    </select>
                                </label>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted">
                                    Voorzieningen in de buurt
                                </p>
                                <div className="mt-2 grid gap-2.5">
                                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                                        <input
                                            type="checkbox"
                                            name="supermarketDistanceKmMax"
                                            value="1"
                                            defaultChecked={
                                                result.filters
                                                    .supermarketDistanceKmMax ===
                                                1
                                            }
                                            className="size-4 accent-brand"
                                        />
                                        Supermarkt binnen 1 km
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                                        <input
                                            type="checkbox"
                                            name="primarySchoolDistanceKmMax"
                                            value="1"
                                            defaultChecked={
                                                result.filters
                                                    .primarySchoolDistanceKmMax ===
                                                1
                                            }
                                            className="size-4 accent-brand"
                                        />
                                        Basisschool binnen 1 km
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                                        <input
                                            type="checkbox"
                                            name="busStopDistanceMetersMax"
                                            value="500"
                                            defaultChecked={
                                                result.filters
                                                    .busStopDistanceMetersMax ===
                                                500
                                            }
                                            className="size-4 accent-brand"
                                        />
                                        Bushalte binnen 500 m
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                                        <input
                                            type="checkbox"
                                            name="trainStationDistanceMetersMax"
                                            value="2000"
                                            defaultChecked={
                                                result.filters
                                                    .trainStationDistanceMetersMax ===
                                                2000
                                            }
                                            className="size-4 accent-brand"
                                        />
                                        Treinstation binnen 2 km
                                    </label>
                                </div>
                            </div>
                            <label className="text-xs font-semibold text-muted">
                                Veiligheid
                                <select
                                    name="registeredCrimesPer1000Max"
                                    defaultValue={
                                        result.filters
                                            .registeredCrimesPer1000Max ?? ""
                                    }
                                    className="marketplace-filter-input mt-1.5"
                                >
                                    <option value="">{ui.noPreference}</option>
                                    <option value="40">
                                        Weinig misdrijven (max 40/1.000 inw.)
                                    </option>
                                </select>
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                Funderingsrisico
                                <select
                                    name="foundationRisk"
                                    defaultValue={
                                        result.filters.foundationRiskFilter ===
                                        "all"
                                            ? ""
                                            : result.filters
                                                  .foundationRiskFilter
                                    }
                                    className="marketplace-filter-input mt-1.5"
                                >
                                    <option value="">{ui.noPreference}</option>
                                    <option value="low">
                                        Alleen laag risico
                                    </option>
                                    <option value="none_low">
                                        Geen verhoogd risico
                                    </option>
                                </select>
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                Geluid van wegverkeer
                                <select
                                    name="noiseRoadLdenMax"
                                    defaultValue={
                                        result.filters.noiseRoadLdenMax ?? ""
                                    }
                                    className="marketplace-filter-input mt-1.5"
                                >
                                    <option value="">{ui.noPreference}</option>
                                    <option value="50">
                                        Rustig (max 50 dB)
                                    </option>
                                    <option value="55">
                                        Max 55 dB (richtwaarde)
                                    </option>
                                </select>
                            </label>
                            <button className="h-10 rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                    <details
                        name="marketplace-filters"
                        className="group relative shrink-0"
                    >
                        <summary className="marketplace-filter-trigger">
                            Erfpacht
                            {erfpachtFilterCount
                                ? ` · ${erfpachtFilterCount}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel marketplace-filter-panel-right w-64">
                            <div>
                                <p className="text-xs font-semibold text-muted">
                                    Grondsituatie
                                </p>
                                <div className="mt-1.5">
                                    <ErfpachtToggle
                                        value={result.filters.erfpachtFilter}
                                    />
                                </div>
                            </div>
                            <p className="mt-4 text-xs leading-5 text-muted">
                                Erfpacht toont woningen waarvan de grond in
                                erfpacht is (met of zonder afgekochte canon).
                            </p>
                            <button className="mt-4 h-10 w-full rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                </div>
            </form>

            <main>
                <div className="border-b border-line bg-surface">
                    <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                        <div>
                            <p className="font-semibold">
                                {result.pagination.total.toLocaleString(
                                    "nl-NL",
                                )}{" "}
                                {result.filters.purpose === "SALE"
                                    ? "koopwoningen"
                                    : "huurwoningen"}
                            </p>
                            {result.filters.query ? (
                                <p className="mt-0.5 text-sm text-muted">
                                    in of rond “{result.filters.query}”
                                </p>
                            ) : null}
                        </div>
                        <form action="/search">
                            {Object.entries(params).flatMap(([key, value]) =>
                                key === "sort" || key === "page"
                                    ? []
                                    : (Array.isArray(value)
                                          ? value
                                          : value
                                            ? [value]
                                            : []
                                      ).map((item) => (
                                          <input
                                              key={`${key}-${item}`}
                                              type="hidden"
                                              name={key}
                                              value={item}
                                          />
                                      )),
                            )}
                            <label className="flex items-center gap-2 text-sm text-muted">
                                <span className="hidden sm:inline">
                                    Sorteer:
                                </span>
                                <select
                                    name="sort"
                                    defaultValue={result.filters.sort}
                                    className="h-10 rounded-md border border-line bg-surface px-3 font-semibold text-foreground"
                                >
                                    <option value="newest">Nieuwste</option>
                                    <option value="price_asc">
                                        Prijs oplopend
                                    </option>
                                    <option value="price_desc">
                                        Prijs aflopend
                                    </option>
                                    <option value="area_desc">
                                        Woonoppervlak
                                    </option>
                                </select>
                                <button className="h-10 rounded-md bg-brand px-3 font-semibold text-white">
                                    Sorteer
                                </button>
                            </label>
                        </form>
                    </div>
                </div>
                <MarketplaceResults
                    listings={result.data}
                    activeBounds={result.filters.bounds}
                />
                {result.pagination.pageCount > 1 ? (
                    <nav
                        aria-label="Resultaatpagina's"
                        className="border-t border-line bg-surface px-4 py-7"
                    >
                        <div className="mx-auto flex max-w-2xl items-center justify-center gap-3">
                            {result.pagination.page > 1 ? (
                                <Link
                                    href={pageHref(
                                        params,
                                        result.pagination.page - 1,
                                    )}
                                    className="marketplace-page-button"
                                    aria-label="Vorige pagina"
                                >
                                    <ChevronLeft size={18} />
                                </Link>
                            ) : null}
                            <span className="px-3 text-sm font-semibold">
                                Pagina {result.pagination.page} van{" "}
                                {result.pagination.pageCount}
                            </span>
                            {result.pagination.page <
                            result.pagination.pageCount ? (
                                <Link
                                    href={pageHref(
                                        params,
                                        result.pagination.page + 1,
                                    )}
                                    className="marketplace-page-button"
                                    aria-label="Volgende pagina"
                                >
                                    <ChevronRight size={18} />
                                </Link>
                            ) : null}
                        </div>
                    </nav>
                ) : null}
            </main>
        </div>
    );
}
