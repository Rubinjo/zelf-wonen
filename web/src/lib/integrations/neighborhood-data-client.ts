// The CBS "Kerncijfers wijken en buurten" datasets publish the same columns
// under different numbered keys per year (e.g. InBezitWoningcorporatie_49 in
// 2024/2025 versus _42 in 2021/2022), so columns are resolved by their stable
// title instead of a hard-coded key. The newest datasets are always tried first.
const CBS_NEIGHBORHOOD_FALLBACKS: NeighborhoodDataset[] = [
    { identifier: "86165NED", year: 2025 },
    { identifier: "85984NED", year: 2024 },
];
const CBS_CRIME_DATASET = "83648NED";
const CBS_ODATA_URL = "https://opendata.cbs.nl/ODataApi/OData";
const CBS_CATALOG_URL = "https://opendata.cbs.nl/ODataCatalog/Tables";
const OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
] as const;

const NEIGHBORHOOD_DATASETS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// CBS "Bevolking 15 tot 75 jaar; opleidingsniveau, wijken en buurten".
const CBS_EDUCATION_DATASET = "86232NED";
// De hoofdwaarde (puntsschatting) in de opleidingsdataset; de andere Marges-
// waarden zijn de 95%-betrouwbaarheidsmarges (MOG0095/MBG0095).
const CBS_EDUCATION_MAIN_MARGIN = "MW00000";

// RIVM Atlas Leefomgeving – jaargemiddelde geluidsbelasting (Lden) per bron.
// Ruwe indicatie op een raster van 10 meter, geen geveltoets. Laag- en
// bovengrenzen worden in de UI tegen de wettelijke voorkeursgrenswaarde gezet.
const RIVM_NOISE_WMS_URL = "https://geoservices.rivm.nl/geluid/ows";
const NOISE_WMS_LAYERS: ReadonlyArray<[NoiseSourceKey, string]> = [
    ["road", "GeluidBelastingWegverkeerLden"],
    ["rail", "GeluidBelastingSpoorwegLden"],
    ["industry", "GeluidBelastingIndustrieLden"],
    ["aircraft", "GeluidBelastingLuchtvaartLden"],
];

// PDOK/KCAF – indicatieve aandachtsgebieden funderingsproblematiek (met BAG-
// bouwjaarpercentages). Een punt buiten een aandachtsgebied geeft geen feature.
const FOUNDATION_WMS_URL =
    "https://service.pdok.nl/rvo/indicatieve-aandachtsgebieden-funderingsproblematiek/wms/v1_0";
const FOUNDATION_WMS_LAYER = "indgebfunderingsproblematiek";

type CbsResponse<T> = { value?: T[] };

// Maps a semantic column to its stable title in the CBS dataset. The numbered
// keys (e.g. InBezitWoningcorporatie_49) change between dataset years, so rows
// are read through a title->key map resolved per dataset.
const CBS_COLUMN_TITLES = {
    population: "Aantal inwoners",
    populationDensity: "Bevolkingsdichtheid",
    housingCorporation: "In bezit woningcorporatie",
    age0To14: "0 tot 15 jaar",
    age15To24: "15 tot 25 jaar",
    age25To44: "25 tot 45 jaar",
    age45To64: "45 tot 65 jaar",
    age65Plus: "65 jaar of ouder",
    supermarketDistance: "Afstand tot grote supermarkt",
    primarySchoolDistance: "Afstand tot school",
    daycareDistance: "Afstand tot kinderdagverblijf",
    generalPracticeDistance: "Afstand tot huisartsenpraktijk",
    primarySchoolsWithin3Km: "Scholen binnen 3 km",
    male: "Mannen",
    female: "Vrouwen",
    totalHouseholds: "Huishoudens totaal",
    singlePersonHouseholds: "Eenpersoonshuishoudens",
    householdsWithoutChildren: "Huishoudens zonder kinderen",
    householdsWithChildren: "Huishoudens met kinderen",
    averageHouseholdSize: "Gemiddelde huishoudensgrootte",
} as const;

type CbsColumnName = keyof typeof CBS_COLUMN_TITLES;

// Core columns a dataset must provide to be usable. Remaining columns are
// optional and fall back to null when a dataset does not include them, so the
// newest available year is always preferred.
const CBS_REQUIRED_COLUMNS: readonly CbsColumnName[] = [
    "population",
    "populationDensity",
    "housingCorporation",
];

type CbsColumns = Record<CbsColumnName, string | undefined>;

