ALTER TABLE "ProductionItem"
ADD COLUMN "customerId" TEXT;

CREATE INDEX "ProductionItem_customerId_idx"
ON "ProductionItem"("customerId");

ALTER TABLE "ProductionItem"
ADD CONSTRAINT "ProductionItem_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "ProductionCustomer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
