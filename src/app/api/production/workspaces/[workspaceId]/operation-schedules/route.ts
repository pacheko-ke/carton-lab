import { Prisma } from "@prisma/client";
import {
  canEditProductionJobs,
  getProductionOperationBalance,
  isProductionWorkflowStage,
  productionOrderQuantity,
  PRODUCTION_WORKFLOW_STAGES,
  validateProductionOperationSchedule,
} from "@/lib/production-data";
import { isProductionMachineCompatibleWithOperation } from "@/lib/production-maintenance-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
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
    where: { id: body.jobId, workspaceId },
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
      workspaceId,
      status: { not: "RETIRED" },
    },
    select: { id: true, machineType: true, workCenter: true },
  });
  if (!machine) {
    return NextResponse.json(
      { error: "Select a registered machine from this production workspace" },
      { status: 404 },
    );
  }
  if (!isProductionMachineCompatibleWithOperation(
    machine.machineType,
    machine.workCenter,
    body.operation,
  )) {
    return NextResponse.json(
      { error: `The selected machine is not compatible with the ${body.operation} operation.` },
      { status: 400 },
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

  const start = new Date(body.scheduledStartAt);
  const end = new Date(body.scheduledEndAt);
  const scheduleData = {
    machineId: machine.id,
    workCenter: machine.workCenter,
    scheduledStartAt: start,
    scheduledEndAt: end,
    plannedQty: Number(body.plannedQty),
    status: body.status,
    notes: body.notes.trim(),
  };
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.productionOperationSchedule.findUnique({
        where: {
          jobId_operation: { jobId: job.id, operation: body.operation },
        },
        select: { id: true, status: true },
      });
      const priorGoodQty = existing
        ? await transaction.productionOperationRun.aggregate({
            where: { scheduleId: existing.id },
            _sum: { goodQty: true },
          })
        : null;
      const balance = getProductionOperationBalance(
        productionOrderQuantity(job.data),
        priorGoodQty?._sum.goodQty ?? 0,
      );
      if (existing?.status === "COMPLETED" && (balance === null || balance === 0)) {
        return {
          error: "This operation is complete and has no remaining order balance to schedule.",
          status: 409 as const,
        };
      }
      if (body.status === "COMPLETED" && existing?.status !== "COMPLETED") {
        return {
          error: "Complete an operation by recording its production output.",
          status: 400 as const,
        };
      }
      if (existing?.status === "COMPLETED" && body.status === "COMPLETED") {
        return {
          error: "Set the operation to a planned status to schedule its remaining balance.",
          status: 409 as const,
        };
      }
      if (balance === 0) {
        return {
          error: "This operation has no remaining order balance to schedule.",
          status: 409 as const,
        };
      }
      if (balance !== null && Number(body.plannedQty) > balance) {
        return {
          error: `Planned quantity cannot exceed the remaining balance of ${balance}.`,
          status: 400 as const,
        };
      }

      const conflict = await transaction.productionOperationSchedule.findFirst({
        where: {
          workspaceId,
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
        return {
          error: "This machine already has an overlapping scheduled operation.",
          status: 409 as const,
        };
      }

      const schedule = await transaction.productionOperationSchedule.upsert({
        where: {
        jobId_operation: { jobId: job.id, operation: body.operation },
        },
        create: {
          workspaceId,
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
      return { schedule, isExisting: Boolean(existing) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { schedule: result.schedule },
      {
        status: result.isExisting ? 200 : 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another schedule was saved concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
