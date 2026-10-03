import type { Prisma } from "@/generated/prisma/client";
import type { MarketplaceFilters, MarketplaceListing } from "./marketplace-service";

export function aggregatedMarketplaceWhere(
    filters: MarketplaceFilters,
    priceFilter: Prisma.BigIntNullableFilter,
    property: Prisma.PropertyWhereInput,
): Prisma.AggregatedListingWhereInput {
    // Expired/offline imports do not establish a completed sale or tenancy.
    // Filters requiring data that imports lack must not produce false matches.
    const unsupported = filters.monumentFilter !== "all" || filters.erfpachtFilter !== "all"
        || filters.parkingOptions.length > 0;
    const where: Prisma.AggregatedListingWhereInput = {
        ...(unsupported || !filters.statuses.includes("LIVE") ? { id: { in: [] } } : {}),
        status: "ACTIVE",
        purpose: filters.purpose,
        ...(property.neighborhoodProfile ? { neighborhoodProfile: property.neighborhoodProfile } : {}),
        [filters.purpose === "RENT" ? "monthlyRentCents" : "askingPriceCents"]:
            Object.keys(priceFilter).length ? priceFilter : { not: null },
        ...(filters.propertyTypes.length ? { propertyType: { in: filters.propertyTypes as Prisma.EnumPropertyTypeFilter["in"] } } : {}),
        ...(filters.livingAreaMin !== null ? { livingAreaSqm: { gte: filters.livingAreaMin } } : {}),
        ...(filters.roomsMin !== null ? { roomCount: { gte: filters.roomsMin } } : {}),
        ...(filters.bedroomsMin !== null ? { bedroomCount: { gte: filters.bedroomsMin } } : {}),
        ...(filters.bathroomsMin !== null ? { bathroomCount: { gte: filters.bathroomsMin } } : {}),
        ...(filters.plotAreaMin !== null ? { plotAreaSqm: { gte: filters.plotAreaMin } } : {}),
        ...(filters.constructionYearMin !== null || filters.constructionYearMax !== null ? {
            constructionYear: {
                ...(filters.constructionYearMin !== null ? { gte: filters.constructionYearMin } : {}),
                ...(filters.constructionYearMax !== null ? { lte: filters.constructionYearMax } : {}),
            },
        } : {}),
        ...(filters.bounds ? {
            latitude: { gte: filters.bounds.south, lte: filters.bounds.north },
            longitude: { gte: filters.bounds.west, lte: filters.bounds.east },
        } : {}),
        ...(filters.city ? { city: { equals: filters.city, mode: "insensitive" } } : {}),
        ...(filters.energyLabels.length ? {
            energyLabel: { in: filters.energyLabels as Prisma.EnumEnergyLabelClassFilter["in"] },
        } : {}),
        ...(filters.amenities.length ? { amenities: { hasEvery: filters.amenities } } : {}),
    };
    const and: Prisma.AggregatedListingWhereInput[] = [];
    if (filters.query) {
        and.push({ OR: [
            { titleNl: { contains: filters.query, mode: "insensitive" } },
            { city: { contains: filters.query, mode: "insensitive" } },
            { street: { contains: filters.query, mode: "insensitive" } },
            { postcode: { contains: filters.query.replaceAll(" ", ""), mode: "insensitive" } },
        ] });
    }
    const textCondition = (term: string): Prisma.AggregatedListingWhereInput => ({ OR: [
        { titleNl: { contains: term, mode: "insensitive" } },
        { descriptionNl: { contains: term, mode: "insensitive" } },
    ] });
    and.push(...filters.keywords.map(textCondition));
    if (filters.hasGarden === true || filters.gardenOrientation) {
        and.push({ OR: [textCondition("tuin"), textCondition("garden")] });
        if (filters.gardenOrientation) {
            const directions = { N: "noorden", NE: "noordoosten", E: "oosten", SE: "zuidoosten", S: "zuiden", SW: "zuidwesten", W: "westen", NW: "noordwesten" };
            and.push({ OR: [textCondition(`op het ${directions[filters.gardenOrientation]}`), textCondition(`op ${directions[filters.gardenOrientation]}`)] });
        }
    }
    if (filters.availableFrom !== "any") {
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + (filters.availableFrom === "now" ? 0 : filters.availableFrom === "1m" ? 31 : 92));
        and.push({ OR: [{ availableFrom: null }, { availableFrom: { lte: horizon } }] });
    }
    if (and.length) where.AND = and;
    return where;
}

type ImportedListing = Prisma.AggregatedListingGetPayload<{
    include: { images: true; platformLinks: true };
}>;

export function toMarketplaceListing(listing: ImportedListing): MarketplaceListing {
    const address = `${listing.street} ${listing.houseNumber}${listing.houseNumberAddition ? ` ${listing.houseNumberAddition}` : ""}`;
    const base = (process.env.AGGREGATED_MEDIA_BASE_URL ?? "/aggregated-media").replace(/\/+$/, "");
    const imageUrls = listing.images.map((image) => `${base}/${image.storageKey}`);
    return {
        id: listing.id, slug: listing.publicSlug, purpose: listing.purpose, status: "LIVE",
        title: listing.titleNl || address, street: listing.street, houseNumber: listing.houseNumber,
        houseNumberAddition: listing.houseNumberAddition, postcode: listing.postcode ?? "", city: listing.city,
        latitude: listing.latitude === null ? null : Number(listing.latitude),
        longitude: listing.longitude === null ? null : Number(listing.longitude),
        propertyType: listing.propertyType,
        livingAreaSqm: listing.livingAreaSqm === null ? null : Number(listing.livingAreaSqm),
        landAreaSqm: listing.plotAreaSqm === null ? null : Number(listing.plotAreaSqm),
        roomCount: listing.roomCount, bedroomCount: listing.bedroomCount,
        constructionYear: listing.constructionYear, isMonument: false,
        erfpachtType: null, erfpachtCanonCents: null, energyLabel: listing.energyLabel,
        priceCents: (listing.purpose === "RENT" ? listing.monthlyRentCents : listing.askingPriceCents)?.toString() ?? null,
        finalPriceCents: null, serviceCostsCents: listing.serviceCostsCents?.toString() ?? null,
        imageUrl: imageUrls[0] ?? null, imageUrls, imageAlt: address,
        liveAt: listing.firstSeenAt.toISOString(), bidWindowOpensAt: null, bidWindowClosesAt: null,
        externalSource: listing.platformLinks.map((link) => link.source === "KAMERNET" ? "Kamernet" : "Funda").join(" / ") || "External",
    };
}

export function compareMarketplaceListings(a: MarketplaceListing, b: MarketplaceListing, sort: MarketplaceFilters["sort"]): number {
    const value = (listing: MarketplaceListing) => sort === "price_asc" || sort === "price_desc"
        ? listing.priceCents === null ? null : BigInt(listing.priceCents)
        : sort === "area_desc" ? listing.livingAreaSqm
        : listing.liveAt === null ? null : Date.parse(listing.liveAt);
    const left = value(a);
    const right = value(b);
    const tie = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (left === right) return tie;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left < right ? -1 : 1) * (sort === "price_asc" ? 1 : -1);
}
