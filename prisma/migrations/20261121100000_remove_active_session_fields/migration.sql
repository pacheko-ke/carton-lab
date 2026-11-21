ALTER TABLE "User"
DROP COLUMN IF EXISTS "activeSessionId",
DROP COLUMN IF EXISTS "activeSessionExpiresAt";
