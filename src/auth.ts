import NextAuth from "next-auth";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { PREMIUM_TRIAL_DAYS } from "@/lib/billing";
import { getTrialEmailJobs } from "@/lib/email-jobs";
import {
  consumeEmailOtpCode,
  getOrCreateVerifiedEmailUser,
  isValidEmail,
  normalizeEmail,
} from "@/lib/email-otp";
import { notifyNewAccount } from "@/lib/new-account-notifications";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  clearExpiredAuthSession,
  getAuthSessionExpiresAt,
} from "@/lib/auth-session";
import { isEmailOtpConfigured } from "@/auth-config";
import authConfig from "@/auth.config";

const SESSION_TAKEOVER_TTL_SECONDS = 300;

export function createSessionTakeoverToken(
  userId: string,
  activeSessionId: string,
) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for session takeover.");

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TAKEOVER_TTL_SECONDS;
  const payload = `${userId}.${activeSessionId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionTakeoverToken(token: string) {
  const parts = token.split(".");
  if (
    parts.length !== 4 ||
    !parts[0] ||
    !parts[1] ||
    !/^\d+$/.test(parts[2]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[3])
  ) {
    return null;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const payload = parts.slice(0, 3).join(".");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const provided = Buffer.from(parts[3], "base64url");
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided) ||
    Number(parts[2]) <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return { userId: parts[0], activeSessionId: parts[1] };
}

async function allowUserSignIn(
  userId: string,
  takeOverExistingSession: boolean,
) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeSessionId: true, activeSessionExpiresAt: true },
  });
  if (!existingUser) {
    return false;
  }
  if (!existingUser.activeSessionId) return true;

  if (
    await clearExpiredAuthSession(
      userId,
      existingUser.activeSessionId,
      existingUser.activeSessionExpiresAt,
    )
  ) {
    return true;
  }
  if (!takeOverExistingSession) return false;

  const result = await prisma.user.updateMany({
    where: { id: userId, activeSessionId: existingUser.activeSessionId },
    data: {
      activeSessionId: randomUUID(),
      activeSessionExpiresAt: getAuthSessionExpiresAt(),
    },
  });
  return result.count === 1;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        if (
          profile?.email_verified !== true ||
          typeof profile.email !== "string" ||
          !user.id
        ) {
          return false;
        }

        const existingUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { activeSessionId: true, activeSessionExpiresAt: true },
        });
        if (!existingUser) return false;
        if (existingUser.activeSessionId) {
          const expired = await clearExpiredAuthSession(
            user.id,
            existingUser.activeSessionId,
            existingUser.activeSessionExpiresAt,
          );
          if (!expired) {
            const currentUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { activeSessionId: true },
            });
            if (currentUser?.activeSessionId) {
              const takeoverToken = createSessionTakeoverToken(
                user.id,
                currentUser.activeSessionId,
              );
              return `/login?error=AccessDenied&takeover=${encodeURIComponent(takeoverToken)}`;
            }
          }
        }
        return true;
      }

      if (account?.provider !== "email-otp" || !user.id) return true;

      return allowUserSignIn(
        user.id,
        user.takeOverExistingSession === true,
      );
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.isEmailVerified = Boolean(user.emailVerified);
        const activeSessionId = randomUUID();
        token.activeSessionId = activeSessionId;
        if (user.id) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              activeSessionId,
              activeSessionExpiresAt: getAuthSessionExpiresAt(),
            },
          });
        }
      }

      if (
        account?.provider === "google" &&
        profile?.email_verified === true
      ) {
        token.isEmailVerified = true;
      }

      if (!token.sub) return token;

      const userRecord = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { activeSessionId: true, activeSessionExpiresAt: true },
      });
      if (!userRecord) return null;

      const now = new Date();
      if (
        !userRecord.activeSessionId ||
        token.activeSessionId !== userRecord.activeSessionId ||
        !userRecord.activeSessionExpiresAt ||
        userRecord.activeSessionExpiresAt <= now
      ) {
        return null;
      }

      if (
        userRecord.activeSessionExpiresAt.getTime() <=
        now.getTime() + AUTH_SESSION_MAX_AGE_SECONDS * 1000
      ) {
        const nextSessionExpiry = getAuthSessionExpiresAt(now);
        const result = await prisma.user.updateMany({
          where: {
            id: token.sub,
            activeSessionId: token.activeSessionId,
            activeSessionExpiresAt: {
              gt: now,
              lte: nextSessionExpiry,
            },
          },
          data: { activeSessionExpiresAt: nextSessionExpiry },
        });
        if (result.count !== 1) {
          const currentUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { activeSessionId: true, activeSessionExpiresAt: true },
          });
          if (
            currentUser?.activeSessionId !== token.activeSessionId ||
            !currentUser.activeSessionExpiresAt ||
            currentUser.activeSessionExpiresAt <= now
          ) {
            return null;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.isEmailVerified = token.isEmailVerified === true;
      }
      return session;
    },
  },
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "email-otp",
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Verification code", type: "text" },
        takeOverExistingSession: { label: "Sign in here", type: "text" },
      },
      async authorize(credentials) {
        if (!isEmailOtpConfigured()) return null;
        if (
          typeof credentials.email !== "string" ||
          typeof credentials.code !== "string"
        ) {
          return null;
        }

        const email = normalizeEmail(credentials.email);
        const code = credentials.code.trim();
        if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return null;
        if (!(await consumeEmailOtpCode(email, code))) return null;

        const user = await getOrCreateVerifiedEmailUser(email);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          emailVerified: user.emailVerified,
          takeOverExistingSession:
            credentials.takeOverExistingSession === "true",
        };
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
  events: {
    async signOut(event) {
      if (!("token" in event) || !event.token) return;
      const { token } = event;
      if (!token?.sub || typeof token.activeSessionId !== "string") return;
      await prisma.user.updateMany({
        where: {
          id: token.sub,
          activeSessionId: token.activeSessionId,
        },
        data: { activeSessionId: null, activeSessionExpiresAt: null },
      });
    },
    async createUser({ user }) {
      const userId = user.id;
      if (!userId) {
        throw new Error("Cannot start the Premium trial without a user ID.");
      }
      const trialEndsAt = new Date(
        Date.now() + PREMIUM_TRIAL_DAYS * 24 * 60 * 60 * 1000,
      );
      await prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: userId },
          data: {
            trialEndsAt,
            marketingEmailsEnabled: true,
          },
        });
        await transaction.emailJob.createMany({
          data: getTrialEmailJobs(userId, trialEndsAt),
          skipDuplicates: true,
        });
      });
      await notifyNewAccount({
        email: user.email ?? null,
        name: user.name ?? null,
        trialEndsAt,
      });
    },
    async signIn({ user, account, profile }) {
      if (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        user.id
      ) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    },
  },
});
