import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  calculateProductionQuoteLineCosts,
  validateProductionQuote,
} from "@/lib/production-quote-data";
import { canBookProductionOrders, canEditProductionJobs, isRecord } from "@/lib/production-data";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

function quoteSelection() {
  return {
    id: true,
    organizationId: true,
    quoteNo: true,
    version: true,
    status: true,
    currency: true,
    validUntil: true,
    inquiryReference: true,
    notes: true,
    rejectionReason: true,
    totalCost: true,
    totalPrice: true,
    submittedAt: true,
    approvedAt: true,
    rejectedAt: true,
    convertedAt: true,
    createdAt: true,
    customer: { select: { id: true, name: true } },
    createdBy: { select: { name: true } },
    approvedBy: { select: { name: true } },
    lines: {
      orderBy: { id: "asc" as const },
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
        boardAreaM2: true,
        boardGsm: true,
        paperCostPerKg: true,
        trimWastePercent: true,
        conversionCost: true,
        consumablesCost: true,
        marginPercent: true,
        materialCostPerUnit: true,
        unitCost: true,
        unitPrice: true,
        lineCostTotal: true,
        linePriceTotal: true,
      },
    },
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { organizationId } = await params;
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }
  if (
    !isAdmin &&
    !canBookProductionOrders(membership.role) &&
    !canEditProductionJobs(membership.role)
  ) {
    return NextResponse.json({ error: "Sales or Production access required" }, { status: 403 });
  }

  if (new URL(request.url).searchParams.get("catalog") === "true") {
    const [items, customers] = await Promise.all([
      prisma.productionItem.findMany({
        where: { organizationId },
        orderBy: [{ itemCode: "asc" }, { name: "asc" }],
        select: {
          id: true,
          itemCode: true,
          customerId: true,
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
      }),
      prisma.productionCustomer.findMany({
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          kraPin: true,
          contactPerson: true,
          phone: true,
          email: true,
          address: true,
        },
      }),
    ]);
    return NextResponse.json(
      { items, customers },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const quotes = await prisma.productionQuote.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    take: 200,
    select: quoteSelection(),
  });
  return NextResponse.json(
    { quotes },
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
  const revisionOf = isRecord(body) ? body.revisionOf : undefined;
  if (revisionOf !== undefined && (typeof revisionOf !== "string" || revisionOf.length > 100)) {
    return NextResponse.json({ error: "Invalid quote revision reference" }, { status: 400 });
  }
  if (!validateProductionQuote(body)) {
    return NextResponse.json({ error: "Invalid quotation details" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (body.validUntil < today) {
    return NextResponse.json({ error: "Quotation expiry must be today or later" }, { status: 400 });
  }

  const [customer, items] = await Promise.all([
    prisma.productionCustomer.findUnique({
      where: { id: body.customerId },
      select: { id: true },
    }),
    prisma.productionItem.findMany({
      where: {
        organizationId,
        id: { in: body.lines.map((line) => line.itemId) },
      },
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
    }),
  ]);
  if (!customer) {
    return NextResponse.json({ error: "Select a customer from the shared catalog" }, { status: 404 });
  }
  if (items.length !== body.lines.length) {
    return NextResponse.json({ error: "Select products from this organization" }, { status: 404 });
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const lineData = body.lines.map((line) => {
    const item = itemById.get(line.itemId);
    const costs = calculateProductionQuoteLineCosts(line);
    if (!item || !costs) {
      throw new Error("Validated quotation line could not be calculated.");
    }
    return {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      boxType: item.boxType,
      topLiner: item.topLiner,
      medium: item.medium,
      bottomLiner: item.bottomLiner,
      length: item.length,
      width: item.width,
      height: item.height,
      unit: item.unit,
      quantity: Number(line.quantity),
      boardAreaM2: line.boardAreaM2,
      boardGsm: line.boardGsm,
      paperCostPerKg: line.paperCostPerKg,
      trimWastePercent: line.trimWastePercent,
      conversionCost: line.conversionCost,
      consumablesCost: line.consumablesCost,
      marginPercent: line.marginPercent,
      ...costs,
    };
  });
  const totalCost = lineData.reduce(
    (total, line) => total.plus(line.lineCostTotal),
    new Prisma.Decimal(0),
  );
  const totalPrice = lineData.reduce(
    (total, line) => total.plus(line.linePriceTotal),
    new Prisma.Decimal(0),
  );
  const date = new Date(`${body.validUntil}T23:59:59.999Z`);
  const quote = await prisma.$transaction(async (transaction) => {
    let quoteNo = `QT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
    let version = 1;
    if (typeof revisionOf === "string") {
      const previous = await transaction.productionQuote.findFirst({
        where: { id: revisionOf, organizationId },
        select: { id: true, quoteNo: true, version: true, status: true },
      });
      if (
        !previous ||
        !["DRAFT", "REJECTED", "APPROVED"].includes(previous.status)
      ) {
        return null;
      }
      const latest = await transaction.productionQuote.findFirst({
        where: { organizationId, quoteNo: previous.quoteNo },
        orderBy: { version: "desc" },
        select: { id: true },
      });
      if (latest?.id !== previous.id) return null;
      const superseded = await transaction.productionQuote.updateMany({
        where: { id: previous.id, status: previous.status },
        data: { status: "SUPERSEDED", updatedByUserId: user.id },
      });
      if (superseded.count !== 1) return null;
      quoteNo = previous.quoteNo;
      version = previous.version + 1;
    }

    return transaction.productionQuote.create({
      data: {
        organizationId,
        customerId: customer.id,
        quoteNo,
        version,
        currency: body.currency,
        validUntil: date,
        inquiryReference: body.inquiryReference.trim(),
        notes: body.notes.trim(),
        totalCost: totalCost.toDecimalPlaces(2),
        totalPrice: totalPrice.toDecimalPlaces(2),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        lines: { create: lineData },
      },
      select: quoteSelection(),
    });
  });
  if (!quote) {
    return NextResponse.json(
      { error: "This quote can no longer be revised. Refresh the quote list and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { quote },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
