CREATE TYPE "ViewingType" AS ENUM ('APPOINTMENT', 'OPEN_HOUSE');

CREATE TABLE "viewing_slots" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "type" "ViewingType" NOT NULL DEFAULT 'APPOINTMENT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viewing_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "viewing_slots_valid_period" CHECK ("endsAt" > "startsAt"),
    CONSTRAINT "viewing_slots_positive_capacity" CHECK ("capacity" > 0),
    CONSTRAINT "viewing_slots_appointment_capacity" CHECK ("type" <> 'APPOINTMENT' OR "capacity" = 1)
);

CREATE TABLE "viewing_bookings" (
    "id" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewing_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "viewing_slots_listingId_startsAt_idx" ON "viewing_slots"("listingId", "startsAt");
CREATE UNIQUE INDEX "viewing_bookings_slotId_userId_key" ON "viewing_bookings"("slotId", "userId");
CREATE INDEX "viewing_bookings_userId_createdAt_idx" ON "viewing_bookings"("userId", "createdAt");

ALTER TABLE "viewing_slots" ADD CONSTRAINT "viewing_slots_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "viewing_bookings" ADD CONSTRAINT "viewing_bookings_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "viewing_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "viewing_bookings" ADD CONSTRAINT "viewing_bookings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
