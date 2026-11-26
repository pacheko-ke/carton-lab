import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionReceipt } from "@/lib/production-supply-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; orderId: string }>;
};

const purchaseOrderSelection = {
  id: true,
  orderNo: true,
  status: true,
  expectedAt: true,
  notes: true,
  createdAt: true,
  supplier: { select: { id: true, code: true, name: true } },
  lines: {
    orderBy: { material: { name: "asc" } },
    select: {
      id: true,
      orderedQty: true,
      receivedQty: true,
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
  },
} as const;

export async function POST(request: Request, { params }: RouteContext) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionReceipt(body)) {
    return NextResponse.json({ error: "Invalid goods receipt details" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const purchaseOrder = await transaction.productionPurchaseOrder.findFirst({
        where: { id: orderId, workspaceId },
        select: {
          id: true,
          orderNo: true,
          status: true,
          lines: {
            select: {
              id: true,
              materialId: true,
              orderedQty: true,
              receivedQty: true,
            },
          },
        },
      });
      if (!purchaseOrder) {
        return { error: "Purchase order not found", status: 404 as const };
      }
      if (purchaseOrder.status === "RECEIVED" || purchaseOrder.status === "CANCELLED") {
        return { error: "This purchase order is not open for receiving", status: 409 as const };
      }

      const validatedLines = body.lines.map((receiptLine) => {
        const orderLine = purchaseOrder.lines.find(
          (line) => line.id === receiptLine.purchaseOrderLineId,
        );
        if (!orderLine) return null;
        const quantity = new Prisma.Decimal(receiptLine.quantity);
        const outstanding = orderLine.orderedQty.minus(orderLine.receivedQty);
        if (quantity.gt(outstanding)) return null;
        return { orderLine, quantity };
      });
      if (validatedLines.some((line) => line === null)) {
        return { error: "Receipt quantity exceeds the outstanding order quantity", status: 409 as const };
      }

      for (const validatedLine of validatedLines) {
        if (!validatedLine) continue;
        await transaction.productionPurchaseOrderLine.update({
          where: { id: validatedLine.orderLine.id },
          data: { receivedQty: { increment: validatedLine.quantity } },
        });
        await transaction.productionStockMovement.create({
          data: {
            workspaceId,
            materialId: validatedLine.orderLine.materialId,
            purchaseOrderLineId: validatedLine.orderLine.id,
            createdByUserId: user.id,
            type: "RECEIPT",
            quantity: validatedLine.quantity,
            reference: purchaseOrder.orderNo,
            notes: "Purchase order receipt",
          },
        });
      }

      const updatedLines = await transaction.productionPurchaseOrderLine.findMany({
        where: { purchaseOrderId: orderId },
        select: { orderedQty: true, receivedQty: true },
      });
      const status = updatedLines.every((line) => line.receivedQty.gte(line.orderedQty))
        ? "RECEIVED"
        : "PARTIALLY_RECEIVED";
      await transaction.productionPurchaseOrder.update({
        where: { id: orderId },
        data: { status },
      });
      const updatedPurchaseOrder = await transaction.productionPurchaseOrder.findUnique({
        where: { id: orderId },
        select: purchaseOrderSelection,
      });
      return { purchaseOrder: updatedPurchaseOrder, status: 201 as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { purchaseOrder: result.purchaseOrder },
      { status: result.status, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another receipt was posted concurrently. Refresh the purchase order and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
