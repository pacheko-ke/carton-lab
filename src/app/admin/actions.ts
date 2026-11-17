"use server";

import { requireAdminUser } from "@/lib/admin";
import { sendResendEmail } from "@/lib/resend-email";
import { redirect } from "next/navigation";

export async function sendResendTestEmail() {
  const admin = await requireAdminUser();
  if (!admin.email) {
    redirect("/admin?emailTest=missing-address");
  }
  if (!process.env.RESEND_API_KEY) {
    redirect("/admin?emailTest=missing-api-key");
  }

  try {
    await sendResendEmail({
      to: admin.email,
      subject: "CartonLab email test",
      heading: "Resend email alerts are working",
      message: "This colorful test email confirms that CartonLab can send email through Resend.",
      details: [
        { label: "Recipient", value: admin.email },
        { label: "Purpose", value: "Email delivery test" },
      ],
    }, {
      from: "CartonLab <onboarding@resend.dev>",
    });
  } catch (error) {
    console.error("Could not send the CartonLab Resend test email:", error);
    redirect("/admin?emailTest=failed");
  }

  redirect("/admin?emailTest=sent");
}
