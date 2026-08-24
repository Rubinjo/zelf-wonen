/**
 * Volledigheidsmodel van het woningpaspoort.
 *
 * Het woningpaspoort is compleet wanneer alle relevante onderdelen aanwezig
 * zijn: advertentiegegevens, officiële woninggegevens, energielabel, foto's,
 * plattegrond, kenmerken, staat & onderhoud, kadastrale gegevens en (voor
 * appartementen) VvE-gegevens.
 *
 * Deze module is puur (geen DB/API-aanroepen) zodat de UI, de API en de
 * PDF-generatie altijd dezelfde score en checklist berekenen.
 */

export type PassportPurpose = "SALE" | "RENT";

export type PassportItemStatus = "SATISFIED" | "MISSING" | "NOT_APPLICABLE";

export type PassportItem = {
    key: string;
    label: string;
    description: string;
    status: PassportItemStatus;
    /** Gewicht (0 = niet van toepassing, uitgesloten van de score). */
    weight: number;
    /** Actie-hint voor de verkoper/verhuurder als het onderdeel ontbreekt. */
    actionHint: string;
    /** Documentcategorie die dit onderdeel kan vervullen (optioneel). */
    category?: string;
    /** Veld in de draft dat dit onderdeel kan vervullen (optioneel). */
    draftKey?: string;
};

export type PassportSourceData = {
    purpose: PassportPurpose;
    propertyType: string;
    listing: {
        titleNl: string | null;
        descriptionNl: string | null;
        attributes: unknown;
        property: {
            livingAreaSqm: unknown;
            roomCount: number | null;
            constructionYear: number | null;
            cadastralParcelId: string | null;
            energyLabels: Array<unknown>;
            neighborhoodProfile: unknown;
        };
        media: Array<{ kind: string; status: string }>;
        floorPlans: Array<unknown>;
    };
    draft: Record<string, unknown>;
    documents: Array<{ category: string }>;
};

export type PassportCompleteness = {
    score: number;
    satisfied: number;
    applicable: number;
    total: number;
    items: PassportItem[];
};

function hasDocument(category: string, documents: Array<{ category: string }>) {
    return documents.some((document) => document.category === category);
}

function draftValue(draft: Record<string, unknown>, key: string) {
    return draft[key];
}

/** "Aanwezig" betekent: niet null/undefined en geen lege string. */
function isPresent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

