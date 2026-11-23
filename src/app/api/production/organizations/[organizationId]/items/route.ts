import { randomUUID } from "node:crypto";
import { canBookProductionOrders, validateProductionItem } from "@/lib/production-data";
import { getProductionOrganizationMembership, getVerifiedProductionUser } from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

function createProductionItemCode(): string {
  return `ITM-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

const itemSelection = {
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
} as const;

export async function GET(_request: Request, { params }: RouteContext) {
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

  const items = await prisma.productionItem.findMany({
    where: { organizationId },
    orderBy: [{ itemCode: "asc" }, { name: "asc" }],
    select: itemSelection,
  });
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
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
  if (!validateProductionItem(body)) {
    return NextResponse.json({ error: "Invalid item details" }, { status: 400 });
  }

  try {
    const item = await prisma.productionItem.create({
      data: {
        organizationId,
        createdByUserId: user.id,
        itemCode: createProductionItemCode(),
        name: body.name.trim(),
        boxType: body.boxType.trim(),
        topLiner: body.topLiner.trim(),
        medium: body.medium.trim(),
        bottomLiner: body.bottomLiner.trim(),
        length: body.length.trim(),
        width: body.width.trim(),
        height: body.height.trim(),
        unit: body.unit,
      },
      select: itemSelection,
    });
    return NextResponse.json(
      { item },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Could not generate a unique item code. Please retry." }, { status: 409 });
    }
    throw error;
  }
}
