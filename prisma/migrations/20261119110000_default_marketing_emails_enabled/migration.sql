ALTER TABLE "User"
ALTER COLUMN "marketingEmailsEnabled" SET DEFAULT true;

UPDATE "User"
SET "marketingEmailsEnabled" = true
WHERE "marketingEmailsEnabled" = false
  AND "marketingEmailsUpdatedAt" IS NULL;
