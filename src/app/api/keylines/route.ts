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
    select: { emailVerified: true, subscriptions: true },
  });

  if (!user?.emailVerified) {
    return NextResponse.json({ error: "Verified account required" }, { status: 403 });
  }

  const premium = hasPremiumAccess(user.subscriptions);
  return NextResponse.json(
    {
      plan: premium ? "premium" : "free",
      ...createKeylineCatalog(premium),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
