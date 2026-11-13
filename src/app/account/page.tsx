import { Suspense } from "react";
import Link from "next/link";
import {
  cancelPremiumSubscription,
  startPremiumCheckout,
} from "../billing-actions";
import { requireVerifiedUser } from "@/lib/account";
import {
  hasPremiumAccess,
  isPaystackBillingConfigured,
  MPESA_PROVIDER_PLAN_ID,
} from "@/lib/billing";
import { isDarajaAvailableForUser } from "@/lib/daraja";
import BrandIcon from "../brand-icon";
import { updateAccountProfile } from "../auth-actions";
import { isAdminEmail } from "@/lib/admin";

type AccountPageProps = {
  searchParams: Promise<{
    billing?: string | string[];
    profile?: string | string[];
  }>;
};

const billingMessages: Record<string, string> = {
  "checkout-complete":
    "Checkout completed. Premium access will appear after Paystack verifies your payment.",
  "mpesa-prompt-sent":
    "An M-Pesa payment prompt was sent to your phone. Premium access will appear after Daraja confirms the payment.",
  cancelled:
    "Your subscription was cancelled. Premium access remains until the paid period ends.",
  "not-active": "No active Premium subscription was found.",
  "already-premium": "Your Premium subscription is already active.",
  "plan-mismatch":
    "Paystack's selected plan must match $5 USD per month. Check that PAYSTACK_PLAN_CODE points to a USD 5 monthly plan in the same Live Paystack account as your API key.",
};

export default function AccountPage(props: AccountPageProps) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-slate-950 text-slate-100">
          Loading account…
        </main>
      }
    >
      <AccountContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function AccountContent({ searchParams }: AccountPageProps) {
  const [user, params] = await Promise.all([
    requireVerifiedUser(),
    searchParams,
  ]);
  const premium = hasPremiumAccess(
    user.subscriptions,
    user.premiumAccessGranted,
  );
  const activeSubscription = user.subscriptions
    .filter(
      (subscription) =>
        ((Boolean(process.env.PAYSTACK_PLAN_CODE) &&
          subscription.providerPlanId === process.env.PAYSTACK_PLAN_CODE) ||
          subscription.providerPlanId === MPESA_PROVIDER_PLAN_ID) &&
        (subscription.status === "active" ||
          (subscription.status === "cancelled" &&
            subscription.cancelAtPeriodEnd)) &&
        subscription.currentPeriodEnd !== null &&
        subscription.currentPeriodEnd > new Date(),
    )
    .sort(
      (first, second) =>
        (second.currentPeriodEnd?.getTime() ?? 0) -
        (first.currentPeriodEnd?.getTime() ?? 0),
    )[0];
  const complimentaryPremium = user.premiumAccessGranted && !activeSubscription;
  const message = Array.isArray(params.billing)
    ? undefined
    : billingMessages[params.billing ?? ""];
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
        <nav className="account-header-links" aria-label="Account navigation">
          {isAdminEmail(user.email) && (
            <Link href="/admin" className="account-back-link">
              Metrics
            </Link>
          )}
          <Link href="/app" className="account-back-link">
            Back to designer
          </Link>
        </nav>
      </header>

      <section className="account-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> ACCOUNT &amp; PLAN</span>
          <h1>Your workspace plan</h1>
          <p>
            {user.name || user.email
              ? `Signed in as ${user.name || user.email}.`
              : "Manage your CartonLab account and plan."}
          </p>
        </div>

        {message && (
          <p className="account-notice" role="status">
            {message}
          </p>
        )}
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
            <p>These details are included in your keyline drawing.</p>
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

        <section className="account-plan-card" aria-labelledby="plan-heading">
          <div className="account-plan-heading">
            <div>
              <span className="account-plan-kicker">CURRENT PLAN</span>
              <h2 id="plan-heading">{premium ? "Premium" : "Free"}</h2>
            </div>
            <span
              className={`account-plan-status${premium ? " is-premium" : ""}`}
            >
              <span aria-hidden="true" />
              {activeSubscription?.cancelAtPeriodEnd
                ? "Ending"
                : premium
                  ? "Active"
                  : "Current"}
            </span>
          </div>

          <p className="account-plan-price">
            {complimentaryPremium ? "Granted" : premium ? "$5" : "$0"}
            {!complimentaryPremium && <span> / month</span>}
          </p>

          {premium ? (
            <>
              <ul className="account-feature-list">
                <li>Access to every packaging keyline</li>
                <li>PDF, SVG, and DXF exports</li>
              </ul>
              {complimentaryPremium && (
                <p className="account-subscription-note">
                  Premium access is granted to this account; no paid
                  subscription is required.
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
                activeSubscription.providerPlanId !== MPESA_PROVIDER_PLAN_ID && (
                  <form action={cancelPremiumSubscription}>
                    <button className="button button-large" type="submit">
                      Cancel subscription
                    </button>
                  </form>
                )}
            </>
          ) : (
            <>
              <ul className="account-feature-list">
                <li>RSC, Pizza, and Chicken Box keylines</li>
                <li>PDF, SVG, and DXF exports for available keylines</li>
                <li>Premium keylines are locked</li>
              </ul>
              {isPaystackBillingConfigured() && (
                <form action={startPremiumCheckout}>
                  <input type="hidden" name="paymentMethod" value="card" />
                  <button className="button button-large" type="submit">
                    Upgrade to Premium with Paystack <span>→</span>
                  </button>
                </form>
              )}
              {isDarajaAvailableForUser(user.email) && (
                <form action={startPremiumCheckout}>
                  <input type="hidden" name="paymentMethod" value="mpesa" />
                  <label className="account-phone-label" htmlFor="mpesa-phone">
                    M-Pesa phone number
                    <input
                      id="mpesa-phone"
                      name="phoneNumber"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="0712345678"
                      pattern="[0-9+() -]{9,16}"
                      maxLength={16}
                      required
                    />
                  </label>
                  <button className="button button-large" type="submit">
                    Pay one month with M-Pesa <span>→</span>
                  </button>
                </form>
              )}
              {!isPaystackBillingConfigured() &&
                !isDarajaAvailableForUser(user.email) && (
                  <p className="account-billing-unavailable" role="status">
                    Premium checkout is not available yet.
                  </p>
                )}
              <p className="account-subscription-note">
                M-Pesa is a one-time monthly payment. Its KES amount is
                calculated from the latest available USD/KES reference rate at
                checkout and does not renew automatically.
              </p>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
