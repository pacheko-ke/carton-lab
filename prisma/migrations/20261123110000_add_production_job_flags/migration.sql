CREATE TABLE "ProductionJobFlag" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    CONSTRAINT "ProductionJobFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionJobFlag_jobId_key" ON "ProductionJobFlag"("jobId");

ALTER TABLE "ProductionJobFlag"
ADD CONSTRAINT "ProductionJobFlag_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionJobFlag"
ADD CONSTRAINT "ProductionJobFlag_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionJobFlag"
ADD CONSTRAINT "ProductionJobFlag_resolvedByUserId_fkey"
FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
