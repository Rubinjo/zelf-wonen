import {
    parkingOptions,
    propertyAmenityOptions,
    type ErfpachtType,
    type ParkingOption,
    type PropertyAmenity,
    type RoofType,
} from "@/lib/property-options";
import { gardenOrientationLabels, type GardenOrientation } from "./garden";

const amenityAliases: Record<PropertyAmenity, string[]> = {
    SOLAR_PANELS: ["zonnepanelen"],
    AIR_CONDITIONING: ["airconditioning", "airco"],
    FIBER_OPTIC: ["glasvezel", "glasvezelkabel"],
    HEAT_PUMP: ["warmtepomp"],
    EV_CHARGER: ["laadpaal"],
    FIREPLACE: ["open haard"],
    MECHANICAL_VENTILATION: ["mechanische ventilatie"],
    ALARM_SYSTEM: ["alarminstallatie", "alarmsysteem"],
};
const parkingAliases: Record<ParkingOption, string[]> = {
    ON_PROPERTY: ["op eigen terrein", "parkeren op eigen terrein"],
    FREE_STREET: ["gratis parkeren", "gratis parkeren op straat"],
    PAID_STREET: ["betaald parkeren", "betaald parkeren op straat"],
    PARKING_PERMIT: ["parkeervergunning", "parkeervergunningen"],
    PUBLIC_GARAGE: ["openbare parkeergarage"],
    PRIVATE_GARAGE: ["eigen garage"],
    SPACE_FOR_SALE: ["parkeerplaats apart te koop"],
};
const roofAliases: [string, RoofType][] = [
    ["plat dak", "FLAT"], ["zadeldak", "GABLE"], ["schilddak", "HIP"],
    ["mansardedak", "MANSARD"], ["lessenaarsdak", "SHED"], ["samengesteld dak", "COMBINATION"],
];

function numericFact(value: string | null): number | null {
    const match = value?.replace(/\.(?=\d{3}(?:\D|$))/g, "").match(/\d+(?:[.,]\d+)?/);
    return match ? Number(match[0].replace(",", ".")) : null;
}

export function mapAggregatedPropertyDetails(interior: unknown, amenities: readonly string[]) {
    const facts: Record<string, string> = {};
    if (interior && typeof interior === "object" && !Array.isArray(interior)) {
        for (const [key, value] of Object.entries(interior)) {
            if (typeof value === "string") facts[key.toLowerCase()] = value.trim();
        }
    }
    const fact = (key: string) => facts[key] || null;
    const tokens = (values: readonly string[]) => values.flatMap(value =>
        value.toLowerCase().split(/,|\s+en\s+/).map(part => part.trim()),
    );
    const facilityTokens = tokens([...amenities, fact("voorzieningen") ?? ""]);
    const parkingTokens = tokens([fact("soort parkeergelegenheid") ?? ""]);
    const garage = fact("soort garage");
    if (garage && !/^(geen|niet|n\.v\.t\.)\b/i.test(garage)) parkingTokens.push("eigen garage");
    const gardenText = fact("tuin") ?? fact("garden");
    // A balcony/sun terrace does not establish a garden in our listing model.
    const hasGarden = Boolean(gardenText && /tuin|patio|atrium/i.test(gardenText)
        && !/\bgeen\b/i.test(gardenText));
    const orientationText = fact("ligging tuin")?.toLowerCase() ?? "";
    const orientation = (Object.entries(gardenOrientationLabels) as [GardenOrientation, string][])
        .sort((a, b) => b[1].length - a[1].length)
        .find(([, label]) => orientationText.includes(label.toLowerCase()))?.[0] ?? null;
    const ownership = fact("eigendomssituatie")?.toLowerCase() ?? "";
    const erfpachtType: ErfpachtType | null = ownership.includes("volle eigendom") ? "FREEHOLD"
        : ownership.includes("erfpacht") ? ownership.includes("afgekocht") ? "LEASEHOLD_AFGEKOCHT" : "LEASEHOLD"
        : null;
    const vveContribution = numericFact(fact("bijdrage vve"));
    return {
        floorCount: numericFact(fact("aantal woonlagen")),
        externalStorageAreaSqm: numericFact(fact("externe bergruimte")),
        roofType: roofAliases.find(([label]) => fact("soort dak")?.toLowerCase().startsWith(label))?.[1] ?? null,
        garden: hasGarden ? { orientation } : null,
        erfpachtType,
        serviceCostsCents: vveContribution === null ? null : Math.round(vveContribution * 100),
        amenities: propertyAmenityOptions.filter(option => facilityTokens.some(token =>
            token === option.value.toLowerCase() || amenityAliases[option.value].includes(token),
        )).map(option => option.value),
        parkingOptions: parkingOptions.filter(option => parkingTokens.some(token =>
            token === option.value.toLowerCase() || parkingAliases[option.value].includes(token),
        )).map(option => option.value),
    };
}

export function aggregatedAddress(input: {
    street: string; houseNumber: number; houseNumberAddition: string | null;
    postcode: string | null; city: string;
}) {
    const house = input.houseNumber
        ? `${input.houseNumber}${input.houseNumberAddition ? ` ${input.houseNumberAddition}` : ""}`
        : "";
    const street = [house, house.replaceAll(" ", "")].some(number =>
        number && input.street.toLowerCase().endsWith(` ${number.toLowerCase()}`),
    ) ? input.street : `${input.street}${house ? ` ${house}` : ""}`;
    return `${street}, ${[input.postcode, input.city].filter(Boolean).join(" ")}`;
}
