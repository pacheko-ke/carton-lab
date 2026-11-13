import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

export async function requireAdminUser() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user?.emailVerified) redirect("/login?error=UnverifiedEmail");
  if (!isAdminEmail(user.email)) redirect("/app");

  return user;
}
