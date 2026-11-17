import { getAdminEmailRecipients, sendEmailAlert } from "@/lib/resend-email";
import { sendWelcomeEmail } from "@/lib/welcome-email";

type NewAccountNotificationInput = {
  email: string | null;
  name: string | null;
  trialEndsAt: Date;
};

export async function notifyNewAccount({
  email,
  name,
  trialEndsAt,
}: NewAccountNotificationInput) {
  await sendEmailAlert({
    recipients: getAdminEmailRecipients(),
    subject: "New CartonLab account",
    heading: "A new account is ready",
    message:
      "A new CartonLab account has been created and its 7-day Premium trial has started.",
    details: [
      { label: "Name", value: name ?? "Not provided" },
      { label: "Email", value: email ?? "Not provided" },
      { label: "Trial ends", value: trialEndsAt.toLocaleDateString("en-KE") },
    ],
  });
  if (!email) {
    console.error("Could not send welcome email: new user has no email address.");
    return;
  }
  try {
    await sendWelcomeEmail({ email, name });
  } catch (error) {
    console.error("Could not send welcome email:", error);
  }
}
