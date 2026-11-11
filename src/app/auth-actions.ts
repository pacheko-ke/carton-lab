"use server";

import { signIn, signOut } from "@/auth";
import { isGoogleAuthConfigured } from "@/auth-config";

export async function signInWithGoogle() {
  if (!isGoogleAuthConfigured()) {
    throw new Error("Google authentication has not been configured.");
  }
  await signIn("google", { redirectTo: "/app" });
}

export async function signOutOfCartonLab() {
  await signOut({ redirectTo: "/" });
}
