import { randomUUID } from "node:crypto";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionSupplier } from "@/lib/production-supply-data";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

const supplierSelection = {
  id: true,
  code: true,
  name: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
  active: true,
} as const;

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  const suppliers = await prisma.productionSupplier.findMany({
    where: { workspaceId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: supplierSelection,
  });
  return NextResponse.json(
    { suppliers },
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
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
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
  if (!validateProductionSupplier(body)) {
    return NextResponse.json({ error: "Invalid supplier details" }, { status: 400 });
  }

  try {
    const supplier = await prisma.productionSupplier.create({
      data: {
        workspaceId,
        createdByUserId: user.id,
        code: `SUP-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        name: body.name.trim(),
        contactPerson: body.contactPerson.trim() || null,
        phone: body.phone.trim() || null,
        email: body.email.trim().toLowerCase() || null,
        address: body.address.trim() || null,
      },
      select: supplierSelection,
    });
    return NextResponse.json(
      { supplier },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Could not generate a unique supplier code. Please retry." }, { status: 409 });
    }
    throw error;
  }
}
