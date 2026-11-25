import {
  canEditProductionJobs,
  isProductionWorkflowStage,
  PRODUCTION_WORKFLOW_STAGES,
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
    select: {
      id: true,
      data: true,
      flag: { select: { resolvedAt: true } },
    },
  });
  if (!job) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }
  const machine = await prisma.productionMachine.findFirst({
    where: {
      id: body.machineId,
      organizationId,
      status: { not: "RETIRED" },
    },
    select: { id: true, workCenter: true },
  });
  if (!machine) {
    return NextResponse.json(
      { error: "Select a registered machine from this production organization" },
      { status: 404 },
    );
  }
  if (job.flag && !job.flag.resolvedAt) {
    return NextResponse.json(
      { error: "Clear the active job flag before scheduling its next operation." },
      { status: 409 },
    );
  }

  const jobData =
    job.data !== null && typeof job.data === "object" && !Array.isArray(job.data)
      ? job.data
      : null;
  const currentWorkflowStage =
    jobData && isProductionWorkflowStage(jobData.workflowStage)
      ? jobData.workflowStage
      : null;
  const targetWorkflowStage =
    body.operation === "Corrugating"
      ? "Board Production"
      : body.operation === "Printing"
        ? "Printing"
        : null;
  const workflowStageUpdate =
    jobData &&
    targetWorkflowStage &&
    PRODUCTION_WORKFLOW_STAGES.indexOf(currentWorkflowStage ?? "Order Booking") <
      PRODUCTION_WORKFLOW_STAGES.indexOf(targetWorkflowStage)
      ? { ...jobData, workflowStage: targetWorkflowStage }
      : null;

  const existing = await prisma.productionOperationSchedule.findUnique({
    where: {
      jobId_operation: { jobId: job.id, operation: body.operation },
    },
    select: { id: true, status: true },
  });
  if (body.status === "COMPLETED" && existing?.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Complete an operation by recording its production output." },
      { status: 400 },
    );
  }
  if (existing?.status === "COMPLETED" && body.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "A completed operation cannot be reopened." },
      { status: 409 },
    );
  }
  const start = new Date(body.scheduledStartAt);
  const end = new Date(body.scheduledEndAt);
  const conflict = body.status === "COMPLETED"
    ? null
    : await prisma.productionOperationSchedule.findFirst({
        where: {
          organizationId,
          OR: [
            { machineId: machine.id },
            {
              machineId: null,
              workCenter: { equals: machine.workCenter, mode: "insensitive" },
            },
          ],
          status: { not: "COMPLETED" },
          scheduledStartAt: { lt: end },
          scheduledEndAt: { gt: start },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      });
  if (conflict) {
    return NextResponse.json(
      { error: "This machine already has an overlapping scheduled operation." },
      { status: 409 },
    );
  }

  const scheduleData = {
    machineId: machine.id,
    workCenter: machine.workCenter,
    scheduledStartAt: start,
    scheduledEndAt: end,
    plannedQty: Number(body.plannedQty),
    status: body.status,
    notes: body.notes.trim(),
  };
  const schedule = await prisma.$transaction(async (transaction) => {
    const savedSchedule = await transaction.productionOperationSchedule.upsert({
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
        machineId: true,
        workCenter: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        plannedQty: true,
        status: true,
        notes: true,
        updatedAt: true,
      },
    });
    if (workflowStageUpdate) {
      await transaction.productionJob.update({
        where: { id: job.id },
        data: { data: workflowStageUpdate },
      });
    }
    return savedSchedule;
  });

  return NextResponse.json(
    { schedule },
    {
      status: existing ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
