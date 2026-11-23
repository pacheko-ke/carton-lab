CREATE TABLE "ProductionCustomer" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionCustomer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionCustomer_name_idx" ON "ProductionCustomer"("name");

ALTER TABLE "ProductionCustomer"
ADD CONSTRAINT "ProductionCustomer_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
