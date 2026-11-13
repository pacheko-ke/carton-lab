"use server";

import { auth, signIn, signOut } from "@/auth";
import { isGoogleAuthConfigured } from "@/auth-config";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function signInWithGoogle() {
  if (!isGoogleAuthConfigured()) {
    throw new Error("Google authentication has not been configured.");
  }
  await signIn("google", { redirectTo: "/app" });
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
  revalidatePath("/app");
  redirect("/account?profile=updated");
}
