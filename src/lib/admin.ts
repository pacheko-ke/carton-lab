import { auth } from "@/auth";
import { getUserAccessSnapshot } from "@/lib/access-control";
import { redirect } from "next/navigation";

export { isAdminEmail } from "@/lib/admin-email";

export async function requireAdminUser() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const access = await getUserAccessSnapshot(session.user.id);
  if (!access?.user.emailVerified) redirect("/login?error=UnverifiedEmail");
  if (!access.isSuperAdmin) redirect("/app");

  return { id: access.user.id, email: access.user.email };
}
