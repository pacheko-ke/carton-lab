"use server";

import { randomUUID } from "node:crypto";
import { requireVerifiedUser } from "@/lib/account";
import {
  flutterwaveRequest,
  getCurrentUsdToKesRate,
  getApplicationUrl,
  getFlutterwavePlanId,
  hasPremiumAccess,
  isFlutterwaveBillingConfigured,
  MPESA_CURRENCY,
  MPESA_PROVIDER_PLAN_ID,
  PREMIUM_CURRENCY,
  PREMIUM_PRICE,
} from "@/lib/billing";
import {
  initiateStkPush,
  isDarajaAvailableForUser,
  normalizeKenyanPhoneNumber,
} from "@/lib/daraja";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type FlutterwavePlan = {
  amount: number;
  currency: string;
  interval: string;
  status: string;
};

type CheckoutResponse = {
  link: string;
};

export async function startPremiumCheckout(formData: FormData) {
  const user = await requireVerifiedUser();
  if (hasPremiumAccess(user.subscriptions)) {
    redirect("/account?billing=already-premium");
  }
  if (!user.email) {
    throw new Error("A verified email address is required for billing.");
  }

  const paymentMethod = formData.get("paymentMethod");
  if (paymentMethod !== "card" && paymentMethod !== "mpesa") {
    throw new Error("Choose a supported Premium payment method.");
  }

  let planId: string;
  let amount: number;
  let currency: string;
  let exchangeRate: number | undefined;
  let rateDate: Date | undefined;
  let phoneNumber: string | undefined;

  if (paymentMethod === "card") {
    if (!isFlutterwaveBillingConfigured()) {
      throw new Error("Flutterwave card billing is not fully configured.");
    }

    planId = getFlutterwavePlanId();
    const plan = await flutterwaveRequest<FlutterwavePlan>(
      `/payment-plans/${planId}`,
    );
    if (
      plan.status !== "active" ||
      plan.currency !== PREMIUM_CURRENCY ||
      plan.amount !== PREMIUM_PRICE ||
      plan.interval !== "monthly"
    ) {
      throw new Error(
        "The configured Flutterwave plan must be active and charge $5 USD monthly.",
      );
    }
    amount = PREMIUM_PRICE;
    currency = PREMIUM_CURRENCY;
  } else {
    if (!isDarajaAvailableForUser(user.email)) {
      throw new Error("Daraja M-Pesa billing is not fully configured.");
    }
    phoneNumber = normalizeKenyanPhoneNumber(formData.get("phoneNumber"));
    const quote = await getCurrentUsdToKesRate();
    planId = MPESA_PROVIDER_PLAN_ID;
    amount = quote.amountKes;
    currency = MPESA_CURRENCY;
    exchangeRate = quote.rate;
    rateDate = quote.rateDate;
  }

  const txRef = `cartonlab-${user.id}-${randomUUID()}`;
  await prisma.billingCheckout.create({
    data: {
      txRef,
      userId: user.id,
      planId,
      paymentMethod,
      amount,
      currency,
      exchangeRate,
      rateDate,
      phoneNumber,
    },
  });

  if (paymentMethod === "mpesa") {
    if (!phoneNumber) {
      throw new Error("Enter the M-Pesa phone number to charge.");
    }
    const stkPush = await initiateStkPush({
      phoneNumber,
      amount,
      accountReference: "CartonLab",
    });
    await prisma.billingCheckout.update({
      where: { txRef },
      data: {
        providerCheckoutRequestId: stkPush.checkoutRequestId,
        providerMerchantRequestId: stkPush.merchantRequestId,
      },
    });
    redirect("/account?billing=mpesa-prompt-sent");
  }

  const checkout = await flutterwaveRequest<CheckoutResponse>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency,
      payment_options: "card",
      payment_plan: Number(planId),
      redirect_url: `${getApplicationUrl()}/account?billing=checkout-complete`,
      customer: {
        email: user.email,
        name: user.name ?? undefined,
      },
      meta: {
        cartonlabUserId: user.id,
        ...(exchangeRate === undefined ? {} : { usdKesRate: exchangeRate }),
      },
      customizations: {
        title: "CartonLab Premium",
        description: "Premium access — $5 USD per month",
      },
    }),
  });

  const validatedUrl = new URL(checkout.link);
  if (
    validatedUrl.protocol !== "https:" ||
    validatedUrl.hostname !== "checkout.flutterwave.com"
  ) {
    throw new Error("Flutterwave returned an unexpected checkout URL.");
  }
  const checkoutUrl = validatedUrl.toString();
  redirect(checkoutUrl);
}

export async function cancelPremiumSubscription() {
  const user = await requireVerifiedUser();
  const planId = process.env.FLW_PAYMENT_PLAN_ID;
  if (!planId) {
    throw new Error("FLW_PAYMENT_PLAN_ID is not configured.");
  }

  const subscription = user.subscriptions.find(
    (item) =>
      item.providerPlanId === planId &&
      item.status === "active" &&
      item.currentPeriodEnd !== null &&
      item.currentPeriodEnd > new Date(),
  );
  if (!subscription) {
    redirect("/account?billing=not-active");
  }

  const cancellation = await flutterwaveRequest<{ status: string }>(
    `/subscriptions/${subscription.providerSubscriptionId}/cancel`,
    { method: "PUT" },
  );
  if (!["cancelled", "deactivated"].includes(cancellation.status.toLowerCase())) {
    throw new Error("Flutterwave did not confirm the subscription cancellation.");
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "cancelled",
      cancelAtPeriodEnd: true,
      providerEventCreatedAt: new Date(),
    },
  });
  redirect("/account?billing=cancelled");
}
