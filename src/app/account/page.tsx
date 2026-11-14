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
import BrandIcon from "../brand-icon";
import { isAdminEmail } from "@/lib/admin";

type AccountPageProps = {
  searchParams: Promise<{
    billing?: string | string[];
  }>;
};

const billingMessages: Record<string, string> = {
  "checkout-complete":
    "Checkout completed. Premium access will appear after Paystack verifies your payment.",
  "mpesa-unavailable": "M-Pesa checkout is temporarily unavailable.",
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
  const now = new Date();
  const premium = hasPremiumAccess(
    user.subscriptions,
    user.premiumAccessGranted,
    user.trialEndsAt,
    now,
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
        subscription.currentPeriodEnd > now,
    )
    .sort(
      (first, second) =>
        (second.currentPeriodEnd?.getTime() ?? 0) -
        (first.currentPeriodEnd?.getTime() ?? 0),
    )[0];
  const complimentaryPremium = user.premiumAccessGranted && !activeSubscription;
  const trialActive = Boolean(
    !user.premiumAccessGranted &&
      !activeSubscription &&
      user.trialEndsAt &&
      user.trialEndsAt > now,
  );
  const message = Array.isArray(params.billing)
    ? undefined
    : billingMessages[params.billing ?? ""];
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
            Back to Studio
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
        <section
          className="account-profile-card"
          aria-labelledby="profile-heading"
        >
          <div>
            <span className="account-plan-kicker">PROFILE DETAILS</span>
            <h2 id="profile-heading">Your account</h2>
            <p>
              {user.name || user.email || "Manage your profile"}
              {user.companyName ? ` · ${user.companyName}` : ""}
              . Update the details included in your keyline drawing.
            </p>
          </div>
          <Link className="button button-large" href="/account/profile">
            Update profile <span>→</span>
          </Link>
        </section>

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
            <li>Dimension markings and carton colour options</li>
          </ul>

          {premium ? (
            <>
              {trialActive && user.trialEndsAt && (
                <p className="account-subscription-note">
                  Your 7-day Premium trial ends on{" "}
                  {user.trialEndsAt.toLocaleDateString()}. If you subscribe
                  now, Paystack starts charging $5/month immediately;
                  otherwise, your account returns to Free after the trial.
                </p>
              )}
              {trialActive && isPaystackBillingConfigured() && (
                <form action={startPremiumCheckout}>
                  <input type="hidden" name="paymentMethod" value="card" />
                  <button className="button button-large" type="submit">
                    Subscribe now for $5/month <span>→</span>
                  </button>
                </form>
              )}
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
              <p className="account-subscription-note">
                {user.trialEndsAt && user.trialEndsAt <= now
                  ? "Your 7-day free trial has ended. "
                  : ""}
                Your current plan is Free. Upgrade to unlock the complete
                Premium library.
              </p>
              {isPaystackBillingConfigured() && (
                <form action={startPremiumCheckout}>
                  <input type="hidden" name="paymentMethod" value="card" />
                  <button className="button button-large" type="submit">
                    Get everything with Premium <span>→</span>
                  </button>
                </form>
              )}
              {!isPaystackBillingConfigured() && (
                <p className="account-billing-unavailable" role="status">
                  Premium checkout is not available yet.
                </p>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
