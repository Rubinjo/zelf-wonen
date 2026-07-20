ALTER TABLE "viewing_slots"
    ADD COLUMN "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "viewing_slots"
SET "publishedAt" = LEAST("createdAt", "startsAt" - INTERVAL '1 millisecond');

DROP INDEX "viewing_slots_listingId_startsAt_idx";
CREATE INDEX "viewing_slots_listingId_publishedAt_startsAt_idx"
    ON "viewing_slots"("listingId", "publishedAt", "startsAt");

ALTER TABLE "viewing_slots"
    ADD CONSTRAINT "viewing_slots_publication_before_start"
    CHECK ("publishedAt" < "startsAt");
