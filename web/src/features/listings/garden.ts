/**
 * Gestructureerde tuininformatie.
 *
 * De tuin wordt opgeslagen in de layout-JSON van een pand
 * (Property.layout.garden) zodat deze doorzoekbaar is via de
 * JSON-filters van PostgreSQL en getoond kan worden in de editor.
 */

export const GARDEN_ORIENTATIONS = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
] as const;

export type GardenOrientation = (typeof GARDEN_ORIENTATIONS)[number];

export const gardenOrientationLabels: Record<GardenOrientation, string> = {
    N: "Noorden",
    NE: "Noordoosten",
    E: "Oosten",
    SE: "Zuidoosten",
    S: "Zuiden",
    SW: "Zuidwesten",
    W: "Westen",
    NW: "Noordwesten",
};

export type GardenInfo = {
    orientation: GardenOrientation | null;
};

// JSON-waarden die Prisma als InputJsonValue accepteert.
type PrismaJson =
    | string
    | number
    | boolean
    | null
    | PrismaJson[]
    | { [key: string]: PrismaJson };

export type PropertyLayout = {
    rooms?: Array<{ name?: string; floor?: number; areaSqm?: number }>;
    garden?: GardenInfo;
};

/**
 * Leest veilig de layout-JSON van een pand; geeft null terug bij
 * ontbrekende of onverwachte data.
 */
export function parsePropertyLayout(layout: unknown): PropertyLayout | null {
    if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
        return null;
    }
    return layout as PropertyLayout;
}

/**
 * Plaatst de tuininformatie in een bestaande layout-JSON zonder de
 * overige sleutels (bijv. kamers) te verliezen. Een tuin zonder
 * oriëntatie wordt als lege garden-object opgeslagen; zonder tuin
 * verdwijnt de sleutel volledig.
 */
export function applyGardenToLayout(
    layout: unknown,
    garden: { hasGarden: boolean; orientation: GardenOrientation | null },
): Record<string, PrismaJson> {
    const base: Record<string, PrismaJson> =
        layout && typeof layout === "object" && !Array.isArray(layout)
            ? { ...(layout as Record<string, PrismaJson>) }
            : {};
    if (!garden.hasGarden) {
        delete base.garden;
        return base;
    }
    base.garden = { orientation: garden.orientation };
    return base;
}
