CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "logoUrl" TEXT,
    "premiumAccessGranted" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyInvitation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyInvitation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "KeylineBookmark" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "companyId" TEXT;
ALTER TABLE "BillingCheckout" ADD COLUMN "companyId" TEXT;
ALTER TABLE "BillingPayment" ADD COLUMN "companyId" TEXT;

CREATE INDEX "Company_name_idx" ON "Company"("name");
CREATE UNIQUE INDEX "CompanyMembership_userId_key" ON "CompanyMembership"("userId");
CREATE INDEX "CompanyMembership_companyId_role_idx" ON "CompanyMembership"("companyId", "role");
CREATE UNIQUE INDEX "CompanyInvitation_tokenHash_key" ON "CompanyInvitation"("tokenHash");
CREATE INDEX "CompanyInvitation_companyId_email_createdAt_idx" ON "CompanyInvitation"("companyId", "email", "createdAt");
CREATE INDEX "CompanyInvitation_expiresAt_acceptedAt_idx" ON "CompanyInvitation"("expiresAt", "acceptedAt");
CREATE INDEX "KeylineBookmark_companyId_createdAt_idx" ON "KeylineBookmark"("companyId", "createdAt");
CREATE INDEX "Subscription_companyId_status_currentPeriodEnd_idx" ON "Subscription"("companyId", "status", "currentPeriodEnd");
CREATE INDEX "BillingCheckout_companyId_createdAt_idx" ON "BillingCheckout"("companyId", "createdAt");
CREATE INDEX "BillingPayment_companyId_createdAt_idx" ON "BillingPayment"("companyId", "createdAt");

ALTER TABLE "CompanyMembership"
ADD CONSTRAINT "CompanyMembership_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyMembership"
ADD CONSTRAINT "CompanyMembership_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyInvitation"
ADD CONSTRAINT "CompanyInvitation_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyInvitation"
ADD CONSTRAINT "CompanyInvitation_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Company" (
    "id", "name", "country", "contactEmail", "contactPhone", "address",
    "timezone", "currency", "createdAt", "updatedAt"
)
VALUES (
    'global-production',
    COALESCE(
        (
            SELECT NULLIF(BTRIM(u."companyName"), '')
            FROM "User" AS u
            WHERE NULLIF(BTRIM(u."companyName"), '') IS NOT NULL
              AND EXISTS (
                  SELECT 1
                  FROM "UserAccessRole" AS assignment
                  JOIN "AccessRole" AS role ON role."id" = assignment."roleId"
                  WHERE assignment."userId" = u."id"
                    AND (
                        role."isSuperAdmin" OR
                        role."permissions" && ARRAY[
                            'production.view',
                            'production.manage',
                            'production.design',
                            'production.orders.book',
                            'production.catalog.manage',
                            'production.payroll.manage'
                        ]::TEXT[]
                    )
              )
            ORDER BY u."id"
            LIMIT 1
        ),
        'Production workspace'
    ),
    '',
    COALESCE(
        (
            SELECT "email"
            FROM "User"
            WHERE "email" IS NOT NULL
            ORDER BY "id"
            LIMIT 1
        ),
        ''
    ),
    '',
    '',
    'Africa/Nairobi',
    'KES',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

WITH eligible AS (
    SELECT
        u."id" AS "userId",
        BOOL_OR('production.manage' = ANY(r."permissions")) AS "canManage",
        BOOL_OR(r."isSuperAdmin") AS "isSuperAdmin",
        ROW_NUMBER() OVER (ORDER BY u."id") AS "rowNumber"
    FROM "User" AS u
    JOIN "UserAccessRole" AS assignment ON assignment."userId" = u."id"
    JOIN "AccessRole" AS r ON r."id" = assignment."roleId"
    WHERE r."isSuperAdmin" OR r."permissions" && ARRAY[
            'production.view',
            'production.manage',
            'production.design',
            'production.orders.book',
            'production.catalog.manage',
            'production.payroll.manage'
        ]::TEXT[]
    GROUP BY u."id"
)
INSERT INTO "CompanyMembership" (
    "id", "companyId", "userId", "role", "createdAt", "updatedAt"
)
SELECT
    'legacy-membership-' || "userId",
    'global-production',
    "userId",
    CASE
        WHEN "rowNumber" = 1 THEN 'OWNER'
        WHEN "canManage" OR "isSuperAdmin" THEN 'ADMIN'
        ELSE 'MEMBER'
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM eligible;

UPDATE "Company" AS company
SET
    "premiumAccessGranted" = COALESCE((
        SELECT BOOL_OR(u."premiumAccessGranted")
        FROM "CompanyMembership" AS membership
        JOIN "User" AS u ON u."id" = membership."userId"
        WHERE membership."companyId" = company."id"
    ), false),
    "trialEndsAt" = (
        SELECT MAX(u."trialEndsAt")
        FROM "CompanyMembership" AS membership
        JOIN "User" AS u ON u."id" = membership."userId"
        WHERE membership."companyId" = company."id"
    );

UPDATE "KeylineBookmark" AS bookmark
SET "companyId" = membership."companyId"
FROM "CompanyMembership" AS membership
WHERE bookmark."userId" = membership."userId";

UPDATE "Subscription" AS subscription
SET "companyId" = membership."companyId"
FROM "CompanyMembership" AS membership
WHERE subscription."userId" = membership."userId";

UPDATE "BillingCheckout" AS checkout
SET "companyId" = membership."companyId"
FROM "CompanyMembership" AS membership
WHERE checkout."userId" = membership."userId";

UPDATE "BillingPayment" AS payment
SET "companyId" = membership."companyId"
FROM "CompanyMembership" AS membership
WHERE payment."userId" = membership."userId";

ALTER TABLE "KeylineBookmark"
ADD CONSTRAINT "KeylineBookmark_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingCheckout"
ADD CONSTRAINT "BillingCheckout_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
ADD CONSTRAINT "BillingPayment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
