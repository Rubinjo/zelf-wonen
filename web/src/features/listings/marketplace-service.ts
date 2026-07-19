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

export type MarketplaceListing = {
    id: string;
    slug: string;
    purpose: "SALE" | "RENT";
    status: "LIVE";
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
    energyLabel: string | null;
    priceCents: string | null;
    serviceCostsCents: string | null;
    imageUrl: string | null;
    imageUrls: string[];
    imageAlt: string;
    liveAt: string | null;
};

export type MarketplaceFilters = {
    purpose: "SALE" | "RENT";
    query: string;
    priceMin: number | null;
    priceMax: number | null;
    propertyTypes: string[];
    livingAreaMin: number | null;
    roomsMin: number | null;
    bedroomsMin: number | null;
    constructionYearMin: number | null;
    energyLabels: string[];
    amenities: string[];
    parkingOptions: string[];
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
const amenities = [
    "SOLAR_PANELS",
    "AIR_CONDITIONING",
    "FIBER_OPTIC",
    "HEAT_PUMP",
    "EV_CHARGER",
    "FIREPLACE",
] as const;
const parkingOptions = [
    "ON_PROPERTY",
    "FREE_STREET",
    "PAID_STREET",
    "PARKING_PERMIT",
    "PUBLIC_GARAGE",
    "PRIVATE_GARAGE",
] as const;
const energyLabelGroups: Record<string, string[]> = {
    A: [
        "A_PLUS_PLUS_PLUS_PLUS_PLUS",
        "A_PLUS_PLUS_PLUS_PLUS",
        "A_PLUS_PLUS_PLUS",
        "A_PLUS_PLUS",
        "A_PLUS",
        "A",
    ],
    B: ["B"],
    C: ["C"],
    D: ["D"],
    E: ["E"],
    F: ["F"],
    G: ["G"],
};

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

export function parseMarketplaceFilters(
    searchParams: MarketplaceSearchParams,
): MarketplaceFilters {
    const sort = first(searchParams.sort);
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
    return {
        purpose: first(searchParams.purpose) === "RENT" ? "RENT" : "SALE",
        query: first(searchParams.q)?.trim().slice(0, 100) ?? "",
        priceMin: positiveNumber(first(searchParams.priceMin)),
        priceMax: positiveNumber(first(searchParams.priceMax)),
        propertyTypes: allowedValues(searchParams.propertyType, propertyTypes),
        livingAreaMin: positiveNumber(first(searchParams.livingAreaMin)),
        roomsMin: positiveNumber(first(searchParams.roomsMin)),
        bedroomsMin: positiveNumber(first(searchParams.bedroomsMin)),
        constructionYearMin: positiveNumber(
            first(searchParams.constructionYearMin),
        ),
        energyLabels: allowedValues(
            searchParams.energyLabel,
            Object.keys(energyLabelGroups),
        ),
        amenities: allowedValues(searchParams.amenity, amenities),
        parkingOptions: allowedValues(searchParams.parking, parkingOptions),
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
    if (filters.constructionYearMin !== null) {
        propertyFilter.constructionYear = { gte: filters.constructionYearMin };
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
                    in: filters.energyLabels.flatMap(
                        (label) => energyLabelGroups[label],
                    ) as Prisma.EnumEnergyLabelClassFilter["in"],
                },
            },
        };
    }

    const where: Prisma.ListingWhereInput = {
        status: "LIVE",
        publicSlug: { not: null },
        purpose: filters.purpose,
        [priceField]:
            Object.keys(priceFilter).length > 0 ? priceFilter : { not: null },
        property: { is: propertyFilter },
    };
    if (filters.query) {
        where.AND = [
            {
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
            },
        ];
    }

    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
        filters.sort === "price_asc"
            ? [{ [priceField]: { sort: "asc", nulls: "last" } }]
            : filters.sort === "price_desc"
              ? [{ [priceField]: { sort: "desc", nulls: "last" } }]
              : filters.sort === "area_desc"
                ? [{ property: { livingAreaSqm: "desc" } }]
                : [{ liveAt: { sort: "desc", nulls: "last" } }];

    const [total, listings] = await db.$transaction([
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
            },
        }),
    ]);

    const data: MarketplaceListing[] = listings.map((listing) => {
        const address = `${listing.property.street} ${listing.property.houseNumber}${listing.property.houseNumberAddition ? ` ${listing.property.houseNumberAddition}` : ""}`;
        return {
            id: listing.id,
            slug: listing.publicSlug!,
            purpose: listing.purpose,
            status: "LIVE",
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
            energyLabel: listing.property.energyLabels[0]?.labelClass ?? null,
            priceCents:
                (
                    listing.askingPriceCents ?? listing.monthlyRentCents
                )?.toString() ?? null,
            serviceCostsCents: listing.serviceCostsCents?.toString() ?? null,
            imageUrl: listing.media[0]
                ? `/${listing.media[0].storageKey}`
                : null,
            imageUrls: listing.media.map((media) => `/${media.storageKey}`),
            imageAlt: listing.media[0]?.altTextNl || address,
            liveAt: listing.liveAt?.toISOString() ?? null,
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
