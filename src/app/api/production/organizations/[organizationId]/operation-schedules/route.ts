import {
  canEditProductionJobs,
  validateProductionOperationSchedule,
} from "@/lib/production-data";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

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
    return NextResponse.json({ error: "Production role required to schedule jobs" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionOperationSchedule(body)) {
    return NextResponse.json({ error: "Invalid operation schedule details" }, { status: 400 });
  }

  const job = await prisma.productionJob.findFirst({
    where: { id: body.jobId, organizationId },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }

  const existing = await prisma.productionOperationSchedule.findUnique({
    where: {
      jobId_operation: { jobId: job.id, operation: body.operation },
    },
    select: { id: true },
  });
  const start = new Date(body.scheduledStartAt);
  const end = new Date(body.scheduledEndAt);
  const conflict = body.status === "COMPLETED"
    ? null
    : await prisma.productionOperationSchedule.findFirst({
        where: {
          organizationId,
          workCenter: { equals: body.workCenter.trim(), mode: "insensitive" },
          status: { not: "COMPLETED" },
          scheduledStartAt: { lt: end },
          scheduledEndAt: { gt: start },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      });
  if (conflict) {
    return NextResponse.json(
      { error: "This work center already has an overlapping scheduled operation." },
      { status: 409 },
    );
  }

  const scheduleData = {
    workCenter: body.workCenter.trim(),
    scheduledStartAt: start,
    scheduledEndAt: end,
    plannedQty: Number(body.plannedQty),
    status: body.status,
    notes: body.notes.trim(),
  };
  const schedule = await prisma.productionOperationSchedule.upsert({
    where: {
      jobId_operation: { jobId: job.id, operation: body.operation },
    },
    create: {
      organizationId,
      jobId: job.id,
      createdByUserId: user.id,
      operation: body.operation,
      ...scheduleData,
    },
    update: scheduleData,
    select: {
      id: true,
      jobId: true,
      operation: true,
      workCenter: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      plannedQty: true,
      status: true,
      notes: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    { schedule },
    {
      status: existing ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