type CbsProperty = {
    Key?: string;
    Title?: string;
};

type CbsNeighborhoodRow = {
    WijkenEnBuurten?: string;
} & Record<string, number | string | null | undefined>;

type CbsCrimeRow = {
    RegioS?: string;
    Perioden?: string;
    GeregistreerdeMisdrijvenPer1000Inw_3?: number | null;
};

type CbsCatalogTable = {
    Identifier?: string;
    Period?: string;
};

type NeighborhoodDataset = {
    identifier: string;
    year: number;
};

// Welke geluidsbronnen we per woning kunnen tonen (Lden).
export type NoiseSourceKey = "road" | "rail" | "industry" | "aircraft";

// Indicatief funderingsrisico, afgeleid van de KCAF-aandachtsgebieden (PDOK).
export type FoundationRiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

type NoiseLookup = Record<NoiseSourceKey, number | null>;

type FoundationLookup = {
    level: FoundationRiskLevel;
    areaShare: number | null;
    pre1970Percent: number | null;
    groundClass: string | null;
    detail: string | null;
};

type EducationLookup = {
    lowPercent: number;
    mediumPercent: number;
    highPercent: number;
    year: number;
    sourceUrl: string;
};

let neighborhoodDatasetsCache: NeighborhoodDataset[] | null = null;
let neighborhoodDatasetsCachedAt = 0;
const datasetColumnsCache = new Map<string, CbsColumns | null>();

type OverpassElement = {
    id: number;
    type: string;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
    tags?: Record<string, string>;
};

type FacilityKind =
    | "supermarket"
    | "school"
    | "bus"
    | "tram"
    | "metro"
    | "train";

type FacilitySummary = {
    nearestMeters: number | null;
    countWithinOneKm: number;
};

export type NeighborhoodLookup = {
    neighborhoodCode: string;
    neighborhoodName: string;
    districtCode: string | null;
    districtName: string | null;
    municipalityCode: string;
    latitude: number | null;
    longitude: number | null;
};

export type NeighborhoodData = {
    neighborhoodCode: string;
    neighborhoodName: string;
    districtCode: string | null;
    districtName: string | null;
    municipalityCode: string;
    statisticsYear: number;
    population: number | null;
    populationDensityPerKm2: number | null;
    nationalPopulationDensityPerKm2: number | null;
    age0To14Percent: number | null;
    age15To24Percent: number | null;
    age25To44Percent: number | null;
    age45To64Percent: number | null;
    age65PlusPercent: number | null;
    nationalAge0To14Percent: number | null;
    nationalAge15To24Percent: number | null;
    nationalAge25To44Percent: number | null;
    nationalAge45To64Percent: number | null;
    nationalAge65PlusPercent: number | null;
    housingCorporationPercent: number | null;
    nationalHousingCorporationPercent: number | null;
    registeredCrimesPer1000: number | null;
    nationalRegisteredCrimesPer1000: number | null;
    crimeStatisticsYear: number | null;
    supermarketDistanceKm: number | null;
    primarySchoolDistanceKm: number | null;
    daycareDistanceKm: number | null;
    generalPracticeDistanceKm: number | null;
    primarySchoolsWithin3Km: number | null;
    supermarketsWithin1Km: number | null;
    schoolsWithin1Km: number | null;
    busStopDistanceMeters: number | null;
    tramStopDistanceMeters: number | null;
    metroStationDistanceMeters: number | null;
    trainStationDistanceMeters: number | null;
    noiseRoadLden: number | null;
    noiseRailLden: number | null;
    noiseIndustryLden: number | null;
    noiseAircraftLden: number | null;
    noiseGridMeters: number | null;
    noiseSource: string | null;
    noiseRetrievedAt: Date | null;
    foundationRiskLevel: FoundationRiskLevel | null;
    foundationRiskAreaShare: number | null;
    foundationPre1970Percent: number | null;
    foundationGroundClass: string | null;
    foundationRiskDetail: string | null;
    foundationRiskSource: string | null;
    foundationRiskRetrievedAt: Date | null;
    malePercent: number | null;
    femalePercent: number | null;
    averageHouseholdSize: number | null;
    singleHouseholdPercent: number | null;
    coupleHouseholdPercent: number | null;
    familyHouseholdPercent: number | null;
    educationLowPercent: number | null;
    educationMediumPercent: number | null;
    educationHighPercent: number | null;
    educationStatisticsYear: number | null;
    demographicsSourceUrl: string | null;
    demographicsRetrievedAt: Date | null;
    cbsDataset: string;
    cbsSourceUrl: string;
    cbsRetrievedAt: Date;
    crimeDataset: string | null;
    crimeSourceUrl: string | null;
    osmSourceUrl: string | null;
    osmRetrievedAt: Date | null;
};

