CREATE TABLE "ProductionItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boxType" TEXT NOT NULL,
    "topLiner" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "bottomLiner" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "width" TEXT NOT NULL,
    "height" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'mm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionItem_organizationId_itemCode_key"
ON "ProductionItem"("organizationId", "itemCode");

CREATE INDEX "ProductionItem_organizationId_name_idx"
ON "ProductionItem"("organizationId", "name");

ALTER TABLE "ProductionItem"
ADD CONSTRAINT "ProductionItem_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionItem"
ADD CONSTRAINT "ProductionItem_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
