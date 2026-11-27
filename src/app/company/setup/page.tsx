import Link from "next/link";
import { redirect } from "next/navigation";
import BrandLogo from "@/app/brand-logo";
import SignOutButton from "@/app/sign-out-button";
import { requireVerifiedUser } from "@/lib/account";
import { createCompany } from "../actions";

export default async function CompanySetupPage() {
  const user = await requireVerifiedUser();
  if (user.companyMembership) redirect("/company");

  return (
    <main className="account-page">
      <header className="account-header">
        <Link href="/" className="brand-lockup" aria-label="PackStudio home">
          <BrandLogo className="brand-wordmark" />
        </Link>
        <nav className="account-header-links" aria-label="Account navigation">
          <SignOutButton />
        </nav>
      </header>
      <section className="account-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> COMPANY SETUP</span>
          <h1>Set up your company</h1>
          <p>
            Add your company details to create a private workspace for your
            products, customers, and production records.
          </p>
        </div>
        <section className="account-profile-card" aria-labelledby="company-setup-heading">
          <div>
            <span className="account-plan-kicker">COMPANY DETAILS</span>
            <h2 id="company-setup-heading">Your business</h2>
          </div>
          <form action={createCompany}>
            <label className="account-profile-field" htmlFor="company-name">
              Company name
              <input
                autoComplete="organization"
                defaultValue={user.companyName ?? ""}
                id="company-name"
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="account-profile-field" htmlFor="company-country">
              Country
              <input
                autoComplete="country-name"
                id="company-country"
                maxLength={100}
                name="country"
                required
              />
            </label>
            <label className="account-profile-field" htmlFor="company-email">
              Company contact email
              <input
                autoComplete="email"
                defaultValue={user.email ?? ""}
                id="company-email"
                maxLength={254}
                name="contactEmail"
                required
                type="email"
              />
            </label>
            <label className="account-profile-field" htmlFor="company-phone">
              Company phone
              <input
                autoComplete="tel"
                defaultValue={user.contact ?? ""}
                id="company-phone"
                maxLength={40}
                name="contactPhone"
                type="tel"
              />
            </label>
            <label className="account-profile-field" htmlFor="company-address">
              Address
              <textarea
                autoComplete="street-address"
                defaultValue={user.address ?? ""}
                id="company-address"
                maxLength={300}
                name="address"
                rows={3}
              />
            </label>
            <label className="account-profile-field" htmlFor="company-timezone">
              Timezone
              <input
                defaultValue="Africa/Nairobi"
                id="company-timezone"
                maxLength={100}
                name="timezone"
                required
              />
            </label>
            <label className="account-profile-field" htmlFor="company-currency">
              Currency (ISO code)
              <input
                defaultValue="KES"
                id="company-currency"
                maxLength={3}
                name="currency"
                required
              />
            </label>
            <label className="account-profile-field" htmlFor="company-logo">
              Company logo URL (optional)
              <input
                id="company-logo"
                maxLength={2048}
                name="logoUrl"
                placeholder="https://example.com/logo.png"
                type="url"
              />
            </label>
            <button className="button button-large" type="submit">
              Create company workspace
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
