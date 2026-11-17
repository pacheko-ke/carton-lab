"use server";

import { auth, signIn, signOut } from "@/auth";
import {
  isEmailOtpConfigured,
  isGoogleAuthConfigured,
} from "@/auth-config";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import {
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
};

export async function signInWithGoogle() {
  if (!isGoogleAuthConfigured()) {
    throw new Error("Google authentication has not been configured.");
  }
  await signIn("google", { redirectTo: "/app" });
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
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return {
      status: "error",
      message: "Enter the six-digit code sent to your email.",
    };
  }

  try {
    await signIn("email-otp", { email, code, redirectTo: "/app" });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      return {
        status: "error",
        message: "That code is invalid or expired. Request a new code and try again.",
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
