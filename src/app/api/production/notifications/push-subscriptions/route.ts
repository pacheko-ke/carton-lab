import { getVerifiedProductionUser } from "@/lib/production-access";
import { isRecord } from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function isValidPushSubscription(value: unknown): value is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  if (!isRecord(value) || typeof value.endpoint !== "string" || value.endpoint.length > 2048) {
    return false;
  }
  if (!isRecord(value.keys)) return false;
  if (
    typeof value.keys.p256dh !== "string" ||
    value.keys.p256dh.length < 20 ||
    value.keys.p256dh.length > 256 ||
    typeof value.keys.auth !== "string" ||
    value.keys.auth.length < 8 ||
    value.keys.auth.length > 128
  ) {
    return false;
  }

  try {
    const endpoint = new URL(value.endpoint);
    const hostname = endpoint.hostname.toLowerCase();
    const isKnownPushService =
      hostname === "fcm.googleapis.com" ||
      hostname.endsWith(".push.services.mozilla.com") ||
      hostname.endsWith(".notify.windows.com") ||
      hostname.endsWith(".push.apple.com");
    return endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      (!endpoint.port || endpoint.port === "443") &&
      isKnownPushService;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isValidPushSubscription(body)) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const existing = await prisma.productionPushSubscription.findUnique({
    where: { endpoint: body.endpoint },
    select: { id: true, userId: true },
  });
  if (existing && existing.userId !== user.id) {
    return NextResponse.json(
      { error: "This push subscription belongs to another account" },
      { status: 409 },
    );
  }
  if (existing) {
    await prisma.productionPushSubscription.update({
      where: { id: existing.id },
      data: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
  } else {
    try {
      await prisma.productionPushSubscription.create({
        data: {
          userId: user.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        },
      });
    } catch (error) {
      if (isRecord(error) && error.code === "P2002") {
        return NextResponse.json(
          { error: "This push subscription was registered concurrently. Try again." },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.endpoint !== "string" || body.endpoint.length > 2048) {
    return NextResponse.json({ error: "Invalid push subscription endpoint" }, { status: 400 });
  }

  await prisma.productionPushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: user.id },
  });
  return new NextResponse(null, { status: 204 });
}
