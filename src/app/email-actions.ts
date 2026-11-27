"use server";

import { requireVerifiedUser } from "@/lib/account";
import { verifyEmailPreferenceToken } from "@/lib/email-preferences";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateEmailPreferences(formData: FormData) {
  const user = await requireVerifiedUser();
  const enabled = formData.get("marketingEmailsEnabled") === "on";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      marketingEmailsEnabled: enabled,
      marketingEmailsUpdatedAt: new Date(),
    },
  });

  revalidatePath("/account");
  revalidatePath("/production/admin");
  if (formData.get("embeddedDashboard") === "true") return;
  redirect(`/production/admin?view=account&marketing=${enabled ? "enabled" : "disabled"}`);
}

export async function unsubscribeFromMarketingEmails(formData: FormData) {
  const token = formData.get("token");
  if (typeof token !== "string") {
    throw new Error("A valid email preference token is required.");
  }

  const userId = verifyEmailPreferenceToken(token);
  if (!userId) {
    throw new Error("This email preference link is invalid.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      marketingEmailsEnabled: false,
      marketingEmailsUpdatedAt: new Date(),
    },
  });

  revalidatePath("/account");
  redirect(
    `/email-preferences?status=unsubscribed&token=${encodeURIComponent(token)}`,
  );
}
