import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { PREMIUM_TRIAL_DAYS } from "@/lib/billing";
import { sendWelcomeEmail } from "@/lib/welcome-email";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  events: {
    async createUser({ user }) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          trialEndsAt: new Date(
            Date.now() + PREMIUM_TRIAL_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
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
