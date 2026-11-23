import { randomUUID } from "node:crypto";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { validateProductionMaterial } from "@/lib/production-supply-data";
import { canEditProductionJobs } from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

const materialSelection = {
  id: true,
  code: true,
  name: true,
  category: true,
  unit: true,
  reorderPoint: true,
  active: true,
} as const;

export async function GET(_request: Request, { params }: RouteContext) {
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
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  const materials = await prisma.productionMaterial.findMany({
    where: { organizationId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: materialSelection,
  });
  return NextResponse.json(
    { materials },
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
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionMaterial(body)) {
    return NextResponse.json({ error: "Invalid material details" }, { status: 400 });
  }

  try {
    const material = await prisma.productionMaterial.create({
      data: {
        organizationId,
        createdByUserId: user.id,
        code: `MAT-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        name: body.name.trim(),
        category: body.category,
        unit: body.unit,
        reorderPoint: body.reorderPoint,
      },
      select: materialSelection,
    });
    return NextResponse.json(
      { material },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Could not generate a unique material code. Please retry." }, { status: 409 });
    }
    throw error;
  }
}
