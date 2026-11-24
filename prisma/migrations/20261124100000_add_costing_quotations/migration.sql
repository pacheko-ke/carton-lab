ALTER TABLE "ProductionJob"
ADD COLUMN "quoteId" TEXT;

CREATE TABLE "ProductionQuote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quoteNo" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "inquiryReference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "totalCost" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "convertedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionQuote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionQuote_version_check" CHECK ("version" > 0),
    CONSTRAINT "ProductionQuote_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'SUPERSEDED')),
    CONSTRAINT "ProductionQuote_currency_check" CHECK ("currency" IN ('KES', 'USD', 'EUR')),
    CONSTRAINT "ProductionQuote_totals_check" CHECK ("totalCost" >= 0 AND "totalPrice" >= 0)
);

CREATE TABLE "ProductionQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "boxType" TEXT NOT NULL,
    "topLiner" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "bottomLiner" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "width" TEXT NOT NULL,
    "height" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "boardAreaM2" DECIMAL(10,4) NOT NULL,
    "boardGsm" DECIMAL(10,3) NOT NULL,
    "paperCostPerKg" DECIMAL(14,4) NOT NULL,
    "trimWastePercent" DECIMAL(7,3) NOT NULL,
    "conversionCost" DECIMAL(14,4) NOT NULL,
    "consumablesCost" DECIMAL(14,4) NOT NULL,
    "marginPercent" DECIMAL(7,3) NOT NULL,
    "materialCostPerUnit" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "lineCostTotal" DECIMAL(14,2) NOT NULL,
    "linePriceTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ProductionQuoteLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionQuoteLine_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "ProductionQuoteLine_cost_inputs_check" CHECK (
        "boardAreaM2" > 0 AND
        "boardGsm" > 0 AND
        "paperCostPerKg" > 0 AND
        "trimWastePercent" BETWEEN 0 AND 200 AND
        "conversionCost" >= 0 AND
        "consumablesCost" >= 0 AND
        "marginPercent" BETWEEN 0 AND 80
    ),
    CONSTRAINT "ProductionQuoteLine_totals_check" CHECK (
        "materialCostPerUnit" >= 0 AND
        "unitCost" >= 0 AND
        "unitPrice" >= "unitCost" AND
        "lineCostTotal" >= 0 AND
        "linePriceTotal" >= "lineCostTotal"
    )
);

CREATE UNIQUE INDEX "ProductionQuote_organizationId_quoteNo_version_key"
ON "ProductionQuote"("organizationId", "quoteNo", "version");

CREATE INDEX "ProductionQuote_organizationId_status_createdAt_idx"
ON "ProductionQuote"("organizationId", "status", "createdAt");

CREATE INDEX "ProductionQuote_customerId_createdAt_idx"
ON "ProductionQuote"("customerId", "createdAt");

CREATE INDEX "ProductionQuoteLine_quoteId_idx"
ON "ProductionQuoteLine"("quoteId");

CREATE INDEX "ProductionQuoteLine_itemId_idx"
ON "ProductionQuoteLine"("itemId");

CREATE INDEX "ProductionJob_quoteId_idx"
ON "ProductionJob"("quoteId");

ALTER TABLE "ProductionQuote"
ADD CONSTRAINT "ProductionQuote_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionQuote"
ADD CONSTRAINT "ProductionQuote_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "ProductionCustomer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionQuote"
ADD CONSTRAINT "ProductionQuote_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionQuote"
ADD CONSTRAINT "ProductionQuote_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionQuote"
ADD CONSTRAINT "ProductionQuote_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionQuote"
ADD CONSTRAINT "ProductionQuote_convertedByUserId_fkey"
FOREIGN KEY ("convertedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionQuoteLine"
ADD CONSTRAINT "ProductionQuoteLine_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "ProductionQuote"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionQuoteLine"
ADD CONSTRAINT "ProductionQuoteLine_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "ProductionItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionJob"
ADD CONSTRAINT "ProductionJob_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "ProductionQuote"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
