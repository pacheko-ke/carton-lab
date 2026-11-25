ALTER TABLE "ProductionOperationSchedule"
ADD COLUMN "machineId" TEXT;

WITH unique_machine_work_centers AS (
    SELECT
        "organizationId",
        lower("workCenter") AS "normalizedWorkCenter",
        MAX("id") AS "machineId"
    FROM "ProductionMachine"
    GROUP BY "organizationId", lower("workCenter")
    HAVING COUNT(*) = 1
)
UPDATE "ProductionOperationSchedule" AS schedule
SET "machineId" = machine."machineId"
FROM unique_machine_work_centers AS machine
WHERE schedule."organizationId" = machine."organizationId"
  AND lower(schedule."workCenter") = machine."normalizedWorkCenter";

CREATE INDEX "ProductionOperationSchedule_machineId_scheduledStartAt_idx"
ON "ProductionOperationSchedule"("machineId", "scheduledStartAt");

ALTER TABLE "ProductionOperationSchedule"
ADD CONSTRAINT "ProductionOperationSchedule_machineId_fkey"
FOREIGN KEY ("machineId") REFERENCES "ProductionMachine"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
