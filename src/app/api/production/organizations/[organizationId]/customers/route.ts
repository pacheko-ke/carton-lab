import {
  canBookProductionOrders,
  validateProductionCustomerCreation,
} from "@/lib/production-data";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionDesigner,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

const customerSelection = {
  id: true,
  name: true,
  kraPin: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
} as const;

async function getOrderBooker(organizationId: string) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Verified account required" }, { status: 401 }) };
  }

  const isAdmin = isProductionAdmin(user);
  if (!isAdmin && await isProductionDesigner(user.id)) {
    return {
      response: NextResponse.json({ error: "Designer access is limited to Origination" }, { status: 403 }),
    };
  }
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return { response: NextResponse.json({ error: "Organization access denied" }, { status: 403 }) };
  }
  if (!isAdmin && !canBookProductionOrders(membership.role)) {
    return { response: NextResponse.json({ error: "Order Booker role required" }, { status: 403 }) };
  }

  return { user };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { organizationId } = await params;
  const access = await getOrderBooker(organizationId);
  if ("response" in access) return access.response;

  const customers = await prisma.productionCustomer.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    select: customerSelection,
  });
  return NextResponse.json(
    { customers },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const { organizationId } = await params;
  const access = await getOrderBooker(organizationId);
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionCustomerCreation(body)) {
    return NextResponse.json(
      { error: "All customer details are required and email must be valid" },
      { status: 400 },
    );
  }

  const customer = await prisma.productionCustomer.create({
    data: {
      createdByUserId: access.user.id,
      name: body.name.trim(),
      kraPin: body.kraPin?.trim().toUpperCase() || null,
      contactPerson: body.contactPerson.trim() || null,
      phone: body.phone.trim() || null,
      email: body.email.trim().toLowerCase() || null,
      address: body.address.trim() || null,
    },
    select: customerSelection,
  });
  return NextResponse.json(
    { customer },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
