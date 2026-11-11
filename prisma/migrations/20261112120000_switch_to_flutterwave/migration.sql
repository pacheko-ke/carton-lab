-- Replace Stripe-specific billing identifiers with provider-neutral fields.
ALTER TABLE "User"
DROP COLUMN "stripeCustomerId";

ALTER TABLE "Subscription"
RENAME COLUMN "stripeSubscriptionId" TO "providerSubscriptionId";

ALTER TABLE "Subscription"
RENAME COLUMN "stripePriceId" TO "providerPlanId";

ALTER TABLE "Subscription"
RENAME COLUMN "stripeEventCreatedAt" TO "providerEventCreatedAt";

ALTER INDEX "Subscription_stripeSubscriptionId_key"
RENAME TO "Subscription_providerSubscriptionId_key";

CREATE TABLE "BillingCheckout" (
    "txRef" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("txRef")
);

CREATE INDEX "BillingCheckout_userId_idx"
ON "BillingCheckout"("userId");

ALTER TABLE "BillingCheckout"
ADD CONSTRAINT "BillingCheckout_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
