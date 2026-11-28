ALTER TABLE "Company"
  ADD COLUMN "employeeNumberNext" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "hrDepartments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "hrJobTitles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "hrWorkAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ProductionEmployee"
  ADD COLUMN "nationalId" TEXT,
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "address" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "nextOfKinName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "nextOfKinRelationship" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "nextOfKinPhone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "machineId" TEXT,
  ADD COLUMN "workArea" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "ProductionEmployee_workspaceId_nationalId_key"
  ON "ProductionEmployee"("workspaceId", "nationalId");
CREATE INDEX "ProductionEmployee_machineId_idx"
  ON "ProductionEmployee"("machineId");

ALTER TABLE "ProductionEmployee"
  ADD CONSTRAINT "ProductionEmployee_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "ProductionMachine"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
