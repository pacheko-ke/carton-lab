import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionLeaveRequest } from "@/lib/production-hr-data";
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
  const leaveRequests = await prisma.productionLeaveRequest.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { startsAt: "asc" }],
    take: 1000,
    select: {
      id: true,
      organizationId: true,
      employeeId: true,
      leaveType: true,
      startsAt: true,
      endsAt: true,
      reason: true,
      status: true,
      reviewNotes: true,
      createdAt: true,
      reviewedAt: true,
      employee: { select: { employeeNo: true, name: true, department: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ leaveRequests }, { headers: { "Cache-Control": "private, no-store" } });
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
  if (!validateProductionLeaveRequest(body)) {
    return NextResponse.json({ error: "Invalid leave request details" }, { status: 400 });
  }
  const employee = await prisma.productionEmployee.findFirst({
    where: { id: body.employeeId, organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Select an active employee from this organization." }, { status: 404 });
  }
  const requestRecord = await prisma.productionLeaveRequest.create({
    data: {
      organizationId,
      employeeId: employee.id,
      createdByUserId: user.id,
      leaveType: body.leaveType,
      startsAt: new Date(`${body.startsAt}T00:00:00.000Z`),
      endsAt: new Date(`${body.endsAt}T00:00:00.000Z`),
      reason: body.reason.trim(),
    },
    select: { id: true, leaveType: true, startsAt: true, endsAt: true, status: true },
  });
  return NextResponse.json(
    { leaveRequest: requestRecord },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
