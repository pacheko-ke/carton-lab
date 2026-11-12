ALTER TABLE "User"
ADD COLUMN "premiumAccessGranted" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "User"
SET "premiumAccessGranted" = TRUE
WHERE "email" IS NOT NULL
  AND BTRIM("email") <> '';
