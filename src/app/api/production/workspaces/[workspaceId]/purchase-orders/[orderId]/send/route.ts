import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { getProductionPurchaseOrderDocument } from "@/lib/production-purchase-order-document";
import { sendResendEmail } from "@/lib/resend-email";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; orderId: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
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
  if (document.purchaseOrder.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Cancelled purchase orders cannot be sent to suppliers." },
      { status: 409 },
    );
  }
  const supplierEmail = document.purchaseOrder.supplier.email?.trim();
  if (!supplierEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail)) {
    return NextResponse.json(
      { error: "Add a valid supplier email before sending this purchase order." },
      { status: 409 },
    );
  }

  try {
    await sendResendEmail({
      to: supplierEmail,
      subject: `Purchase order ${document.purchaseOrder.orderNo}`,
      heading: `Purchase order ${document.purchaseOrder.orderNo}`,
      message: `Please find the purchase order from ${document.company.name} attached. Contact the buyer if you have any questions.`,
      details: [
        { label: "Supplier", value: document.purchaseOrder.supplier.name },
        {
          label: "Expected delivery",
          value: document.purchaseOrder.expectedAt?.toLocaleDateString("en-GB", {
            timeZone: "UTC",
          }) ?? "To be confirmed",
        },
        {
          label: "Delivery terms",
          value: document.purchaseOrder.deliveryTerms.trim() || "Not specified",
        },
        {
          label: "Created by",
          value: document.purchaseOrder.createdBy?.name?.trim() ||
            document.purchaseOrder.createdBy?.email ||
            "Production user",
        },
      ],
      attachments: [{
        filename: `${document.purchaseOrder.orderNo}.pdf`,
        content: Buffer.from(document.pdf).toString("base64"),
        content_type: "application/pdf",
      }],
    });
  } catch (error) {
    console.error(
      `Could not send purchase order ${document.purchaseOrder.orderNo} to ${supplierEmail}:`,
      error,
    );
    return NextResponse.json(
      { error: "Could not email the purchase order. Check email delivery settings and retry." },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { sentTo: supplierEmail },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
