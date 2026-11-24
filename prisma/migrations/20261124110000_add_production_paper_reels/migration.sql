CREATE TABLE "ProductionPaperReel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchaseOrderLineId" TEXT,
    "parentReelId" TEXT,
    "createdByUserId" TEXT,
    "reelNo" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL DEFAULT '',
    "widthMm" DECIMAL(10,2) NOT NULL,
    "gsm" DECIMAL(10,3) NOT NULL,
    "receivedWeightKg" DECIMAL(14,3) NOT NULL,
    "availableWeightKg" DECIMAL(14,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "storageLocation" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPaperReel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionPaperReel_width_gsm_check" CHECK ("widthMm" > 0 AND "gsm" > 0),
    CONSTRAINT "ProductionPaperReel_weight_check" CHECK (
        "receivedWeightKg" > 0 AND
        "availableWeightKg" >= 0 AND
        "availableWeightKg" <= "receivedWeightKg"
    ),
    CONSTRAINT "ProductionPaperReel_status_check" CHECK ("status" IN ('AVAILABLE', 'CONSUMED', 'QUARANTINED'))
);

CREATE TABLE "ProductionReelMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "relatedReelId" TEXT,
    "jobId" TEXT,
    "createdByUserId" TEXT,
    "type" TEXT NOT NULL,
    "deltaKg" DECIMAL(14,3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionReelMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionReelMovement_type_check" CHECK (
        ("type" IN ('REGISTER', 'REMNANT_IN') AND "deltaKg" > 0) OR
        ("type" IN ('REMNANT_OUT', 'ISSUE') AND "deltaKg" < 0) OR
        ("type" = 'RETURN' AND "deltaKg" > 0) OR
        ("type" = 'ADJUSTMENT' AND "deltaKg" <> 0)
    )
);

CREATE UNIQUE INDEX "ProductionPaperReel_barcode_key"
ON "ProductionPaperReel"("barcode");

CREATE UNIQUE INDEX "ProductionPaperReel_organizationId_reelNo_key"
ON "ProductionPaperReel"("organizationId", "reelNo");

CREATE INDEX "ProductionPaperReel_organizationId_status_createdAt_idx"
ON "ProductionPaperReel"("organizationId", "status", "createdAt");

CREATE INDEX "ProductionPaperReel_materialId_batchNo_idx"
ON "ProductionPaperReel"("materialId", "batchNo");

CREATE INDEX "ProductionPaperReel_supplierId_receivedAt_idx"
ON "ProductionPaperReel"("supplierId", "receivedAt");

CREATE INDEX "ProductionPaperReel_purchaseOrderLineId_idx"
ON "ProductionPaperReel"("purchaseOrderLineId");

CREATE INDEX "ProductionPaperReel_parentReelId_idx"
ON "ProductionPaperReel"("parentReelId");

CREATE INDEX "ProductionReelMovement_reelId_createdAt_idx"
ON "ProductionReelMovement"("reelId", "createdAt");

CREATE INDEX "ProductionReelMovement_organizationId_jobId_createdAt_idx"
ON "ProductionReelMovement"("organizationId", "jobId", "createdAt");

CREATE INDEX "ProductionReelMovement_relatedReelId_idx"
ON "ProductionReelMovement"("relatedReelId");

ALTER TABLE "ProductionPaperReel"
ADD CONSTRAINT "ProductionPaperReel_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionPaperReel"
ADD CONSTRAINT "ProductionPaperReel_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "ProductionMaterial"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionPaperReel"
ADD CONSTRAINT "ProductionPaperReel_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "ProductionSupplier"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionPaperReel"
ADD CONSTRAINT "ProductionPaperReel_purchaseOrderLineId_fkey"
FOREIGN KEY ("purchaseOrderLineId") REFERENCES "ProductionPurchaseOrderLine"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionPaperReel"
ADD CONSTRAINT "ProductionPaperReel_parentReelId_fkey"
FOREIGN KEY ("parentReelId") REFERENCES "ProductionPaperReel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionPaperReel"
ADD CONSTRAINT "ProductionPaperReel_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionReelMovement"
ADD CONSTRAINT "ProductionReelMovement_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionReelMovement"
ADD CONSTRAINT "ProductionReelMovement_reelId_fkey"
FOREIGN KEY ("reelId") REFERENCES "ProductionPaperReel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionReelMovement"
ADD CONSTRAINT "ProductionReelMovement_relatedReelId_fkey"
FOREIGN KEY ("relatedReelId") REFERENCES "ProductionPaperReel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionReelMovement"
ADD CONSTRAINT "ProductionReelMovement_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionReelMovement"
ADD CONSTRAINT "ProductionReelMovement_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
