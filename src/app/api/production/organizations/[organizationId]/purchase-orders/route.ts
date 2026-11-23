import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionPurchaseOrder } from "@/lib/production-supply-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

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

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  const purchaseOrders = await prisma.productionPurchaseOrder.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: purchaseOrderSelection,
  });
  return NextResponse.json(
    { purchaseOrders },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
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
  if (!validateProductionPurchaseOrder(body)) {
    return NextResponse.json({ error: "Invalid purchase order details" }, { status: 400 });
  }

  const supplier = await prisma.productionSupplier.findFirst({
    where: { id: body.supplierId, organizationId, active: true },
    select: { id: true },
  });
  if (!supplier) {
    return NextResponse.json({ error: "Select an active supplier for this organization" }, { status: 404 });
  }
  const materialIds = body.lines.map((line) => line.materialId);
  const materials = await prisma.productionMaterial.findMany({
    where: { id: { in: materialIds }, organizationId, active: true },
    select: { id: true },
  });
  if (materials.length !== materialIds.length) {
    return NextResponse.json({ error: "Select active materials from this organization" }, { status: 404 });
  }

  const date = new Date();
  const orderNo = `PO-${date.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  try {
    const purchaseOrder = await prisma.productionPurchaseOrder.create({
      data: {
        organizationId,
        supplierId: supplier.id,
        createdByUserId: user.id,
        orderNo,
        expectedAt: body.expectedAt
          ? new Date(`${body.expectedAt}T00:00:00.000Z`)
          : null,
        notes: body.notes.trim(),
        lines: {
          create: body.lines.map((line) => ({
            materialId: line.materialId,
            orderedQty: new Prisma.Decimal(line.quantity),
          })),
        },
      },
      select: purchaseOrderSelection,
    });
    return NextResponse.json(
      { purchaseOrder },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Could not generate a unique purchase order number. Please retry." }, { status: 409 });
    }
    throw error;
  }
}
