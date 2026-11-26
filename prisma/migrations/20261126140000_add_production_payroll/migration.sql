ALTER TABLE "ProductionEmployee"
ADD COLUMN "monthlyBasicSalary" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "monthlyTaxableAllowances" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "payrollConfiguredAt" TIMESTAMP(3);

CREATE TABLE "ProductionPayrollRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'global-production',
    "period" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "finalizedByUserId" TEXT,
    "rulesVersion" TEXT NOT NULL,
    "statutoryRules" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionPayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionPayrollLine" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeNo" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "basicSalary" INTEGER NOT NULL,
    "taxableAllowances" INTEGER NOT NULL,
    "grossPay" INTEGER NOT NULL,
    "nssfEmployee" INTEGER NOT NULL,
    "nssfEmployer" INTEGER NOT NULL,
    "shif" INTEGER NOT NULL,
    "housingLevyEmployee" INTEGER NOT NULL,
    "housingLevyEmployer" INTEGER NOT NULL,
    "taxablePay" INTEGER NOT NULL,
    "paye" INTEGER NOT NULL,
    "netPay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionPayrollLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionPayrollRun_workspaceId_period_key"
ON "ProductionPayrollRun"("workspaceId", "period");

CREATE INDEX "ProductionPayrollRun_workspaceId_createdAt_idx"
ON "ProductionPayrollRun"("workspaceId", "createdAt");

CREATE UNIQUE INDEX "ProductionPayrollLine_payrollRunId_employeeId_key"
ON "ProductionPayrollLine"("payrollRunId", "employeeId");

CREATE INDEX "ProductionPayrollLine_employeeId_idx"
ON "ProductionPayrollLine"("employeeId");

ALTER TABLE "ProductionPayrollRun"
ADD CONSTRAINT "ProductionPayrollRun_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionPayrollRun"
ADD CONSTRAINT "ProductionPayrollRun_finalizedByUserId_fkey"
FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionPayrollLine"
ADD CONSTRAINT "ProductionPayrollLine_payrollRunId_fkey"
FOREIGN KEY ("payrollRunId") REFERENCES "ProductionPayrollRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionPayrollLine"
ADD CONSTRAINT "ProductionPayrollLine_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "ProductionEmployee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
