import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/account";

export default async function CompanySetupPage() {
  const user = await requireVerifiedUser();
  void user;
  redirect("/production/admin?view=account");
}
