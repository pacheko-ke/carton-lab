import { signOutOfPackStudio } from "@/app/auth-actions";

export default function SignOutButton() {
  return (
    <form action={signOutOfPackStudio} className="account-signout-form">
      <button className="account-back-link account-signout-button" type="submit">
        Sign out
      </button>
    </form>
  );
}
