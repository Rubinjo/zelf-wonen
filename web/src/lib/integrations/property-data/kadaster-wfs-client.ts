const KADASTER_WFS_URL =
    "https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0";

type ParcelFeatureCollection = {
    features?: Array<{
        properties?: {
            kadastraleGrootteWaarde?: number;
        };
    }>;
};

function parcelFilter(municipality: string, section: string, number: string) {
    const conditions = [
        ["AKRKadastraleGemeenteCodeWaarde", municipality],
        ["sectie", section],
        ["perceelnummer", number],
    ]
        .map(
            ([property, value]) =>
                `<fes:PropertyIsEqualTo><fes:ValueReference>${property}</fes:ValueReference><fes:Literal>${value}</fes:Literal></fes:PropertyIsEqualTo>`,
        )
        .join("");
    return `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:And>${conditions}</fes:And></fes:Filter>`;
}

export class KadasterWfsClient {
    async lookupParcel(parcelId: string) {
        const match = parcelId.match(/^([A-Z0-9]{5})-([A-Z]{1,2})-(\d+)$/);
        if (!match) return null;

        const url = new URL(KADASTER_WFS_URL);
        url.searchParams.set("service", "WFS");
        url.searchParams.set("version", "2.0.0");
        url.searchParams.set("request", "GetFeature");
        url.searchParams.set("typeNames", "kadastralekaart:Perceel");
        url.searchParams.set("outputFormat", "application/json");
        url.searchParams.set("count", "1");
        url.searchParams.set(
            "filter",
            parcelFilter(match[1], match[2], match[3]),
        );

        const response = await fetch(url, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(5_000),
            next: { revalidate: 86_400 },
        });
        if (!response.ok) {
            throw new Error(
                `Kadaster lookup failed with status ${response.status}`,
            );
        }

        const result = (await response.json()) as ParcelFeatureCollection;
        const area = result.features?.[0]?.properties?.kadastraleGrootteWaarde;
        if (area === undefined) return null;

        return { cadastralParcelId: parcelId, officialLandAreaSqm: area };
    }
}
