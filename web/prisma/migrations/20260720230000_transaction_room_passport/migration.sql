CREATE TYPE "TransactionStatus" AS ENUM ('ACTIVE', 'CONTRACT_PENDING', 'CONDITIONS_PENDING', 'READY_FOR_TRANSFER', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TransactionMilestoneType" AS ENUM ('PURCHASE_AGREEMENT', 'COOLING_OFF_PERIOD', 'FINANCING', 'BUILDING_INSPECTION', 'SECURITY_DEPOSIT', 'NOTARY_SELECTION', 'DEED_OF_TRANSFER', 'FINAL_INSPECTION', 'KEY_HANDOVER');
CREATE TYPE "TransactionMilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'WAIVED', 'OVERDUE');
CREATE TYPE "TransactionMessageKind" AS ENUM ('TEXT', 'SYSTEM');
CREATE TYPE "TransactionDocumentCategory" AS ENUM ('CHAT_ATTACHMENT', 'PURCHASE_AGREEMENT', 'PROPERTY_PASSPORT', 'FINANCING', 'BUILDING_INSPECTION', 'NOTARY', 'FINAL_INSPECTION', 'OTHER');
CREATE TYPE "TransactionDocumentStatus" AS ENUM ('AVAILABLE', 'SUPERSEDED', 'DELETED');
CREATE TYPE "TransactionEventType" AS ENUM ('ROOM_CREATED', 'MESSAGE_SENT', 'DOCUMENT_UPLOADED', 'DOCUMENT_DOWNLOADED', 'MILESTONE_UPDATED', 'CONTRACT_CONFIRMED', 'NOTARY_UPDATED', 'HANDOVER_UPDATED', 'PASSPORT_VERSION_CREATED', 'TRANSACTION_COMPLETED', 'TRANSACTION_CANCELLED');

CREATE TABLE "property_transactions" (
    "id" UUID NOT NULL, "listingId" UUID NOT NULL, "acceptedBidId" UUID NOT NULL,
    "sellerUserId" UUID NOT NULL, "buyerUserId" UUID NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE', "purchasePriceCents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR', "targetTransferDate" TIMESTAMP(3), "contractTerms" JSONB,
    "buyerContractConfirmedAt" TIMESTAMP(3), "sellerContractConfirmedAt" TIMESTAMP(3), "coolingOffEndsAt" TIMESTAMP(3),
    "notaryDetails" JSONB, "handoverDetails" JSONB, "completedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT, "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "property_transactions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "transaction_milestones" (
    "id" UUID NOT NULL, "transactionId" UUID NOT NULL, "type" "TransactionMilestoneType" NOT NULL,
    "status" "TransactionMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED', "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "details" JSONB, "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transaction_milestones_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "transaction_messages" (
    "id" UUID NOT NULL, "transactionId" UUID NOT NULL, "authorUserId" UUID NOT NULL,
    "kind" "TransactionMessageKind" NOT NULL DEFAULT 'TEXT', "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "editedAt" TIMESTAMP(3),
    CONSTRAINT "transaction_messages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "transaction_documents" (
    "id" UUID NOT NULL, "transactionId" UUID NOT NULL, "messageId" UUID, "uploadedById" UUID NOT NULL,
    "category" "TransactionDocumentCategory" NOT NULL DEFAULT 'OTHER', "status" "TransactionDocumentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sha256" CHAR(64) NOT NULL, "fileName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transaction_documents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "property_passport_versions" (
    "id" UUID NOT NULL, "listingId" UUID NOT NULL, "version" INTEGER NOT NULL, "listingVersionSource" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL, "completenessScore" INTEGER NOT NULL, "previousHash" CHAR(64), "entryHash" CHAR(64) NOT NULL,
    "createdByUserId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "property_passport_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "transaction_events" (
    "id" UUID NOT NULL, "transactionId" UUID NOT NULL, "actorUserId" UUID, "type" "TransactionEventType" NOT NULL,
    "payload" JSONB, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "previousHash" CHAR(64), "entryHash" CHAR(64) NOT NULL,
    CONSTRAINT "transaction_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "property_transactions_one_open_per_listing_idx" ON "property_transactions"("listingId") WHERE "status" <> 'CANCELLED';
CREATE UNIQUE INDEX "property_transactions_acceptedBidId_key" ON "property_transactions"("acceptedBidId");
CREATE INDEX "property_transactions_sellerUserId_status_updatedAt_idx" ON "property_transactions"("sellerUserId", "status", "updatedAt");
CREATE INDEX "property_transactions_buyerUserId_status_updatedAt_idx" ON "property_transactions"("buyerUserId", "status", "updatedAt");
CREATE INDEX "property_transactions_listingId_status_idx" ON "property_transactions"("listingId", "status");
CREATE UNIQUE INDEX "transaction_milestones_transactionId_type_key" ON "transaction_milestones"("transactionId", "type");
CREATE INDEX "transaction_milestones_transactionId_sortOrder_idx" ON "transaction_milestones"("transactionId", "sortOrder");
CREATE INDEX "transaction_milestones_dueAt_status_idx" ON "transaction_milestones"("dueAt", "status");
CREATE INDEX "transaction_messages_transactionId_createdAt_idx" ON "transaction_messages"("transactionId", "createdAt");
CREATE INDEX "transaction_messages_authorUserId_createdAt_idx" ON "transaction_messages"("authorUserId", "createdAt");
CREATE UNIQUE INDEX "transaction_documents_storageKey_key" ON "transaction_documents"("storageKey");
CREATE INDEX "transaction_documents_transactionId_category_createdAt_idx" ON "transaction_documents"("transactionId", "category", "createdAt");
CREATE INDEX "transaction_documents_messageId_idx" ON "transaction_documents"("messageId");
CREATE UNIQUE INDEX "property_passport_versions_entryHash_key" ON "property_passport_versions"("entryHash");
CREATE UNIQUE INDEX "property_passport_versions_listingId_version_key" ON "property_passport_versions"("listingId", "version");
CREATE INDEX "property_passport_versions_listingId_createdAt_idx" ON "property_passport_versions"("listingId", "createdAt");
CREATE UNIQUE INDEX "transaction_events_entryHash_key" ON "transaction_events"("entryHash");
CREATE INDEX "transaction_events_transactionId_occurredAt_idx" ON "transaction_events"("transactionId", "occurredAt");
CREATE INDEX "transaction_events_actorUserId_occurredAt_idx" ON "transaction_events"("actorUserId", "occurredAt");

ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_acceptedBidId_fkey" FOREIGN KEY ("acceptedBidId") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction_milestones" ADD CONSTRAINT "transaction_milestones_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "property_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_messages" ADD CONSTRAINT "transaction_messages_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "property_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_messages" ADD CONSTRAINT "transaction_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "property_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "transaction_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_passport_versions" ADD CONSTRAINT "property_passport_versions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_passport_versions" ADD CONSTRAINT "property_passport_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "property_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "property_passport_versions" ADD CONSTRAINT "property_passport_versions_completeness_check" CHECK ("completenessScore" BETWEEN 0 AND 100);