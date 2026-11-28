CREATE TABLE "ProductionSafetyIncident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'global-production',
    "employeeId" TEXT,
    "createdByUserId" TEXT,
    "closedByUserId" TEXT,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "immediateAction" TEXT NOT NULL DEFAULT '',
    "investigationNotes" TEXT NOT NULL DEFAULT '',
    "correctiveAction" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSafetyIncident_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionSafetyIncident_type_check"
      CHECK ("incidentType" IN ('INJURY', 'NEAR_MISS', 'HAZARD', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL')),
    CONSTRAINT "ProductionSafetyIncident_severity_check"
      CHECK ("severity" IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    CONSTRAINT "ProductionSafetyIncident_status_check"
      CHECK ("status" IN ('OPEN', 'INVESTIGATING', 'CLOSED')),
    CONSTRAINT "ProductionSafetyIncident_closure_check"
      CHECK (
        ("status" = 'CLOSED' AND "closedAt" IS NOT NULL) OR
        ("status" <> 'CLOSED' AND "closedAt" IS NULL AND "closedByUserId" IS NULL)
      )
);

CREATE INDEX "ProductionSafetyIncident_workspaceId_status_occurredAt_idx"
  ON "ProductionSafetyIncident"("workspaceId", "status", "occurredAt");
CREATE INDEX "ProductionSafetyIncident_employeeId_occurredAt_idx"
  ON "ProductionSafetyIncident"("employeeId", "occurredAt");

ALTER TABLE "ProductionSafetyIncident"
  ADD CONSTRAINT "ProductionSafetyIncident_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "ProductionEmployee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionSafetyIncident"
  ADD CONSTRAINT "ProductionSafetyIncident_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionSafetyIncident"
  ADD CONSTRAINT "ProductionSafetyIncident_closedByUserId_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
