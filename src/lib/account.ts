import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function requireVerifiedUser() {
  const session = await auth();
  if (!session?.user.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      premiumAccessGranted: true,
      subscriptions: true,
    },
  });

  if (!user?.emailVerified) {
    redirect("/login?error=UnverifiedEmail");
  }

  return user;
}
