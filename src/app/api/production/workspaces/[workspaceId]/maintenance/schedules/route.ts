import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionMaintenancePlan } from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

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
  const plans = await prisma.productionMaintenancePlan.findMany({
    where: { workspaceId },
    orderBy: [{ active: "desc" }, { nextDueAt: "asc" }],
    take: 500,
    select: {
      id: true,
      workspaceId: true,
      machineId: true,
      taskName: true,
      intervalDays: true,
      nextDueAt: true,
      lastCompletedAt: true,
      instructions: true,
      active: true,
      machine: { select: { machineNo: true, name: true } },
    },
  });
  return NextResponse.json(
    { plans },
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
  if (!validateProductionMaintenancePlan(body)) {
    return NextResponse.json({ error: "Invalid preventive maintenance plan" }, { status: 400 });
  }
  const machine = await prisma.productionMachine.findFirst({
    where: { id: body.machineId, workspaceId, status: { not: "RETIRED" } },
    select: { id: true },
  });
  if (!machine) {
    return NextResponse.json({ error: "Select an active machine from this workspace" }, { status: 404 });
  }
  const plan = await prisma.productionMaintenancePlan.create({
    data: {
      workspaceId,
      machineId: machine.id,
      createdByUserId: user.id,
      taskName: body.taskName.trim(),
      intervalDays: Number(body.intervalDays),
      nextDueAt: new Date(`${body.nextDueAt}T00:00:00.000Z`),
      instructions: body.instructions.trim(),
    },
    select: { id: true, taskName: true, nextDueAt: true },
  });
  return NextResponse.json(
    { plan },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
