import { randomUUID } from "node:crypto";
import {
  canBookProductionOrders,
  canEditProductionJobs,
} from "@/lib/production-data";
import { validateProductionQuoteConversion } from "@/lib/production-quote-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { notifyOriginationOfNewJob } from "@/lib/production-notifications";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string; quoteId: string }> };

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
  const { workspaceId, quoteId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (
    !isAdmin &&
    !canBookProductionOrders(membership.role) &&
    !canEditProductionJobs(membership.role)
  ) {
    return NextResponse.json({ error: "Sales or Production access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionQuoteConversion(body)) {
    return NextResponse.json({ error: "Invalid customer order details" }, { status: 400 });
  }

  const now = new Date();
  const quote = await prisma.productionQuote.findFirst({
    where: { id: quoteId, workspaceId },
    select: {
      id: true,
      quoteNo: true,
      version: true,
      status: true,
      currency: true,
      validUntil: true,
      customer: { select: { name: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          itemId: true,
          itemCode: true,
          itemName: true,
          boxType: true,
          topLiner: true,
          medium: true,
          bottomLiner: true,
          length: true,
          width: true,
          height: true,
          unit: true,
          quantity: true,
          unitPrice: true,
        },
      },
    },
  });
  if (!quote) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  }
  if (quote.status !== "APPROVED" || quote.validUntil < now) {
    return NextResponse.json(
      { error: "Only an unexpired, approved quote can be converted to orders" },
      { status: 409 },
    );
  }

  const jobs = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.productionQuote.updateMany({
      where: {
        id: quote.id,
        workspaceId,
        status: "APPROVED",
        validUntil: { gte: now },
      },
      data: {
        status: "CONVERTED",
        convertedAt: now,
        convertedByUserId: user.id,
        updatedByUserId: user.id,
      },
    });
    if (updated.count !== 1) return null;

    const createdJobs = [];
    for (const line of quote.lines) {
      const job = await transaction.productionJob.create({
        data: {
          workspaceId,
          quoteId: quote.id,
          createdByUserId: user.id,
          data: {
            jobNo: createJobSheetNumber(),
            workflowStage: "Order Booking",
            issueDate: now.toISOString().slice(0, 10),
            documentType: "JOB",
            priority: "Normal",
            customer: quote.customer.name,
            itemId: line.itemId ?? "",
            itemCode: line.itemCode,
            jobName: line.itemName,
            customerPO: body.customerPO.trim(),
            orderQty: String(line.quantity),
            orderDate: body.orderDate,
            deliveryDate: body.deliveryDate,
            boxType: line.boxType,
            topLiner: line.topLiner,
            medium: line.medium,
            bottomLiner: line.bottomLiner,
            length: line.length,
            width: line.width,
            height: line.height,
            unit: line.unit,
          },
        },
        select: { id: true, workspaceId: true, data: true, createdAt: true },
      });
      createdJobs.push(job);
    }
    return createdJobs;
  });
  if (!jobs) {
    return NextResponse.json(
      { error: "This quote has already been converted or has expired. Refresh and try again." },
      { status: 409 },
    );
  }
  await Promise.all(jobs.map((job) => notifyOriginationOfNewJob(job)));

  return NextResponse.json(
    { jobs },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
