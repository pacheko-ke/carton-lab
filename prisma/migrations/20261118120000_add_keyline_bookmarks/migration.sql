CREATE TABLE "KeylineBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keylineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeylineBookmark_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KeylineBookmark_userId_createdAt_idx"
ON "KeylineBookmark"("userId", "createdAt");

ALTER TABLE "KeylineBookmark"
ADD CONSTRAINT "KeylineBookmark_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
