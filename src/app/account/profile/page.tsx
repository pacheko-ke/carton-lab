import { redirect } from "next/navigation";

export default function ProfilePage() {
  redirect("/production/admin?view=account");
}
