import { Suspense } from "react";
import Link from "next/link";
import { unsubscribeFromMarketingEmails } from "@/app/email-actions";
import { verifyEmailPreferenceToken } from "@/lib/email-preferences";
import { prisma } from "@/lib/prisma";
import BrandIcon from "../brand-icon";

type EmailPreferencesPageProps = {
  searchParams: Promise<{
    token?: string | string[];
    status?: string | string[];
  }>;
};

export default function EmailPreferencesPage(props: EmailPreferencesPageProps) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-slate-950 text-slate-100">
          Loading email preferences…
        </main>
      }
    >
      <EmailPreferencesContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function EmailPreferencesContent({
  searchParams,
}: EmailPreferencesPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const userId = token ? verifyEmailPreferenceToken(token) : null;
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { marketingEmailsEnabled: true },
      })
    : null;
  const unsubscribed =
    params.status === "unsubscribed" &&
    user !== null &&
    !user.marketingEmailsEnabled;

  return (
    <main className="account-page">
      <header className="account-header">
        <Link href="/" className="brand-lockup" aria-label="CartonLab home">
          <span className="brand-mark">
            <BrandIcon className="brand-mark-image" />
          </span>
          <span>CartonLab Lightweight 2.0</span>
        </Link>
      </header>
      <section className="account-content email-preferences-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> EMAIL PREFERENCES</span>
          <h1>Manage product emails</h1>
          <p>
            Manage whether CartonLab can email you about Premium features and
            product updates.
          </p>
        </div>
        {unsubscribed ? (
          <p className="account-notice" role="status">
            You have been unsubscribed from CartonLab product and promotional
            emails.
          </p>
        ) : !user || !token ? (
          <p className="account-notice" role="status">
            This email preference link is invalid. Sign in to manage your
            preferences from your account page.
          </p>
        ) : !user.marketingEmailsEnabled ? (
          <p className="account-notice" role="status">
            You are already unsubscribed from product and promotional emails.
          </p>
        ) : (
          <section className="account-profile-card">
            <div>
              <span className="account-plan-kicker">PRODUCT UPDATES</span>
              <h2>Unsubscribe from marketing emails</h2>
              <p>
                This only changes product announcements and Premium offers.
                Important account and billing messages may still be sent.
              </p>
            </div>
            <form action={unsubscribeFromMarketingEmails}>
              <input type="hidden" name="token" value={token} />
              <button className="button button-large" type="submit">
                Unsubscribe
              </button>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}
