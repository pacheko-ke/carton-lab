import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  flutterwaveRequest,
  getFlutterwavePlanId,
  PREMIUM_CURRENCY,
  PREMIUM_PRICE,
} from "@/lib/billing";
import { NextResponse } from "next/server";

type FlutterwaveSubscription = {
  id: number;
  amount: number;
  plan: number | string;
  status: string;
  customer?: {
    customer_email?: string;
    email?: string;
  };
};

type VerifiedTransaction = {
  id: number;
  tx_ref: string;
  amount: number | string;
  currency: string;
  status: string;
  payment_type: string;
  created_at: string;
  customer?: { email?: string };
};

type WebhookPayload = {
  event?: string;
  data?: {
    id?: number;
    status?: string;
    currency?: string;
    plan?: number | string | { id?: number | string };
    customer?: {
      email?: string;
      customer_email?: string;
    };
  };
};

function sameSecretHash(actual: string | null, expected: string) {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function nextMonthlyDate(date: Date) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

async function findFlutterwaveSubscriptions(
  email: string,
  planId: string,
  status: "active" | "cancelled",
) {
  const query = new URLSearchParams({ email, plan: planId, status });
  const subscriptions = await flutterwaveRequest<FlutterwaveSubscription[]>(
    `/subscriptions?${query.toString()}`,
  );
  return subscriptions.filter(
    (subscription) =>
      String(subscription.plan) === planId &&
      subscription.status.toLowerCase() === status &&
      (subscription.customer?.customer_email ?? subscription.customer?.email)
        ?.toLowerCase() === email.toLowerCase(),
  );
}

export async function POST(request: Request) {
  const webhookSecret = process.env.FLW_SECRET_HASH;
  if (!webhookSecret || !process.env.FLW_SECRET_KEY) {
    return NextResponse.json(
      { error: "Flutterwave webhook is not configured." },
      { status: 503 },
    );
  }
  if (!sameSecretHash(request.headers.get("verif-hash"), webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (
    typeof parsedPayload !== "object" ||
    parsedPayload === null ||
    Array.isArray(parsedPayload)
  ) {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  const payload = parsedPayload as WebhookPayload;

  const planId = getFlutterwavePlanId();
  const data = payload.data;
  if (payload.event === "charge.completed" && data?.id) {
    if (data.status !== "successful") {
      return NextResponse.json({ received: true });
    }

    const transaction = await flutterwaveRequest<VerifiedTransaction>(
      `/transactions/${data.id}/verify`,
    );
    const email = transaction.customer?.email;
    if (
      transaction.status !== "successful" ||
      transaction.id !== data.id ||
      transaction.currency !== PREMIUM_CURRENCY ||
      Number(transaction.amount) !== PREMIUM_PRICE ||
      transaction.payment_type !== "card" ||
      !transaction.tx_ref ||
      !email
    ) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const checkout = await prisma.billingCheckout.findUnique({
      where: { txRef: transaction.tx_ref },
      include: { user: true },
    });
    if (checkout && checkout.planId !== planId) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const user =
      checkout?.user ??
      (await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      }));
    if (!user?.emailVerified || user.email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const localSubscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        providerPlanId: planId,
        status: "active",
      },
    });
    if (!checkout && !localSubscription) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const matchingSubscriptions = await findFlutterwaveSubscriptions(
      email,
      planId,
      "active",
    );
    const providerSubscription = matchingSubscriptions.find(
      (subscription) =>
        subscription.amount === PREMIUM_PRICE &&
        Number.isSafeInteger(subscription.id),
    );
    if (!providerSubscription) {
      return NextResponse.json(
        { error: "No active Flutterwave subscription matches the payment." },
        { status: 503 },
      );
    }

    const paidAt = new Date(transaction.created_at);
    if (Number.isNaN(paidAt.getTime())) {
      return NextResponse.json(
        { error: "Flutterwave returned an invalid transaction date." },
        { status: 502 },
      );
    }

    const existing = await prisma.subscription.findUnique({
      where: { providerSubscriptionId: String(providerSubscription.id) },
    });
    if (existing && existing.userId !== user.id) {
      return NextResponse.json(
        { error: "Flutterwave subscription is already linked to another account." },
        { status: 409 },
      );
    }
    if (existing?.providerEventCreatedAt && existing.providerEventCreatedAt >= paidAt) {
      return NextResponse.json({ received: true, stale: true });
    }

    await prisma.subscription.upsert({
      where: { providerSubscriptionId: String(providerSubscription.id) },
      create: {
        userId: user.id,
        providerSubscriptionId: String(providerSubscription.id),
        providerPlanId: planId,
        status: "active",
        currentPeriodEnd: nextMonthlyDate(paidAt),
        providerEventCreatedAt: paidAt,
      },
      update: {
        providerPlanId: planId,
        status: "active",
        currentPeriodEnd: nextMonthlyDate(paidAt),
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: paidAt,
      },
    });

    return NextResponse.json({ received: true });
  }

  if (payload.event === "subscription.cancelled" && data) {
    const email = data.customer?.customer_email ?? data.customer?.email;
    const eventPlanId =
      typeof data.plan === "object" ? data.plan.id : data.plan;
    if (
      !email ||
      String(eventPlanId) !== planId ||
      (data.status && data.status.toLowerCase() !== "deactivated")
    ) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const cancelledSubscriptions = await findFlutterwaveSubscriptions(
      email,
      planId,
      "cancelled",
    );
    for (const subscription of cancelledSubscriptions) {
      await prisma.subscription.updateMany({
        where: {
          providerSubscriptionId: String(subscription.id),
          providerPlanId: planId,
        },
        data: {
          status: "cancelled",
          cancelAtPeriodEnd: true,
          providerEventCreatedAt: new Date(),
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
