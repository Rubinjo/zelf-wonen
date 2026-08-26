import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const MARKETPLACE_PAGE_SIZE = 18;

export type MarketplaceSearchParams = Record<
    string,
    string | string[] | undefined
>;

export type MarketplaceBounds = {
    north: number;
    east: number;
    south: number;
    west: number;
};

export type GardenOrientation =
    | "N"
    | "NE"
    | "E"
    | "SE"
    | "S"
    | "SW"
    | "W"
    | "NW";

export type MarketplaceStatus = "LIVE" | "UNDER_OFFER" | "SOLD" | "RENTED";

export type MarketplaceListing = {
    id: string;
    slug: string;
    purpose: "SALE" | "RENT";
    status: MarketplaceStatus;
    title: string;
    street: string;
    houseNumber: number;
    houseNumberAddition: string | null;
    postcode: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
    propertyType: string;
    livingAreaSqm: number | null;
    landAreaSqm: number | null;
    roomCount: number | null;
    bedroomCount: number | null;
    constructionYear: number | null;
    isMonument: boolean;
    erfpachtType: string | null;
    erfpachtCanonCents: string | null;
    energyLabel: string | null;
    priceCents: string | null;
    finalPriceCents: string | null;
    serviceCostsCents: string | null;
    imageUrl: string | null;
    imageUrls: string[];
    imageAlt: string;
    liveAt: string | null;
    bidWindowOpensAt: string | null;
    bidWindowClosesAt: string | null;
};

export type MarketplaceFilters = {
    purpose: "SALE" | "RENT";
    query: string;
    city: string | null;
    keywords: string[];
    hasGarden: boolean | null;
    gardenOrientation: GardenOrientation | null;
    statuses: MarketplaceStatus[];
    priceMin: number | null;
    priceMax: number | null;
    propertyTypes: string[];
    livingAreaMin: number | null;
    roomsMin: number | null;
    bedroomsMin: number | null;
    bathroomsMin: number | null;
    plotAreaMin: number | null;
    constructionYearMin: number | null;
    constructionYearMax: number | null;
    monumentFilter: "all" | "only" | "exclude";
    erfpachtFilter: "all" | "leasehold" | "freehold";
    energyLabels: string[];
    amenities: string[];
    parkingOptions: string[];
    populationDensityPerKm2Max: number | null;
    housingCorporationPercentMin: number | null;
    housingCorporationPercentMax: number | null;
    registeredCrimesPer1000Max: number | null;
    supermarketDistanceKmMax: number | null;
    primarySchoolDistanceKmMax: number | null;
    busStopDistanceMetersMax: number | null;
    trainStationDistanceMetersMax: number | null;
    foundationRiskFilter: "all" | "low" | "none_low";
    noiseRoadLdenMax: number | null;
    availableFrom: "any" | "now" | "1m" | "3m";
    bounds: MarketplaceBounds | null;
    sort: "newest" | "price_asc" | "price_desc" | "area_desc";
    page: number;
};

const propertyTypes = [
    "HOUSE",
    "APARTMENT",
    "PARKING",
    "LAND",
    "COMMERCIAL",
    "OTHER",
] as const;
const marketplaceStatuses = ["LIVE", "UNDER_OFFER", "SOLD", "RENTED"] as const;
const amenities = [
    "SOLAR_PANELS",
    "AIR_CONDITIONING",
    "FIBER_OPTIC",
    "HEAT_PUMP",
    "EV_CHARGER",
    "FIREPLACE",
    "MECHANICAL_VENTILATION",
    "ALARM_SYSTEM",
] as const;
const parkingOptions = [
    "ON_PROPERTY",
    "FREE_STREET",
    "PAID_STREET",
    "PARKING_PERMIT",
    "PUBLIC_GARAGE",
    "PRIVATE_GARAGE",
    "SPACE_FOR_SALE",
] as const;
const energyLabels = [
    "A_PLUS_PLUS_PLUS_PLUS_PLUS",
    "A_PLUS_PLUS_PLUS_PLUS",
    "A_PLUS_PLUS_PLUS",
    "A_PLUS_PLUS",
    "A_PLUS",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
] as const;

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function selected(value: string | string[] | undefined) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values.flatMap((item) => item.split(",")).filter(Boolean);
}

