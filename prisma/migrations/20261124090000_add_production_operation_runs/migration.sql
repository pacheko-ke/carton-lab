CREATE TABLE "ProductionOperationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "goodQty" INTEGER NOT NULL,
    "rejectedQty" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOperationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionOperationRun_organizationId_recordedAt_idx"
ON "ProductionOperationRun"("organizationId", "recordedAt");

CREATE INDEX "ProductionOperationRun_scheduleId_recordedAt_idx"
ON "ProductionOperationRun"("scheduleId", "recordedAt");

ALTER TABLE "ProductionOperationRun"
ADD CONSTRAINT "ProductionOperationRun_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionOperationRun"
ADD CONSTRAINT "ProductionOperationRun_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "ProductionOperationSchedule"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionOperationRun"
ADD CONSTRAINT "ProductionOperationRun_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
