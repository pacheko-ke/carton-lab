"use server";

import { randomUUID } from "node:crypto";
import { requireVerifiedUser } from "@/lib/account";
import {
  flutterwaveRequest,
  getApplicationUrl,
  getFlutterwavePlanId,
  hasPremiumAccess,
  isFlutterwaveBillingConfigured,
  PREMIUM_CURRENCY,
  PREMIUM_PRICE,
} from "@/lib/billing";
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

export async function startPremiumCheckout() {
  const user = await requireVerifiedUser();
  if (hasPremiumAccess(user.subscriptions)) {
    redirect("/account?billing=already-premium");
  }
  if (!isFlutterwaveBillingConfigured()) {
    throw new Error("Flutterwave billing is not fully configured.");
  }
  if (!user.email) {
    throw new Error("A verified email address is required for billing.");
  }

  const planId = getFlutterwavePlanId();
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

  const txRef = `cartonlab-${user.id}-${randomUUID()}`;
  const checkout = await flutterwaveRequest<CheckoutResponse>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: txRef,
      amount: PREMIUM_PRICE,
      currency: PREMIUM_CURRENCY,
      payment_options: "card",
      payment_plan: Number(planId),
      redirect_url: `${getApplicationUrl()}/account?billing=checkout-complete`,
      customer: {
        email: user.email,
        name: user.name ?? undefined,
      },
      meta: { cartonlabUserId: user.id },
      customizations: {
        title: "CartonLab Premium",
        description: "Premium access — $5 USD per month",
      },
    }),
  });

  const checkoutUrl = new URL(checkout.link);
  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "checkout.flutterwave.com"
  ) {
    throw new Error("Flutterwave returned an unexpected checkout URL.");
  }

  await prisma.billingCheckout.create({
    data: { txRef, userId: user.id, planId },
  });
  redirect(checkoutUrl.toString());
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
  if (cancellation.status.toLowerCase() !== "cancelled") {
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