export function computePassportCompleteness(
    data: PassportSourceData,
): PassportCompleteness {
    const { listing, draft, documents } = data;
    const property = listing.property;
    const hasEnergyLabel =
        property.energyLabels.length > 0 ||
        hasDocument("ENERGY_LABEL", documents);
    const hasPhoto = listing.media.some(
        (item) => item.kind === "PHOTO" && item.status === "READY",
    );
    const hasFloorPlan =
        listing.floorPlans.length > 0 ||
        hasDocument("FLOOR_PLAN", documents);
    const hasCadastral =
        isPresent(property.cadastralParcelId) ||
        hasDocument("CADASTRAL", documents);

    const conditionFilled = isPresent(draftValue(draft, "condition"));
    const inspectionFilled = isPresent(
        draftValue(draft, "lastInspectionAt"),
    );
    const renovationFilled = isPresent(draftValue(draft, "renovationYear"));
    const featuresFilled = isPresent(draftValue(draft, "features"));
    const vveFilled =
        isPresent((draft.vve as { name?: unknown } | null)?.name) ||
        isPresent((draft.vve as { monthlyContributionCents?: unknown } | null)
            ?.monthlyContributionCents);

    const isApartment = data.propertyType === "APARTMENT";

    const items: PassportItem[] = [
        {
            key: "DESCRIPTION",
            label: "Omschrijving",
            description:
                "Titel en omschrijving van de woning zijn aanwezig en geven een goed beeld van de woning.",
            status:
                isPresent(listing.titleNl) && isPresent(listing.descriptionNl)
                    ? "SATISFIED"
                    : "MISSING",
            weight: 1,
            actionHint:
                "Vul een titel en omschrijving in op de advertentie. Na publicatie kun je dit niet meer wijzigen.",
        },
        {
            key: "PROPERTY_DETAILS",
            label: "Woninggegevens",
            description:
                "Woonoppervlak, aantal kamers en bouwjaar zijn vastgelegd.",
            status:
                isPresent(property.livingAreaSqm) &&
                isPresent(property.roomCount) &&
                isPresent(property.constructionYear)
                    ? "SATISFIED"
                    : "MISSING",
            weight: 1,
            actionHint:
                "Vul woonoppervlak, kamers en bouwjaar in op de advertentie. Na publicatie kun je dit niet meer wijzigen.",
        },
        {
            key: "ENERGY_LABEL",
            label: "Energielabel",
            description:
                "Een geldig energielabel is beschikbaar (uit de basisregistratie of als document).",
            status: hasEnergyLabel ? "SATISFIED" : "MISSING",
            weight: 1,
            actionHint:
                "Voeg het energielabel toe als document (categorie ‘Energielabel’) of koppel het via de advertentie.",
            category: "ENERGY_LABEL",
        },
        {
            key: "PHOTOS",
            label: "Foto's",
            description: "Minimaal één foto van de woning is toegevoegd.",
            status: hasPhoto ? "SATISFIED" : "MISSING",
            weight: 1,
            actionHint:
                "Voeg minimaal één foto toe op de advertentie. Na publicatie kun je dit niet meer wijzigen.",
        },
        {
            key: "FLOOR_PLAN",
            label: "Plattegrond",
            description:
                "Een plattegrond is beschikbaar (via de advertentie of als document).",
            status: hasFloorPlan ? "SATISFIED" : "MISSING",
            weight: 1,
            actionHint:
                "Voeg een plattegrond toe als document (categorie ‘Plattegrond’) of via de advertentie.",
            category: "FLOOR_PLAN",
        },
        {
            key: "FEATURES",
            label: "Kenmerken & voorzieningen",
            description:
                "Bijzondere kenmerken en voorzieningen van de woning zijn ingevuld.",
            status:
                isPresent(listing.attributes) || featuresFilled
                    ? "SATISFIED"
                    : "MISSING",
            weight: 1,
            actionHint:
                "Vul de kenmerken en voorzieningen in (of via de advertentie).",
            draftKey: "features",
        },
        {
            key: "CONDITION",
            label: "Staat & onderhoud",
            description:
                "De bouwkundige staat is bekend: via een keuring (NEN 2767) of een toelichting van de eigenaar.",
            status:
                hasDocument("BUILDING_INSPECTION", documents) ||
                conditionFilled ||
                inspectionFilled ||
                renovationFilled
                    ? "SATISFIED"
                    : "MISSING",
            weight: 1,
            actionHint:
                "Upload de bouwkundige keuring (categorie ‘Bouwkundige keuring’) of vul de staat van onderhoud in.",
            category: "BUILDING_INSPECTION",
            draftKey: "condition",
        },
        {
            key: "CADASTRAL",
            label: "Kadastrale gegevens",
            description:
                "Het kadastrale perceel is gekoppeld of het eigendomsbewijs/kadastraal uittreksel is toegevoegd.",
            status: hasCadastral ? "SATISFIED" : "MISSING",
            weight: 1,
            actionHint:
                "Upload een kadastraal uittreksel of eigendomsbewijs (categorie ‘Kadastrale gegevens’).",
            category: "CADASTRAL",
        },
        {
            key: "VVE",
            label: "VvE-gegevens",
            description:
                "VvE-gegevens en de maandelijkse bijdrage zijn ingevuld of de VvE-stukken zijn toegevoegd.",
            status: isApartment
                ? vveFilled || hasDocument("VVE", documents)
                    ? "SATISFIED"
                    : "MISSING"
                : "NOT_APPLICABLE",
            weight: isApartment ? 1 : 0,
            actionHint:
                "Vul de VvE-gegevens in of upload de VvE-stukken (categorie ‘VvE-stukken’).",
            category: "VVE",
            draftKey: "vve",
        },
    ];

    const applicable = items.filter((item) => item.weight > 0);
    const satisfied = applicable.filter(
        (item) => item.status === "SATISFIED",
    ).length;
    const weightedSatisfied = applicable
        .filter((item) => item.status === "SATISFIED")
        .reduce((sum, item) => sum + item.weight, 0);
    const weightedTotal = applicable.reduce(
        (sum, item) => sum + item.weight,
        0,
    );
    const score =
        weightedTotal === 0
            ? 0
            : Math.round((weightedSatisfied / weightedTotal) * 100);

    return {
        score,
        satisfied,
        applicable: applicable.length,
        total: items.length,
        items,
    };
}
