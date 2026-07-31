const CBS_NEIGHBORHOOD_FALLBACK = {
    identifier: "85984NED",
    year: 2024,
};
const CBS_CRIME_DATASET = "83648NED";
const CBS_ODATA_URL = "https://opendata.cbs.nl/ODataApi/OData";
const CBS_CATALOG_URL = "https://opendata.cbs.nl/ODataCatalog/Tables";
const OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
] as const;

type CbsResponse<T> = { value?: T[] };

type CbsNeighborhoodRow = {
    AantalInwoners_5?: number | null;
    k_0Tot15Jaar_8?: number | null;
    k_15Tot25Jaar_9?: number | null;
    k_25Tot45Jaar_10?: number | null;
    k_45Tot65Jaar_11?: number | null;
    k_65JaarOfOuder_12?: number | null;
    Bevolkingsdichtheid_34?: number | null;
    InBezitWoningcorporatie_49?: number | null;
    AfstandTotHuisartsenpraktijk_110?: number | null;
    AfstandTotGroteSupermarkt_111?: number | null;
    AfstandTotKinderdagverblijf_112?: number | null;
    AfstandTotSchool_113?: number | null;
    ScholenBinnen3Km_114?: number | null;
};

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

let neighborhoodDatasetsCache: NeighborhoodDataset[] | null = null;

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
    if (neighborhoodDatasetsCache) return neighborhoodDatasetsCache;
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
        datasets.length > 0 ? datasets : [CBS_NEIGHBORHOOD_FALLBACK];
    return neighborhoodDatasetsCache;
}

async function lookupNeighborhoodRows(neighborhoodCode: string) {
    const datasets = await latestNeighborhoodDatasets().catch((error) => {
        console.error("CBS neighborhood dataset discovery failed", error);
        return [CBS_NEIGHBORHOOD_FALLBACK];
    });
    for (const dataset of datasets) {
        const result = await fetchCbs<CbsNeighborhoodRow>(
            dataset.identifier,
            "TypedDataSet",
            `WijkenEnBuurten eq '${neighborhoodCode}' or WijkenEnBuurten eq 'NL00      '`,
        ).catch(() => null);
        const rows = result?.value ?? [];
        const neighborhood = rows.find(
            (row) =>
                (row as CbsNeighborhoodRow & { WijkenEnBuurten?: string })
                    .WijkenEnBuurten === neighborhoodCode,
        );
        const national = rows.find(
            (row) =>
                (row as CbsNeighborhoodRow & { WijkenEnBuurten?: string })
                    .WijkenEnBuurten?.trim() === "NL00",
        );
        if (
            neighborhood &&
            "AantalInwoners_5" in neighborhood &&
            "Bevolkingsdichtheid_34" in neighborhood
        ) {
            return { dataset, neighborhood, national: national ?? null };
        }
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
        nationalValue:
            national?.GeregistreerdeMisdrijvenPer1000Inw_3 ?? null,
        year: Number(municipality.Perioden.slice(0, 4)),
    };
}

export class NeighborhoodDataClient {
    async lookup(input: NeighborhoodLookup): Promise<NeighborhoodData | null> {
        const result = await lookupNeighborhoodRows(input.neighborhoodCode);
        if (!result) return null;
        const { dataset, neighborhood: row, national } = result;

        const [crime, facilities] = await Promise.all([
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
        ]);
        const population = row.AantalInwoners_5 ?? null;
        const nationalPopulation = national?.AantalInwoners_5 ?? null;
        const retrievedAt = new Date();
        return {
            neighborhoodCode: input.neighborhoodCode,
            neighborhoodName: input.neighborhoodName,
            districtCode: input.districtCode,
            districtName: input.districtName,
            municipalityCode: input.municipalityCode,
            statisticsYear: dataset.year,
            population,
            populationDensityPerKm2: row.Bevolkingsdichtheid_34 ?? null,
            nationalPopulationDensityPerKm2:
                national?.Bevolkingsdichtheid_34 ?? null,
            age0To14Percent: percentage(row.k_0Tot15Jaar_8, population),
            age15To24Percent: percentage(row.k_15Tot25Jaar_9, population),
            age25To44Percent: percentage(row.k_25Tot45Jaar_10, population),
            age45To64Percent: percentage(row.k_45Tot65Jaar_11, population),
            age65PlusPercent: percentage(row.k_65JaarOfOuder_12, population),
            nationalAge0To14Percent: percentage(
                national?.k_0Tot15Jaar_8,
                nationalPopulation,
            ),
            nationalAge15To24Percent: percentage(
                national?.k_15Tot25Jaar_9,
                nationalPopulation,
            ),
            nationalAge25To44Percent: percentage(
                national?.k_25Tot45Jaar_10,
                nationalPopulation,
            ),
            nationalAge45To64Percent: percentage(
                national?.k_45Tot65Jaar_11,
                nationalPopulation,
            ),
            nationalAge65PlusPercent: percentage(
                national?.k_65JaarOfOuder_12,
                nationalPopulation,
            ),
            housingCorporationPercent: row.InBezitWoningcorporatie_49 ?? null,
            nationalHousingCorporationPercent:
                national?.InBezitWoningcorporatie_49 ?? null,
            registeredCrimesPer1000: crime?.value ?? null,
            nationalRegisteredCrimesPer1000: crime?.nationalValue ?? null,
            crimeStatisticsYear: crime?.year ?? null,
            supermarketDistanceKm: row.AfstandTotGroteSupermarkt_111 ?? null,
            primarySchoolDistanceKm: row.AfstandTotSchool_113 ?? null,
            daycareDistanceKm: row.AfstandTotKinderdagverblijf_112 ?? null,
            generalPracticeDistanceKm:
                row.AfstandTotHuisartsenpraktijk_110 ?? null,
            primarySchoolsWithin3Km: row.ScholenBinnen3Km_114 ?? null,
            supermarketsWithin1Km:
                facilities?.supermarket.countWithinOneKm ?? null,
            schoolsWithin1Km: facilities?.school.countWithinOneKm ?? null,
            busStopDistanceMeters: facilities?.bus.nearestMeters ?? null,
            tramStopDistanceMeters: facilities?.tram.nearestMeters ?? null,
            metroStationDistanceMeters: facilities?.metro.nearestMeters ?? null,
            trainStationDistanceMeters: facilities?.train.nearestMeters ?? null,
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
