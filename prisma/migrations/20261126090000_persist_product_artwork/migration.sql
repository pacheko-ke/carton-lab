ALTER TABLE "ProductionAttachment"
ADD COLUMN "itemId" TEXT;

WITH ranked_artwork AS (
    SELECT
        attachment."id",
        item."id" AS "itemId",
        ROW_NUMBER() OVER (
            PARTITION BY item."id"
            ORDER BY attachment."createdAt" DESC, attachment."id" DESC
        ) AS artwork_rank
    FROM "ProductionAttachment" AS attachment
    JOIN "ProductionJob" AS job
      ON job."id" = attachment."jobId"
    JOIN "ProductionItem" AS item
      ON item."id" = job."data" ->> 'itemId'
     AND item."organizationId" = job."organizationId"
)
UPDATE "ProductionAttachment" AS attachment
SET "itemId" = ranked_artwork."itemId"
FROM ranked_artwork
WHERE attachment."id" = ranked_artwork."id"
  AND ranked_artwork.artwork_rank = 1;

CREATE UNIQUE INDEX "ProductionAttachment_itemId_key"
ON "ProductionAttachment"("itemId");

ALTER TABLE "ProductionAttachment"
ADD CONSTRAINT "ProductionAttachment_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "ProductionItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
