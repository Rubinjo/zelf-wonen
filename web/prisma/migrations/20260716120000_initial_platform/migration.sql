-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('NL', 'EN');
CREATE TYPE "ListingPurpose" AS ENUM ('SALE', 'RENT');
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'READY_FOR_VERIFICATION', 'LIVE', 'UNDER_OFFER', 'SOLD', 'RENTED', 'ARCHIVED');
CREATE TYPE "PropertyType" AS ENUM ('HOUSE', 'APARTMENT', 'PARKING', 'LAND', 'COMMERCIAL', 'OTHER');
CREATE TYPE "EnergyLabelClass" AS ENUM ('A_PLUS_PLUS_PLUS_PLUS_PLUS', 'A_PLUS_PLUS_PLUS_PLUS', 'A_PLUS_PLUS_PLUS', 'A_PLUS_PLUS', 'A_PLUS', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'UNKNOWN');
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'FLOOR_PLAN_STATIC', 'DOCUMENT');
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'READY', 'REJECTED');
CREATE TYPE "FloorPlanMode" AS ENUM ('STATIC_UPLOAD', 'FLOORPLANNER_EMBED');
CREATE TYPE "VerificationKind" AS ENUM ('EMAIL', 'IDIN');
CREATE TYPE "VerificationStatus" AS ENUM ('INITIATED', 'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "VerificationPurpose" AS ENUM ('ACCOUNT_ACCESS', 'LISTING_PUBLICATION', 'EXTERNAL_PUBLICATION');
CREATE TYPE "PublicationPackage" AS ENUM ('BRONZE', 'SILVER', 'GOLD');
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAYMENT_PENDING', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PublicationChannel" AS ENUM ('PLATFORM', 'FUNDA');
CREATE TYPE "PublicationStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'LIVE', 'REJECTED', 'WITHDRAWN', 'FAILED');
CREATE TYPE "BidEventType" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'ACCEPTED', 'REJECTED', 'EXPIRED');
CREATE TYPE "EstimateTier" AS ENUM ('MULTIMODAL_ML', 'BASIC_ML', 'POSTCODE_SQM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'NL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "two_factors" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "bagAddressId" TEXT,
    "bagBuildingId" TEXT,
    "cadastralParcelId" TEXT,
    "postcode" VARCHAR(6) NOT NULL,
    "houseNumber" INTEGER NOT NULL,
    "houseNumberAddition" TEXT,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "municipality" TEXT,
    "province" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "propertyType" "PropertyType" NOT NULL,
    "livingAreaSqm" DECIMAL(8,2),
    "officialLandAreaSqm" DECIMAL(10,2),
    "volumeCubicMeters" DECIMAL(10,2),
    "roomCount" INTEGER,
    "bedroomCount" INTEGER,
    "constructionYear" INTEGER,
    "layout" JSONB,
    "kadasterSourcePayload" JSONB,
    "kadasterRetrievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "energy_labels" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "registrationNumber" TEXT,
    "labelClass" "EnergyLabelClass" NOT NULL,
    "primaryFossilEnergyKwhSqmYear" DECIMAL(10,2),
    "registeredAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'RVO_EP_ONLINE',
    "sourcePayload" JSONB,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "energy_labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "purpose" "ListingPurpose" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "publicSlug" TEXT,
    "titleNl" TEXT,
    "titleEn" TEXT,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "askingPriceCents" BIGINT,
    "monthlyRentCents" BIGINT,
    "serviceCostsCents" BIGINT,
    "availableFrom" TIMESTAMP(3),
    "viewingNotes" TEXT,
    "attributes" JSONB,
    "bidWindowOpensAt" TIMESTAMP(3),
    "bidWindowClosesAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "publicationRequestedAt" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_media" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altTextNl" TEXT,
    "altTextEn" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "floor_plans" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "mode" "FloorPlanMode" NOT NULL,
    "floorName" TEXT,
    "floorplannerProjectId" TEXT,
    "embedUrl" TEXT,
    "staticMediaId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "identity_verification_attempts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID,
    "purpose" "VerificationPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'INITIATED',
    "subjectReferenceHash" CHAR(64),
    "attributesMatched" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "responsePayloadHash" CHAR(64),
    CONSTRAINT "identity_verification_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "VerificationKind" NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" CHAR(64),
    "entryHash" CHAR(64) NOT NULL,
    CONSTRAINT "verification_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_orders" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "package" "PublicationPackage" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "amountCents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "paymentProvider" TEXT,
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "publication_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_publications" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "orderId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "channel" "PublicationChannel" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'QUEUED',
    "package" "PublicationPackage",
    "externalReference" TEXT,
    "requestPayloadHash" CHAR(64),
    "responsePayloadHash" CHAR(64),
    "submittedAt" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listing_publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bids" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "bidderUserId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "bidderPseudonym" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "resolutiveConditions" JSONB NOT NULL,
    "financingDeadline" TIMESTAMP(3),
    "transferDateRequested" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceIpHash" CHAR(64),
    "previousHash" CHAR(64),
    "entryHash" CHAR(64) NOT NULL,
    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bid_events" (
    "id" UUID NOT NULL,
    "bidId" UUID NOT NULL,
    "type" "BidEventType" NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" CHAR(64),
    "entryHash" CHAR(64) NOT NULL,
    CONSTRAINT "bid_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bid_logbook_exports" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "documentSha256" CHAR(64) NOT NULL,
    "logbookHeadHash" CHAR(64) NOT NULL,
    "anonymizationVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "bid_logbook_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "estimate_cache" (
    "id" UUID NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "normalizedInput" JSONB NOT NULL,
    "qualitativeFeatures" JSONB,
    "imageHashes" JSONB,
    "tier" "EstimateTier" NOT NULL,
    "estimatedValueCents" BIGINT NOT NULL,
    "lowerBoundCents" BIGINT NOT NULL,
    "upperBoundCents" BIGINT NOT NULL,
    "confidenceBasisPoints" INTEGER NOT NULL,
    "llmModelVersion" TEXT,
    "mlModelVersion" TEXT,
    "publicDatasetVersion" TEXT,
    "explanation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "estimate_cache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "postcode_price_stats" (
    "id" UUID NOT NULL,
    "postcodeSector" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "averagePricePerSqmCents" BIGINT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "postcode_price_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "listingId" UUID,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "previousHash" CHAR(64),
    "entryHash" CHAR(64) NOT NULL,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "two_factors_userId_idx" ON "two_factors"("userId");
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");
CREATE INDEX "properties_ownerId_idx" ON "properties"("ownerId");
CREATE INDEX "properties_postcode_houseNumber_houseNumberAddition_idx" ON "properties"("postcode", "houseNumber", "houseNumberAddition");
CREATE INDEX "properties_ownerId_bagAddressId_idx" ON "properties"("ownerId", "bagAddressId");
CREATE UNIQUE INDEX "energy_labels_registrationNumber_key" ON "energy_labels"("registrationNumber");
CREATE INDEX "energy_labels_propertyId_registeredAt_idx" ON "energy_labels"("propertyId", "registeredAt");
CREATE UNIQUE INDEX "listings_publicSlug_key" ON "listings"("publicSlug");
CREATE INDEX "listings_ownerId_status_idx" ON "listings"("ownerId", "status");
CREATE INDEX "listings_propertyId_idx" ON "listings"("propertyId");
CREATE UNIQUE INDEX "listing_media_storageKey_key" ON "listing_media"("storageKey");
CREATE INDEX "listing_media_listingId_kind_sortOrder_idx" ON "listing_media"("listingId", "kind", "sortOrder");
CREATE INDEX "floor_plans_listingId_sortOrder_idx" ON "floor_plans"("listingId", "sortOrder");
CREATE UNIQUE INDEX "identity_verification_attempts_providerReference_key" ON "identity_verification_attempts"("providerReference");
CREATE INDEX "identity_verification_attempts_userId_status_completedAt_idx" ON "identity_verification_attempts"("userId", "status", "completedAt");
CREATE INDEX "identity_verification_attempts_listingId_purpose_status_idx" ON "identity_verification_attempts"("listingId", "purpose", "status");
CREATE UNIQUE INDEX "verification_audit_logs_entryHash_key" ON "verification_audit_logs"("entryHash");
CREATE INDEX "verification_audit_logs_userId_kind_occurredAt_idx" ON "verification_audit_logs"("userId", "kind", "occurredAt");
CREATE UNIQUE INDEX "publication_orders_paymentReference_key" ON "publication_orders"("paymentReference");
CREATE INDEX "publication_orders_listingId_status_idx" ON "publication_orders"("listingId", "status");
CREATE INDEX "publication_orders_userId_createdAt_idx" ON "publication_orders"("userId", "createdAt");
CREATE UNIQUE INDEX "listing_publications_idempotencyKey_key" ON "listing_publications"("idempotencyKey");
CREATE INDEX "listing_publications_listingId_channel_status_idx" ON "listing_publications"("listingId", "channel", "status");
CREATE UNIQUE INDEX "listing_publications_channel_externalReference_key" ON "listing_publications"("channel", "externalReference");
CREATE UNIQUE INDEX "bids_idempotencyKey_key" ON "bids"("idempotencyKey");
CREATE UNIQUE INDEX "bids_entryHash_key" ON "bids"("entryHash");
CREATE INDEX "bids_listingId_submittedAt_idx" ON "bids"("listingId", "submittedAt");
CREATE INDEX "bids_bidderUserId_idx" ON "bids"("bidderUserId");
CREATE UNIQUE INDEX "bid_events_entryHash_key" ON "bid_events"("entryHash");
CREATE INDEX "bid_events_bidId_occurredAt_idx" ON "bid_events"("bidId", "occurredAt");
CREATE UNIQUE INDEX "bid_logbook_exports_storageKey_key" ON "bid_logbook_exports"("storageKey");
CREATE INDEX "bid_logbook_exports_listingId_generatedAt_idx" ON "bid_logbook_exports"("listingId", "generatedAt");
CREATE UNIQUE INDEX "estimate_cache_inputHash_key" ON "estimate_cache"("inputHash");
CREATE INDEX "estimate_cache_expiresAt_idx" ON "estimate_cache"("expiresAt");
CREATE INDEX "postcode_price_stats_postcodeSector_effectiveAt_idx" ON "postcode_price_stats"("postcodeSector", "effectiveAt");
CREATE UNIQUE INDEX "postcode_price_stats_postcodeSector_propertyType_datasetVer_key" ON "postcode_price_stats"("postcodeSector", "propertyType", "datasetVersion");
CREATE UNIQUE INDEX "audit_events_entryHash_key" ON "audit_events"("entryHash");
CREATE INDEX "audit_events_aggregateType_aggregateId_occurredAt_idx" ON "audit_events"("aggregateType", "aggregateId", "occurredAt");
CREATE INDEX "audit_events_listingId_occurredAt_idx" ON "audit_events"("listingId", "occurredAt");

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "energy_labels" ADD CONSTRAINT "energy_labels_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listings" ADD CONSTRAINT "listings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listings" ADD CONSTRAINT "listings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity_verification_attempts" ADD CONSTRAINT "identity_verification_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_verification_attempts" ADD CONSTRAINT "identity_verification_attempts_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "verification_audit_logs" ADD CONSTRAINT "verification_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_orders" ADD CONSTRAINT "publication_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_orders" ADD CONSTRAINT "publication_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listing_publications" ADD CONSTRAINT "listing_publications_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listing_publications" ADD CONSTRAINT "listing_publications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "publication_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bids" ADD CONSTRAINT "bids_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidderUserId_fkey" FOREIGN KEY ("bidderUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bid_events" ADD CONSTRAINT "bid_events_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bid_logbook_exports" ADD CONSTRAINT "bid_logbook_exports_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma does not model PostgreSQL triggers. These protect legally significant history.
CREATE OR REPLACE FUNCTION reject_immutable_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bids_are_append_only
BEFORE UPDATE OR DELETE ON bids
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER bid_events_are_append_only
BEFORE UPDATE OR DELETE ON bid_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER verification_audit_is_append_only
BEFORE UPDATE OR DELETE ON verification_audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER audit_events_are_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER logbook_exports_are_append_only
BEFORE UPDATE OR DELETE ON bid_logbook_exports
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
