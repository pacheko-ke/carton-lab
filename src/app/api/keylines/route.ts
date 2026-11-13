import { auth } from "@/auth";
import { hasPremiumAccess } from "@/lib/billing";
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
    },
  });

  if (!user?.emailVerified) {
    return NextResponse.json({ error: "Verified account required" }, { status: 403 });
  }

  const premium = hasPremiumAccess(
    user.subscriptions,
    user.premiumAccessGranted,
    user.trialEndsAt,
  );
  return NextResponse.json(
    {
      plan: premium ? "premium" : "free",
      trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      ...createKeylineCatalog(premium),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
