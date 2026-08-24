import { NextRequest, NextResponse } from "next/server";

// Server-side Overpass proxy voor de kaartlagen op de woningpagina. De browser
// roept dit endpoint aan zodat CORS/rate-limiting van Overpass buiten de client
// blijven en de zoekradius beperkt blijft.
const OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
] as const;

const OVERLAY_CATEGORIES = [
    "supermarket",
    "school",
    "care",
    "transit",
] as const;
type OverlayCategory = (typeof OVERLAY_CATEGORIES)[number];

// Per categorie de Overpass-deelquery's. RADIUS/LAT/LON worden per verzoek
// ingevuld; `out center` geeft een punt voor nodes én ways/relations.
const CATEGORY_QUERIES: Record<OverlayCategory, string> = {
    supermarket: "nwr(around:RADIUS,LAT,LON)[shop=supermarket];",
    school: "nwr(around:RADIUS,LAT,LON)[amenity=school];",
    care: 'nwr(around:RADIUS,LAT,LON)[amenity~"^(hospital|doctors|clinic|pharmacy|dentist)$"];nwr(around:RADIUS,LAT,LON)[healthcare~"^(hospital|doctor|clinic|pharmacy|dentist|physiotherapist|midwife)$"];',
    transit:
        "nwr(around:RADIUS,LAT,LON)[highway=bus_stop];nwr(around:RADIUS,LAT,LON)[public_transport=platform][bus=yes];nwr(around:RADIUS,LAT,LON)[railway=tram_stop];nwr(around:RADIUS,LAT,LON)[station=subway];nwr(around:RADIUS,LAT,LON)[subway=yes];nwr(around:RADIUS,LAT,LON)[railway=station];",
};

type OverpassElement = {
    id: number;
    type: string;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
    tags?: Record<string, string>;
};

type OverlayPoint = {
    id: string;
    kind: string;
    lat: number;
    lon: number;
    name: string | null;
};

// Overpass-data per locatie verandert maandelijks in plaats van per minuut,
// dus antwoorden worden in memory bewaard en bij vraag ook verouderd geleverd
// (stale-while-revalidate). Identieke gelijktijdige verzoeken delen één lookup.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_STALE_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;
// Tweede mirror pas na korte vertraging starten: meestal wint de eerste, maar
// bij trage uitval wacht niemand meer 2× de timeout achter elkaar.
const ENDPOINT_STAGGER_MS = 2_500;
const ATTEMPT_TIMEOUT_MS = 15_000;

const overlayCache = new Map<
    string,
    { points: OverlayPoint[]; fetchedAt: number }
>();
const inFlightLookups = new Map<string, Promise<OverlayPoint[]>>();

const CARE_AMENITIES = new Set([
    "hospital",
    "doctors",
    "clinic",
    "pharmacy",
    "dentist",
]);
const CARE_HEALTHCARE = new Set([
    "hospital",
    "doctor",
    "clinic",
    "pharmacy",
    "dentist",
    "physiotherapist",
    "midwife",
]);

function isCare(tags: Record<string, string>) {
    const amenity = tags.amenity;
    const healthcare = tags.healthcare;
    return (
        (amenity !== undefined && CARE_AMENITIES.has(amenity)) ||
        (healthcare !== undefined && CARE_HEALTHCARE.has(healthcare))
    );
}

function transitType(tags: Record<string, string>): string | null {
    if (
        tags.highway === "bus_stop" ||
        (tags.public_transport === "platform" && tags.bus === "yes")
    ) {
        return "bus";
    }
    if (tags.railway === "tram_stop") return "tram";
    if (
        tags.station === "subway" ||
        tags.subway === "yes" ||
        tags.railway === "subway_entrance"
    ) {
        return "metro";
    }
    if (tags.railway === "station") return "train";
    return null;
}

function classify(
    element: OverpassElement,
    categories: OverlayCategory[],
): string | null {
    const tags = element.tags ?? {};
    if (categories.includes("supermarket") && tags.shop === "supermarket") {
        return "supermarket";
    }
    if (categories.includes("school") && tags.amenity === "school") {
        return "school";
    }
    if (categories.includes("care") && isCare(tags)) return "care";
    if (categories.includes("transit")) return transitType(tags);
    return null;
}

// Eén poging naar één Overpass-mirror met eigen timeout.
function attemptEndpoint(
    endpoint: string,
    query: string,
): Promise<{ elements?: OverpassElement[] }> {
    return fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "user-agent": "ZelfWonen/0.1 (public listing map overlays)",
        },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    }).then((response) => {
        if (!response.ok) {
            throw new Error(`Overpass responded with ${response.status}`);
        }
        return response.json() as Promise<{ elements?: OverpassElement[] }>;
    });
}

