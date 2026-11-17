import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { PREMIUM_TRIAL_DAYS } from "@/lib/billing";
import { getAdminEmailRecipients, sendEmailAlert } from "@/lib/resend-email";
import { sendWelcomeEmail } from "@/lib/welcome-email";
import { getTrialEmailJobs } from "@/lib/email-jobs";
import authConfig from "@/auth.config";
import { hasVerifiedProviderEmail } from "@/auth-config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
      await sendEmailAlert({
        recipients: getAdminEmailRecipients(),
        subject: "New CartonLab account",
        heading: "A new account is ready",
        message: "A new CartonLab account has been created and its 7-day Premium trial has started.",
        details: [
          { label: "Name", value: user.name ?? "Not provided" },
          { label: "Email", value: user.email ?? "Not provided" },
          { label: "Trial ends", value: trialEndsAt.toLocaleDateString("en-KE") },
        ],
      });
      if (!user.email) {
        console.error("Could not send welcome email: new user has no email address.");
        return;
      }
      try {
        await sendWelcomeEmail({ email: user.email, name: user.name ?? null });
      } catch (error) {
        console.error("Could not send welcome email:", error);
      }
    },
    async signIn({ user, account, profile }) {
      if (
        hasVerifiedProviderEmail(account?.provider, profile?.email_verified) &&
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
