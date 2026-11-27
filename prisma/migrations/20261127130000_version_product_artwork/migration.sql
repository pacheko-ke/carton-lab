ALTER TABLE "ProductionAttachment"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "ProductionAttachment_itemId_key";

CREATE UNIQUE INDEX "ProductionAttachment_itemId_version_key"
ON "ProductionAttachment"("itemId", "version");

CREATE INDEX "ProductionAttachment_itemId_createdAt_idx"
ON "ProductionAttachment"("itemId", "createdAt");
