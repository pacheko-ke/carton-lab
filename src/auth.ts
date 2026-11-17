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
import { isEmailOtpConfigured } from "@/auth-config";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
