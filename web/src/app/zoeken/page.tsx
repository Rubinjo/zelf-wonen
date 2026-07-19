import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { MarketplaceResults } from "@/components/marketplace/marketplace-results";
import {
    searchMarketplaceListings,
    type MarketplaceSearchParams,
} from "@/features/listings/marketplace-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Huizen te koop en te huur",
    description:
        "Zoek huizen en appartementen te koop of te huur op ZelfWonen. Filter op prijs, woonoppervlak, kamers, energielabel en voorzieningen.",
};

const propertyTypeOptions = [
    ["HOUSE", "Huis"],
    ["APARTMENT", "Appartement"],
    ["LAND", "Bouwgrond"],
    ["PARKING", "Parkeerplaats"],
    ["COMMERCIAL", "Bedrijfsruimte"],
] as const;
const amenityOptions = [
    ["SOLAR_PANELS", "Zonnepanelen"],
    ["HEAT_PUMP", "Warmtepomp"],
    ["AIR_CONDITIONING", "Airconditioning"],
    ["FIBER_OPTIC", "Glasvezel"],
    ["EV_CHARGER", "Laadpaal"],
    ["FIREPLACE", "Open haard"],
] as const;
const parkingOptions = [
    ["ON_PROPERTY", "Op eigen terrein"],
    ["FREE_STREET", "Gratis parkeren"],
    ["PARKING_PERMIT", "Parkeervergunning"],
    ["PRIVATE_GARAGE", "Eigen garage"],
    ["PUBLIC_GARAGE", "Openbare garage"],
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
    return `/zoeken${query.size ? `?${query.toString()}` : ""}`;
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
    const result = await searchMarketplaceListings(params);
    const selectedPropertyTypes = values(params.propertyType);
    const selectedEnergyLabels = values(params.energyLabel);
    const selectedAmenities = values(params.amenity);
    const selectedParking = values(params.parking);
    const buildingFilterCount =
        Number(
            result.filters.constructionYearMin !== null ||
                result.filters.constructionYearMax !== null,
        ) + Number(result.filters.monumentFilter !== "all");
    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-line bg-white">
                <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 font-semibold"
                        aria-label="ZelfWonen home"
                    >
                        <span className="grid size-9 place-items-center rounded-lg bg-brand text-white">
                            <Building2 size={19} />
                        </span>
                        <span className="text-lg sm:text-xl">
                            Zelf<span className="text-brand">Wonen</span>
                        </span>
                    </Link>
                    <nav className="flex items-center gap-2 sm:gap-5">
                        <Link
                            href="/zoeken"
                            className="hidden text-sm font-semibold text-brand sm:block"
                        >
                            Woning zoeken
                        </Link>
                        <Link
                            href="/#start"
                            className="rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand hover:text-white"
                        >
                            Woning aanbieden
                        </Link>
                    </nav>
                </div>
            </header>

            <section className="border-b border-line bg-brand-dark text-white">
                <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">
                    <div className="mb-5">
                        <div>
                            <p className="text-xs font-semibold uppercase text-accent">
                                Aanbod van particuliere verkopers
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
                                Vind een plek die bij je past
                            </h1>
                        </div>
                    </div>
                    <form
                        action="/zoeken"
                        className="grid gap-2 sm:grid-cols-[160px_1fr_auto]"
                    >
                        <label className="sr-only" htmlFor="purpose">
                            Koop of huur
                        </label>
                        <select
                            id="purpose"
                            name="purpose"
                            defaultValue={result.filters.purpose}
                            className="h-13 rounded-md border-0 bg-white px-4 font-semibold text-foreground outline-none ring-brand focus:ring-2"
                        >
                            <option value="SALE">Kopen</option>
                            <option value="RENT">Huren</option>
                        </select>
                        <label className="relative">
                            <span className="sr-only">
                                Plaats, buurt, postcode of straat
                            </span>
                            <Search
                                size={19}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                            />
                            <input
                                name="q"
                                defaultValue={result.filters.query}
                                placeholder="Plaats, buurt, postcode of straat"
                                className="h-13 w-full rounded-md border-0 bg-white pl-12 pr-4 text-foreground outline-none ring-brand placeholder:text-muted focus:ring-2"
                            />
                        </label>
                        <button
                            type="submit"
                            className="inline-flex h-13 items-center justify-center gap-2 rounded-md bg-accent px-7 font-semibold text-brand-dark transition hover:bg-white"
                        >
                            <Search size={18} /> Zoeken
                        </button>
                    </form>
                </div>
            </section>

            <form
                action="/zoeken"
                className="sticky top-0 z-900 border-b border-line bg-white"
            >
                <input
                    type="hidden"
                    name="purpose"
                    value={result.filters.purpose}
                />
                {result.filters.query ? (
                    <input
                        type="hidden"
                        name="q"
                        value={result.filters.query}
                    />
                ) : null}
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
                                    placeholder="€ 0"
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
                                    placeholder="Geen maximum"
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
                            Woningtype
                            {selectedPropertyTypes.length
                                ? ` · ${selectedPropertyTypes.length}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel w-60">
                            <FilterChecks
                                name="propertyType"
                                options={propertyTypeOptions}
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
                            <label className="text-xs font-semibold text-muted">
                                Minimaal woonoppervlak
                                <select
                                    name="livingAreaMin"
                                    defaultValue={
                                        result.filters.livingAreaMin ?? ""
                                    }
                                    className="marketplace-filter-input mt-1.5"
                                >
                                    <option value="">Geen voorkeur</option>
                                    {[50, 75, 100, 125, 150, 200].map(
                                        (area) => (
                                            <option key={area} value={area}>
                                                {area} m² of meer
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs font-semibold text-muted">
                                    Kamers
                                    <select
                                        name="roomsMin"
                                        defaultValue={
                                            result.filters.roomsMin ?? ""
                                        }
                                        className="marketplace-filter-input mt-1.5"
                                    >
                                        <option value="">Alle</option>
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
                                        <option value="">Alle</option>
                                        {[1, 2, 3, 4, 5].map((count) => (
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
                                options={amenityOptions}
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
                            Parkeren
                            {selectedParking.length
                                ? ` · ${selectedParking.length}`
                                : ""}
                        </summary>
                        <div className="marketplace-filter-panel marketplace-filter-panel-right w-64">
                            <FilterChecks
                                name="parking"
                                options={parkingOptions}
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
                        <div className="marketplace-filter-panel marketplace-filter-panel-right grid w-60 gap-3">
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
                            <label className="text-xs font-semibold text-muted">
                                Monumentstatus
                                <select
                                    name="isMonument"
                                    defaultValue={
                                        result.filters.monumentFilter === "only"
                                            ? "true"
                                            : result.filters.monumentFilter ===
                                                "exclude"
                                              ? "false"
                                              : ""
                                    }
                                    className="marketplace-filter-input mt-1.5"
                                >
                                    <option value="">Alle panden</option>
                                    <option value="true">
                                        Alleen monumentale panden
                                    </option>
                                    <option value="false">
                                        Monumentale panden uitsluiten
                                    </option>
                                </select>
                            </label>
                            <button className="h-10 rounded-md bg-brand text-sm font-semibold text-white">
                                Toepassen
                            </button>
                        </div>
                    </details>
                </div>
            </form>

            <main>
                <div className="border-b border-line bg-white">
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
                        <form action="/zoeken">
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
                                    className="h-10 rounded-md border border-line bg-white px-3 font-semibold text-foreground"
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
                        className="border-t border-line bg-white px-4 py-7"
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
