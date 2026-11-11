import { Suspense } from "react";
import Link from "next/link";
import {
  cancelPremiumSubscription,
  startPremiumCheckout,
} from "../billing-actions";
import { requireVerifiedUser } from "@/lib/account";
import {
  hasPremiumAccess,
  isFlutterwaveBillingConfigured,
} from "@/lib/billing";
import BrandIcon from "../brand-icon";

type AccountPageProps = {
  searchParams: Promise<{ billing?: string | string[] }>;
};

const billingMessages: Record<string, string> = {
  "checkout-complete":
    "Checkout completed. Premium access will appear after Flutterwave confirms your subscription.",
  cancelled:
    "Your subscription was cancelled. Premium access remains until the paid period ends.",
  "not-active": "No active Premium subscription was found.",
  "already-premium": "Your Premium subscription is already active.",
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
  const premium = hasPremiumAccess(user.subscriptions);
  const activeSubscription = user.subscriptions
    .filter(
      (subscription) =>
        subscription.providerPlanId === process.env.FLW_PAYMENT_PLAN_ID &&
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
        <Link href="/app" className="account-back-link">
          Back to designer
        </Link>
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
            {premium ? "$5" : "$0"}
            <span> / month</span>
          </p>

          {premium ? (
            <>
              <ul className="account-feature-list">
                <li>Access to every packaging keyline</li>
                <li>PDF, SVG, and DXF exports</li>
              </ul>
              {activeSubscription?.cancelAtPeriodEnd &&
                activeSubscription.currentPeriodEnd && (
                  <p className="account-subscription-note">
                    Your subscription is set to end on{" "}
                    {activeSubscription.currentPeriodEnd.toLocaleDateString()}.
                    Premium access remains active until then.
                  </p>
                )}
              {activeSubscription?.status === "active" && (
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
              {isFlutterwaveBillingConfigured() ? (
                <form action={startPremiumCheckout}>
                  <button className="button button-large" type="submit">
                    Upgrade to Premium with card <span>→</span>
                  </button>
                </form>
              ) : (
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
