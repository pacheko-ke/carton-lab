import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionMachine } from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

async function getAccess(userId: string, organizationId: string, isAdmin: boolean) {
  const membership = await getProductionOrganizationMembership(userId, organizationId, isAdmin);
  if (!membership) {
    return { response: NextResponse.json({ error: "Organization access denied" }, { status: 403 }) };
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return { response: NextResponse.json({ error: "Production role required" }, { status: 403 }) };
  }
  return { membership };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
  const access = await getAccess(user.id, organizationId, isProductionAdmin(user));
  if (access.response) return access.response;

  const machines = await prisma.productionMachine.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { machineNo: "asc" }],
    take: 300,
    select: {
      id: true,
      organizationId: true,
      machineNo: true,
      name: true,
      machineType: true,
      workCenter: true,
      location: true,
      status: true,
    },
  });
  return NextResponse.json(
    { machines },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
  const access = await getAccess(user.id, organizationId, isProductionAdmin(user));
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionMachine(body)) {
    return NextResponse.json({ error: "Invalid machine details" }, { status: 400 });
  }

  try {
    const machine = await prisma.productionMachine.create({
      data: {
        organizationId,
        createdByUserId: user.id,
        machineNo: body.machineNo.trim(),
        name: body.name.trim(),
        machineType: body.machineType.trim(),
        workCenter: body.workCenter.trim(),
        location: body.location.trim(),
      },
      select: {
        id: true,
        machineNo: true,
        name: true,
        machineType: true,
        workCenter: true,
        location: true,
        status: true,
      },
    });
    return NextResponse.json(
      { machine },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A machine already uses that asset number in this organization." },
        { status: 409 },
      );
    }
    throw error;
  }
}
