import { Suspense } from "react";
import Link from "next/link";
import { requireVerifiedUser } from "@/lib/account";
import { isAdminEmail } from "@/lib/admin";
import BrandIcon from "../../brand-icon";
import { updateAccountProfile } from "../../auth-actions";

type ProfilePageProps = {
  searchParams: Promise<{
    profile?: string | string[];
  }>;
};

export default function ProfilePage(props: ProfilePageProps) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-slate-950 text-slate-100">
          Loading profile…
        </main>
      }
    >
      <ProfileContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ProfileContent({ searchParams }: ProfilePageProps) {
  const [user, params] = await Promise.all([
    requireVerifiedUser(),
    searchParams,
  ]);
  const profileUpdated =
    params.profile === "updated" ||
    (Array.isArray(params.profile) && params.profile.includes("updated"));

  return (
    <main className="account-page">
      <header className="account-header">
        <Link href="/" className="brand-lockup" aria-label="CartonLab home">
          <span className="brand-mark">
            <BrandIcon className="brand-mark-image" />
          </span>
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <nav className="account-header-links" aria-label="Profile navigation">
          {isAdminEmail(user.email) && (
            <Link href="/admin" className="account-back-link">
              Metrics
            </Link>
          )}
          <Link href="/account" className="account-back-link">
            Back to account
          </Link>
        </nav>
      </header>

      <section className="account-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> ACCOUNT DETAILS</span>
          <h1>Update your profile</h1>
          <p>These details are included in your keyline drawing.</p>
        </div>

        {profileUpdated && (
          <p className="account-notice" role="status">
            Your account details have been updated.
          </p>
        )}

        <section
          className="account-profile-card"
          aria-labelledby="profile-heading"
        >
          <div>
            <span className="account-plan-kicker">PROFILE DETAILS</span>
            <h2 id="profile-heading">Your details</h2>
          </div>
          <form action={updateAccountProfile}>
            <label className="account-profile-field" htmlFor="profile-name">
              Name
              <input
                id="profile-name"
                name="name"
                type="text"
                autoComplete="name"
                maxLength={100}
                defaultValue={user.name ?? ""}
                required
              />
            </label>
            {user.companyName ? (
              <div className="account-profile-field">
                Company name
                <p className="account-profile-value">{user.companyName}</p>
              </div>
            ) : (
              <label className="account-profile-field" htmlFor="profile-company">
                Company name
                <span>Can be set once and cannot be changed later.</span>
                <input
                  id="profile-company"
                  name="companyName"
                  type="text"
                  autoComplete="organization"
                  maxLength={100}
                />
              </label>
            )}
            <label className="account-profile-field" htmlFor="profile-role">
              Role
              <input
                id="profile-role"
                name="role"
                type="text"
                autoComplete="organization-title"
                maxLength={100}
                defaultValue={user.role ?? ""}
              />
            </label>
            <label className="account-profile-field" htmlFor="profile-contact">
              Contact
              <input
                id="profile-contact"
                name="contact"
                type="text"
                autoComplete="tel"
                maxLength={120}
                placeholder="Phone or email"
                defaultValue={user.contact ?? ""}
              />
            </label>
            <label className="account-profile-field" htmlFor="profile-address">
              Address
              <textarea
                id="profile-address"
                name="address"
                autoComplete="street-address"
                maxLength={120}
                rows={3}
                defaultValue={user.address ?? ""}
              />
            </label>
            <button className="button button-large" type="submit">
              Save details
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
