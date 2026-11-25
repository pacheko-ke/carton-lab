import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionMaintenanceTicket } from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

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
  const tickets = await prisma.productionMaintenanceTicket.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      organizationId: true,
      machineId: true,
      planId: true,
      jobId: true,
      operationScheduleId: true,
      ticketNo: true,
      ticketType: true,
      priority: true,
      status: true,
      description: true,
      resolution: true,
      downtimeMinutes: true,
      openedAt: true,
      closedAt: true,
      machine: { select: { machineNo: true, name: true } },
      plan: { select: { taskName: true } },
      job: { select: { data: true } },
      operationSchedule: { select: { operation: true, workCenter: true } },
      parts: {
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          quantity: true,
          issuedAt: true,
          material: { select: { code: true, name: true, unit: true } },
          issuedBy: { select: { name: true } },
        },
      },
      createdBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    },
  });
  return NextResponse.json(
    { tickets },
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
  if (!validateProductionMaintenanceTicket(body)) {
    return NextResponse.json({ error: "Invalid maintenance ticket details" }, { status: 400 });
  }
  const machine = await prisma.productionMachine.findFirst({
    where: { id: body.machineId, organizationId, status: { not: "RETIRED" } },
    select: { id: true, machineNo: true, workCenter: true, status: true },
  });
  if (!machine) {
    return NextResponse.json({ error: "Select an active machine from this organization" }, { status: 404 });
  }
  let planId: string | null = null;
  if (body.planId) {
    const plan = await prisma.productionMaintenancePlan.findFirst({
      where: {
        id: body.planId,
        organizationId,
        machineId: machine.id,
        active: true,
      },
      select: { id: true },
    });
    if (!plan) {
      return NextResponse.json({ error: "Select an active preventive plan for this machine" }, { status: 404 });
    }
    planId = plan.id;
  }

  let jobId: string | null = body.jobId || null;
  if (body.operationScheduleId) {
    const schedule = await prisma.productionOperationSchedule.findFirst({
      where: {
        id: body.operationScheduleId,
        organizationId,
        OR: [
          { machineId: machine.id },
          {
            machineId: null,
            workCenter: machine.workCenter,
          },
        ],
        ...(jobId ? { jobId } : {}),
      },
      select: { id: true, jobId: true },
    });
    if (!schedule) {
      return NextResponse.json(
        { error: "Select an operation assigned to this machine in this organization" },
        { status: 404 },
      );
    }
    jobId = schedule.jobId;
  } else if (jobId) {
    const job = await prisma.productionJob.findFirst({
      where: { id: jobId, organizationId },
      select: { id: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Production job not found" }, { status: 404 });
    }
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const currentMachine = await transaction.productionMachine.findFirst({
        where: { id: machine.id, organizationId, status: { not: "RETIRED" } },
        select: { id: true },
      });
      if (!currentMachine) return { kind: "machine_unavailable" } as const;
      const saved = await transaction.productionMaintenanceTicket.create({
        data: {
          organizationId,
          machineId: currentMachine.id,
          planId,
          jobId,
          operationScheduleId: body.operationScheduleId || null,
          createdByUserId: user.id,
          ticketNo: `MT-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
          ticketType: body.ticketType,
          priority: body.priority,
          description: body.description.trim(),
          downtimeMinutes: Number(body.downtimeMinutes),
        },
        select: {
          id: true,
          ticketNo: true,
          status: true,
          ticketType: true,
          priority: true,
          downtimeMinutes: true,
        },
      });
      await transaction.productionMachine.update({
        where: { id: currentMachine.id },
        data: { status: "MAINTENANCE" },
      });
      return { kind: "created", ticket: saved } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "machine_unavailable") {
      return NextResponse.json({ error: "This machine has been retired." }, { status: 409 });
    }
    return NextResponse.json(
      { ticket: result.ticket },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Machine maintenance changed concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
