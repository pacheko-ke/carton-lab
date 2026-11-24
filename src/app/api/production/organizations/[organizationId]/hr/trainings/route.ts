import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionSafetyTraining } from "@/lib/production-hr-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  const { organizationId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }
  const trainings = await prisma.productionSafetyTraining.findMany({
    where: { organizationId },
    orderBy: [{ expiresAt: "asc" }, { completedAt: "desc" }],
    take: 1000,
    select: {
      id: true,
      organizationId: true,
      employeeId: true,
      trainingName: true,
      provider: true,
      completedAt: true,
      expiresAt: true,
      notes: true,
      employee: { select: { employeeNo: true, name: true, department: true } },
    },
  });
  return NextResponse.json({ trainings }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  const { organizationId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionSafetyTraining(body)) {
    return NextResponse.json({ error: "Invalid safety training details" }, { status: 400 });
  }
  const employee = await prisma.productionEmployee.findFirst({
    where: { id: body.employeeId, organizationId },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Select an employee from this organization." }, { status: 404 });
  }
  const training = await prisma.productionSafetyTraining.create({
    data: {
      organizationId,
      employeeId: employee.id,
      createdByUserId: user.id,
      trainingName: body.trainingName.trim(),
      provider: body.provider.trim(),
      completedAt: new Date(`${body.completedAt}T00:00:00.000Z`),
      expiresAt: body.expiresAt ? new Date(`${body.expiresAt}T00:00:00.000Z`) : null,
      notes: body.notes.trim(),
    },
    select: { id: true, trainingName: true, completedAt: true, expiresAt: true },
  });
  return NextResponse.json({ training }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
