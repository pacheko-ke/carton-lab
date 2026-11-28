import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { getProductionPurchaseOrderDocument } from "@/lib/production-purchase-order-document";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string; orderId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, orderId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  const document = await getProductionPurchaseOrderDocument(workspaceId, orderId);
  if (!document) {
    return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  }

  const filename = `${document.purchaseOrder.orderNo.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
  return new NextResponse(Buffer.from(document.pdf), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/pdf",
    },
  });
}
