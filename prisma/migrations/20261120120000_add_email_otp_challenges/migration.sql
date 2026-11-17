CREATE TABLE "EmailOtpChallenge" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestWindowStartedAt" TIMESTAMP(3) NOT NULL,
    "requestsInWindow" INTEGER NOT NULL DEFAULT 1,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "EmailOtpChallenge_expiresAt_idx" ON "EmailOtpChallenge"("expiresAt");

CREATE TABLE "EmailOtpRateLimit" (
    "key" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EmailOtpRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "EmailOtpRateLimit_windowStartedAt_idx" ON "EmailOtpRateLimit"("windowStartedAt");
