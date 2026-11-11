import type { Subscription } from "@prisma/client";

export const PREMIUM_PRICE = 5;
export const PREMIUM_CURRENCY = "USD";
export const MPESA_PROVIDER_PLAN_ID = "mpesa-monthly";
export const MPESA_CURRENCY = "KES";

export function isFlutterwaveBillingConfigured() {
  return Boolean(
    process.env.FLW_SECRET_KEY &&
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
  return subscriptions.some(
    (subscription) =>
      ((Boolean(planId) && subscription.providerPlanId === planId) ||
        subscription.providerPlanId === MPESA_PROVIDER_PLAN_ID) &&
      (subscription.status === "active" ||
        (subscription.status === "cancelled" &&
          subscription.cancelAtPeriodEnd)) &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd > now,
  );
}

export async function getCurrentUsdToKesRate() {
  const response = await fetch("https://api.frankfurter.dev/v2/rate/usd/kes", {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Could not fetch the current USD/KES rate (${response.status}).`);
  }

  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("base" in result) ||
    !("quote" in result) ||
    !("rate" in result) ||
    !("date" in result) ||
    result.base !== "USD" ||
    result.quote !== MPESA_CURRENCY ||
    typeof result.rate !== "number" ||
    !Number.isFinite(result.rate) ||
    result.rate <= 0 ||
    typeof result.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(result.date)
  ) {
    throw new Error("The USD/KES rate service returned invalid data.");
  }

  const rateDate = new Date(`${result.date}T00:00:00Z`);
  const ageInDays =
    (Date.now() - rateDate.getTime()) / (24 * 60 * 60 * 1000);
  if (
    Number.isNaN(rateDate.getTime()) ||
    rateDate.toISOString().slice(0, 10) !== result.date ||
    ageInDays < 0 ||
    ageInDays > 7
  ) {
    throw new Error("The USD/KES rate is stale or has an invalid date.");
  }

  const amountKes = Math.round(PREMIUM_PRICE * result.rate);
  if (!Number.isSafeInteger(amountKes) || amountKes < 1) {
    throw new Error("The USD/KES conversion produced an invalid payment amount.");
  }

  return { rate: result.rate, rateDate, amountKes };
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
