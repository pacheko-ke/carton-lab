import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionSafetyIncident } from "@/lib/production-hr-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

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
  if (!validateProductionSafetyIncident(body)) {
    return NextResponse.json({ error: "Invalid safety incident details" }, { status: 400 });
  }
  const occurredAt = new Date(body.occurredAt);
  if (occurredAt > new Date()) {
    return NextResponse.json({ error: "Incident time cannot be in the future." }, { status: 400 });
  }
  if (body.employeeId) {
    const employee = await prisma.productionEmployee.findFirst({
      where: { id: body.employeeId, workspaceId },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ error: "Select an employee from this workspace." }, { status: 404 });
    }
  }

  const incident = await prisma.productionSafetyIncident.create({
    data: {
      workspaceId,
      employeeId: body.employeeId || null,
      createdByUserId: user.id,
      incidentType: body.incidentType,
      severity: body.severity,
      title: body.title.trim(),
      occurredAt,
      location: body.location.trim(),
      description: body.description.trim(),
      immediateAction: body.immediateAction.trim(),
    },
    select: { id: true, title: true, status: true, occurredAt: true },
  });
  return NextResponse.json(
    { incident },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
