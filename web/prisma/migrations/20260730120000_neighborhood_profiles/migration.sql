CREATE TABLE "neighborhood_profiles" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "neighborhoodCode" VARCHAR(10) NOT NULL,
    "neighborhoodName" TEXT NOT NULL,
    "districtCode" VARCHAR(8),
    "districtName" TEXT,
    "municipalityCode" VARCHAR(6) NOT NULL,
    "statisticsYear" INTEGER NOT NULL,
    "population" INTEGER,
    "populationDensityPerKm2" INTEGER,
    "nationalPopulationDensityPerKm2" INTEGER,
    "age0To14Percent" DECIMAL(5,2),
    "age15To24Percent" DECIMAL(5,2),
    "age25To44Percent" DECIMAL(5,2),
    "age45To64Percent" DECIMAL(5,2),
    "age65PlusPercent" DECIMAL(5,2),
    "nationalAge0To14Percent" DECIMAL(5,2),
    "nationalAge15To24Percent" DECIMAL(5,2),
    "nationalAge25To44Percent" DECIMAL(5,2),
    "nationalAge45To64Percent" DECIMAL(5,2),
    "nationalAge65PlusPercent" DECIMAL(5,2),
    "housingCorporationPercent" DECIMAL(5,2),
    "nationalHousingCorporationPercent" DECIMAL(5,2),
    "registeredCrimesPer1000" DECIMAL(8,2),
    "nationalRegisteredCrimesPer1000" DECIMAL(8,2),
    "crimeStatisticsYear" INTEGER,
    "supermarketDistanceKm" DECIMAL(6,2),
    "primarySchoolDistanceKm" DECIMAL(6,2),
    "daycareDistanceKm" DECIMAL(6,2),
    "generalPracticeDistanceKm" DECIMAL(6,2),
    "primarySchoolsWithin3Km" DECIMAL(6,1),
    "supermarketsWithin1Km" INTEGER,
    "schoolsWithin1Km" INTEGER,
    "busStopDistanceMeters" INTEGER,
    "tramStopDistanceMeters" INTEGER,
    "metroStationDistanceMeters" INTEGER,
    "trainStationDistanceMeters" INTEGER,
    "cbsDataset" TEXT NOT NULL,
    "cbsSourceUrl" TEXT NOT NULL,
    "cbsRetrievedAt" TIMESTAMP(3) NOT NULL,
    "crimeDataset" TEXT,
    "crimeSourceUrl" TEXT,
    "osmSourceUrl" TEXT,
    "osmRetrievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "neighborhood_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "neighborhood_profiles_propertyId_key" ON "neighborhood_profiles"("propertyId");
CREATE INDEX "neighborhood_profiles_neighborhoodCode_idx" ON "neighborhood_profiles"("neighborhoodCode");
CREATE INDEX "neighborhood_profiles_housingCorporationPercent_idx" ON "neighborhood_profiles"("housingCorporationPercent");
CREATE INDEX "neighborhood_profiles_registeredCrimesPer1000_idx" ON "neighborhood_profiles"("registeredCrimesPer1000");
CREATE INDEX "neighborhood_profiles_supermarketDistanceKm_idx" ON "neighborhood_profiles"("supermarketDistanceKm");
CREATE INDEX "neighborhood_profiles_primarySchoolDistanceKm_idx" ON "neighborhood_profiles"("primarySchoolDistanceKm");
CREATE INDEX "neighborhood_profiles_busStopDistanceMeters_idx" ON "neighborhood_profiles"("busStopDistanceMeters");
CREATE INDEX "neighborhood_profiles_trainStationDistanceMeters_idx" ON "neighborhood_profiles"("trainStationDistanceMeters");

ALTER TABLE "neighborhood_profiles" ADD CONSTRAINT "neighborhood_profiles_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;