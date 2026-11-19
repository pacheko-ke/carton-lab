import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    emailVerified?: Date | null;
    takeOverExistingSession?: boolean;
  }

  interface Session {
    user: {
      id: string;
      isEmailVerified: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isEmailVerified?: boolean;
    activeSessionId?: string;
  }
}
