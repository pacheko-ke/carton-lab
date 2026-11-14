import { Suspense } from "react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/admin";
import { MPESA_PROVIDER_PLAN_ID } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import BrandIcon from "../brand-icon";

const dateFormatter = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
});

function formatDate(value: Date | null) {
  return value ? dateFormatter.format(value) : "—";
}

function formatAmount(amount: number, currency: string) {
  const divisor = currency === "USD" ? 100 : 1;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount / divisor);
}

function formatCheckoutAmount(amount: number, currency: string) {
  const minorAmount = currency === "USD" ? amount * 100 : amount;
  return formatAmount(minorAmount, currency);
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="account-page admin-page" aria-busy="true">
          <div className="admin-content">Loading system metrics…</div>
        </main>
      }
    >
      <AdminDashboard />
    </Suspense>
  );
}

async function AdminDashboard() {
  await requireAdminUser();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const activePeriod = { gt: now };
  const paystackPlanCode = process.env.PAYSTACK_PLAN_CODE;
  const activeStatuses = {
    OR: [
      { status: "active", cancelAtPeriodEnd: false },
      { status: "cancelled", cancelAtPeriodEnd: true },
    ],
  };

  const [
    totalAccounts,
    verifiedAccounts,
    premiumAccounts,
    activePaystackSubscriptions,
    activeMpesaSubscriptions,
    endingSubscriptions,
    attentionSubscriptions,
    pendingCheckouts,
    successfulPayments,
    failedPayments,
    paymentTotals,
    recentPayments,
    recentSubscriptions,
    recentCheckouts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.user.count({
      where: {
        OR: [
          { premiumAccessGranted: true },
          {
            subscriptions: {
              some: {
                ...activeStatuses,
                currentPeriodEnd: activePeriod,
              },
            },
          },
        ],
      },
    }),
    paystackPlanCode
      ? prisma.subscription.count({
          where: {
            providerPlanId: paystackPlanCode,
            status: "active",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: activePeriod,
          },
        })
      : Promise.resolve(0),
    prisma.subscription.count({
      where: {
        providerPlanId: MPESA_PROVIDER_PLAN_ID,
        status: "active",
        currentPeriodEnd: activePeriod,
      },
    }),
    prisma.subscription.count({
      where: {
        ...activeStatuses,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: activePeriod,
      },
    }),
    prisma.subscription.count({ where: { status: "attention" } }),
    prisma.billingCheckout.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.billingPayment.count({
      where: { status: "success", paidAt: { gte: thirtyDaysAgo } },
    }),
    prisma.billingPayment.count({
      where: { status: "failed", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.billingPayment.groupBy({
      by: ["currency"],
      where: { status: "success", paidAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.billingPayment.findMany({
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: {
        provider: true,
        providerTransactionId: true,
        paymentMethod: true,
        status: true,
        amount: true,
        currency: true,
        paidAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.subscription.findMany({
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        providerPlanId: true,
        id: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        updatedAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.billingCheckout.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        txRef: true,
        paymentMethod: true,
        amount: true,
        currency: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  const paymentRevenue = paymentTotals
    .map(
      (total) =>
        `${formatAmount(total._sum.amount ?? 0, total.currency)} (${total._count._all})`,
    )
    .join(" · ") || "No confirmed payments";

  return (
    <main className="account-page admin-page">
      <header className="account-header admin-header">
        <Link href="/" className="brand-lockup" aria-label="CartonLab home">
          <span className="brand-mark">
            <BrandIcon className="brand-mark-image" />
          </span>
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <nav className="account-header-links" aria-label="Admin navigation">
          <Link href="/account" className="account-back-link">
            Account
          </Link>
          <Link href="/app" className="account-back-link">
            Studio
          </Link>
        </nav>
      </header>

      <section className="admin-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> SYSTEM OVERVIEW</span>
          <h1>Metrics dashboard</h1>
          <p>
            Accounts, premium access, billing activity, and recent payment
            events. Revenue and payment counts cover the last 30 days.
          </p>
        </div>

        <section className="admin-metrics" aria-label="Account metrics">
          <Metric label="Accounts" value={totalAccounts} />
          <Metric label="Verified accounts" value={verifiedAccounts} />
          <Metric label="Premium access" value={premiumAccounts} />
          <Metric
            label="Active Paystack subscriptions"
            value={activePaystackSubscriptions}
          />
          <Metric
            label="Active M-Pesa periods"
            value={activeMpesaSubscriptions}
          />
          <Metric
            label="Subscriptions ending"
            value={endingSubscriptions}
          />
          <Metric label="Payment attention" value={attentionSubscriptions} />
          <Metric
            label="Checkouts started (30d)"
            value={pendingCheckouts}
          />
          <Metric
            label="Successful payments (30d)"
            value={successfulPayments}
            detail={
              paymentRevenue === "No confirmed payments"
                ? paymentRevenue
                : `Collected: ${paymentRevenue}`
            }
          />
          <Metric label="Failed payments (30d)" value={failedPayments} />
        </section>

        <section className="admin-panel" aria-labelledby="payments-heading">
          <div className="admin-panel-heading">
            <div>
              <span className="account-plan-kicker">BILLING</span>
              <h2 id="payments-heading">Recent payments</h2>
            </div>
            <span>Successful and failed charges</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Transaction</th>
                  <th scope="col">Paid at</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.providerTransactionId}>
                    <td>
                      {payment.user.name || payment.user.email || "Unknown"}
                      {payment.user.name && payment.user.email && (
                        <small>{payment.user.email}</small>
                      )}
                    </td>
                    <td>{payment.provider} · {payment.paymentMethod}</td>
                    <td>{formatAmount(payment.amount, payment.currency)}</td>
                    <td>
                      <span className={`admin-status is-${payment.status}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="admin-reference">
                      {payment.providerTransactionId}
                    </td>
                    <td>{formatDate(payment.paidAt)}</td>
                  </tr>
                ))}
                {recentPayments.length === 0 && (
                  <tr>
                    <td colSpan={6}>No payment events recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="admin-panel-note">
            Transaction tracking begins after billing-payment migrations are
            deployed. Earlier payments are not available in the current data.
          </p>
        </section>

        <div className="admin-columns">
          <section className="admin-panel" aria-labelledby="subscriptions-heading">
            <div className="admin-panel-heading">
              <div>
                <span className="account-plan-kicker">ACCESS</span>
                <h2 id="subscriptions-heading">Recent subscriptions</h2>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Plan / provider</th>
                    <th scope="col">Status</th>
                    <th scope="col">Period ends</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubscriptions.map((subscription) => (
                    <tr
                      key={subscription.id}
                    >
                      <td>
                        {subscription.user.name ||
                          subscription.user.email ||
                          "Unknown"}
                        {subscription.user.name && subscription.user.email && (
                          <small>{subscription.user.email}</small>
                        )}
                      </td>
                      <td>
                        {subscription.providerPlanId === MPESA_PROVIDER_PLAN_ID
                          ? "M-Pesa"
                          : subscription.providerPlanId === paystackPlanCode
                            ? "Paystack"
                            : "Other"}
                      </td>
                      <td>
                        {subscription.cancelAtPeriodEnd
                          ? "ending"
                          : subscription.status}
                      </td>
                      <td>{formatDate(subscription.currentPeriodEnd)}</td>
                    </tr>
                  ))}
                  {recentSubscriptions.length === 0 && (
                    <tr>
                      <td colSpan={4}>No subscriptions recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel" aria-labelledby="checkouts-heading">
            <div className="admin-panel-heading">
              <div>
                <span className="account-plan-kicker">CHECKOUTS</span>
                <h2 id="checkouts-heading">Recent attempts</h2>
              </div>
              <span>Last 30 days</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Method</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCheckouts.map((checkout) => (
                    <tr key={checkout.txRef}>
                      <td>
                        {checkout.user.name || checkout.user.email || "Unknown"}
                        {checkout.user.name && checkout.user.email && (
                          <small>{checkout.user.email}</small>
                        )}
                      </td>
                      <td>{checkout.paymentMethod}</td>
                      <td>
                        {formatCheckoutAmount(checkout.amount, checkout.currency)}
                      </td>
                      <td>{formatDate(checkout.createdAt)}</td>
                    </tr>
                  ))}
                  {recentCheckouts.length === 0 && (
                    <tr>
                      <td colSpan={4}>No checkout attempts in the last 30 days.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
