CREATE TYPE "SeekerNotificationType" AS ENUM ('NEW_LISTING', 'PRICE_CHANGED', 'LISTING_STATUS_CHANGED', 'VIEWING_UPDATED', 'BID_UPDATED', 'TRANSACTION_UPDATED', 'DEADLINE_APPROACHING');

CREATE TABLE "favorite_listings" (
    "id" UUID NOT NULL, "userId" UUID NOT NULL, "listingId" UUID NOT NULL, "note" TEXT,
    "priceSnapshotCents" BIGINT, "statusSnapshot" "ListingStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "favorite_listings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL, "userId" UUID NOT NULL, "name" TEXT NOT NULL, "queryString" TEXT NOT NULL,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true, "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "notification_preferences" (
    "userId" UUID NOT NULL, "newListing" BOOLEAN NOT NULL DEFAULT true, "priceChange" BOOLEAN NOT NULL DEFAULT true,
    "statusChange" BOOLEAN NOT NULL DEFAULT true, "viewing" BOOLEAN NOT NULL DEFAULT true, "bid" BOOLEAN NOT NULL DEFAULT true,
    "transaction" BOOLEAN NOT NULL DEFAULT true, "deadline" BOOLEAN NOT NULL DEFAULT true, "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE "seeker_notifications" (
    "id" UUID NOT NULL, "userId" UUID NOT NULL, "type" "SeekerNotificationType" NOT NULL, "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL, "body" TEXT NOT NULL, "href" TEXT, "payload" JSONB, "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "seeker_notifications_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "shortlist_shares" (
    "id" UUID NOT NULL, "ownerId" UUID NOT NULL, "label" TEXT, "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shortlist_shares_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "shortlist_items" (
    "id" UUID NOT NULL, "shareId" UUID NOT NULL, "listingId" UUID NOT NULL, "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shortlist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorite_listings_userId_listingId_key" ON "favorite_listings"("userId", "listingId");
CREATE INDEX "favorite_listings_userId_updatedAt_idx" ON "favorite_listings"("userId", "updatedAt");
CREATE INDEX "favorite_listings_listingId_idx" ON "favorite_listings"("listingId");
CREATE INDEX "saved_searches_userId_updatedAt_idx" ON "saved_searches"("userId", "updatedAt");
CREATE UNIQUE INDEX "saved_searches_userId_queryString_key" ON "saved_searches"("userId", "queryString");
CREATE UNIQUE INDEX "seeker_notifications_userId_eventKey_key" ON "seeker_notifications"("userId", "eventKey");
CREATE INDEX "seeker_notifications_userId_readAt_createdAt_idx" ON "seeker_notifications"("userId", "readAt", "createdAt");
CREATE UNIQUE INDEX "shortlist_shares_tokenHash_key" ON "shortlist_shares"("tokenHash");
CREATE INDEX "shortlist_shares_ownerId_createdAt_idx" ON "shortlist_shares"("ownerId", "createdAt");
CREATE INDEX "shortlist_shares_expiresAt_revokedAt_idx" ON "shortlist_shares"("expiresAt", "revokedAt");
CREATE UNIQUE INDEX "shortlist_items_shareId_listingId_key" ON "shortlist_items"("shareId", "listingId");
CREATE INDEX "shortlist_items_shareId_sortOrder_idx" ON "shortlist_items"("shareId", "sortOrder");
CREATE INDEX "shortlist_items_listingId_idx" ON "shortlist_items"("listingId");

ALTER TABLE "favorite_listings" ADD CONSTRAINT "favorite_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorite_listings" ADD CONSTRAINT "favorite_listings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seeker_notifications" ADD CONSTRAINT "seeker_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shortlist_shares" ADD CONSTRAINT "shortlist_shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "shortlist_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;