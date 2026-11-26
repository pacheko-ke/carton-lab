CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessRole_key_key"
ON "AccessRole"("key");

CREATE INDEX "AccessRole_name_idx"
ON "AccessRole"("name");

CREATE TABLE "UserAccessRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccessRole_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE INDEX "UserAccessRole_roleId_idx"
ON "UserAccessRole"("roleId");

CREATE INDEX "UserAccessRole_assignedByUserId_idx"
ON "UserAccessRole"("assignedByUserId");

ALTER TABLE "UserAccessRole"
ADD CONSTRAINT "UserAccessRole_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAccessRole"
ADD CONSTRAINT "UserAccessRole_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAccessRole"
ADD CONSTRAINT "UserAccessRole_assignedByUserId_fkey"
FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AccessRole" (
    "id", "key", "name", "description", "permissions",
    "isSuperAdmin", "isSystem", "updatedAt"
) VALUES
    (
        'access-role-member', 'member', 'Member',
        'Standard PackStudio access.',
        ARRAY['keylines.use']::TEXT[], false, true, CURRENT_TIMESTAMP
    ),
    (
        'access-role-production', 'production', 'Production',
        'Manage production jobs and operations across all production organizations.',
        ARRAY['production.view', 'production.manage']::TEXT[], false, true, CURRENT_TIMESTAMP
    ),
    (
        'access-role-designer', 'designer', 'Designer',
        'Work with Origination, artwork, and job flags across all production organizations.',
        ARRAY['production.view', 'production.design']::TEXT[], false, true, CURRENT_TIMESTAMP
    ),
    (
        'access-role-order-booker', 'order-booker', 'Order Booker',
        'Manage the product catalog and book customer orders across all production organizations.',
        ARRAY['production.view', 'production.orders.book', 'production.catalog.manage']::TEXT[],
        false, true, CURRENT_TIMESTAMP
    ),
    (
        'access-role-super-admin', 'super-admin', 'Super Admin',
        'Unrestricted access across the entire application.',
        ARRAY['*']::TEXT[], true, true, CURRENT_TIMESTAMP
    );

INSERT INTO "UserAccessRole" ("userId", "roleId")
SELECT "id", 'access-role-member'
FROM "User"
ON CONFLICT ("userId", "roleId") DO NOTHING;

INSERT INTO "UserAccessRole" ("userId", "roleId")
SELECT membership."userId",
       CASE membership."role"::TEXT
         WHEN 'PRODUCTION' THEN 'access-role-production'
         WHEN 'DESIGNER' THEN 'access-role-designer'
         WHEN 'ORDER_BOOKER' THEN 'access-role-order-booker'
       END
FROM "ProductionOrganizationMembership" AS membership
ON CONFLICT ("userId", "roleId") DO NOTHING;

DROP TABLE "ProductionOrganizationMembership";
DROP TYPE "ProductionRole";
