ALTER TABLE "User"
ADD COLUMN "activeSessionExpiresAt" TIMESTAMP(3);

UPDATE "User"
SET "activeSessionExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '12 hours 5 minutes'
WHERE "activeSessionId" IS NOT NULL;
