const BAG_WFS_URL = "https://service.pdok.nl/lv/bag/wfs/v2_0";

type BagUsage = string | string[];

type BagProperties = {
    identificatie?: string;
    oppervlakte?: number;
    gebruiksdoel?: BagUsage;
    bouwjaar?: number;
    pandidentificatie?: string;
};

type BagFeatureCollection = {
    features?: Array<{ properties?: BagProperties }>;
};

function equalityFilter(property: string, value: string) {
    return `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:PropertyIsEqualTo><fes:ValueReference>${property}</fes:ValueReference><fes:Literal>${value}</fes:Literal></fes:PropertyIsEqualTo></fes:Filter>`;
}

function andFilter(filters: Array<[string, string]>) {
    const conditions = filters
        .map(
            ([property, value]) =>
                `<fes:PropertyIsEqualTo><fes:ValueReference>${property}</fes:ValueReference><fes:Literal>${value}</fes:Literal></fes:PropertyIsEqualTo>`,
        )
        .join("");
    return `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:And>${conditions}</fes:And></fes:Filter>`;
}

function hasUsage(usage: BagUsage | undefined, expected: string) {
    const values = Array.isArray(usage) ? usage : [usage];
    return values.some((value) => value?.toLowerCase() === expected);
}

function inferPropertyType(
    usage: BagUsage | undefined,
    residentialObjectCount: number | null,
) {
    if (hasUsage(usage, "woonfunctie")) {
        if (residentialObjectCount === null) return null;
        return residentialObjectCount > 1 ? "APARTMENT" : "HOUSE";
    }

    const commercialUsages = [
        "bijeenkomstfunctie",
        "gezondheidszorgfunctie",
        "industriefunctie",
        "kantoorfunctie",
        "logiesfunctie",
        "onderwijsfunctie",
        "sportfunctie",
        "winkelfunctie",
    ];
    return commercialUsages.some((value) => hasUsage(usage, value))
        ? "COMMERCIAL"
        : "OTHER";
}

export class BagWfsClient {
    private async getFeatures(filter: string, count = 1) {
        const url = new URL(BAG_WFS_URL);
        url.searchParams.set("service", "WFS");
        url.searchParams.set("version", "2.0.0");
        url.searchParams.set("request", "GetFeature");
        url.searchParams.set("typeNames", "bag:verblijfsobject");
        url.searchParams.set("outputFormat", "application/json");
        url.searchParams.set("count", String(count));
        url.searchParams.set("filter", filter);

        const response = await fetch(url, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(5_000),
            next: { revalidate: 86_400 },
        });
        if (!response.ok) {
            throw new Error(`BAG lookup failed with status ${response.status}`);
        }
        return (await response.json()) as BagFeatureCollection;
    }

    async lookupObject(objectId: string) {
        if (!/^\d{16}$/.test(objectId)) return null;

        const result = await this.getFeatures(
            equalityFilter("identificatie", objectId),
        );
        const properties = result.features?.[0]?.properties;
        if (!properties) return null;

        let residentialObjectCount: number | null = null;
        if (
            properties.pandidentificatie &&
            /^\d{16}$/.test(properties.pandidentificatie)
        ) {
            const buildingResult = await this.getFeatures(
                andFilter([
                    ["pandidentificatie", properties.pandidentificatie],
                    ["gebruiksdoel", "woonfunctie"],
                ]),
                2,
            );
            residentialObjectCount = buildingResult.features?.length ?? null;
        }

        return {
            bagBuildingId: properties.pandidentificatie ?? null,
            livingAreaSqm: properties.oppervlakte ?? null,
            constructionYear: properties.bouwjaar ?? null,
            suggestedPropertyType: inferPropertyType(
                properties.gebruiksdoel,
                residentialObjectCount,
            ),
        };
    }
}
