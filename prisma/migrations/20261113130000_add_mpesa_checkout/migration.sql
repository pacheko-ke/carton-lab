ALTER TABLE "BillingCheckout"
ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'card',
ADD COLUMN "amount" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateDate" TIMESTAMP(3),
ADD COLUMN "phoneNumber" TEXT,
ADD COLUMN "providerCheckoutRequestId" TEXT,
ADD COLUMN "providerMerchantRequestId" TEXT;

CREATE UNIQUE INDEX "BillingCheckout_providerCheckoutRequestId_key"
ON "BillingCheckout"("providerCheckoutRequestId");
