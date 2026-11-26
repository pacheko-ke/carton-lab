import NextAuth from "next-auth";
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
import { AUTH_SESSION_MAX_AGE_SECONDS } from "@/lib/auth-session";
import { assignDefaultAccessRole } from "@/lib/access-control";
import { isEmailOtpConfigured } from "@/auth-config";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        return (
          profile?.email_verified === true &&
          typeof profile.email === "string" &&
          Boolean(user.id)
        );
      }

      return account?.provider === "email-otp" && Boolean(user.id);
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.isEmailVerified = Boolean(user.emailVerified);
      }

      if (
        account?.provider === "google" &&
        profile?.email_verified === true
      ) {
        token.isEmailVerified = true;
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
  session: { strategy: "jwt", maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
  events: {
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
        await assignDefaultAccessRole(transaction, userId);
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
