import { randomUUID } from "node:crypto";
import { canBookProductionOrders, validateProductionOrderBooking } from "@/lib/production-data";
import { getProductionOrganizationMembership, getVerifiedProductionUser } from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

function createJobSheetNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `JS-${date}-${suffix}`;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const { organizationId } = await params;
  const membership = await getProductionOrganizationMembership(user.id, organizationId);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }
  if (!canBookProductionOrders(membership.role)) {
    return NextResponse.json({ error: "Order Booker role required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionOrderBooking(body)) {
    return NextResponse.json({ error: "Invalid order booking details" }, { status: 400 });
  }

  const item = await prisma.productionItem.findFirst({
    where: { id: body.itemId, organizationId },
    select: {
      id: true,
      itemCode: true,
      name: true,
      boxType: true,
      topLiner: true,
      medium: true,
      bottomLiner: true,
      length: true,
      width: true,
      height: true,
      unit: true,
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Select an item from this organization" }, { status: 404 });
  }

  const customer = await prisma.productionCustomer.findUnique({
    where: { id: body.customerId },
    select: { name: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Select a customer from the shared catalog" }, { status: 404 });
  }

  const data = {
    jobNo: createJobSheetNumber(),
    workflowStage: "Order Booking",
    issueDate: new Date().toISOString().slice(0, 10),
    documentType: "JOB",
    priority: "Normal",
    customer: customer.name,
    itemId: item.id,
    itemCode: item.itemCode,
    jobName: item.name,
    customerPO: body.customerPO.trim(),
    orderQty: String(Number(body.orderQty)),
    orderDate: body.orderDate,
    deliveryDate: body.deliveryDate,
    boxType: item.boxType,
    topLiner: item.topLiner,
    medium: item.medium,
    bottomLiner: item.bottomLiner,
    length: item.length,
    width: item.width,
    height: item.height,
    unit: item.unit,
  };
  const job = await prisma.productionJob.create({
    data: {
      organizationId,
      createdByUserId: user.id,
      data,
    },
    select: { id: true, organizationId: true, data: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(
    { job },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
