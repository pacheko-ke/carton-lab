CREATE TYPE "ProductionRole" AS ENUM ('PRODUCTION', 'DESIGNER');

CREATE TABLE "ProductionTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionMembership" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProductionRole" NOT NULL DEFAULT 'PRODUCTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionMembership_pkey" PRIMARY KEY ("teamId", "userId")
);

CREATE TABLE "ProductionJob" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionAttachment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "pathname" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionTeam_name_key" ON "ProductionTeam"("name");
CREATE INDEX "ProductionMembership_userId_idx" ON "ProductionMembership"("userId");
CREATE INDEX "ProductionJob_teamId_updatedAt_idx" ON "ProductionJob"("teamId", "updatedAt");
CREATE UNIQUE INDEX "ProductionAttachment_pathname_key" ON "ProductionAttachment"("pathname");
CREATE INDEX "ProductionAttachment_jobId_createdAt_idx" ON "ProductionAttachment"("jobId", "createdAt");

ALTER TABLE "ProductionMembership"
ADD CONSTRAINT "ProductionMembership_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "ProductionTeam"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionMembership"
ADD CONSTRAINT "ProductionMembership_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionJob"
ADD CONSTRAINT "ProductionJob_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "ProductionTeam"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionJob"
ADD CONSTRAINT "ProductionJob_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionAttachment"
ADD CONSTRAINT "ProductionAttachment_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionAttachment"
ADD CONSTRAINT "ProductionAttachment_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
