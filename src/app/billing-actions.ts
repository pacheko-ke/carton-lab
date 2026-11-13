"use server";

import { randomUUID } from "node:crypto";
import { requireVerifiedUser } from "@/lib/account";
import {
  getCurrentUsdToKesRate,
  getApplicationUrl,
  getPaystackPlanCode,
  hasPremiumAccess,
  isPaystackBillingConfigured,
  MPESA_CURRENCY,
  MPESA_PROVIDER_PLAN_ID,
  paystackRequest,
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

type PaystackPlan = {
  amount: number;
  currency: string;
  interval: string;
  plan_code: string;
};

type PaystackCheckout = {
  authorization_url: string;
};

export async function startPremiumCheckout(formData: FormData) {
  const user = await requireVerifiedUser();
  if (hasPremiumAccess(user.subscriptions, user.premiumAccessGranted)) {
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
    if (!isPaystackBillingConfigured()) {
      throw new Error("Paystack billing is not fully configured.");
    }

    planId = getPaystackPlanCode();
    const plan = await paystackRequest<PaystackPlan>(
      `/plan/${encodeURIComponent(planId)}`,
    );
    if (
      !plan ||
      plan.plan_code !== planId ||
      plan.currency !== PREMIUM_CURRENCY ||
      plan.amount !== PREMIUM_PRICE * 100 ||
      plan.interval !== "monthly"
    ) {
      throw new Error(
        "The configured Paystack plan must be active and charge $5 USD monthly.",
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
  if (paymentMethod === "mpesa") {
    if (!phoneNumber) {
      throw new Error("Enter the M-Pesa phone number to charge.");
    }
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

  const checkout = await paystackRequest<PaystackCheckout>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: String(PREMIUM_PRICE * 100),
        currency: PREMIUM_CURRENCY,
        plan: planId,
        reference: txRef,
        callback_url: `${getApplicationUrl()}/account?billing=checkout-complete`,
        metadata: {
          cartonlabUserId: user.id,
          planCode: planId,
        },
      }),
    },
  );
  if (!checkout?.authorization_url) {
    throw new Error("Paystack did not return a checkout URL.");
  }
  const checkoutUrl = new URL(checkout.authorization_url);
  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "checkout.paystack.com"
  ) {
    throw new Error("Paystack returned an unexpected checkout URL.");
  }

  await prisma.billingCheckout.create({
    data: {
      txRef,
      userId: user.id,
      planId,
      paymentMethod,
      amount,
      currency,
    },
  });
  redirect(checkoutUrl.toString());
}

export async function cancelPremiumSubscription() {
  const user = await requireVerifiedUser();
  const planId = getPaystackPlanCode();
  const subscription = user.subscriptions.find(
    (item) =>
      item.providerPlanId === planId &&
      item.status === "active" &&
      !item.cancelAtPeriodEnd &&
      item.currentPeriodEnd !== null &&
      item.currentPeriodEnd > new Date(),
  );
  if (!subscription) {
    redirect("/account?billing=not-active");
  }
  if (!subscription.providerSubscriptionToken) {
    throw new Error("Paystack subscription cancellation is not available.");
  }

  const cancellation = await paystackRequest<unknown>(
    "/subscription/disable",
    {
      method: "POST",
      body: JSON.stringify({
        code: subscription.providerSubscriptionId,
        token: subscription.providerSubscriptionToken,
      }),
    },
    true,
  );
  if (cancellation === false) {
    throw new Error("Paystack did not confirm the subscription cancellation.");
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "active",
      cancelAtPeriodEnd: true,
      providerEventCreatedAt: new Date(),
    },
  });
  redirect("/account?billing=cancelled");
}
