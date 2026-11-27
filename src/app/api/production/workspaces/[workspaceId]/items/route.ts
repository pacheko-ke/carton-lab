import { randomUUID } from "node:crypto";
import { canBookProductionOrders, validateProductionItem } from "@/lib/production-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionDesigner,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

function createProductionItemCode(): string {
  return `ITM-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

const itemSelection = {
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
} as const;

export async function GET(_request: Request, { params }: RouteContext) {
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

  const items = await prisma.productionItem.findMany({
    where: { workspaceId },
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
  if (!validateProductionItem(body)) {
    return NextResponse.json({ error: "Invalid item details" }, { status: 400 });
  }

  const customer = await prisma.productionCustomer.findFirst({
    where: { id: body.customerId, workspaceId },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Select a customer from this workspace" }, { status: 404 });
  }

  try {
    const item = await prisma.productionItem.create({
      data: {
        workspaceId,
        createdByUserId: user.id,
        customerId: customer.id,
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
