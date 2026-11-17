import { sendResendEmail } from "@/lib/resend-email";

type WelcomeEmailInput = {
  email: string;
  name: string | null;
};

export async function sendWelcomeEmail({ email, name }: WelcomeEmailInput) {
  const appUrl = new URL("/app", process.env.APP_URL ?? "http://localhost:3000").toString();
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Welcome to CartonLab!";
  await sendResendEmail({
    to: email,
    subject: "Welcome to CartonLab",
    heading: "Your Premium trial is ready",
    message: `${greeting}\n\nYour CartonLab account is ready, and your 7-day Premium trial has started.`,
    action: { label: "Open CartonLab Studio", href: appUrl },
  });
}
