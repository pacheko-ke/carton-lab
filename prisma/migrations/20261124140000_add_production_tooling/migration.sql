CREATE TABLE "ProductionTooling" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "customerId" TEXT,
    "toolNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'COMPANY',
    "storageLocation" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "wearNotes" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionTooling_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionTooling_category_check"
      CHECK ("category" IN ('DIE', 'PRINT_PLATE', 'CYLINDER', 'ANILOX')),
    CONSTRAINT "ProductionTooling_owner_check"
      CHECK (
        ("ownerType" = 'COMPANY' AND "customerId" IS NULL) OR
        ("ownerType" = 'CUSTOMER' AND "customerId" IS NOT NULL)
      ),
    CONSTRAINT "ProductionTooling_status_check"
      CHECK ("status" IN ('AVAILABLE', 'MAINTENANCE', 'RETIRED')),
    CONSTRAINT "ProductionTooling_usage_count_check" CHECK ("usageCount" >= 0)
);

CREATE TABLE "ProductionToolingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "toolingId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "jobId" TEXT,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionToolingEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionToolingEvent_type_check"
      CHECK ("eventType" IN ('USAGE', 'REPAIR', 'INSPECTION', 'STATUS_CHANGE')),
    CONSTRAINT "ProductionToolingEvent_description_check"
      CHECK (length(trim("description")) > 0)
);

CREATE UNIQUE INDEX "ProductionTooling_organizationId_toolNo_key"
ON "ProductionTooling"("organizationId", "toolNo");

CREATE INDEX "ProductionTooling_organizationId_category_status_idx"
ON "ProductionTooling"("organizationId", "category", "status");

CREATE INDEX "ProductionTooling_customerId_idx"
ON "ProductionTooling"("customerId");

CREATE INDEX "ProductionToolingEvent_organizationId_createdAt_idx"
ON "ProductionToolingEvent"("organizationId", "createdAt");

CREATE INDEX "ProductionToolingEvent_toolingId_createdAt_idx"
ON "ProductionToolingEvent"("toolingId", "createdAt");

CREATE INDEX "ProductionToolingEvent_jobId_idx"
ON "ProductionToolingEvent"("jobId");

ALTER TABLE "ProductionTooling"
ADD CONSTRAINT "ProductionTooling_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionTooling"
ADD CONSTRAINT "ProductionTooling_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionTooling"
ADD CONSTRAINT "ProductionTooling_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "ProductionCustomer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionToolingEvent"
ADD CONSTRAINT "ProductionToolingEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionToolingEvent"
ADD CONSTRAINT "ProductionToolingEvent_toolingId_fkey"
FOREIGN KEY ("toolingId") REFERENCES "ProductionTooling"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionToolingEvent"
ADD CONSTRAINT "ProductionToolingEvent_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionToolingEvent"
ADD CONSTRAINT "ProductionToolingEvent_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
