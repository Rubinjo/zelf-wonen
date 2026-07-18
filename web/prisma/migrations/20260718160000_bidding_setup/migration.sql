CREATE TYPE "BiddingMethod" AS ENUM ('PRIVATE', 'SEALED', 'OPEN');

ALTER TABLE "listings"
    ADD COLUMN "biddingMethod" "BiddingMethod" NOT NULL DEFAULT 'PRIVATE',
    ADD COLUMN "minimumBidCents" BIGINT,
    ADD COLUMN "bidIncrementCents" BIGINT,
    ADD COLUMN "allowBidConditions" BOOLEAN NOT NULL DEFAULT true;