async function fetchCbs<T>(
    dataset: string,
    collection: string,
    filter?: string,
) {
    const url = new URL(`${CBS_ODATA_URL}/${dataset}/${collection}`);
    if (filter) url.searchParams.set("$filter", filter);
    url.searchParams.set("$format", "json");
    const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(6_000),
        next: { revalidate: 86_400 },
    });
    if (!response.ok) {
        throw new Error(`CBS lookup failed with status ${response.status}`);
    }
    return (await response.json()) as CbsResponse<T>;
}

async function latestNeighborhoodDatasets(): Promise<NeighborhoodDataset[]> {
    const now = Date.now();
    if (
        neighborhoodDatasetsCache &&
        now - neighborhoodDatasetsCachedAt < NEIGHBORHOOD_DATASETS_CACHE_TTL_MS
    ) {
        return neighborhoodDatasetsCache;
    }
    const url = new URL(CBS_CATALOG_URL);
    url.searchParams.set(
        "$filter",
        "substringof('Kerncijfers wijken en buurten',Title) and OutputStatus eq 'Regulier' and Language eq 'nl'",
    );
    url.searchParams.set("$select", "Identifier,Period");
    url.searchParams.set("$orderby", "Period desc");
    url.searchParams.set("$top", "5");
    url.searchParams.set("$format", "json");
    const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(6_000),
        next: { revalidate: 86_400 },
    });
    if (!response.ok) {
        throw new Error(
            `CBS catalog lookup failed with status ${response.status}`,
        );
    }
    const payload = (await response.json()) as CbsResponse<CbsCatalogTable>;
    const datasets = (payload.value ?? []).flatMap((table) => {
        const year = Number(table.Period);
        return table.Identifier && /^\d{4}$/.test(table.Period ?? "")
            ? [{ identifier: table.Identifier, year }]
            : [];
    });
    neighborhoodDatasetsCache =
        datasets.length > 0 ? datasets : CBS_NEIGHBORHOOD_FALLBACKS;
    neighborhoodDatasetsCachedAt = Date.now();
    return neighborhoodDatasetsCache;
}

function cbsColumns(properties: CbsProperty[]): CbsColumns | null {
    const byTitle = new Map<string, string>();
    for (const property of properties) {
        const title = property.Title?.trim();
        if (title) byTitle.set(title.toLowerCase(), property.Key ?? "");
    }
    const columns = {} as CbsColumns;
    for (const [name, title] of Object.entries(CBS_COLUMN_TITLES)) {
        const key = byTitle.get(title.toLowerCase());
        if (!key) {
            if ((CBS_REQUIRED_COLUMNS as readonly string[]).includes(name)) {
                return null;
            }
            columns[name as CbsColumnName] = undefined;
        } else {
            columns[name as CbsColumnName] = key;
        }
    }
    return columns;
}

async function resolveDatasetColumns(
    datasetIdentifier: string,
): Promise<CbsColumns | null> {
    const cached = datasetColumnsCache.get(datasetIdentifier);
    if (cached !== undefined) return cached;
    const properties = await fetchCbs<CbsProperty>(
        datasetIdentifier,
        "DataProperties",
    );
    const columns = cbsColumns(properties.value ?? []);
    if (!columns) {
        console.error(
            `CBS dataset ${datasetIdentifier} does not provide the required neighborhood columns`,
        );
    }
    datasetColumnsCache.set(datasetIdentifier, columns);
    return columns;
}

function rowNumber(
    row: CbsNeighborhoodRow,
    key: string | undefined,
): number | null {
    if (!key) return null;
    const value = row[key];
    if (value === null || value === undefined || value === "") return null;
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
}

