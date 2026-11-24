CREATE TABLE "ProductionMachine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "machineNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineType" TEXT NOT NULL,
    "workCenter" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionMachine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionMachine_status_check"
      CHECK ("status" IN ('ACTIVE', 'MAINTENANCE', 'RETIRED'))
);

CREATE TABLE "ProductionMaintenancePlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "taskName" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "lastCompletedAt" TIMESTAMP(3),
    "instructions" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionMaintenancePlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionMaintenancePlan_interval_check"
      CHECK ("intervalDays" BETWEEN 1 AND 3650)
);

CREATE TABLE "ProductionMaintenanceTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "planId" TEXT,
    "jobId" TEXT,
    "operationScheduleId" TEXT,
    "createdByUserId" TEXT,
    "closedByUserId" TEXT,
    "ticketNo" TEXT NOT NULL,
    "ticketType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT '',
    "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionMaintenanceTicket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionMaintenanceTicket_type_check"
      CHECK ("ticketType" IN ('BREAKDOWN', 'PREVENTIVE')),
    CONSTRAINT "ProductionMaintenanceTicket_priority_check"
      CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "ProductionMaintenanceTicket_status_check"
      CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT "ProductionMaintenanceTicket_downtime_check"
      CHECK ("downtimeMinutes" >= 0),
    CONSTRAINT "ProductionMaintenanceTicket_closed_check"
      CHECK (
        ("status" IN ('OPEN', 'IN_PROGRESS') AND "closedAt" IS NULL) OR
        ("status" IN ('COMPLETED', 'CANCELLED') AND "closedAt" IS NOT NULL)
      ),
    CONSTRAINT "ProductionMaintenanceTicket_resolution_check"
      CHECK (
        "status" NOT IN ('COMPLETED', 'CANCELLED') OR
        length(trim("resolution")) > 0
      )
);

CREATE TABLE "ProductionMaintenancePart" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "issuedByUserId" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionMaintenancePart_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionMaintenancePart_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "ProductionMachine_organizationId_machineNo_key"
ON "ProductionMachine"("organizationId", "machineNo");

CREATE INDEX "ProductionMachine_organizationId_workCenter_status_idx"
ON "ProductionMachine"("organizationId", "workCenter", "status");

CREATE INDEX "ProductionMaintenancePlan_organizationId_active_nextDueAt_idx"
ON "ProductionMaintenancePlan"("organizationId", "active", "nextDueAt");

CREATE INDEX "ProductionMaintenancePlan_machineId_active_nextDueAt_idx"
ON "ProductionMaintenancePlan"("machineId", "active", "nextDueAt");

CREATE UNIQUE INDEX "ProductionMaintenanceTicket_organizationId_ticketNo_key"
ON "ProductionMaintenanceTicket"("organizationId", "ticketNo");

CREATE INDEX "ProductionMaintenanceTicket_organizationId_status_openedAt_idx"
ON "ProductionMaintenanceTicket"("organizationId", "status", "openedAt");

CREATE INDEX "ProductionMaintenanceTicket_machineId_openedAt_idx"
ON "ProductionMaintenanceTicket"("machineId", "openedAt");

CREATE INDEX "ProductionMaintenanceTicket_planId_idx"
ON "ProductionMaintenanceTicket"("planId");

CREATE INDEX "ProductionMaintenanceTicket_jobId_idx"
ON "ProductionMaintenanceTicket"("jobId");

CREATE INDEX "ProductionMaintenanceTicket_operationScheduleId_idx"
ON "ProductionMaintenanceTicket"("operationScheduleId");

CREATE UNIQUE INDEX "ProductionMaintenancePart_stockMovementId_key"
ON "ProductionMaintenancePart"("stockMovementId");

CREATE INDEX "ProductionMaintenancePart_ticketId_issuedAt_idx"
ON "ProductionMaintenancePart"("ticketId", "issuedAt");

CREATE INDEX "ProductionMaintenancePart_materialId_issuedAt_idx"
ON "ProductionMaintenancePart"("materialId", "issuedAt");

ALTER TABLE "ProductionMachine"
ADD CONSTRAINT "ProductionMachine_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionMachine"
ADD CONSTRAINT "ProductionMachine_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenancePlan"
ADD CONSTRAINT "ProductionMaintenancePlan_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenancePlan"
ADD CONSTRAINT "ProductionMaintenancePlan_machineId_fkey"
FOREIGN KEY ("machineId") REFERENCES "ProductionMachine"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenancePlan"
ADD CONSTRAINT "ProductionMaintenancePlan_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenanceTicket"
ADD CONSTRAINT "ProductionMaintenanceTicket_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenanceTicket"
ADD CONSTRAINT "ProductionMaintenanceTicket_machineId_fkey"
FOREIGN KEY ("machineId") REFERENCES "ProductionMachine"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenanceTicket"
ADD CONSTRAINT "ProductionMaintenanceTicket_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "ProductionMaintenancePlan"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenanceTicket"
ADD CONSTRAINT "ProductionMaintenanceTicket_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenanceTicket"
ADD CONSTRAINT "ProductionMaintenanceTicket_operationScheduleId_fkey"
FOREIGN KEY ("operationScheduleId") REFERENCES "ProductionOperationSchedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenanceTicket"
ADD CONSTRAINT "ProductionMaintenanceTicket_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenanceTicket"
ADD CONSTRAINT "ProductionMaintenanceTicket_closedByUserId_fkey"
FOREIGN KEY ("closedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenancePart"
ADD CONSTRAINT "ProductionMaintenancePart_ticketId_fkey"
FOREIGN KEY ("ticketId") REFERENCES "ProductionMaintenanceTicket"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenancePart"
ADD CONSTRAINT "ProductionMaintenancePart_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "ProductionMaterial"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenancePart"
ADD CONSTRAINT "ProductionMaintenancePart_stockMovementId_fkey"
FOREIGN KEY ("stockMovementId") REFERENCES "ProductionStockMovement"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionMaintenancePart"
ADD CONSTRAINT "ProductionMaintenancePart_issuedByUserId_fkey"
FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
