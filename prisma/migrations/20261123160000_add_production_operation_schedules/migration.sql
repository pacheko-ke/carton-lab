CREATE TABLE "ProductionOperationSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "operation" TEXT NOT NULL,
    "workCenter" TEXT NOT NULL,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOperationSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionOperationSchedule_jobId_operation_key"
ON "ProductionOperationSchedule"("jobId", "operation");

CREATE INDEX "ProductionOperationSchedule_organizationId_scheduledStartAt_idx"
ON "ProductionOperationSchedule"("organizationId", "scheduledStartAt");

CREATE INDEX "ProductionOperationSchedule_organizationId_workCenter_scheduledStartAt_idx"
ON "ProductionOperationSchedule"("organizationId", "workCenter", "scheduledStartAt");

ALTER TABLE "ProductionOperationSchedule"
ADD CONSTRAINT "ProductionOperationSchedule_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionOperationSchedule"
ADD CONSTRAINT "ProductionOperationSchedule_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionOperationSchedule"
ADD CONSTRAINT "ProductionOperationSchedule_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