async function lookupNeighborhoodRows(neighborhoodCode: string) {
    const datasets = await latestNeighborhoodDatasets().catch((error) => {
        console.error("CBS neighborhood dataset discovery failed", error);
        return CBS_NEIGHBORHOOD_FALLBACKS;
    });
    for (const dataset of datasets) {
        const columns = await resolveDatasetColumns(dataset.identifier).catch(
            () => null,
        );
        if (!columns) continue;
        const result = await fetchCbs<CbsNeighborhoodRow>(
            dataset.identifier,
            "TypedDataSet",
            `WijkenEnBuurten eq '${neighborhoodCode}' or WijkenEnBuurten eq 'NL00      '`,
        ).catch(() => null);
        const rows = result?.value ?? [];
        const neighborhood = rows.find(
            (row) => row.WijkenEnBuurten === neighborhoodCode,
        );
        if (!neighborhood) continue;
        const national =
            rows.find((row) => row.WijkenEnBuurten?.trim() === "NL00") ?? null;
        return { dataset, columns, neighborhood, national };
    }
    return null;
}

function percentage(part: number | null | undefined, total: number | null) {
    if (part === null || part === undefined || !total) return null;
    return Math.round((part / total) * 10_000) / 100;
}

function distanceMeters(
    latitude: number,
    longitude: number,
    element: OverpassElement,
) {
    const targetLatitude = element.lat ?? element.center?.lat;
    const targetLongitude = element.lon ?? element.center?.lon;
    if (targetLatitude === undefined || targetLongitude === undefined) {
        return null;
    }
    const radians = (value: number) => (value * Math.PI) / 180;
    const latitudeDelta = radians(targetLatitude - latitude);
    const longitudeDelta = radians(targetLongitude - longitude);
    const originLatitude = radians(latitude);
    const destinationLatitude = radians(targetLatitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(originLatitude) *
            Math.cos(destinationLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;
    return (
        6_371_000 *
        2 *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function facilityKind(element: OverpassElement): FacilityKind | null {
    const tags = element.tags ?? {};
    if (tags.shop === "supermarket") return "supermarket";
    if (tags.amenity === "school") return "school";
    if (tags.railway === "tram_stop") return "tram";
    if (tags.station === "subway" || tags.subway === "yes") return "metro";
    if (tags.railway === "station" && tags.station !== "subway") return "train";
    if (
        tags.highway === "bus_stop" ||
        (tags.public_transport === "platform" && tags.bus === "yes")
    ) {
        return "bus";
    }
    return null;
}

async function lookupFacilities(latitude: number, longitude: number) {
    const query = `[out:json][timeout:12];(nwr(around:5000,${latitude},${longitude})[shop=supermarket];nwr(around:5000,${latitude},${longitude})[amenity=school];nwr(around:5000,${latitude},${longitude})[highway=bus_stop];nwr(around:5000,${latitude},${longitude})[public_transport=platform][bus=yes];nwr(around:5000,${latitude},${longitude})[railway=tram_stop];nwr(around:10000,${latitude},${longitude})[station=subway];nwr(around:10000,${latitude},${longitude})[subway=yes];nwr(around:15000,${latitude},${longitude})[railway=station];);out center;`;
    let payload: { elements?: OverpassElement[] } | null = null;
    let lastStatus: number | null = null;
    for (const endpoint of OVERPASS_URLS) {
        const response = await fetch(endpoint, {
            method: "POST",
            body: new URLSearchParams({ data: query }),
            headers: {
                accept: "application/json",
                "content-type":
                    "application/x-www-form-urlencoded;charset=UTF-8",
                "user-agent":
                    "ZelfWonen/0.1 (public listing neighborhood enrichment)",
            },
            signal: AbortSignal.timeout(20_000),
        }).catch(() => null);
        if (!response) continue;
        lastStatus = response.status;
        if (response.ok) {
            payload = (await response.json()) as {
                elements?: OverpassElement[];
            };
            break;
        }
    }
    if (!payload) {
        throw new Error(
            `OpenStreetMap lookup failed${lastStatus ? ` with status ${lastStatus}` : ""}`,
        );
    }
    const distances = new Map<FacilityKind, number[]>();
    const seen = new Set<string>();
    for (const element of payload.elements ?? []) {
        const kind = facilityKind(element);
        const distance = distanceMeters(latitude, longitude, element);
        const identity = `${kind}:${element.type}:${element.id}`;
        if (!kind || distance === null || seen.has(identity)) continue;
        seen.add(identity);
        distances.set(kind, [...(distances.get(kind) ?? []), distance]);
    }
    return Object.fromEntries(
        (
            ["supermarket", "school", "bus", "tram", "metro", "train"] as const
        ).map((kind) => {
            const values = distances.get(kind) ?? [];
            const summary: FacilitySummary = {
                nearestMeters:
                    values.length > 0 ? Math.round(Math.min(...values)) : null,
                countWithinOneKm: values.filter((value) => value <= 1_000)
                    .length,
            };
            return [kind, summary];
        }),
    ) as Record<FacilityKind, FacilitySummary>;
}

async function lookupCrime(municipalityCode: string) {
    const result = await fetchCbs<CbsCrimeRow>(
        CBS_CRIME_DATASET,
        "TypedDataSet",
        `SoortMisdrijf eq 'T001161' and (RegioS eq '${municipalityCode}' or RegioS eq 'NL01  ')`,
    );
    const rows = result.value ?? [];
    const municipalityRows = rows
        .filter((row) => row.RegioS?.trim() === municipalityCode)
        .sort((left, right) =>
            (right.Perioden ?? "").localeCompare(left.Perioden ?? ""),
        );
    const municipality = municipalityRows.find((row) =>
        rows.some(
            (candidate) =>
                candidate.RegioS?.trim() === "NL01" &&
                candidate.Perioden === row.Perioden,
        ),
    );
    if (!municipality?.Perioden) return null;
    const national = rows.find(
        (row) =>
            row.RegioS?.trim() === "NL01" &&
            row.Perioden === municipality.Perioden,
    );
    return {
        value: municipality.GeregistreerdeMisdrijvenPer1000Inw_3 ?? null,
        nationalValue: national?.GeregistreerdeMisdrijvenPer1000Inw_3 ?? null,
        year: Number(municipality.Perioden.slice(0, 4)),
    };
}

// ---------------------------------------------------------------------------
// Opleidingsniveau (CBS 86232NED, "Bevolking 15 tot 75 jaar; opleidingsniveau")
// ---------------------------------------------------------------------------
let educationDatasetYearCache: number | null = null;
let educationDatasetYearCachedAt = 0;

async function educationDatasetYear(): Promise<number | null> {
    const now = Date.now();
    if (
        educationDatasetYearCache !== null &&
        now - educationDatasetYearCachedAt < NEIGHBORHOOD_DATASETS_CACHE_TTL_MS
    ) {
        return educationDatasetYearCache;
    }
    try {
        const url = new URL(CBS_CATALOG_URL);
        url.searchParams.set(
            "$filter",
            `Identifier eq '${CBS_EDUCATION_DATASET}'`,
        );
        url.searchParams.set("$select", "Identifier,Period");
        url.searchParams.set("$format", "json");
        const response = await fetch(url, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(6_000),
            next: { revalidate: 86_400 },
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as CbsResponse<CbsCatalogTable>;
        const year = Number(payload.value?.[0]?.Period);
        educationDatasetYearCache = /^\d{4}$/.test(String(year)) ? year : null;
        educationDatasetYearCachedAt = now;
        return educationDatasetYearCache;
    } catch (error) {
        console.error("CBS education dataset year lookup failed", error);
        return null;
    }
}

async function lookupEducation(
    neighborhoodCode: string,
): Promise<EducationLookup | null> {
    try {
        const properties = await fetchCbs<CbsProperty>(
            CBS_EDUCATION_DATASET,
            "DataProperties",
        );
        const byTitle = new Map<string, string>();
        for (const property of properties.value ?? []) {
            const title = property.Title?.trim().toLowerCase();
            if (title) byTitle.set(title, property.Key ?? "");
        }
        const valueKey = byTitle.get("bevolking 15 tot 75 jaar");
        const levelDimensionKey = byTitle.get("opleidingsniveau");
        if (!valueKey || !levelDimensionKey) return null;

        const dimension = await fetchCbs<CbsProperty>(
            CBS_EDUCATION_DATASET,
            levelDimensionKey,
        ).catch(() => ({ value: [] }));
        const levelByKey = new Map<string, "low" | "medium" | "high">();
        for (const item of dimension.value ?? []) {
            const title = (item.Title ?? "").toLowerCase();
            if (title.includes("basisonderwijs")) {
                levelByKey.set(item.Key ?? "", "low");
            } else if (title.includes("havo")) {
                levelByKey.set(item.Key ?? "", "medium");
            } else if (title.includes("hbo")) {
                levelByKey.set(item.Key ?? "", "high");
            }
        }

        const rows = await fetchCbs<CbsNeighborhoodRow>(
            CBS_EDUCATION_DATASET,
            "TypedDataSet",
            `WijkenEnBuurten eq '${neighborhoodCode}'`,
        ).catch(() => ({ value: [] }));
        const values = {
            low: 0,
            medium: 0,
            high: 0,
        } as Record<"low" | "medium" | "high", number>;
        let found = false;
        for (const row of rows.value ?? []) {
            if (row.Marges !== CBS_EDUCATION_MAIN_MARGIN) continue;
            const level = levelByKey.get(String(row.Opleidingsniveau ?? ""));
            if (!level) continue;
            const value = rowNumber(row, valueKey);
            if (value !== null) {
                values[level] = value;
                found = true;
            }
        }
        if (!found) return null;
        const total = values.low + values.medium + values.high;
        if (total <= 0) return null;
        const percentageOf = (part: number) =>
            Math.round((part / total) * 10_000) / 100;
        return {
            lowPercent: percentageOf(values.low),
            mediumPercent: percentageOf(values.medium),
            highPercent: percentageOf(values.high),
            year: (await educationDatasetYear()) ?? new Date().getFullYear(),
            sourceUrl: `${CBS_ODATA_URL}/${CBS_EDUCATION_DATASET}`,
        };
    } catch (error) {
        console.error("CBS education lookup failed", error);
        return null;
    }
}

// ---------------------------------------------------------------------------
// WMS GetFeatureInfo (RIVM geluid + PDOK/KCAF fundering)
// ---------------------------------------------------------------------------
async function wmsGetFeatureInfo(
    baseUrl: string,
    layer: string,
    latitude: number,
    longitude: number,
): Promise<Record<string, unknown> | null> {
    // Klein venster rond het adres; het middelste pixel (I=50, J=50) is de woning.
    const span = 0.0005;
    const params = new URLSearchParams({
        SERVICE: "WMS",
        VERSION: "1.3.0",
        REQUEST: "GetFeatureInfo",
        LAYERS: layer,
        QUERY_LAYERS: layer,
        CRS: "EPSG:4326",
        BBOX: `${latitude - span},${longitude - span},${latitude + span},${longitude + span}`,
        WIDTH: "101",
        HEIGHT: "101",
        I: "50",
        J: "50",
        INFO_FORMAT: "application/json",
    });
    const response = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: {
            accept: "application/json, text/html",
            "user-agent":
                "ZelfWonen/0.1 (public listing environment enrichment)",
        },
        signal: AbortSignal.timeout(12_000),
    }).catch(() => null);
    if (!response || !response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
        const payload = (await response.json().catch(() => null)) as {
            features?: Array<Record<string, unknown>>;
        } | null;
        return payload?.features?.[0] ?? null;
    }
    // HTML-variant: eerste getal uit de attributentabel.
    const html = await response.text();
    const match = html.match(/(\d+(?:[.,]\d+)?)/);
    return match ? { _htmlValue: Number(match[1].replace(",", ".")) } : null;
}

function noiseValueFromFeature(
    feature: Record<string, unknown>,
): number | null {
    const properties =
        (feature.properties as Record<string, unknown> | undefined) ?? feature;
    const preferredKeys = ["lden", "waarde", "value", "geluidsbelasting"];
    for (const [key, value] of Object.entries(properties)) {
        const lower = key.toLowerCase();
        if (
            preferredKeys.some(
                (candidate) =>
                    lower.includes(candidate) || candidate.includes(lower),
            )
        ) {
            const number = typeof value === "number" ? value : Number(value);
            if (Number.isFinite(number)) return Math.round(number * 10) / 10;
        }
    }
    for (const value of Object.values(properties)) {
        if (typeof value !== "number" && typeof value !== "string") continue;
        const number = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(number) && number >= 0 && number <= 120) {
            return Math.round(number * 10) / 10;
        }
    }
    return null;
}

async function lookupNoise(
    latitude: number,
    longitude: number,
): Promise<NoiseLookup | null> {
    const settled = await Promise.all(
        NOISE_WMS_LAYERS.map(async ([key, layer]) => {
            const feature = await wmsGetFeatureInfo(
                RIVM_NOISE_WMS_URL,
                layer,
                latitude,
                longitude,
            );
            return [key, feature ? noiseValueFromFeature(feature) : null] as [
                NoiseSourceKey,
                number | null,
            ];
        }),
    );
    const values = Object.fromEntries(settled) as NoiseLookup;
    if (Object.values(values).every((value) => value === null)) return null;
    return values;
}

function foundationLevelFrom(
    pre1970Percent: number | null,
): FoundationRiskLevel {
    if (pre1970Percent === null) return "LOW";
    if (pre1970Percent >= 80) return "HIGH";
    if (pre1970Percent >= 50) return "MEDIUM";
    return "LOW";
}

async function lookupFoundationRisk(
    latitude: number,
    longitude: number,
): Promise<FoundationLookup | null> {
    try {
        const feature = await wmsGetFeatureInfo(
            FOUNDATION_WMS_URL,
            FOUNDATION_WMS_LAYER,
            latitude,
            longitude,
        );
        // Geen feature = niet binnen een indicatief aandachtsgebied (KCAF).
        if (!feature) return null;
        const properties =
            (feature.properties as Record<string, unknown> | undefined) ?? {};
        const numberValue = (key: string): number | null => {
            const raw = properties[key];
            if (raw === null || raw === undefined || raw === "") return null;
            const number = Number(raw);
            return Number.isFinite(number)
                ? Math.round(number * 10) / 10
                : null;
        };
        const pre1970Percent = numberValue("percvoor1970");
        return {
            level: foundationLevelFrom(pre1970Percent),
            areaShare: numberValue("percFgr"),
            pre1970Percent,
            groundClass:
                typeof properties.fgr === "string" ? properties.fgr : null,
            detail:
                typeof properties.legenda === "string"
                    ? properties.legenda
                    : null,
        };
    } catch (error) {
        console.error("Foundation risk lookup failed", error);
        return null;
    }
}

export class NeighborhoodDataClient {
    async lookup(input: NeighborhoodLookup): Promise<NeighborhoodData | null> {
        const result = await lookupNeighborhoodRows(input.neighborhoodCode);
        if (!result) return null;
        const { dataset, columns, neighborhood: row, national } = result;

        const [crime, facilities, noise, foundation, education] =
            await Promise.all([
                lookupCrime(input.municipalityCode).catch((error) => {
                    console.error("CBS crime enrichment failed", error);
                    return null;
                }),
                input.latitude !== null && input.longitude !== null
                    ? lookupFacilities(input.latitude, input.longitude).catch(
                          (error) => {
                              console.error(
                                  "OpenStreetMap facility enrichment failed",
                                  error,
                              );
                              return null;
                          },
                      )
                    : null,
                input.latitude !== null && input.longitude !== null
                    ? lookupNoise(input.latitude, input.longitude).catch(
                          (error) => {
                              console.error(
                                  "RIVM noise enrichment failed",
                                  error,
                              );
                              return null;
                          },
                      )
                    : null,
                input.latitude !== null && input.longitude !== null
                    ? lookupFoundationRisk(
                          input.latitude,
                          input.longitude,
                      ).catch((error) => {
                          console.error(
                              "Foundation risk enrichment failed",
                              error,
                          );
                          return null;
                      })
                    : null,
                lookupEducation(input.neighborhoodCode).catch((error) => {
                    console.error("CBS education enrichment failed", error);
                    return null;
                }),
            ]);
        const population = rowNumber(row, columns.population);
        const nationalPopulation = national
            ? rowNumber(national, columns.population)
            : null;
        const retrievedAt = new Date();
        return {
            neighborhoodCode: input.neighborhoodCode,
            neighborhoodName: input.neighborhoodName,
            districtCode: input.districtCode,
            districtName: input.districtName,
            municipalityCode: input.municipalityCode,
            statisticsYear: dataset.year,
            population,
            populationDensityPerKm2: rowNumber(row, columns.populationDensity),
            nationalPopulationDensityPerKm2: national
                ? rowNumber(national, columns.populationDensity)
                : null,
            age0To14Percent: percentage(
                rowNumber(row, columns.age0To14),
                population,
            ),
            age15To24Percent: percentage(
                rowNumber(row, columns.age15To24),
                population,
            ),
            age25To44Percent: percentage(
                rowNumber(row, columns.age25To44),
                population,
            ),
            age45To64Percent: percentage(
                rowNumber(row, columns.age45To64),
                population,
            ),
            age65PlusPercent: percentage(
                rowNumber(row, columns.age65Plus),
                population,
            ),
            nationalAge0To14Percent: percentage(
                national ? rowNumber(national, columns.age0To14) : null,
                nationalPopulation,
            ),
            nationalAge15To24Percent: percentage(
                national ? rowNumber(national, columns.age15To24) : null,
                nationalPopulation,
            ),
            nationalAge25To44Percent: percentage(
                national ? rowNumber(national, columns.age25To44) : null,
                nationalPopulation,
            ),
            nationalAge45To64Percent: percentage(
                national ? rowNumber(national, columns.age45To64) : null,
                nationalPopulation,
            ),
            nationalAge65PlusPercent: percentage(
                national ? rowNumber(national, columns.age65Plus) : null,
                nationalPopulation,
            ),
            housingCorporationPercent: rowNumber(
                row,
                columns.housingCorporation,
            ),
            nationalHousingCorporationPercent: national
                ? rowNumber(national, columns.housingCorporation)
                : null,
            registeredCrimesPer1000: crime?.value ?? null,
            nationalRegisteredCrimesPer1000: crime?.nationalValue ?? null,
            crimeStatisticsYear: crime?.year ?? null,
            supermarketDistanceKm: rowNumber(row, columns.supermarketDistance),
            primarySchoolDistanceKm: rowNumber(
                row,
                columns.primarySchoolDistance,
            ),
            daycareDistanceKm: rowNumber(row, columns.daycareDistance),
            generalPracticeDistanceKm: rowNumber(
                row,
                columns.generalPracticeDistance,
            ),
            primarySchoolsWithin3Km: rowNumber(
                row,
                columns.primarySchoolsWithin3Km,
            ),
            supermarketsWithin1Km:
                facilities?.supermarket.countWithinOneKm ?? null,
            schoolsWithin1Km: facilities?.school.countWithinOneKm ?? null,
            busStopDistanceMeters: facilities?.bus.nearestMeters ?? null,
            tramStopDistanceMeters: facilities?.tram.nearestMeters ?? null,
            metroStationDistanceMeters: facilities?.metro.nearestMeters ?? null,
            trainStationDistanceMeters: facilities?.train.nearestMeters ?? null,
            noiseRoadLden: noise?.road ?? null,
            noiseRailLden: noise?.rail ?? null,
            noiseIndustryLden: noise?.industry ?? null,
            noiseAircraftLden: noise?.aircraft ?? null,
            noiseGridMeters: noise ? 10 : null,
            noiseSource: noise ? "RIVM Atlas Leefomgeving" : null,
            noiseRetrievedAt: noise ? retrievedAt : null,
            foundationRiskLevel: foundation?.level ?? null,
            foundationRiskAreaShare: foundation?.areaShare ?? null,
            foundationPre1970Percent: foundation?.pre1970Percent ?? null,
            foundationGroundClass: foundation?.groundClass ?? null,
            foundationRiskDetail: foundation?.detail ?? null,
            foundationRiskSource: foundation
                ? "KCAF/PDOK en BAG (indicatieve aandachtsgebieden funderingsproblematiek)"
                : null,
            foundationRiskRetrievedAt: foundation ? retrievedAt : null,
            malePercent: percentage(rowNumber(row, columns.male), population),
            femalePercent: percentage(
                rowNumber(row, columns.female),
                population,
            ),
            averageHouseholdSize: rowNumber(row, columns.averageHouseholdSize),
            singleHouseholdPercent: percentage(
                rowNumber(row, columns.singlePersonHouseholds),
                rowNumber(row, columns.totalHouseholds),
            ),
            coupleHouseholdPercent: percentage(
                rowNumber(row, columns.householdsWithoutChildren),
                rowNumber(row, columns.totalHouseholds),
            ),
            familyHouseholdPercent: percentage(
                rowNumber(row, columns.householdsWithChildren),
                rowNumber(row, columns.totalHouseholds),
            ),
            educationLowPercent: education?.lowPercent ?? null,
            educationMediumPercent: education?.mediumPercent ?? null,
            educationHighPercent: education?.highPercent ?? null,
            educationStatisticsYear: education?.year ?? null,
            demographicsSourceUrl: education?.sourceUrl ?? null,
            demographicsRetrievedAt: education ? retrievedAt : null,
            cbsDataset: dataset.identifier,
            cbsSourceUrl: `${CBS_ODATA_URL}/${dataset.identifier}`,
            cbsRetrievedAt: retrievedAt,
            crimeDataset: crime ? CBS_CRIME_DATASET : null,
            crimeSourceUrl: crime
                ? `${CBS_ODATA_URL}/${CBS_CRIME_DATASET}`
                : null,
            osmSourceUrl: facilities
                ? "https://www.openstreetmap.org/copyright"
                : null,
            osmRetrievedAt: facilities ? retrievedAt : null,
        };
    }
}
