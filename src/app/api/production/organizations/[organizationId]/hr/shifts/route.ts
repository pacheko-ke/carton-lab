import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionRosterShift } from "@/lib/production-hr-data";
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
  const shifts = await prisma.productionRosterShift.findMany({
    where: { organizationId },
    orderBy: { startsAt: "desc" },
    take: 1000,
    select: {
      id: true,
      organizationId: true,
      employeeId: true,
      shiftName: true,
      workCenter: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      status: true,
      notes: true,
      employee: { select: { employeeNo: true, name: true, department: true } },
      attendance: {
        select: {
          clockedInAt: true,
          clockedOutAt: true,
          overtimeMinutes: true,
          notes: true,
          createdBy: { select: { name: true } },
        },
      },
    },
  });
  return NextResponse.json({ shifts }, { headers: { "Cache-Control": "private, no-store" } });
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
  if (!validateProductionRosterShift(body)) {
    return NextResponse.json({ error: "Invalid roster shift details" }, { status: 400 });
  }
  const employee = await prisma.productionEmployee.findFirst({
    where: { id: body.employeeId, organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Select an active employee from this organization." }, { status: 404 });
  }
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  const conflictingShift = await prisma.productionRosterShift.findFirst({
    where: {
      organizationId,
      employeeId: employee.id,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });
  if (conflictingShift) {
    return NextResponse.json({ error: "This employee already has an overlapping roster shift." }, { status: 409 });
  }
  const shift = await prisma.productionRosterShift.create({
    data: {
      organizationId,
      employeeId: employee.id,
      createdByUserId: user.id,
      shiftName: body.shiftName.trim(),
      workCenter: body.workCenter.trim(),
      startsAt,
      endsAt,
      breakMinutes: Number(body.breakMinutes),
      notes: body.notes.trim(),
    },
    select: { id: true, shiftName: true, startsAt: true, endsAt: true },
  });
  return NextResponse.json({ shift }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
