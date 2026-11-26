import {
  canBookProductionOrders,
  validateProductionCustomer,
} from "@/lib/production-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionDesigner,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; customerId: string }>;
};

const customerSelection = {
  id: true,
  name: true,
  kraPin: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
} as const;

export async function PATCH(request: Request, { params }: RouteContext) {
  const { workspaceId, customerId } = await params;
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

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
  if (!validateProductionCustomer(body)) {
    return NextResponse.json({ error: "Invalid customer details" }, { status: 400 });
  }

  const existingCustomer = await prisma.productionCustomer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, kraPin: true },
  });
  if (!existingCustomer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (body.name.trim() !== existingCustomer.name) {
    return NextResponse.json({ error: "Customer name cannot be changed" }, { status: 400 });
  }
  if (
    body.kraPin !== undefined &&
    (body.kraPin.trim().toUpperCase() || null) !== existingCustomer.kraPin
  ) {
    return NextResponse.json({ error: "Customer KRA PIN cannot be changed" }, { status: 400 });
  }

  const customer = await prisma.productionCustomer.update({
    where: { id: customerId },
    data: {
      contactPerson: body.contactPerson.trim() || null,
      phone: body.phone.trim() || null,
      email: body.email.trim().toLowerCase() || null,
      address: body.address.trim() || null,
    },
    select: customerSelection,
  });

  return NextResponse.json(
    { customer },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
