import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import {
  canEditProductionJobs,
  isProductionWorkflowStage,
  isProductionOperationStatus,
  PRODUCTION_WORKFLOW_STAGES,
  validateProductionOperationRun,
} from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; scheduleId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const { workspaceId, scheduleId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required to report production" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionOperationRun(body)) {
    return NextResponse.json({ error: "Invalid production report details" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const schedule = await transaction.productionOperationSchedule.findFirst({
        where: { id: scheduleId, workspaceId },
        select: {
          id: true,
          status: true,
          operation: true,
          job: {
            select: {
              id: true,
              data: true,
              flag: { select: { resolvedAt: true } },
            },
          },
        },
      });
      if (!schedule) return { error: "Scheduled operation not found", status: 404 as const };
      if (!isProductionOperationStatus(schedule.status)) {
        throw new Error(`Operation schedule ${schedule.id} has an invalid status.`);
      }
      if (schedule.status === "COMPLETED") {
        return { error: "This operation is already complete", status: 409 as const };
      }
      if (schedule.job.flag && !schedule.job.flag.resolvedAt) {
        return {
          error: "Clear the active job flag before recording production output.",
          status: 409 as const,
        };
      }

      const run = await transaction.productionOperationRun.create({
        data: {
          workspaceId,
          scheduleId,
          createdByUserId: user.id,
          goodQty: Number(body.goodQty),
          rejectedQty: Number(body.rejectedQty),
          notes: body.notes.trim(),
        },
        select: {
          id: true,
          goodQty: true,
          rejectedQty: true,
          notes: true,
          recordedAt: true,
        },
      });
      await transaction.productionOperationSchedule.update({
        where: { id: schedule.id },
        data: { status: body.completeOperation ? "COMPLETED" : "IN_PROGRESS" },
      });
      if (schedule.operation === "Printing" && body.completeOperation) {
        const jobData =
          schedule.job.data !== null &&
          typeof schedule.job.data === "object" &&
          !Array.isArray(schedule.job.data)
            ? schedule.job.data
            : null;
        const currentStage =
          jobData && isProductionWorkflowStage(jobData.workflowStage)
            ? jobData.workflowStage
            : "Order Booking";
        if (
          jobData &&
          PRODUCTION_WORKFLOW_STAGES.indexOf(currentStage) <
            PRODUCTION_WORKFLOW_STAGES.indexOf("Dispatch")
        ) {
          await transaction.productionJob.update({
            where: { id: schedule.job.id },
            data: { data: { ...jobData, workflowStage: "Dispatch" } },
          });
        }
      }
      return { run, status: 201 as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { run: result.run },
      { status: result.status, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another production report was recorded concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
