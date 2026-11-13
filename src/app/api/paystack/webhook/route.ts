import { isValidPaystackWebhookSignature, paystackRequest } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type PaystackSubscription = {
  amount: number;
  customer: { email: string };
  email_token: string;
  next_payment_date: string | null;
  plan: {
    amount: number;
    currency: string;
    interval: string;
    plan_code: string;
  };
  status: string;
  subscription_code: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function subscriptionCode(data: Record<string, unknown>) {
  const nested = isRecord(data.subscription) ? data.subscription : undefined;
  return (
    readString(data.subscription_code) ??
    (nested ? readString(nested.subscription_code) : undefined)
  );
}

function eventDate(data: Record<string, unknown>) {
  const value =
    readString(data.created_at) ??
    readString(data.createdAt) ??
    readString(data.paid_at);
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isExpectedPlan(subscription: PaystackSubscription, planCode: string) {
  return (
    subscription.subscription_code.length > 0 &&
    subscription.plan.plan_code === planCode &&
    subscription.plan.amount === 500 &&
    subscription.amount === 500 &&
    subscription.plan.currency === "USD" &&
    subscription.plan.interval === "monthly"
  );
}

function parseNextPaymentDate(subscription: PaystackSubscription) {
  if (!subscription.next_payment_date) return undefined;
  const date = new Date(subscription.next_payment_date);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function createLocalSubscription(
  data: Record<string, unknown>,
  planCode: string,
) {
  const code = subscriptionCode(data);
  if (!code) return;

  const providerSubscription = await paystackRequest<PaystackSubscription>(
    `/subscription/${encodeURIComponent(code)}`,
  );
  if (!providerSubscription) {
    throw new Error("Paystack returned no subscription details.");
  }
  const existing = await prisma.subscription.findUnique({
    where: { providerSubscriptionId: code },
    include: { user: true },
  });
  if (
    !isExpectedPlan(providerSubscription, planCode) ||
    (existing &&
      existing.user.email?.toLowerCase() !==
        providerSubscription.customer.email.toLowerCase())
  ) {
    return;
  }

  const checkout = existing
    ? null
    : await prisma.billingCheckout.findFirst({
      where: {
        paymentMethod: "card",
        planId: planCode,
        amount: 5,
        currency: "USD",
        createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
        user: {
          email: {
            equals: providerSubscription.customer.email,
            mode: "insensitive",
          },
          emailVerified: { not: null },
        },
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
  const user = existing?.user ?? checkout?.user;

  const currentPeriodEnd = parseNextPaymentDate(providerSubscription);
  if (
    !user?.emailVerified ||
    user.email?.toLowerCase() !==
      providerSubscription.customer.email.toLowerCase() ||
    !currentPeriodEnd ||
    (providerSubscription.status !== "active" &&
      providerSubscription.status !== "non-renewing")
  ) {
    return;
  }

  const updatedAt = eventDate(data);
  if (existing?.providerEventCreatedAt && existing.providerEventCreatedAt >= updatedAt) {
    return;
  }

  await prisma.subscription.upsert({
    where: { providerSubscriptionId: code },
    create: {
      userId: user.id,
      providerSubscriptionId: code,
      providerSubscriptionToken: providerSubscription.email_token,
      providerPlanId: planCode,
      status: "active",
      currentPeriodEnd,
      cancelAtPeriodEnd: providerSubscription.status === "non-renewing",
      providerEventCreatedAt: updatedAt,
    },
    update: {
      providerSubscriptionToken: providerSubscription.email_token,
      providerPlanId: planCode,
      status: "active",
      currentPeriodEnd,
      cancelAtPeriodEnd: providerSubscription.status === "non-renewing",
      providerEventCreatedAt: updatedAt,
    },
  });

  if (checkout) {
    await prisma.billingCheckout.deleteMany({
      where: { txRef: checkout.txRef },
    });
  }
}

async function updateLocalSubscription(
  event: string,
  data: Record<string, unknown>,
  planCode: string,
) {
  const code = subscriptionCode(data);
  if (!code) return;

  const existing = await prisma.subscription.findUnique({
    where: { providerSubscriptionId: code },
    include: { user: true },
  });
  if (!existing || existing.providerPlanId !== planCode) return;

  const updatedAt = eventDate(data);
  if (existing.providerEventCreatedAt && existing.providerEventCreatedAt >= updatedAt) {
    return;
  }

  const providerSubscription = await paystackRequest<PaystackSubscription>(
    `/subscription/${encodeURIComponent(code)}`,
  );
  if (!providerSubscription) {
    throw new Error("Paystack returned no subscription details.");
  }
  if (
    !isExpectedPlan(providerSubscription, planCode) ||
    existing.user.email?.toLowerCase() !==
      providerSubscription.customer.email.toLowerCase()
  ) {
    return;
  }

  const currentPeriodEnd =
    parseNextPaymentDate(providerSubscription) ?? existing.currentPeriodEnd;
  if (!currentPeriodEnd) return;

  if (event === "invoice.update") {
    if (data.status !== "success" && data.paid !== true && data.paid !== 1) return;
    const isNonRenewing = providerSubscription.status === "non-renewing";
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "active",
        currentPeriodEnd,
        cancelAtPeriodEnd: isNonRenewing,
        providerEventCreatedAt: updatedAt,
      },
    });
    return;
  }

  if (event === "invoice.payment_failed") {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "attention",
        providerEventCreatedAt: updatedAt,
      },
    });
    return;
  }

  if (event === "subscription.not_renew") {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "active",
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
        providerEventCreatedAt: updatedAt,
      },
    });
    return;
  }

  if (event === "subscription.disable") {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "cancelled",
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
        providerEventCreatedAt: updatedAt,
      },
    });
  }
}

export async function POST(request: Request) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json(
      { error: "Paystack webhook is not configured." },
      { status: 503 },
    );
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  if (
    !isValidPaystackWebhookSignature(
      rawBody,
      request.headers.get("paystack-signature"),
      request.headers.get("x-paystack-signature"),
    )
  ) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!isRecord(payload) || typeof payload.event !== "string") {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (!isRecord(payload.data)) {
    const subscriptionEvents = [
      "subscription.create",
      "invoice.update",
      "invoice.payment_failed",
      "subscription.not_renew",
      "subscription.disable",
    ];
    if (subscriptionEvents.includes(payload.event)) {
      return NextResponse.json(
        { error: "Invalid webhook payload." },
        { status: 400 },
      );
    }
    return NextResponse.json({ received: true });
  }

  const planCode = process.env.PAYSTACK_PLAN_CODE;
  if (!planCode) {
    return NextResponse.json(
      { error: "Paystack billing is not configured." },
      { status: 503 },
    );
  }
  if (payload.event === "subscription.create") {
    await createLocalSubscription(payload.data, planCode);
  } else if (
    payload.event === "invoice.update" ||
    payload.event === "invoice.payment_failed" ||
    payload.event === "subscription.not_renew" ||
    payload.event === "subscription.disable"
  ) {
    await updateLocalSubscription(payload.event, payload.data, planCode);
  }

  return NextResponse.json({ received: true });
}
