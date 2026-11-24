CREATE TABLE "ProductionWarehousePallet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "palletNo" TEXT NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "quantityAvailable" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionWarehousePallet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionWarehousePallet_quantity_check" CHECK (
        "quantityReceived" > 0 AND
        "quantityAvailable" >= 0 AND
        "quantityAvailable" <= "quantityReceived"
    )
);

CREATE TABLE "ProductionDispatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "dispatchNo" TEXT NOT NULL,
    "deliveryNoteNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISPATCHED',
    "vehicleRegistration" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "receivedBy" TEXT NOT NULL DEFAULT '',
    "deliveryNotes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProductionDispatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionDispatch_status_check" CHECK ("status" IN ('DISPATCHED', 'DELIVERED')),
    CONSTRAINT "ProductionDispatch_delivery_check" CHECK (
        ("status" = 'DISPATCHED' AND "deliveredAt" IS NULL AND "receivedBy" = '') OR
        ("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND length(trim("receivedBy")) > 0)
    )
);

CREATE TABLE "ProductionDispatchLine" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "palletId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ProductionDispatchLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionDispatchLine_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "ProductionWarehousePallet_organizationId_palletNo_key"
ON "ProductionWarehousePallet"("organizationId", "palletNo");

CREATE INDEX "ProductionWarehousePallet_organizationId_location_receivedAt_idx"
ON "ProductionWarehousePallet"("organizationId", "location", "receivedAt");

CREATE INDEX "ProductionWarehousePallet_jobId_receivedAt_idx"
ON "ProductionWarehousePallet"("jobId", "receivedAt");

CREATE UNIQUE INDEX "ProductionDispatch_organizationId_dispatchNo_key"
ON "ProductionDispatch"("organizationId", "dispatchNo");

CREATE UNIQUE INDEX "ProductionDispatch_deliveryNoteNo_key"
ON "ProductionDispatch"("deliveryNoteNo");

CREATE INDEX "ProductionDispatch_organizationId_status_dispatchedAt_idx"
ON "ProductionDispatch"("organizationId", "status", "dispatchedAt");

CREATE INDEX "ProductionDispatch_jobId_dispatchedAt_idx"
ON "ProductionDispatch"("jobId", "dispatchedAt");

CREATE UNIQUE INDEX "ProductionDispatchLine_dispatchId_palletId_key"
ON "ProductionDispatchLine"("dispatchId", "palletId");

CREATE INDEX "ProductionDispatchLine_palletId_idx"
ON "ProductionDispatchLine"("palletId");

ALTER TABLE "ProductionWarehousePallet"
ADD CONSTRAINT "ProductionWarehousePallet_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionWarehousePallet"
ADD CONSTRAINT "ProductionWarehousePallet_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionWarehousePallet"
ADD CONSTRAINT "ProductionWarehousePallet_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionDispatch"
ADD CONSTRAINT "ProductionDispatch_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionDispatch"
ADD CONSTRAINT "ProductionDispatch_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionDispatch"
ADD CONSTRAINT "ProductionDispatch_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionDispatchLine"
ADD CONSTRAINT "ProductionDispatchLine_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "ProductionDispatch"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionDispatchLine"
ADD CONSTRAINT "ProductionDispatchLine_palletId_fkey"
FOREIGN KEY ("palletId") REFERENCES "ProductionWarehousePallet"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
