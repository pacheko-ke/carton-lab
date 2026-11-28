import { Suspense } from "react";
import Link from "next/link";
import {
  cancelPremiumSubscription,
  startPremiumCheckout,
} from "../billing-actions";
import { requireVerifiedUser } from "@/lib/account";
import { canManageCompany } from "@/lib/company";
import { getEffectiveBillingSource } from "@/lib/company-billing";
import {
  hasPremiumAccess,
  hasPremiumSubscriptionAccess,
  isPaystackBillingConfigured,
  MPESA_PROVIDER_PLAN_ID,
} from "@/lib/billing";
import BrandLogo from "../brand-logo";
import { isSuperAdminUser } from "@/lib/access-control";
import { updateEmailPreferences } from "../email-actions";
import { updateAccountProfile } from "../auth-actions";
import SignOutButton from "@/app/sign-out-button";
import { createCompany } from "../company/actions";
import {
  COMPANY_COUNTRY_OPTIONS,
  COMPANY_CURRENCY_OPTIONS,
  getCompanyTimeZoneGroups,
} from "@/lib/company-options";

type AccountPageProps = {
  searchParams: Promise<{
    billing?: string | string[];
    marketing?: string | string[];
  }>;
  embedded?: boolean;
};

const billingMessages: Record<string, string> = {
  "checkout-complete":
    "Checkout completed. Premium access will appear after Paystack verifies your payment.",
  "mpesa-unavailable": "M-Pesa checkout is temporarily unavailable.",
  cancelled:
    "Your subscription was cancelled. Premium access remains until the paid period ends.",
  "not-active": "No active Premium subscription was found.",
  "already-premium": "Your Premium subscription is already active.",
  "company-admin-required":
    "Only a company owner or admin can manage the shared Premium plan.",
  "plan-mismatch":
    "Paystack's selected plan must match $5 USD per month. Check that PAYSTACK_PLAN_CODE points to a USD 5 monthly plan in the same Live Paystack account as your API key.",
  "marketing-enabled": "You are subscribed to PackStudio product emails.",
  "marketing-disabled": "You are unsubscribed from PackStudio product emails.",
};

export default function AccountContent(props: AccountPageProps) {
  return (
    <Suspense
      fallback={
        <div className={props.embedded
          ? "account-panel-loading"
          : "grid min-h-dvh place-items-center bg-slate-950 text-slate-100"}>
          Loading account…
        </div>
      }
    >
      <AccountContentView
        searchParams={props.searchParams}
        embedded={props.embedded}
      />
    </Suspense>
  );
}