function positiveNumber(value: string | undefined) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function constructionYear(value: string | undefined) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 2200
        ? parsed
        : null;
}

function coordinate(value: string | undefined, min: number, max: number) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max
        ? parsed
        : null;
}

function allowedValues(
    value: string | string[] | undefined,
    allowed: readonly string[],
) {
    return selected(value).filter((item) => allowed.includes(item));
}

const gardenOrientations = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
] as const;

function gardenOrientation(value: string | undefined) {
    return value && (gardenOrientations as readonly string[]).includes(value)
        ? (value as GardenOrientation)
        : null;
}

function cleanKeyword(value: string) {
    return value.trim().slice(0, 40);
}

const orientationDutchMap: Record<GardenOrientation, string> = {
    N: "noorden",
    NE: "noordoosten",
    E: "oosten",
    SE: "zuidoosten",
    S: "zuiden",
    SW: "zuidwesten",
    W: "westen",
    NW: "noordwesten",
};

function orientationDutch(orientation: GardenOrientation) {
    return orientationDutchMap[orientation];
}

export function parseMarketplaceFilters(
    searchParams: MarketplaceSearchParams,
): MarketplaceFilters {
    const sort = first(searchParams.sort);
    const monument = first(searchParams.isMonument);
    const north = coordinate(first(searchParams.north), -90, 90);
    const east = coordinate(first(searchParams.east), -180, 180);
    const south = coordinate(first(searchParams.south), -90, 90);
    const west = coordinate(first(searchParams.west), -180, 180);
    const bounds =
        north !== null &&
        east !== null &&
        south !== null &&
        west !== null &&
        south < north &&
        west < east
            ? { north, east, south, west }
            : null;
    const selectedStatuses = allowedValues(
        searchParams.status,
        marketplaceStatuses,
    ) as MarketplaceStatus[];
    return {
        purpose: first(searchParams.purpose) === "RENT" ? "RENT" : "SALE",
        query: first(searchParams.q)?.trim().slice(0, 100) ?? "",
        city: first(searchParams.city)?.trim().slice(0, 80) || null,
        keywords: selected(searchParams.keyword)
            .map(cleanKeyword)
            .filter(Boolean)
            .slice(0, 5),
        hasGarden: (() => {
            const value = first(searchParams.hasGarden);
            return value === "true" ? true : value === "false" ? false : null;
        })(),
        gardenOrientation: gardenOrientation(
            first(searchParams.gardenOrientation),
        ),
        statuses: selectedStatuses.length > 0 ? selectedStatuses : ["LIVE"],
        priceMin: positiveNumber(first(searchParams.priceMin)),
        priceMax: positiveNumber(first(searchParams.priceMax)),
        propertyTypes: allowedValues(searchParams.propertyType, propertyTypes),
        livingAreaMin: positiveNumber(first(searchParams.livingAreaMin)),
        roomsMin: positiveNumber(first(searchParams.roomsMin)),
        bedroomsMin: positiveNumber(first(searchParams.bedroomsMin)),
        bathroomsMin: positiveNumber(first(searchParams.bathroomsMin)),
        plotAreaMin: positiveNumber(first(searchParams.plotAreaMin)),
        constructionYearMin: constructionYear(
            first(searchParams.constructionYearMin),
        ),
        constructionYearMax: constructionYear(
            first(searchParams.constructionYearMax),
        ),
        monumentFilter:
            monument === "true"
                ? "only"
                : monument === "false"
                  ? "exclude"
                  : "all",
        erfpachtFilter: (() => {
            const value = first(searchParams.erfpacht);
            return value === "leasehold"
                ? "leasehold"
                : value === "freehold"
                  ? "freehold"
                  : "all";
        })(),
        energyLabels: allowedValues(searchParams.energyLabel, energyLabels),
        amenities: allowedValues(searchParams.amenity, amenities),
        parkingOptions: allowedValues(searchParams.parking, parkingOptions),
        populationDensityPerKm2Max: positiveNumber(
            first(searchParams.populationDensityPerKm2Max),
        ),
        housingCorporationPercentMin: positiveNumber(
            first(searchParams.housingCorporationPercentMin),
        ),
        housingCorporationPercentMax: positiveNumber(
            first(searchParams.housingCorporationPercentMax),
        ),
        registeredCrimesPer1000Max: positiveNumber(
            first(searchParams.registeredCrimesPer1000Max),
        ),
        supermarketDistanceKmMax: positiveNumber(
            first(searchParams.supermarketDistanceKmMax),
        ),
        primarySchoolDistanceKmMax: positiveNumber(
            first(searchParams.primarySchoolDistanceKmMax),
        ),
        busStopDistanceMetersMax: positiveNumber(
            first(searchParams.busStopDistanceMetersMax),
        ),
        trainStationDistanceMetersMax: positiveNumber(
            first(searchParams.trainStationDistanceMetersMax),
        ),
        foundationRiskFilter: (() => {
            const value = first(searchParams.foundationRisk);
            return value === "low"
                ? "low"
                : value === "none_low"
                  ? "none_low"
                  : "all";
        })(),
        noiseRoadLdenMax: positiveNumber(first(searchParams.noiseRoadLdenMax)),
        availableFrom: (() => {
            const value = first(searchParams.availableFrom);
            return value === "now" || value === "1m" || value === "3m"
                ? value
                : "any";
        })(),
        bounds,
        sort: ["price_asc", "price_desc", "area_desc"].includes(sort ?? "")
            ? (sort as MarketplaceFilters["sort"])
            : "newest",
        page: Math.max(
            1,
            Math.floor(positiveNumber(first(searchParams.page)) ?? 1),
        ),
    };
}

