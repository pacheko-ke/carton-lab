import NextAuth from "next-auth";
import { randomUUID } from "node:crypto";
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
import { isEmailOtpConfigured } from "@/auth-config";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.isEmailVerified = Boolean(user.emailVerified);
        const activeSessionId = randomUUID();
        token.activeSessionId = activeSessionId;
        if (user.id) {
          await prisma.user.update({
            where: { id: user.id },
            data: { activeSessionId },
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
        select: { activeSessionId: true },
      });
      if (!userRecord) return null;

      if (!userRecord.activeSessionId) {
        const activeSessionId = token.activeSessionId ?? randomUUID();
        await prisma.user.update({
          where: { id: token.sub },
          data: { activeSessionId },
        });
        token.activeSessionId = activeSessionId;
        return token;
      }

      if (token.activeSessionId !== userRecord.activeSessionId) {
        return null;
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
        };
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
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
        data: { activeSessionId: null },
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
