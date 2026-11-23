CREATE TABLE "ProductionMaterial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "reorderPoint" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionMaterial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionSupplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSupplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionPurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "orderNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expectedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionPurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "orderedQty" DECIMAL(14,3) NOT NULL,
    "receivedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionStockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "jobId" TEXT,
    "purchaseOrderLineId" TEXT,
    "createdByUserId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionMaterial_organizationId_code_key"
ON "ProductionMaterial"("organizationId", "code");
CREATE INDEX "ProductionMaterial_organizationId_name_idx"
ON "ProductionMaterial"("organizationId", "name");

CREATE UNIQUE INDEX "ProductionSupplier_organizationId_code_key"
ON "ProductionSupplier"("organizationId", "code");
CREATE INDEX "ProductionSupplier_organizationId_name_idx"
ON "ProductionSupplier"("organizationId", "name");

CREATE UNIQUE INDEX "ProductionPurchaseOrder_organizationId_orderNo_key"
ON "ProductionPurchaseOrder"("organizationId", "orderNo");
CREATE INDEX "ProductionPurchaseOrder_organizationId_status_createdAt_idx"
ON "ProductionPurchaseOrder"("organizationId", "status", "createdAt");
CREATE INDEX "ProductionPurchaseOrder_supplierId_createdAt_idx"
ON "ProductionPurchaseOrder"("supplierId", "createdAt");

CREATE UNIQUE INDEX "ProductionPurchaseOrderLine_purchaseOrderId_materialId_key"
ON "ProductionPurchaseOrderLine"("purchaseOrderId", "materialId");
CREATE INDEX "ProductionPurchaseOrderLine_materialId_idx"
ON "ProductionPurchaseOrderLine"("materialId");

CREATE INDEX "ProductionStockMovement_organizationId_materialId_createdAt_idx"
ON "ProductionStockMovement"("organizationId", "materialId", "createdAt");
CREATE INDEX "ProductionStockMovement_organizationId_jobId_createdAt_idx"
ON "ProductionStockMovement"("organizationId", "jobId", "createdAt");
CREATE INDEX "ProductionStockMovement_purchaseOrderLineId_idx"
ON "ProductionStockMovement"("purchaseOrderLineId");

ALTER TABLE "ProductionMaterial"
ADD CONSTRAINT "ProductionMaterial_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionMaterial"
ADD CONSTRAINT "ProductionMaterial_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionSupplier"
ADD CONSTRAINT "ProductionSupplier_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSupplier"
ADD CONSTRAINT "ProductionSupplier_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionPurchaseOrder"
ADD CONSTRAINT "ProductionPurchaseOrder_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionPurchaseOrder"
ADD CONSTRAINT "ProductionPurchaseOrder_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "ProductionSupplier"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionPurchaseOrder"
ADD CONSTRAINT "ProductionPurchaseOrder_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionPurchaseOrderLine"
ADD CONSTRAINT "ProductionPurchaseOrderLine_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "ProductionPurchaseOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionPurchaseOrderLine"
ADD CONSTRAINT "ProductionPurchaseOrderLine_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "ProductionMaterial"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockMovement"
ADD CONSTRAINT "ProductionStockMovement_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionStockMovement"
ADD CONSTRAINT "ProductionStockMovement_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "ProductionMaterial"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionStockMovement"
ADD CONSTRAINT "ProductionStockMovement_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionStockMovement"
ADD CONSTRAINT "ProductionStockMovement_purchaseOrderLineId_fkey"
FOREIGN KEY ("purchaseOrderLineId") REFERENCES "ProductionPurchaseOrderLine"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionStockMovement"
ADD CONSTRAINT "ProductionStockMovement_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
