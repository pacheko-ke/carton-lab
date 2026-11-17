import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const authConfig = {
  pages: { signIn: "/login" },
  providers: [
    Google({
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          emailVerified: profile.email_verified ? new Date() : null,
        };
      },
    }),
  ],
  callbacks: {
    signIn({ account, profile }) {
      return (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        typeof profile.email === "string" &&
        profile.email.length > 0
      );
    },
    jwt({ token, user, account, profile }) {
      if (user) {
        token.isEmailVerified = Boolean(user.emailVerified);
      }
      if (account?.provider === "google" && profile?.email_verified === true) {
        token.isEmailVerified = true;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.isEmailVerified = token.isEmailVerified === true;
      }
      return session;
    },
    authorized({ auth, request }) {
      if (
        request.nextUrl.pathname.startsWith("/app") ||
        request.nextUrl.pathname.startsWith("/cartonlab")
      ) {
        return Boolean(auth?.user?.id);
      }
      return true;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
