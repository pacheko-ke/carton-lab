CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "reference" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPayment_providerTransactionId_key" ON "BillingPayment"("providerTransactionId");
CREATE INDEX "BillingPayment_userId_createdAt_idx" ON "BillingPayment"("userId", "createdAt");
CREATE INDEX "BillingPayment_status_paidAt_idx" ON "BillingPayment"("status", "paidAt");

ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
