"use server";

import { randomUUID } from "node:crypto";
import { requireVerifiedUser } from "@/lib/account";
import {
  getApplicationUrl,
  getPaystackPlanCode,
  hasPremiumAccess,
  isPaystackBillingConfigured,
  paystackRequest,
  PREMIUM_CURRENCY,
  PREMIUM_PRICE,
} from "@/lib/billing";
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
  if (paymentMethod !== "card") {
    redirect("/account?billing=mpesa-unavailable");
  }
  if (!isPaystackBillingConfigured()) {
    throw new Error("Paystack billing is not fully configured.");
  }

  const planId = getPaystackPlanCode();
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
    redirect("/account?billing=plan-mismatch");
  }

  const txRef = `cartonlab-${user.id}-${randomUUID()}`;
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
      paymentMethod: "card",
      amount: PREMIUM_PRICE,
      currency: PREMIUM_CURRENCY,
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