async function AccountContentView({ searchParams, embedded }: AccountPageProps) {
  const [user, params] = await Promise.all([
    requireVerifiedUser(),
    searchParams,
  ]);
  const timeZoneGroups = getCompanyTimeZoneGroups();
  const isSuperAdmin = await isSuperAdminUser(user.id);
  const now = new Date();
  const billing = getEffectiveBillingSource(user);
  const company = user.companyMembership?.company;
  const companySubscriptions = company?.subscriptions ?? [];
  const personalSubscriptions = user.subscriptions.filter(
    (subscription) => subscription.companyId === null,
  );
  const companyPremium = company
    ? hasPremiumAccess(
        companySubscriptions,
        company.premiumAccessGranted,
        company.trialEndsAt,
        now,
      )
    : false;
  const personalPremium = hasPremiumAccess(
    personalSubscriptions,
    user.premiumAccessGranted,
    user.trialEndsAt,
    now,
  );
  const premium = companyPremium || personalPremium;
  const activeSubscriptionFor = (
    subscriptions: typeof billing.subscriptions,
  ) =>
    subscriptions
      .filter(
        (subscription) =>
          ((Boolean(process.env.PAYSTACK_PLAN_CODE) &&
            subscription.providerPlanId === process.env.PAYSTACK_PLAN_CODE) ||
            subscription.providerPlanId === MPESA_PROVIDER_PLAN_ID) &&
          (subscription.status === "active" ||
            (subscription.status === "cancelled" &&
              subscription.cancelAtPeriodEnd)) &&
          subscription.currentPeriodEnd !== null &&
          subscription.currentPeriodEnd > now,
      )
      .sort(
        (first, second) =>
          (second.currentPeriodEnd?.getTime() ?? 0) -
          (first.currentPeriodEnd?.getTime() ?? 0),
      )[0];
  const activeSubscription =
    activeSubscriptionFor(companySubscriptions) ??
    activeSubscriptionFor(personalSubscriptions);
  const complimentaryPremium =
    (company?.premiumAccessGranted === true || user.premiumAccessGranted) &&
    !activeSubscription;
  const companyTrialActive = Boolean(
    company &&
      !hasPremiumSubscriptionAccess(
        companySubscriptions,
        company.premiumAccessGranted,
        now,
      ) &&
      company.trialEndsAt &&
      company.trialEndsAt > now,
  );
  const personalTrialActive = Boolean(
    !hasPremiumSubscriptionAccess(
      personalSubscriptions,
      user.premiumAccessGranted,
      now,
    ) &&
      user.trialEndsAt &&
      user.trialEndsAt > now,
  );
  const trialActive = Boolean(
    !activeSubscription && (companyTrialActive || personalTrialActive),
  );
  const trialEndDate = companyTrialActive
    ? company?.trialEndsAt
    : personalTrialActive
      ? user.trialEndsAt
      : billing.trialEndsAt;
  const companyBillingManager = Boolean(
    user.companyMembership && canManageCompany(user.companyMembership.role),
  );
  const canStartCompanySubscription = Boolean(
    companyBillingManager &&
      company &&
      !hasPremiumSubscriptionAccess(
        companySubscriptions,
        company.premiumAccessGranted,
        now,
      ),
  );
  const message =
    (Array.isArray(params.billing)
      ? undefined
      : billingMessages[params.billing ?? ""]) ??
    (Array.isArray(params.marketing)
      ? undefined
      : billingMessages[`marketing-${params.marketing ?? ""}`]);
  const AccountShell = embedded ? "div" : "main";
  return (
    <AccountShell className={`account-page${embedded ? " account-page-embedded" : ""}`}>
      {!embedded && (
        <header className="account-header">
          <Link href="/" className="brand-lockup" aria-label="PackStudio home">
            <BrandLogo className="brand-wordmark" />
          </Link>
          <nav className="account-header-links" aria-label="Account navigation">
            {isSuperAdmin && (
              <Link href="/admin" className="account-back-link">
                Dashboard
              </Link>
            )}
            <Link href="/app" className="account-back-link">
              Back to Studio
            </Link>
            <SignOutButton />
          </nav>
        </header>
      )}

      <section className="account-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> ACCOUNT &amp; PLAN</span>
          <h1>Your workspace plan</h1>
          <p>
            {user.name || user.email
              ? `Signed in as ${user.name || user.email}.`
              : "Manage your PackStudio account and plan."}
          </p>
        </div>

        {message && (
          <p className="account-notice" role="status">
            {message}
          </p>
        )}
        <section
          className="account-profile-card account-profile-edit-card"
          aria-labelledby="profile-heading"
        >
          <div>
            <span className="account-plan-kicker">PROFILE DETAILS</span>
            <h2 id="profile-heading">Your account</h2>
            <p>
              {user.name || user.email || "Manage your profile"}
              {user.companyMembership?.company.name || user.companyName
                ? ` · ${user.companyMembership?.company.name ?? user.companyName}`
                : ""}
              . Update the profile details.
            </p>
          </div>
          <form action={updateAccountProfile} className="account-profile-form">
            <input name="embeddedDashboard" type="hidden" value="true" />
            <label className="account-profile-field" htmlFor="profile-name">
              Name
              <input
                autoComplete="name"
                defaultValue={user.name ?? ""}
                id="profile-name"
                maxLength={100}
                name="name"
                required
                type="text"
              />
            </label>
            {user.companyMembership?.company.name || user.companyName ? (
              <div className="account-profile-field">
                Company name
                <p className="account-profile-value">
                  {user.companyMembership?.company.name ?? user.companyName}
                </p>
              </div>
            ) : (
              <label className="account-profile-field" htmlFor="profile-company">
                Company name
                <span>Can be set once and cannot be changed later.</span>
                <input
                  autoComplete="organization"
                  id="profile-company"
                  maxLength={100}
                  name="companyName"
                  type="text"
                />
              </label>
            )}
            <label className="account-profile-field" htmlFor="profile-role">
              Role
              <input
                autoComplete="organization-title"
                defaultValue={user.role ?? ""}
                id="profile-role"
                maxLength={100}
                name="role"
                type="text"
              />
            </label>
            <label className="account-profile-field" htmlFor="profile-contact">
              Contact
              <input
                autoComplete="tel"
                defaultValue={user.contact ?? ""}
                id="profile-contact"
                maxLength={120}
                name="contact"
                placeholder="Phone or email"
                type="text"
              />
            </label>
            <label className="account-profile-field account-profile-address" htmlFor="profile-address">
              Address
              <textarea
                autoComplete="street-address"
                defaultValue={user.address ?? ""}
                id="profile-address"
                maxLength={120}
                name="address"
                rows={3}
              />
            </label>
            <button className="production-primary-button account-profile-save" type="submit">
              Save details
            </button>
          </form>
        </section>

        {user.companyMembership ? (
          <section className="account-profile-card" aria-labelledby="company-profile-heading">
            <div>
              <span className="account-plan-kicker">COMPANY WORKSPACE</span>
              <h2 id="company-profile-heading">{user.companyMembership.company.name}</h2>
              <p>Manage your company details, timezone, currency, and team access.</p>
            </div>
            {!embedded && (
              <Link className="button button-large" href="/company">
                Manage company <span>→</span>
              </Link>
            )}
          </section>
        ) : (
          <section className="account-profile-card" aria-labelledby="company-setup-heading">
            <div>
              <span className="account-plan-kicker">COMPANY WORKSPACE</span>
              <h2 id="company-setup-heading">Set up your company</h2>
              <p>Create a private workspace for your company and team.</p>
            </div>
            <form action={createCompany} className="account-profile-form">
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
                <select
                  autoComplete="country-name"
                  defaultValue=""
                  id="company-country"
                  name="country"
                  required
                >
                  <option disabled value="">Select a country</option>
                  {COMPANY_COUNTRY_OPTIONS.map((country) => (
                    <option key={country.value} value={country.value}>{country.label}</option>
                  ))}
                </select>
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
                <select defaultValue="Africa/Nairobi" id="company-timezone" name="timezone" required>
                  {timeZoneGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((timeZone) => (
                        <option key={timeZone.value} value={timeZone.value}>{timeZone.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="account-profile-field" htmlFor="company-currency">
                Currency
                <select defaultValue="KES" id="company-currency" name="currency" required>
                  {COMPANY_CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency.value} value={currency.value}>{currency.label}</option>
                  ))}
                </select>
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
              <button className="production-primary-button account-profile-save" type="submit">
                Create company workspace
              </button>
            </form>
          </section>
        )}

        <section
          className={`account-plan-card${premium ? "" : " is-upgrade"}`}
          aria-labelledby="plan-heading"
        >
          <div className="account-plan-heading">
            <div>
              <span className="account-plan-kicker">
                {premium ? "CURRENT PLAN" : "PREMIUM PLAN"}
              </span>
              <h2 id="plan-heading">Premium</h2>
            </div>
            <span
              className={`account-plan-status${premium ? " is-premium" : ""}`}
            >
              <span aria-hidden="true" />
              {activeSubscription?.cancelAtPeriodEnd
                ? "Ending"
                : trialActive
                  ? "Trial active"
                  : premium
                  ? "Active"
                  : "Upgrade available"}
            </span>
          </div>

          <p className="account-plan-price">
            {trialActive
              ? "Free trial"
              : complimentaryPremium
                ? "Granted"
                : "$5"}
            {!trialActive && !complimentaryPremium && <span> / month</span>}
          </p>

          <ul className="account-feature-list">
            <li>Access to every packaging keyline</li>
            <li>PDF, SVG, and DXF exports for every keyline</li>
            <li>Bulk-generate up to 500 keylines from Excel, CSV, or TXT as one PDF or a ZIP of individual PDFs</li>
            <li>Choose whether keyline exports include the details table and QR code</li>
            <li>Dimension markings and carton colour options</li>
          </ul>

          {premium ? (
            <>
              {trialActive && trialEndDate && (
                <p className="account-subscription-note">
                  Your 7-day Premium trial ends on{" "}
                  {trialEndDate.toLocaleDateString()}.{" "}
                  {companyBillingManager
                    ? "If you subscribe now, your company will be charged $5/month immediately."
                    : user.companyMembership
                      ? "Ask your company owner or admin about the shared Premium plan."
                      : "Set up your company workspace to start a shared Premium plan."}
                  {" "}Otherwise, your account returns to Free after the trial.
                </p>
              )}
              {complimentaryPremium && (
                <p className="account-subscription-note">
                  Premium access is granted to this account or company; no paid
                  subscription is required.
                </p>
              )}
              {company && companyPremium && (
                <p className="account-subscription-note">
                  The company Premium plan is shared with all company members.
                </p>
              )}
              {company && !companyPremium && personalPremium && (
                <p className="account-subscription-note">
                  Your personal Premium access is not shared with other company members.
                </p>
              )}
              {activeSubscription?.cancelAtPeriodEnd &&
                activeSubscription.currentPeriodEnd && (
                  <p className="account-subscription-note">
                    Your subscription is set to end on{" "}
                    {activeSubscription.currentPeriodEnd.toLocaleDateString()}.
                    Premium access remains active until then.
                  </p>
                )}
              {activeSubscription?.providerPlanId === MPESA_PROVIDER_PLAN_ID &&
                activeSubscription.currentPeriodEnd && (
                  <p className="account-subscription-note">
                    Your M-Pesa payment covers one month and does not renew
                    automatically. Premium access ends on{" "}
                    {activeSubscription.currentPeriodEnd.toLocaleDateString()}.
                  </p>
                )}
              {activeSubscription?.status === "active" &&
                !activeSubscription.cancelAtPeriodEnd &&
                activeSubscription.providerPlanId !== MPESA_PROVIDER_PLAN_ID &&
                (!activeSubscription.companyId || companyBillingManager) && (
                  <form action={cancelPremiumSubscription}>
                    <button className="button button-large" type="submit">
                      Cancel subscription
                    </button>
                  </form>
                )}
            </>
          ) : (
            <>
              <p className="account-subscription-note">
                {billing.trialEndsAt && billing.trialEndsAt <= now
                  ? "Your 7-day free trial has ended. "
                  : ""}
                Your current plan is Free. Upgrade to unlock the complete
                Premium library.
              </p>
            </>
          )}
          {canStartCompanySubscription && (
            isPaystackBillingConfigured() ? (
              <form action={startPremiumCheckout}>
                <input type="hidden" name="paymentMethod" value="card" />
                <button className="button button-large" type="submit">
                  Subscribe company to Premium — $5/month <span>→</span>
                </button>
              </form>
            ) : (
              <p className="account-billing-unavailable" role="status">
                Premium checkout is not available yet.
              </p>
            )
          )}
          {user.companyMembership && !companyBillingManager && !companyPremium && (
            <p className="account-subscription-note">
              {personalPremium
                ? "Your personal Premium access is not shared with other company members. "
                : ""}
              Ask your company owner or admin to subscribe to the shared Premium plan.
            </p>
          )}
          {!user.companyMembership && !premium && (
            <p className="account-subscription-note">
              Set up a company workspace before starting a shared Premium plan.
              <Link href="/production/admin?view=account"> Set up company details</Link>
            </p>
          )}
        </section>

        <section
          className="account-profile-card email-preference-card"
          aria-labelledby="email-preferences-heading"
        >
          <div>
            <span className="account-plan-kicker">EMAIL PREFERENCES</span>
            <h2 id="email-preferences-heading">Product emails</h2>
            <p>
              Premium feature announcements and product updates are on by
              default. You can turn them off anytime; account and billing
              emails are not affected.
            </p>
          </div>
          <form action={updateEmailPreferences}>
            <input name="embeddedDashboard" type="hidden" value="true" />
            <label className="email-preference-toggle">
              <input
                type="checkbox"
                name="marketingEmailsEnabled"
                defaultChecked={user.marketingEmailsEnabled}
              />
              <span>Send me product announcements and Premium offers.</span>
            </label>
            <button className="button button-large" type="submit">
              Save email preferences
            </button>
          </form>
        </section>
      </section>
    </AccountShell>
  );
}
