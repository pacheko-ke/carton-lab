import { createHmac, timingSafeEqual } from "node:crypto";
import type { Subscription } from "@prisma/client";

export const PREMIUM_PRICE = 5;
export const PREMIUM_CURRENCY = "USD";
export const PREMIUM_TRIAL_DAYS = 7;
export const MPESA_PROVIDER_PLAN_ID = "mpesa-monthly";
export const MPESA_CURRENCY = "KES";

export function isPaystackBillingConfigured() {
  return Boolean(
    process.env.PAYSTACK_SECRET_KEY &&
      process.env.PAYSTACK_PLAN_CODE,
  );
}

export function getPaystackPlanCode() {
  const planCode = process.env.PAYSTACK_PLAN_CODE;
  if (!planCode || !/^PLN_[A-Za-z0-9]+$/.test(planCode)) {
    throw new Error("PAYSTACK_PLAN_CODE must be a valid Paystack plan code.");
  }
  return planCode;
}

type PremiumSubscription = Pick<
  Subscription,
  | "providerPlanId"
  | "status"
  | "currentPeriodEnd"
  | "cancelAtPeriodEnd"
>;

export function hasPremiumSubscriptionAccess(
  subscriptions: readonly PremiumSubscription[],
  premiumAccessGranted = false,
  now = new Date(),
) {
  if (premiumAccessGranted) return true;
  const planCode = process.env.PAYSTACK_PLAN_CODE;
  return subscriptions.some(
    (subscription) =>
      ((Boolean(planCode) && subscription.providerPlanId === planCode) ||
        subscription.providerPlanId === MPESA_PROVIDER_PLAN_ID) &&
      (subscription.status === "active" ||
        (subscription.status === "cancelled" &&
          subscription.cancelAtPeriodEnd)) &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd > now,
  );
}

export function hasPremiumAccess(
  subscriptions: readonly PremiumSubscription[],
  premiumAccessGranted = false,
  trialEndsAt: Date | null = null,
  now = new Date(),
) {
  return (
    hasPremiumSubscriptionAccess(subscriptions, premiumAccessGranted, now) ||
    (trialEndsAt !== null && trialEndsAt > now)
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

type PaystackEnvelope<T> = {
  status?: boolean;
  message?: string;
  data?: T;
};

export async function paystackRequest<T>(
  path: string,
  options: RequestInit = {},
  allowEmptyData = false,
): Promise<T | undefined> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  const result = (await response.json()) as PaystackEnvelope<T>;
  if (
    !response.ok ||
    result.status !== true ||
    (!allowEmptyData && result.data === undefined)
  ) {
    throw new Error(
      `Paystack request failed (${response.status}): ${result.message ?? "Unexpected response."}`,
    );
  }
  return result.data;
}

export function isValidPaystackWebhookSignature(
  rawBody: Buffer,
  paystackSignature: string | null,
  legacySignature: string | null,
) {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (webhookSecret && paystackSignature) {
    let timestamp: number | undefined;
    const signatures: string[] = [];
    for (const part of paystackSignature.split(",")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key === "t") {
        if (timestamp !== undefined || !/^\d+$/.test(value)) {
          timestamp = NaN;
          break;
        }
        timestamp = Number(value);
      } else if (key === "v1") {
        const colon = value.indexOf(":");
        if (colon >= 0) signatures.push(value.slice(colon + 1));
      }
    }

    if (
      timestamp !== undefined &&
      Number.isFinite(timestamp) &&
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) <= 300
    ) {
      const expected = createHmac("sha512", webhookSecret)
        .update(`${timestamp}.`)
        .update(rawBody)
        .digest();
      if (
        signatures.some((signature) => {
          if (!/^[0-9a-f]{128}$/.test(signature)) return false;
          return timingSafeEqual(expected, Buffer.from(signature, "hex"));
        })
      ) {
        return true;
      }
    }
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (
    !secretKey ||
    !legacySignature ||
    !/^[0-9a-f]{128}$/.test(legacySignature)
  ) {
    return false;
  }
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(legacySignature, "hex"));
}
