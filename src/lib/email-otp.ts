import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PREMIUM_TRIAL_DAYS } from "@/lib/billing";
import { getTrialEmailJobs } from "@/lib/email-jobs";
import { notifyNewAccount } from "@/lib/new-account-notifications";
import { prisma } from "@/lib/prisma";
import { sendResendEmail } from "@/lib/resend-email";

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_IP_REQUESTS_PER_WINDOW = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_FAILED_SIGN_IN_ATTEMPTS = 5;
const FAILED_SIGN_IN_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

type OtpChallengeRow = {
  email: string;
  codeHash: string;
  expiresAt: Date;
  sentAt: Date;
  attempts: number;
  failedSignInAttempts: number;
  failedSignInWindowStartedAt: Date | null;
  requestWindowStartedAt: Date;
  requestsInWindow: number;
  consumedAt: Date | null;
};

function hashCode(email: string, code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured for email OTP.");
  return createHmac("sha256", secret)
    .update(`${email}:${code}`)
    .digest("hex");
}

function hashRateLimitKey(ipAddress: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured for email OTP.");
  return createHmac("sha256", secret)
    .update(`ip:${ipAddress}`)
    .digest("hex");
}

function isValidCodeHash(storedHash: string, candidateHash: string) {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  return stored.length === 32 && timingSafeEqual(stored, candidate);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

export async function sendEmailOtpCode(email: string, ipAddress: string | null) {
  const now = new Date();
  const code = randomInt(100_000, 1_000_000).toString();
  const expiresAt = new Date(now.getTime() + CODE_LIFETIME_MS);
  const codeHash = hashCode(email, code);
  const ipRateLimitKey = ipAddress ? hashRateLimitKey(ipAddress) : null;

  const reservation = await prisma.$transaction(async (transaction) => {
    await transaction.emailOtpChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - RATE_LIMIT_RETENTION_MS) } },
    });
    await transaction.$executeRaw`
      DELETE FROM "EmailOtpRateLimit"
      WHERE "windowStartedAt" < ${new Date(
        now.getTime() - RATE_LIMIT_RETENTION_MS,
      )}
    `;

    if (ipRateLimitKey) {
      await transaction.$queryRaw<{ key: string }[]>`
        INSERT INTO "EmailOtpRateLimit" ("key", "windowStartedAt", "requests")
        VALUES (${ipRateLimitKey}, ${now}, 1)
        ON CONFLICT ("key") DO NOTHING
        RETURNING "key"
      `;
      const rateLimits = await transaction.$queryRaw<
        { key: string; windowStartedAt: Date; requests: number }[]
      >`
        SELECT "key", "windowStartedAt", "requests"
        FROM "EmailOtpRateLimit"
        WHERE "key" = ${ipRateLimitKey}
        FOR UPDATE
      `;
      const ipLimit = rateLimits[0];
      if (!ipLimit) throw new Error("Email OTP rate limit could not be reserved.");

      const sameIpWindow =
        now.getTime() - ipLimit.windowStartedAt.getTime() < REQUEST_WINDOW_MS;
      if (sameIpWindow && ipLimit.requests >= MAX_IP_REQUESTS_PER_WINDOW) {
        return "ip-rate-limited" as const;
      }

      const updated = await transaction.$executeRaw`
        UPDATE "EmailOtpRateLimit"
        SET
          "windowStartedAt" = ${sameIpWindow ? ipLimit.windowStartedAt : now},
          "requests" = ${sameIpWindow ? ipLimit.requests + 1 : 1}
        WHERE "key" = ${ipRateLimitKey}
      `;
      if (updated !== 1) {
        throw new Error("Email OTP rate limit could not be updated.");
      }
    }

    const inserted = await transaction.$queryRaw<{ email: string }[]>`
      INSERT INTO "EmailOtpChallenge" (
        "email",
        "codeHash",
        "expiresAt",
        "sentAt",
        "attempts",
        "failedSignInAttempts",
        "failedSignInWindowStartedAt",
        "requestWindowStartedAt",
        "requestsInWindow",
        "consumedAt"
      )
      VALUES (
        ${email},
        ${codeHash},
        ${expiresAt},
        ${now},
        0,
        ${now},
        1,
        NULL
      )
      ON CONFLICT ("email") DO NOTHING
      RETURNING "email"
    `;

    if (inserted.length) return "reserved" as const;

    const challenges = await transaction.$queryRaw<OtpChallengeRow[]>`
      SELECT
        "email",
        "codeHash",
        "expiresAt",
        "sentAt",
        "attempts",
        "failedSignInAttempts",
        "failedSignInWindowStartedAt",
        "requestWindowStartedAt",
        "requestsInWindow",
        "consumedAt"
      FROM "EmailOtpChallenge"
      WHERE "email" = ${email}
      FOR UPDATE
    `;
    const current = challenges[0];
    if (!current) {
      throw new Error("Email OTP request could not be reserved.");
    }

    if (now.getTime() - current.sentAt.getTime() < RESEND_COOLDOWN_MS) {
      return "cooldown" as const;
    }

    const sameWindow =
      now.getTime() - current.requestWindowStartedAt.getTime() <
      REQUEST_WINDOW_MS;
    if (sameWindow && current.requestsInWindow >= MAX_REQUESTS_PER_WINDOW) {
      return "rate-limited" as const;
    }

    await transaction.emailOtpChallenge.update({
      where: { email },
      data: {
        codeHash,
        expiresAt,
        sentAt: now,
        attempts: 0,
        requestWindowStartedAt: sameWindow
          ? current.requestWindowStartedAt
          : now,
        requestsInWindow: sameWindow ? current.requestsInWindow + 1 : 1,
        consumedAt: null,
      },
    });
    return "reserved" as const;
  });

  if (reservation !== "reserved") {
    return { status: reservation } as const;
  }

  try {
    await sendResendEmail({
      to: email,
      subject: "Your PackStudio verification code",
      heading: "Verify your email",
      message:
        "Enter this one-time code to sign up or sign in to PackStudio. It expires in 10 minutes. If you did not request a code, you can ignore this email.",
      details: [
        { label: "Verification code", value: code },
        { label: "Expires in", value: "10 minutes" },
      ],
    });
  } catch (error) {
    console.error("Could not deliver PackStudio email verification code:", error);
    return { status: "delivery-error" } as const;
  }

  return { status: "sent" } as const;
}

