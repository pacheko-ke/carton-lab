import { canBookProductionOrders } from "@/lib/production-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
  isProductionDesigner,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; itemId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const { workspaceId, itemId } = await params;
  const isAdmin = isProductionAdmin(user);
  if (!isAdmin && await isProductionDesigner(user.id)) {
    return NextResponse.json({ error: "Designer access is limited to Origination" }, { status: 403 });
  }
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (!isAdmin && !canBookProductionOrders(membership.role)) {
    return NextResponse.json({ error: "Order Booker role required" }, { status: 403 });
  }

  const item = await prisma.productionItem.findFirst({
    where: { id: itemId, workspaceId },
    select: { id: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Product not found in this workspace" }, { status: 404 });
  }

  const attachments = await prisma.productionAttachment.findMany({
    where: { itemId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      originalName: true,
      contentType: true,
      size: true,
      version: true,
      revisionComment: true,
      createdAt: true,
    },
  });
  return NextResponse.json(
    { attachments },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
