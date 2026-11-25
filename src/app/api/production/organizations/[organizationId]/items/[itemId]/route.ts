import { canBookProductionOrders, validateProductionItem } from "@/lib/production-data";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionDesigner,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; itemId: string }>;
};

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

export async function PATCH(request: Request, { params }: RouteContext) {
  const { organizationId, itemId } = await params;
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const isAdmin = isProductionAdmin(user);
  if (!isAdmin && await isProductionDesigner(user.id)) {
    return NextResponse.json({ error: "Designer access is limited to Origination" }, { status: 403 });
  }
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
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

  const [item, customer] = await Promise.all([
    prisma.productionItem.findFirst({
      where: { id: itemId, organizationId },
      select: { id: true },
    }),
    prisma.productionCustomer.findUnique({
      where: { id: body.customerId },
      select: { id: true },
    }),
  ]);
  if (!item) {
    return NextResponse.json({ error: "Product not found in this organization" }, { status: 404 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Select a customer from the shared catalog" }, { status: 404 });
  }

  const updatedItem = await prisma.productionItem.update({
    where: { id: itemId },
    data: {
      customerId: customer.id,
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
    { item: updatedItem },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
