CREATE TYPE "RoofType" AS ENUM (
    'FLAT',
    'GABLE',
    'HIP',
    'MANSARD',
    'SHED',
    'COMBINATION',
    'OTHER'
);

CREATE TYPE "PropertyAmenity" AS ENUM (
    'SOLAR_PANELS',
    'AIR_CONDITIONING',
    'FIBER_OPTIC',
    'HEAT_PUMP',
    'EV_CHARGER',
    'FIREPLACE',
    'MECHANICAL_VENTILATION',
    'ALARM_SYSTEM'
);

CREATE TYPE "ParkingOption" AS ENUM (
    'ON_PROPERTY',
    'FREE_STREET',
    'PAID_STREET',
    'PARKING_PERMIT',
    'PUBLIC_GARAGE',
    'PRIVATE_GARAGE',
    'SPACE_FOR_SALE'
);

ALTER TABLE "properties"
    ADD COLUMN "bathroomCount" INTEGER,
    ADD COLUMN "floorCount" INTEGER,
    ADD COLUMN "roofType" "RoofType",
    ADD COLUMN "externalStorageAreaSqm" DECIMAL(8, 2),
    ADD COLUMN "amenities" "PropertyAmenity"[] NOT NULL DEFAULT ARRAY[]::"PropertyAmenity"[],
    ADD COLUMN "parkingOptions" "ParkingOption"[] NOT NULL DEFAULT ARRAY[]::"ParkingOption"[],
    ADD COLUMN "parkingSpacePriceCents" BIGINT;