export async function searchMarketplaceListings(
    searchParams: MarketplaceSearchParams,
) {
    const filters = parseMarketplaceFilters(searchParams);
    const priceField =
        filters.purpose === "RENT" ? "monthlyRentCents" : "askingPriceCents";
    const priceFilter: Prisma.BigIntNullableFilter = {};
    if (filters.priceMin !== null) {
        priceFilter.gte = BigInt(Math.round(filters.priceMin * 100));
    }
    if (filters.priceMax !== null) {
        priceFilter.lte = BigInt(Math.round(filters.priceMax * 100));
    }

    const propertyFilter: Prisma.PropertyWhereInput = {};
    if (filters.propertyTypes.length > 0) {
        propertyFilter.propertyType = {
            in: filters.propertyTypes as Prisma.EnumPropertyTypeFilter["in"],
        };
    }
    if (filters.livingAreaMin !== null) {
        propertyFilter.livingAreaSqm = { gte: filters.livingAreaMin };
    }
    if (filters.roomsMin !== null) {
        propertyFilter.roomCount = { gte: filters.roomsMin };
    }
    if (filters.bedroomsMin !== null) {
        propertyFilter.bedroomCount = { gte: filters.bedroomsMin };
    }
    if (filters.bathroomsMin !== null) {
        propertyFilter.bathroomCount = { gte: filters.bathroomsMin };
    }
    if (filters.plotAreaMin !== null) {
        propertyFilter.officialLandAreaSqm = { gte: filters.plotAreaMin };
    }
    if (
        filters.constructionYearMin !== null ||
        filters.constructionYearMax !== null
    ) {
        propertyFilter.constructionYear = {
            ...(filters.constructionYearMin !== null
                ? { gte: filters.constructionYearMin }
                : {}),
            ...(filters.constructionYearMax !== null
                ? { lte: filters.constructionYearMax }
                : {}),
        };
    }
    if (filters.monumentFilter !== "all") {
        propertyFilter.isMonument = filters.monumentFilter === "only";
    }
    if (filters.erfpachtFilter === "leasehold") {
        propertyFilter.erfpachtType = {
            in: ["LEASEHOLD", "LEASEHOLD_AFGEKOCHT"],
        };
    } else if (filters.erfpachtFilter === "freehold") {
        propertyFilter.erfpachtType = "FREEHOLD";
    }
    if (filters.bounds) {
        propertyFilter.latitude = {
            gte: filters.bounds.south,
            lte: filters.bounds.north,
        };
        propertyFilter.longitude = {
            gte: filters.bounds.west,
            lte: filters.bounds.east,
        };
    }
    if (filters.amenities.length > 0) {
        propertyFilter.amenities = {
            hasEvery:
                filters.amenities as Prisma.EnumPropertyAmenityNullableListFilter["hasEvery"],
        };
    }
    if (filters.parkingOptions.length > 0) {
        propertyFilter.parkingOptions = {
            hasSome:
                filters.parkingOptions as Prisma.EnumParkingOptionNullableListFilter["hasSome"],
        };
    }
    if (filters.energyLabels.length > 0) {
        propertyFilter.energyLabels = {
            some: {
                labelClass: {
                    in: filters.energyLabels as Prisma.EnumEnergyLabelClassFilter["in"],
                },
            },
        };
    }
    const neighborhoodFilter: Prisma.NeighborhoodProfileWhereInput = {};
    const housingCorporationFilter: Prisma.DecimalNullableFilter = {};
    if (filters.housingCorporationPercentMin !== null) {
        housingCorporationFilter.gte = filters.housingCorporationPercentMin;
    }
    if (filters.housingCorporationPercentMax !== null) {
        housingCorporationFilter.lte = filters.housingCorporationPercentMax;
    }
    if (Object.keys(housingCorporationFilter).length > 0) {
        neighborhoodFilter.housingCorporationPercent = housingCorporationFilter;
    }
    if (filters.populationDensityPerKm2Max !== null) {
        neighborhoodFilter.populationDensityPerKm2 = {
            lte: filters.populationDensityPerKm2Max,
        };
    }
    if (filters.registeredCrimesPer1000Max !== null) {
        neighborhoodFilter.registeredCrimesPer1000 = {
            lte: filters.registeredCrimesPer1000Max,
        };
    }
    if (filters.supermarketDistanceKmMax !== null) {
        neighborhoodFilter.supermarketDistanceKm = {
            lte: filters.supermarketDistanceKmMax,
        };
    }
    if (filters.primarySchoolDistanceKmMax !== null) {
        neighborhoodFilter.primarySchoolDistanceKm = {
            lte: filters.primarySchoolDistanceKmMax,
        };
    }
    if (filters.busStopDistanceMetersMax !== null) {
        neighborhoodFilter.busStopDistanceMeters = {
            lte: filters.busStopDistanceMetersMax,
        };
    }
    if (filters.trainStationDistanceMetersMax !== null) {
        neighborhoodFilter.trainStationDistanceMeters = {
            lte: filters.trainStationDistanceMetersMax,
        };
    }
    if (filters.foundationRiskFilter === "low") {
        // Alleen woningen met een bekende, laag risico funderingssituatie.
        neighborhoodFilter.foundationRiskLevel = {
            in: ["NONE", "LOW"],
        };
    } else if (filters.foundationRiskFilter === "none_low") {
        // Sluit bekende verhoogde risico's uit; onbekend blijft zichtbaar.
        neighborhoodFilter.foundationRiskLevel = {
            notIn: ["MEDIUM", "HIGH"],
        };
    }
    if (filters.noiseRoadLdenMax !== null) {
        neighborhoodFilter.noiseRoadLden = {
            lte: filters.noiseRoadLdenMax,
        };
    }
    if (Object.keys(neighborhoodFilter).length > 0) {
        propertyFilter.neighborhoodProfile = { is: neighborhoodFilter };
    }

    const where: Prisma.ListingWhereInput = {
        status: {
            in: filters.statuses as Prisma.EnumListingStatusFilter["in"],
        },
        publicSlug: { not: null },
        purpose: filters.purpose,
        [priceField]:
            Object.keys(priceFilter).length > 0 ? priceFilter : { not: null },
        property: { is: propertyFilter },
    };
    const andConditions: Prisma.ListingWhereInput[] = [];
    if (filters.availableFrom !== "any") {
        // Woningen zonder bekende opleverdatum gelden als direct beschikbaar
        // en blijven binnen elke gekozen periode zichtbaar.
        const now = new Date();
        const horizon = new Date(now);
        horizon.setDate(
            horizon.getDate() +
                (filters.availableFrom === "now"
                    ? 0
                    : filters.availableFrom === "1m"
                      ? 31
                      : 92),
        );
        andConditions.push({
            OR: [{ availableFrom: null }, { availableFrom: { lte: horizon } }],
        });
    }
    if (filters.query) {
        andConditions.push({
            OR: [
                {
                    titleNl: {
                        contains: filters.query,
                        mode: "insensitive",
                    },
                },
                {
                    property: {
                        is: {
                            OR: [
                                {
                                    city: {
                                        contains: filters.query,
                                        mode: "insensitive",
                                    },
                                },
                                {
                                    street: {
                                        contains: filters.query,
                                        mode: "insensitive",
                                    },
                                },
                                {
                                    postcode: {
                                        contains: filters.query.replaceAll(
                                            " ",
                                            "",
                                        ),
                                        mode: "insensitive",
                                    },
                                },
                            ],
                        },
                    },
                },
            ],
        });
    }
    if (filters.city) {
        andConditions.push({
            property: {
                is: { city: { equals: filters.city, mode: "insensitive" } },
            },
        });
    }
    if (filters.keywords.length > 0) {
        // Elke term moet voorkomen in titel of omschrijving (NL/EN).
        andConditions.push(
            ...filters.keywords.map((keyword) => ({
                OR: [
                    {
                        titleNl: {
                            contains: keyword,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        descriptionNl: {
                            contains: keyword,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        titleEn: {
                            contains: keyword,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        descriptionEn: {
                            contains: keyword,
                            mode: "insensitive" as const,
                        },
                    },
                ],
            })),
        );
    }
    if (filters.hasGarden === true || filters.gardenOrientation !== null) {
        // Tuinwens: gestructureerd (layout.garden) of tekstueel
        // ("tuin" in titel/omschrijving).
        const gardenPresentCondition: Prisma.ListingWhereInput = {
            OR: [
                {
                    // Gestructureerd: layout.garden bestaat (jsonb-pad).
                    property: {
                        is: {
                            layout: {
                                path: ["garden"],
                                not: Prisma.DbNull,
                            },
                        },
                    },
                },
                { titleNl: { contains: "tuin", mode: "insensitive" as const } },
                {
                    descriptionNl: {
                        contains: "tuin",
                        mode: "insensitive" as const,
                    },
                },
                {
                    titleEn: {
                        contains: "garden",
                        mode: "insensitive" as const,
                    },
                },
                {
                    descriptionEn: {
                        contains: "garden",
                        mode: "insensitive" as const,
                    },
                },
            ],
        };
        if (filters.gardenOrientation !== null) {
            // Bij een oriëntatie moet de tuin áánwezig zijn én de oriëntatie
            // expliciet genoemd worden (gestructureerd of in de tekst).
            andConditions.push({
                AND: [
                    gardenPresentCondition,
                    {
                        OR: [
                            {
                                property: {
                                    is: {
                                        layout: {
                                            path: ["garden", "orientation"],
                                            // Scalair op een JSON-pad:
                                            // array_contains doet @>
                                            // (containment) en werkt hier
                                            // niet op een stringwaarde.
                                            equals: filters.gardenOrientation,
                                        },
                                    },
                                },
                            },
                            {
                                descriptionNl: {
                                    contains: `op het ${orientationDutch(filters.gardenOrientation)}`,
                                    mode: "insensitive" as const,
                                },
                            },
                            {
                                descriptionNl: {
                                    contains: `op ${orientationDutch(filters.gardenOrientation)}`,
                                    mode: "insensitive" as const,
                                },
                            },
                        ],
                    },
                ],
            });
        } else {
            andConditions.push(gardenPresentCondition);
        }
    }
    if (andConditions.length > 0) {
        where.AND = andConditions;
    }

    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
        filters.sort === "price_asc"
            ? [{ [priceField]: { sort: "asc", nulls: "last" } }]
            : filters.sort === "price_desc"
              ? [{ [priceField]: { sort: "desc", nulls: "last" } }]
              : filters.sort === "area_desc"
                ? [{ property: { livingAreaSqm: "desc" } }]
                : [{ liveAt: { sort: "desc", nulls: "last" } }];

    const [total, listings] = await Promise.all([
        db.listing.count({ where }),
        db.listing.findMany({
            where,
            orderBy,
            skip: (filters.page - 1) * MARKETPLACE_PAGE_SIZE,
            take: MARKETPLACE_PAGE_SIZE,
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
                    where: { kind: "PHOTO", status: "READY" },
                    orderBy: { sortOrder: "asc" },
                    take: 3,
                },
                transactions: {
                    where: { status: { not: "CANCELLED" } },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { purchasePriceCents: true },
                },
            },
        }),
    ]);

    const data: MarketplaceListing[] = listings.map((listing) => {
        const address = `${listing.property.street} ${listing.property.houseNumber}${listing.property.houseNumberAddition ? ` ${listing.property.houseNumberAddition}` : ""}`;
        const finalPriceCents =
            listing.status === "LIVE"
                ? null
                : (listing.transactions[0]?.purchasePriceCents?.toString() ??
                  null);
        return {
            id: listing.id,
            slug: listing.publicSlug!,
            purpose: listing.purpose,
            status: listing.status as MarketplaceStatus,
            title: listing.titleNl || address,
            street: listing.property.street,
            houseNumber: listing.property.houseNumber,
            houseNumberAddition: listing.property.houseNumberAddition,
            postcode: listing.property.postcode,
            city: listing.property.city,
            latitude: listing.property.latitude
                ? Number(listing.property.latitude)
                : null,
            longitude: listing.property.longitude
                ? Number(listing.property.longitude)
                : null,
            propertyType: listing.property.propertyType,
            livingAreaSqm: listing.property.livingAreaSqm
                ? Number(listing.property.livingAreaSqm)
                : null,
            landAreaSqm: listing.property.officialLandAreaSqm
                ? Number(listing.property.officialLandAreaSqm)
                : null,
            roomCount: listing.property.roomCount,
            bedroomCount: listing.property.bedroomCount,
            constructionYear: listing.property.constructionYear,
            isMonument: listing.property.isMonument,
            erfpachtType: listing.property.erfpachtType ?? null,
            erfpachtCanonCents:
                listing.property.erfpachtCanonCents?.toString() ?? null,
            energyLabel: listing.property.energyLabels[0]?.labelClass ?? null,
            priceCents:
                (
                    listing.askingPriceCents ?? listing.monthlyRentCents
                )?.toString() ?? null,
            finalPriceCents,
            serviceCostsCents: listing.serviceCostsCents?.toString() ?? null,
            imageUrl: listing.media[0]
                ? `/${listing.media[0].storageKey}`
                : null,
            imageUrls: listing.media.map((media) => `/${media.storageKey}`),
            imageAlt: listing.media[0]?.altTextNl || address,
            liveAt: listing.liveAt?.toISOString() ?? null,
            bidWindowOpensAt: listing.bidWindowOpensAt?.toISOString() ?? null,
            bidWindowClosesAt: listing.bidWindowClosesAt?.toISOString() ?? null,
        };
    });

    return {
        data,
        filters,
        pagination: {
            page: filters.page,
            pageSize: MARKETPLACE_PAGE_SIZE,
            total,
            pageCount: Math.max(1, Math.ceil(total / MARKETPLACE_PAGE_SIZE)),
        },
    };
}
