import { NextResponse } from "next/server";
import { MPESA_CURRENCY, MPESA_PROVIDER_PLAN_ID, PREMIUM_PRICE } from "@/lib/billing";
import {
  isDarajaAvailableForUser,
  queryStkPush,
} from "@/lib/daraja";
import { prisma } from "@/lib/prisma";

type StkCallback = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: number | string;
  CallbackMetadata?: {
    Item?: Array<{ Name?: string; Value?: number | string }>;
  };
};

type DarajaCallbackPayload = {
  Body?: {
    stkCallback?: StkCallback;
  };
};

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

function metadataValue(callback: StkCallback, name: string) {
  const items = callback.CallbackMetadata?.Item;
  if (!Array.isArray(items)) return undefined;
  const item = items.find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "Name" in value &&
      value.Name === name,
  );
  return item && "Value" in item ? item.Value : undefined;
}

function parseDarajaDate(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const digits = String(value ?? "");
  if (!/^\d{14}$/.test(digits)) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const second = Number(digits.slice(12, 14));
  const utcMillis = Date.UTC(year, month - 1, day, hour - 3, minute, second);
  const date = new Date(utcMillis);
  const localMillis = utcMillis + 3 * 60 * 60 * 1000;
  const localDate = new Date(localMillis);
  if (
    Number.isNaN(date.getTime()) ||
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date;
}

export async function POST(request: Request) {
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
  const callback = (parsedPayload as DarajaCallbackPayload).Body?.stkCallback;
  if (
    !callback?.CheckoutRequestID ||
    !callback.MerchantRequestID ||
    callback.ResultCode === undefined
  ) {
    return NextResponse.json({ error: "Invalid Daraja callback." }, { status: 400 });
  }

  const checkout = await prisma.billingCheckout.findUnique({
    where: { providerCheckoutRequestId: callback.CheckoutRequestID },
    include: { user: true },
  });
  if (
    !checkout ||
    checkout.paymentMethod !== "mpesa" ||
    checkout.planId !== MPESA_PROVIDER_PLAN_ID ||
    checkout.providerMerchantRequestId !== callback.MerchantRequestID
  ) {
    return NextResponse.json(
      { error: "No matching M-Pesa checkout was found." },
      { status: 404 },
    );
  }
  if (!isDarajaAvailableForUser(checkout.user.email)) {
    return NextResponse.json(
      { error: "Daraja callback verification is not configured for this checkout." },
      { status: 503 },
    );
  }

  const query = await queryStkPush({
    checkoutRequestId: callback.CheckoutRequestID,
  });
  if (
    String(query.ResponseCode) !== "0" ||
    query.CheckoutRequestID !== callback.CheckoutRequestID ||
    query.MerchantRequestID !== callback.MerchantRequestID
  ) {
    return NextResponse.json(
      { error: "Daraja could not verify the M-Pesa checkout." },
      { status: 503 },
    );
  }
  if (
    query.ResultCode === undefined ||
    String(query.ResultCode) !== String(callback.ResultCode)
  ) {
    return NextResponse.json(
      { error: "Daraja has not confirmed the final M-Pesa result yet." },
      { status: 503 },
    );
  }
  if (String(query.ResultCode) !== "0") {
    const providerTransactionId = `daraja-failed-${checkout.txRef}`;
    await prisma.billingPayment.upsert({
      where: { providerTransactionId },
      create: {
        userId: checkout.user.id,
        provider: "daraja",
        providerTransactionId,
        reference: checkout.txRef,
        paymentMethod: "mpesa",
        status: "failed",
        amount: checkout.amount,
        currency: checkout.currency,
      },
      update: {
        status: "failed",
        amount: checkout.amount,
        currency: checkout.currency,
        paidAt: null,
      },
    });
    await prisma.billingCheckout.deleteMany({
      where: { txRef: checkout.txRef },
    });
    return NextResponse.json({ received: true, successful: false });
  }

  const receiptNumber = metadataValue(callback, "MpesaReceiptNumber");
  const amount = metadataValue(callback, "Amount");
  const phoneNumber = metadataValue(callback, "PhoneNumber");
  const paidAt = parseDarajaDate(
    metadataValue(callback, "TransactionDate"),
  );
  if (
    typeof receiptNumber !== "string" ||
    !receiptNumber ||
    Number(amount) !== checkout.amount ||
    checkout.currency !== MPESA_CURRENCY ||
    checkout.exchangeRate === null ||
    checkout.rateDate === null ||
    !Number.isFinite(checkout.exchangeRate) ||
    checkout.exchangeRate <= 0 ||
    Math.round(PREMIUM_PRICE * checkout.exchangeRate) !== checkout.amount ||
    Date.now() - checkout.rateDate.getTime() > 7 * 24 * 60 * 60 * 1000 ||
    checkout.rateDate.getTime() > Date.now() ||
    checkout.phoneNumber !== String(phoneNumber) ||
    !paidAt ||
    !checkout.user.emailVerified
  ) {
    return NextResponse.json(
      { error: "The Daraja payment details did not match the checkout." },
      { status: 400 },
    );
  }

  const providerTransactionId = `daraja-${receiptNumber}`;
  const existing = await prisma.subscription.findUnique({
    where: { providerSubscriptionId: providerTransactionId },
  });
  const existingPayment = await prisma.billingPayment.findUnique({
    where: { providerTransactionId },
  });
  if (
    (existing && existing.userId !== checkout.user.id) ||
    (existingPayment && existingPayment.userId !== checkout.user.id)
  ) {
    return NextResponse.json(
      { error: "The M-Pesa receipt is already linked to another account." },
      { status: 409 },
    );
  }
  await prisma.billingPayment.upsert({
    where: { providerTransactionId },
    create: {
      userId: checkout.user.id,
      provider: "daraja",
      providerTransactionId,
      reference: checkout.txRef,
      paymentMethod: "mpesa",
      status: "success",
      amount: checkout.amount,
      currency: checkout.currency,
      paidAt,
    },
    update: {
      status: "success",
      amount: checkout.amount,
      currency: checkout.currency,
      paidAt,
    },
  });
  if (existing?.providerEventCreatedAt && existing.providerEventCreatedAt >= paidAt) {
    await prisma.billingCheckout.deleteMany({ where: { txRef: checkout.txRef } });
    return NextResponse.json({ received: true, duplicate: true });
  }

  const currentAccess = await prisma.subscription.findFirst({
    where: {
      userId: checkout.user.id,
      status: "active",
      currentPeriodEnd: { gt: paidAt },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });
  const periodStart =
    currentAccess?.currentPeriodEnd && currentAccess.currentPeriodEnd > paidAt
      ? currentAccess.currentPeriodEnd
      : paidAt;

  await prisma.subscription.upsert({
    where: { providerSubscriptionId: providerTransactionId },
    create: {
      userId: checkout.user.id,
      providerSubscriptionId: providerTransactionId,
      providerPlanId: MPESA_PROVIDER_PLAN_ID,
      status: "active",
      currentPeriodEnd: nextMonthlyDate(periodStart),
      providerEventCreatedAt: paidAt,
    },
    update: {
      providerPlanId: MPESA_PROVIDER_PLAN_ID,
      status: "active",
      currentPeriodEnd: nextMonthlyDate(periodStart),
      cancelAtPeriodEnd: false,
      providerEventCreatedAt: paidAt,
    },
  });
  await prisma.billingCheckout.deleteMany({ where: { txRef: checkout.txRef } });

  return NextResponse.json({ received: true, successful: true });
}
