import { getVerifiedProductionUser } from "@/lib/production-access";
import { isRecord } from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const [notifications, unreadCount] = await prisma.$transaction([
    prisma.productionNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        jobId: true,
        jobNo: true,
        title: true,
        message: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.productionNotification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);

  return NextResponse.json(
    {
      notifications: notifications.map((notification) => ({
        ...notification,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      })),
      unreadCount,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
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
  if (!isRecord(body) || typeof body.notificationId !== "string" || !body.notificationId) {
    return NextResponse.json({ error: "A notification ID is required" }, { status: 400 });
  }

  const result = await prisma.productionNotification.updateMany({
    where: { id: body.notificationId, userId: user.id },
    data: { readAt: new Date() },
  });
  if (!result.count) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
