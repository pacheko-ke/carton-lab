import type { Subscription } from "@prisma/client";

type BillingSource = {
  subscriptions: readonly Subscription[];
  premiumAccessGranted: boolean;
  trialEndsAt: Date | null;
  companyMembership?: {
    company: {
      subscriptions: readonly Subscription[];
      premiumAccessGranted: boolean;
      trialEndsAt: Date | null;
    };
  } | null;
};

export function getEffectiveBillingSource(source: BillingSource) {
  const company = source.companyMembership?.company;
  const subscriptions = new Map<string, Subscription>();
  for (const subscription of [
    ...source.subscriptions,
    ...(company?.subscriptions ?? []),
  ]) {
    subscriptions.set(subscription.id, subscription);
  }
  const trialEndsAt = [source.trialEndsAt, company?.trialEndsAt ?? null]
    .filter((date): date is Date => date !== null)
    .sort((first, second) => second.getTime() - first.getTime())[0] ?? null;

  return {
    subscriptions: [...subscriptions.values()],
    premiumAccessGranted:
      source.premiumAccessGranted || company?.premiumAccessGranted === true,
    trialEndsAt,
  };
}
