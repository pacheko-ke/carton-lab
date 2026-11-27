import { auth } from "@/auth";
import {
  hasPremiumAccess,
  hasPremiumSubscriptionAccess,
} from "@/lib/billing";
import { hasAccessPermission } from "@/lib/access-control";
import { getEffectiveBillingSource } from "@/lib/company-billing";
import { createKeylineCatalog } from "@/lib/keyline-catalog";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      emailVerified: true,
      premiumAccessGranted: true,
      trialEndsAt: true,
      subscriptions: true,
      companyMembership: {
        select: {
          companyId: true,
          company: {
            select: {
              premiumAccessGranted: true,
              trialEndsAt: true,
              subscriptions: true,
            },
          },
        },
      },
    },
  });

  if (!user?.emailVerified || !user.companyMembership) {
    return NextResponse.json({ error: "Verified account required" }, { status: 403 });
  }
  if (!(await hasAccessPermission(session.user.id, "keylines.use"))) {
    return NextResponse.json({ error: "Keyline access is not assigned to this account" }, { status: 403 });
  }

  const now = new Date();
  const billing = getEffectiveBillingSource(user);
  const premium = hasPremiumAccess(
    billing.subscriptions,
    billing.premiumAccessGranted,
    billing.trialEndsAt,
    now,
  );
  const trialActive =
    !hasPremiumSubscriptionAccess(
      billing.subscriptions,
      billing.premiumAccessGranted,
      now,
    ) &&
    billing.trialEndsAt !== null &&
    billing.trialEndsAt > now;
  return NextResponse.json(
    {
      plan: premium ? "premium" : "free",
      trialActive,
      trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
      ...createKeylineCatalog(premium),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