// Beide mirrors tegelijk starten (de tweede na korte vertraging) en de eerste
// succesvolle reactie winnen; verliezers worden genegeerd.
async function raceEndpoints(
    query: string,
): Promise<{ elements?: OverpassElement[] }> {
    const attempts = OVERPASS_URLS.map((endpoint, index) =>
        index === 0
            ? attemptEndpoint(endpoint, query)
            : new Promise<{ elements?: OverpassElement[] }>(
                  (resolve, reject) => {
                      const timer = setTimeout(
                          () => reject(new Error("stagger")),
                          ENDPOINT_STAGGER_MS,
                      );
                      attemptEndpoint(endpoint, query).then(
                          (payload) => {
                              clearTimeout(timer);
                              resolve(payload);
                          },
                          (error) => {
                              clearTimeout(timer);
                              reject(error);
                          },
                      );
                  },
              ),
    );
    try {
        return await Promise.any(attempts);
    } finally {
        for (const attempt of attempts) attempt.catch(() => {});
    }
}

export async function GET(request: NextRequest) {
    const lat = Number(request.nextUrl.searchParams.get("lat"));
    const lon = Number(request.nextUrl.searchParams.get("lon"));
    const categoriesParam =
        request.nextUrl.searchParams.get("categories") ?? "";
    const requestedRadius = Number(
        request.nextUrl.searchParams.get("radius") ?? 3000,
    );
    const radius = Math.min(5000, Math.max(500, requestedRadius));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json(
            {
                error: {
                    code: "INVALID_COORDINATES",
                    message: "Invalid coordinates",
                },
            },
            { status: 400 },
        );
    }
    const categories = categoriesParam
        .split(",")
        .filter((category): category is OverlayCategory =>
            (OVERLAY_CATEGORIES as readonly string[]).includes(category),
        );
    if (categories.length === 0) {
        return NextResponse.json({ points: [] });
    }

    const query = `[out:json][timeout:25];(${categories
        .map((category) => CATEGORY_QUERIES[category])
        .join("")
        .replaceAll("RADIUS", String(radius))
        .replaceAll("LAT", String(lat))
        .replaceAll("LON", String(lon))});out center;`;

    // Cache-sleutel op afgeronde coördinaten zodat bijna-identieke verzoeken
    // (zelfde woning, kleine gps-afwijkingen) dezelfde entry delen.
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)},${radius},${[
        ...categories,
    ]
        .sort()
        .join(",")}`;

    const cached = overlayCache.get(cacheKey);
    const now = Date.now();
    if (!cached) {
        const points = await lookup(cacheKey, query, categories).catch(
            () => null,
        );
        if (points) {
            return NextResponse.json({ points });
        }
        return NextResponse.json(
            {
                error: {
                    code: "OVERPASS_UNAVAILABLE",
                    message: "Overpass lookup failed",
                },
            },
            { status: 502 },
        );
    }

    // Vers uit de cache; verouderd direct leveren met een verversing op de
    // achtergrond (stale-while-revalidate); veel te oud alsnog vers ophalen,
    // zodat blijvend falen niet eeuwig oude data maskeert.
    const age = now - cached.fetchedAt;
    if (age < CACHE_TTL_MS) {
        return NextResponse.json({ points: cached.points });
    }
    if (age < CACHE_STALE_MS) {
        void lookup(cacheKey, query, categories).catch(() => {});
        return NextResponse.json({ points: cached.points });
    }

    const points = await lookup(cacheKey, query, categories).catch(() => null);
    if (points) {
        return NextResponse.json({ points });
    }
    return NextResponse.json(
        {
            error: {
                code: "OVERPASS_UNAVAILABLE",
                message: "Overpass lookup failed",
            },
        },
        { status: 502 },
    );
}

// Eén gedeelde lookup per cache-sleutel: resultaat in de cache zetten en
// gelijktijdige verzoeken laten wachten op dezelfde belofte.
function lookup(
    cacheKey: string,
    query: string,
    categories: OverlayCategory[],
): Promise<OverlayPoint[]> {
    const existing = inFlightLookups.get(cacheKey);
    if (existing) return existing;

    const promise = raceEndpoints(query)
        .then((payload) => {
            const points = toPoints(payload.elements ?? [], categories);
            overlayCache.set(cacheKey, {
                points,
                fetchedAt: Date.now(),
            });
            trimCache();
            return points;
        })
        .finally(() => {
            inFlightLookups.delete(cacheKey);
        });
    inFlightLookups.set(cacheKey, promise);
    return promise;
}

function toPoints(
    elements: OverpassElement[],
    categories: OverlayCategory[],
): OverlayPoint[] {
    return elements
        .map((element) => {
            const kind = classify(element, categories);
            if (!kind) return null;
            const pointLat = element.lat ?? element.center?.lat;
            const pointLon = element.lon ?? element.center?.lon;
            if (pointLat === undefined || pointLon === undefined) return null;
            return {
                id: `${element.type}-${element.id}`,
                kind,
                lat: pointLat,
                lon: pointLon,
                name: element.tags?.name ?? null,
            };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null)
        .slice(0, 300);
}

function trimCache() {
    while (overlayCache.size > CACHE_MAX_ENTRIES) {
        const oldest = overlayCache.keys().next().value;
        if (oldest === undefined) break;
        overlayCache.delete(oldest);
    }
}