export async function consumeEmailOtpCode(email: string, code: string) {
  const candidateHash = hashCode(email, code);
  return prisma.$transaction(async (transaction) => {
    const challenges = await transaction.$queryRaw<OtpChallengeRow[]>`
      SELECT
        "email",
        "codeHash",
        "expiresAt",
        "sentAt",
        "attempts",
        "failedSignInAttempts",
        "failedSignInWindowStartedAt",
        "requestWindowStartedAt",
        "requestsInWindow",
        "consumedAt"
      FROM "EmailOtpChallenge"
      WHERE "email" = ${email}
      FOR UPDATE
    `;
    const challenge = challenges[0];
    const now = new Date();
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= MAX_CODE_ATTEMPTS
    ) {
      return false;
    }

    const sameFailureWindow =
      challenge.failedSignInWindowStartedAt !== null &&
      now.getTime() - challenge.failedSignInWindowStartedAt.getTime() <
        FAILED_SIGN_IN_WINDOW_MS;
    const failedAttempts = sameFailureWindow
      ? challenge.failedSignInAttempts
      : 0;
    if (failedAttempts >= MAX_FAILED_SIGN_IN_ATTEMPTS) return false;

    if (!isValidCodeHash(challenge.codeHash, candidateHash)) {
      await transaction.emailOtpChallenge.update({
        where: { email },
        data: {
          attempts: { increment: 1 },
          failedSignInAttempts: failedAttempts + 1,
          failedSignInWindowStartedAt: sameFailureWindow
            ? challenge.failedSignInWindowStartedAt
            : now,
        },
      });
      return false;
    }

    await transaction.emailOtpChallenge.update({
      where: { email },
      data: {
        consumedAt: now,
        failedSignInAttempts: 0,
        failedSignInWindowStartedAt: null,
      },
    });
    return true;
  });
}

export async function isEmailSignInRateLimited(email: string) {
  const challenge = await prisma.emailOtpChallenge.findUnique({
    where: { email },
    select: {
      failedSignInAttempts: true,
      failedSignInWindowStartedAt: true,
    },
  });
  return Boolean(
    challenge &&
      challenge.failedSignInAttempts >= MAX_FAILED_SIGN_IN_ATTEMPTS &&
      challenge.failedSignInWindowStartedAt &&
      Date.now() - challenge.failedSignInWindowStartedAt.getTime() <
        FAILED_SIGN_IN_WINDOW_MS,
  );
}

async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
}

export async function getOrCreateVerifiedEmailUser(email: string) {
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.emailVerified) return existing;
    return prisma.user.update({
      where: { id: existing.id },
      data: { emailVerified: new Date() },
    });
  }

  const createdAt = new Date();
  const trialEndsAt = new Date(
    createdAt.getTime() + PREMIUM_TRIAL_DAYS * 24 * 60 * 60 * 1000,
  );
  let user;
  try {
    user = await prisma.$transaction(async (transaction) => {
      const newUser = await transaction.user.create({
        data: {
          email,
          emailVerified: createdAt,
          trialEndsAt,
          marketingEmailsEnabled: true,
        },
      });
      await transaction.emailJob.createMany({
        data: getTrialEmailJobs(newUser.id, trialEndsAt),
        skipDuplicates: true,
      });
      return newUser;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const racedUser = await findUserByEmail(email);
      if (racedUser) {
        return racedUser.emailVerified
          ? racedUser
          : prisma.user.update({
              where: { id: racedUser.id },
              data: { emailVerified: new Date() },
            });
      }
    }
    throw error;
  }

  await notifyNewAccount({
    email: user.email,
    name: user.name,
    trialEndsAt,
  });
  return user;
}
