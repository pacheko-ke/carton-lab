"use server";

import {
  auth,
  signIn,
  signOut,
  verifySessionTakeoverToken,
} from "@/auth";
import {
  isEmailOtpConfigured,
  isGoogleAuthConfigured,
} from "@/auth-config";
import { clearExpiredAuthSession } from "@/lib/auth-session";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import {
  isEmailSignInRateLimited,
  isValidEmail,
  normalizeEmail,
  sendEmailOtpCode,
} from "@/lib/email-otp";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type EmailOtpActionState = {
  status: "idle" | "sent" | "error";
  email?: string;
  message?: string;
  canTakeOver?: boolean;
};

export async function signInWithGoogle() {
  if (!isGoogleAuthConfigured()) {
    throw new Error("Google authentication has not been configured.");
  }
  await signIn("google", { redirectTo: "/app" });
}

export async function signInHereWithGoogle(formData: FormData) {
  if (!isGoogleAuthConfigured()) {
    throw new Error("Google authentication has not been configured.");
  }
  const rawToken = formData.get("takeoverToken");
  const takeover = typeof rawToken === "string"
    ? verifySessionTakeoverToken(rawToken)
    : null;
  if (!takeover) {
    redirect("/login?error=TakeoverExpired");
  }

  const result = await prisma.user.updateMany({
    where: {
      id: takeover.userId,
      activeSessionId: takeover.activeSessionId,
    },
    data: { activeSessionId: null, activeSessionExpiresAt: null },
  });
  if (result.count !== 1) {
    redirect("/login?error=TakeoverExpired");
  }

  await signIn("google", { redirectTo: "/app" });
}

async function hasActiveSession(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      activeSessionId: true,
      activeSessionExpiresAt: true,
    },
  });
  if (!user?.activeSessionId) return false;
  const now = new Date();
  if (user.activeSessionExpiresAt && user.activeSessionExpiresAt > now) {
    return true;
  }
  if (
    await clearExpiredAuthSession(
      user.id,
      user.activeSessionId,
      user.activeSessionExpiresAt,
      now,
    )
  ) {
    return false;
  }
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      activeSessionId: true,
      activeSessionExpiresAt: true,
    },
  });
  return Boolean(
    currentUser?.activeSessionId &&
      currentUser.activeSessionExpiresAt &&
      currentUser.activeSessionExpiresAt > now,
  );
}

export async function requestEmailOtp(
  _previousState: EmailOtpActionState,
  formData: FormData,
): Promise<EmailOtpActionState> {
  if (!isEmailOtpConfigured()) {
    return {
      status: "error",
      message: "Email sign-in is temporarily unavailable. Please use Google sign-in.",
    };
  }

  const rawEmail = formData.get("email");
  if (typeof rawEmail !== "string") {
    return { status: "error", message: "Enter a valid email address." };
  }

  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (await isEmailSignInRateLimited(email)) {
    return {
      status: "error",
      message: "Too many failed sign-in attempts. Please try again after one hour.",
    };
  }
  const requestHeaders = await headers();
  const forwardedIp = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")
    .shift()
    ?.trim();
  const ipAddress = requestHeaders.get("x-real-ip")?.trim() || forwardedIp || null;
  const result = await sendEmailOtpCode(email, ipAddress);
  if (result.status === "cooldown") {
    return {
      status: "error",
      message: "Wait one minute before requesting another code.",
    };
  }
  if (result.status === "rate-limited") {
    return {
      status: "error",
      message: "Too many codes requested. Try again in 15 minutes.",
    };
  }
  if (result.status === "ip-rate-limited") {
    return {
      status: "error",
      message: "Too many codes requested from this network. Try again in 15 minutes.",
    };
  }
  if (result.status === "delivery-error") {
    return {
      status: "error",
      message: "We couldn't send your code. Please try again shortly.",
    };
  }

  return {
    status: "sent",
    email,
    message: "A verification code has been sent to your email.",
  };
}

export async function verifyEmailOtp(
  _previousState: EmailOtpActionState,
  formData: FormData,
): Promise<EmailOtpActionState> {
  if (!isEmailOtpConfigured()) {
    return {
      status: "error",
      message: "Email sign-in is temporarily unavailable. Please use Google sign-in.",
    };
  }

  const rawEmail = formData.get("email");
  const rawCode = formData.get("code");
  if (typeof rawEmail !== "string" || typeof rawCode !== "string") {
    return {
      status: "error",
      message: "Enter the six-digit code sent to your email.",
    };
  }

  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  const takeOverExistingSession =
    formData.get("takeOverExistingSession") === "true";
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return {
      status: "error",
      message: "Enter the six-digit code sent to your email.",
    };
  }
  if (await isEmailSignInRateLimited(email)) {
    return {
      status: "error",
      message: "Too many failed sign-in attempts. Please try again after one hour.",
    };
  }
  if (
    !takeOverExistingSession &&
    (await hasActiveSession(email))
  ) {
    return {
      status: "error",
      canTakeOver: true,
      message: "This account is signed in on another device.",
    };
  }

  try {
    await signIn("email-otp", {
      email,
      code,
      takeOverExistingSession: takeOverExistingSession ? "true" : "false",
      redirectTo: "/app",
    });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      if (await isEmailSignInRateLimited(email)) {
        return {
          status: "error",
          message: "Too many failed sign-in attempts. Please try again after one hour.",
        };
      }
      return {
        status: "error",
        message: "That code is invalid or expired. Request a new code and try again.",
      };
    }
    if (error instanceof AuthError && error.type === "AccessDenied") {
      return {
        status: "error",
        message: "This account's session changed during sign-in. Please try again.",
      };
    }
    throw error;
  }

  throw new Error("Email sign-in returned without redirecting.");
}

export async function signOutOfCartonLab() {
  await signOut({ redirectTo: "/" });
}

export async function updateAccountProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user.id || !session.user.isEmailVerified) {
    redirect("/login");
  }

  const readField = (
    name: string,
    maxLength: number,
    required = false,
  ) => {
    const value = formData.get(name);
    if (value === null && !required) return "";
    if (typeof value !== "string") {
      throw new Error(`Missing ${name} value.`);
    }

    const trimmed = value.trim().replace(/\s+/g, " ");
    if (trimmed.length > maxLength) {
      throw new Error(`${name} must be ${maxLength} characters or fewer.`);
    }
    return trimmed;
  };

  const name = readField("name", 100, true);
  if (!name) {
    throw new Error("Name is required.");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      role: readField("role", 100) || null,
      contact: readField("contact", 120) || null,
      address: readField("address", 120) || null,
    },
  });

  const companyName = readField("companyName", 100);
  if (companyName) {
    await prisma.user.updateMany({
      where: { id: session.user.id, companyName: null },
      data: { companyName },
    });
  }

  revalidatePath("/account");
  revalidatePath("/account/profile");
  revalidatePath("/app");
  redirect("/account/profile?profile=updated");
}
