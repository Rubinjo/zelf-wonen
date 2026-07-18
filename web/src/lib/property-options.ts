export const roofTypeOptions = [
    { value: "FLAT", label: "Plat dak" },
    { value: "GABLE", label: "Zadeldak" },
    { value: "HIP", label: "Schilddak" },
    { value: "MANSARD", label: "Mansardedak" },
    { value: "SHED", label: "Lessenaarsdak" },
    { value: "COMBINATION", label: "Samengesteld dak" },
    { value: "OTHER", label: "Anders" },
] as const;

export const propertyAmenityOptions = [
    { value: "SOLAR_PANELS", label: "Zonnepanelen" },
    { value: "AIR_CONDITIONING", label: "Airconditioning" },
    { value: "FIBER_OPTIC", label: "Glasvezel" },
    { value: "HEAT_PUMP", label: "Warmtepomp" },
    { value: "EV_CHARGER", label: "Laadpaal" },
    { value: "FIREPLACE", label: "Open haard" },
    { value: "MECHANICAL_VENTILATION", label: "Mechanische ventilatie" },
    { value: "ALARM_SYSTEM", label: "Alarmsysteem" },
] as const;

export const parkingOptions = [
    { value: "ON_PROPERTY", label: "Parkeren op eigen terrein" },
    { value: "FREE_STREET", label: "Gratis parkeren op straat" },
    { value: "PAID_STREET", label: "Betaald parkeren op straat" },
    { value: "PARKING_PERMIT", label: "Parkeervergunning" },
    { value: "PUBLIC_GARAGE", label: "Openbare parkeergarage" },
    { value: "PRIVATE_GARAGE", label: "Eigen garage" },
    { value: "SPACE_FOR_SALE", label: "Parkeerplaats apart te koop" },
] as const;

export type RoofType = (typeof roofTypeOptions)[number]["value"];
export type PropertyAmenity = (typeof propertyAmenityOptions)[number]["value"];
export type ParkingOption = (typeof parkingOptions)[number]["value"];
