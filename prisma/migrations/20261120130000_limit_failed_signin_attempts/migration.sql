ALTER TABLE "EmailOtpChallenge"
ADD COLUMN "failedSignInAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failedSignInWindowStartedAt" TIMESTAMP(3);
