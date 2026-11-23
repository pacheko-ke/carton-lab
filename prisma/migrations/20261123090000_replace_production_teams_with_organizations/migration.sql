ALTER TABLE "ProductionTeam" RENAME TO "ProductionOrganization";
ALTER TABLE "ProductionOrganization" RENAME CONSTRAINT "ProductionTeam_pkey" TO "ProductionOrganization_pkey";

DROP INDEX "ProductionTeam_name_key";
CREATE INDEX "ProductionOrganization_name_idx" ON "ProductionOrganization"("name");

ALTER TABLE "ProductionMembership" RENAME TO "ProductionOrganizationMembership";
ALTER TABLE "ProductionOrganizationMembership" RENAME COLUMN "teamId" TO "organizationId";
ALTER TABLE "ProductionOrganizationMembership" RENAME CONSTRAINT "ProductionMembership_pkey" TO "ProductionOrganizationMembership_pkey";
ALTER TABLE "ProductionOrganizationMembership" RENAME CONSTRAINT "ProductionMembership_teamId_fkey" TO "ProductionOrganizationMembership_organizationId_fkey";
ALTER TABLE "ProductionOrganizationMembership" RENAME CONSTRAINT "ProductionMembership_userId_fkey" TO "ProductionOrganizationMembership_userId_fkey";
ALTER INDEX "ProductionMembership_userId_idx" RENAME TO "ProductionOrganizationMembership_userId_idx";

ALTER TABLE "ProductionJob" RENAME COLUMN "teamId" TO "organizationId";
ALTER TABLE "ProductionJob" RENAME CONSTRAINT "ProductionJob_teamId_fkey" TO "ProductionJob_organizationId_fkey";
ALTER INDEX "ProductionJob_teamId_updatedAt_idx" RENAME TO "ProductionJob_organizationId_updatedAt_idx";
