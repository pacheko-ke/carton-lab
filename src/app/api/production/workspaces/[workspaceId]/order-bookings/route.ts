import { randomUUID } from "node:crypto";
import { canBookProductionOrders, validateProductionOrderBooking } from "@/lib/production-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionDesigner,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { notifyOriginationOfNewJob } from "@/lib/production-notifications";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

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

  const { workspaceId } = await params;
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionOrderBooking(body)) {
    return NextResponse.json({ error: "Invalid order booking details" }, { status: 400 });
  }

  const isMultiLineOrder = "lines" in body;
  const lines = "lines" in body
    ? body.lines
    : [{ itemId: body.itemId, orderQty: body.orderQty }];
  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  const items = await prisma.productionItem.findMany({
    where: { id: { in: itemIds }, workspaceId },
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
  if (items.length !== itemIds.length) {
    return NextResponse.json({ error: "Select an item from this workspace" }, { status: 404 });
  }
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const customer = await prisma.productionCustomer.findUnique({
    where: { id: body.customerId },
    select: { name: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Select a customer from the shared catalog" }, { status: 404 });
  }

  const orderGroupId = randomUUID();
  const jobs = await prisma.$transaction(async (transaction) => {
    const createdJobs = [];
    for (const [index, line] of lines.entries()) {
      const item = itemsById.get(line.itemId);
      if (!item) {
        throw new Error(`Validated order line ${index + 1} references an unavailable item.`);
      }
      const data = {
        jobNo: createJobSheetNumber(),
        workflowStage: "Order Booking",
        issueDate: new Date().toISOString().slice(0, 10),
        documentType: "JOB",
        priority: "Normal",
        customer: customer.name,
        customerPO: body.customerPO.trim(),
        orderDate: body.orderDate,
        deliveryDate: body.deliveryDate,
        orderGroupId,
        orderLineNumber: index + 1,
        orderLineCount: lines.length,
        itemId: item.id,
        itemCode: item.itemCode,
        jobName: item.name,
        orderQty: String(Number(line.orderQty)),
        boxType: item.boxType,
        topLiner: item.topLiner,
        medium: item.medium,
        bottomLiner: item.bottomLiner,
        length: item.length,
        width: item.width,
        height: item.height,
        unit: item.unit,
      };
      const job = await transaction.productionJob.create({
        data: {
          workspaceId,
          createdByUserId: user.id,
          data,
        },
        select: { id: true, workspaceId: true, data: true, createdAt: true, updatedAt: true },
      });
      createdJobs.push(job);
    }
    return createdJobs;
  });
  await Promise.all(jobs.map((job) => notifyOriginationOfNewJob(job)));

  return NextResponse.json(
    isMultiLineOrder ? { jobs } : { job: jobs[0] },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
