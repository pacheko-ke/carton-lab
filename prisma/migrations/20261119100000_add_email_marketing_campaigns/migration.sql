ALTER TABLE "User"
ADD COLUMN "marketingEmailsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketingEmailsUpdatedAt" TIMESTAMP(3);

CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailJob_userId_dedupeKey_key"
ON "EmailJob"("userId", "dedupeKey");

CREATE INDEX "EmailJob_status_scheduledAt_idx"
ON "EmailJob"("status", "scheduledAt");

CREATE INDEX "EmailJob_campaignId_idx"
ON "EmailJob"("campaignId");

ALTER TABLE "EmailJob"
ADD CONSTRAINT "EmailJob_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailJob"
ADD CONSTRAINT "EmailJob_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
