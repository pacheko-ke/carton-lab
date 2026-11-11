import type { Subscription } from "@prisma/client";

export const PREMIUM_PRICE = 5;
export const PREMIUM_CURRENCY = "USD";

export function isFlutterwaveBillingConfigured() {
  return Boolean(
    process.env.FLW_SECRET_KEY &&
      process.env.FLW_PUBLIC_KEY &&
      process.env.FLW_PAYMENT_PLAN_ID &&
      process.env.FLW_SECRET_HASH,
  );
}

export function getFlutterwavePlanId() {
  const planId = process.env.FLW_PAYMENT_PLAN_ID;
  if (
    !planId ||
    !/^[1-9]\d*$/.test(planId) ||
    Number(planId) > 2_147_483_647
  ) {
    throw new Error("FLW_PAYMENT_PLAN_ID must be a positive 32-bit integer.");
  }
  return planId;
}

export function hasPremiumAccess(
  subscriptions: readonly Pick<
    Subscription,
    | "providerPlanId"
    | "status"
    | "currentPeriodEnd"
    | "cancelAtPeriodEnd"
  >[],
  now = new Date(),
) {
  const planId = process.env.FLW_PAYMENT_PLAN_ID;
  if (!planId) return false;

  return subscriptions.some(
    (subscription) =>
      subscription.providerPlanId === planId &&
      (subscription.status === "active" ||
        (subscription.status === "cancelled" &&
          subscription.cancelAtPeriodEnd)) &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd > now,
  );
}

export function getApplicationUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

type FlutterwaveEnvelope<T> = {
  status?: string;
  message?: string;
  data?: T;
};

export async function flutterwaveRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) {
    throw new Error("FLW_SECRET_KEY is not configured.");
  }

  const response = await fetch(`https://api.flutterwave.com/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  const result = (await response.json()) as FlutterwaveEnvelope<T>;
  if (!response.ok || result.status !== "success" || result.data === undefined) {
    throw new Error(
      `Flutterwave request failed (${response.status}): ${result.message ?? "Unexpected response."}`,
    );
  }
  return result.data;
}
