CREATE TABLE "ProductionNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionNotification_userId_jobId_key"
ON "ProductionNotification"("userId", "jobId");

CREATE INDEX "ProductionNotification_userId_readAt_createdAt_idx"
ON "ProductionNotification"("userId", "readAt", "createdAt");

CREATE INDEX "ProductionNotification_organizationId_createdAt_idx"
ON "ProductionNotification"("organizationId", "createdAt");

CREATE UNIQUE INDEX "ProductionPushSubscription_endpoint_key"
ON "ProductionPushSubscription"("endpoint");

CREATE INDEX "ProductionPushSubscription_userId_idx"
ON "ProductionPushSubscription"("userId");

ALTER TABLE "ProductionNotification"
ADD CONSTRAINT "ProductionNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionPushSubscription"
ADD CONSTRAINT "ProductionPushSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
