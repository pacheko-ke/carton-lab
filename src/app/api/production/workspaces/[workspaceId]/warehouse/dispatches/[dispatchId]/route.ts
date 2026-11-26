import { getProductionWorkspaceMembership, getVerifiedProductionUser, isProductionAdmin } from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionDelivery } from "@/lib/production-warehouse-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; dispatchId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, dispatchId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionDelivery(body)) {
    return NextResponse.json({ error: "A recipient name is required to confirm delivery" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.productionDispatch.updateMany({
      where: { id: dispatchId, workspaceId, status: "DISPATCHED" },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        receivedBy: body.receivedBy.trim(),
        deliveryNotes: body.deliveryNotes.trim(),
      },
    });
    if (changed.count !== 1) return null;
    return transaction.productionDispatch.findUnique({
      where: { id: dispatchId },
      select: {
        id: true,
        dispatchNo: true,
        deliveryNoteNo: true,
        status: true,
        deliveredAt: true,
        receivedBy: true,
        deliveryNotes: true,
      },
    });
  });
  if (!updated) {
    return NextResponse.json({ error: "This dispatch has already been delivered or does not exist" }, { status: 409 });
  }
  return NextResponse.json(
    { dispatch: updated },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
