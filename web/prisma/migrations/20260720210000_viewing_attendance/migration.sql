CREATE TYPE "ViewingAttendanceStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'NO_SHOW');

ALTER TABLE "viewing_bookings"
ADD COLUMN "attendanceStatus" "ViewingAttendanceStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN "ownerReviewedAt" TIMESTAMP(3);

CREATE INDEX "viewing_bookings_userId_attendanceStatus_idx"
ON "viewing_bookings"("userId", "attendanceStatus");
