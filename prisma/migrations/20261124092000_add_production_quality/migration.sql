CREATE TABLE "ProductionQualityInspection" (
    "id" TEXT NOT NULL,
    "inspectionNo" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "createdByUserId" TEXT,
    "inspectionType" TEXT NOT NULL,
    "sampleQty" INTEGER NOT NULL,
    "rejectedQty" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "notes" TEXT NOT NULL DEFAULT '',
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionQualityInspection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionQualityInspection_sampleQty_check" CHECK ("sampleQty" > 0),
    CONSTRAINT "ProductionQualityInspection_rejectedQty_check" CHECK ("rejectedQty" >= 0 AND "rejectedQty" <= "sampleQty"),
    CONSTRAINT "ProductionQualityInspection_inspectionType_check" CHECK ("inspectionType" IN ('INCOMING', 'IN_PROCESS', 'FINAL', 'CUSTOMER_RETURN')),
    CONSTRAINT "ProductionQualityInspection_result_check" CHECK ("result" IN ('PASS', 'FAIL')),
    CONSTRAINT "ProductionQualityInspection_checks_check" CHECK (jsonb_typeof("checks") = 'array')
);

CREATE TABLE "ProductionNonconformance" (
    "id" TEXT NOT NULL,
    "ncrNo" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "resolvedByUserId" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "affectedQty" INTEGER NOT NULL DEFAULT 0,
    "disposition" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "rootCause" TEXT NOT NULL DEFAULT '',
    "correctiveAction" TEXT NOT NULL DEFAULT '',
    "resolutionNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionNonconformance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionNonconformance_affectedQty_check" CHECK ("affectedQty" >= 0),
    CONSTRAINT "ProductionNonconformance_severity_check" CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "ProductionNonconformance_disposition_check" CHECK ("disposition" IN ('PENDING', 'REWORK', 'SCRAP', 'USE_AS_IS', 'RETURN_TO_SUPPLIER')),
    CONSTRAINT "ProductionNonconformance_status_check" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
    CONSTRAINT "ProductionNonconformance_closed_check" CHECK (
        "status" <> 'CLOSED' OR (
            "closedAt" IS NOT NULL AND
            "disposition" <> 'PENDING' AND
            length(btrim("rootCause")) > 0 AND
            length(btrim("correctiveAction")) > 0 AND
            length(btrim("resolutionNotes")) > 0
        )
    )
);

CREATE UNIQUE INDEX "ProductionQualityInspection_inspectionNo_key"
ON "ProductionQualityInspection"("inspectionNo");

CREATE INDEX "ProductionQualityInspection_organizationId_inspectedAt_idx"
ON "ProductionQualityInspection"("organizationId", "inspectedAt");

CREATE INDEX "ProductionQualityInspection_organizationId_result_idx"
ON "ProductionQualityInspection"("organizationId", "result");

CREATE INDEX "ProductionQualityInspection_jobId_inspectedAt_idx"
ON "ProductionQualityInspection"("jobId", "inspectedAt");

CREATE INDEX "ProductionQualityInspection_scheduleId_idx"
ON "ProductionQualityInspection"("scheduleId");

CREATE UNIQUE INDEX "ProductionNonconformance_ncrNo_key"
ON "ProductionNonconformance"("ncrNo");

CREATE INDEX "ProductionNonconformance_organizationId_status_createdAt_idx"
ON "ProductionNonconformance"("organizationId", "status", "createdAt");

CREATE INDEX "ProductionNonconformance_jobId_createdAt_idx"
ON "ProductionNonconformance"("jobId", "createdAt");

CREATE INDEX "ProductionNonconformance_inspectionId_idx"
ON "ProductionNonconformance"("inspectionId");

ALTER TABLE "ProductionQualityInspection"
ADD CONSTRAINT "ProductionQualityInspection_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionQualityInspection"
ADD CONSTRAINT "ProductionQualityInspection_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionQualityInspection"
ADD CONSTRAINT "ProductionQualityInspection_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "ProductionOperationSchedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionQualityInspection"
ADD CONSTRAINT "ProductionQualityInspection_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionNonconformance"
ADD CONSTRAINT "ProductionNonconformance_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionNonconformance"
ADD CONSTRAINT "ProductionNonconformance_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionNonconformance"
ADD CONSTRAINT "ProductionNonconformance_inspectionId_fkey"
FOREIGN KEY ("inspectionId") REFERENCES "ProductionQualityInspection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionNonconformance"
ADD CONSTRAINT "ProductionNonconformance_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionNonconformance"
ADD CONSTRAINT "ProductionNonconformance_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionNonconformance"
ADD CONSTRAINT "ProductionNonconformance_resolvedByUserId_fkey"
FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
