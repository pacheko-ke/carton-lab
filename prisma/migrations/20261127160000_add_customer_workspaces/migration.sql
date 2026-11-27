ALTER TABLE "ProductionCustomer"
ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'global-production';

CREATE INDEX "ProductionCustomer_workspaceId_name_idx"
ON "ProductionCustomer"("workspaceId", "name");
