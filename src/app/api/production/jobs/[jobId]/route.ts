import {
  canEditProductionJobs,
  isProductionWorkflowStage,
  isProductionOriginationQueueStage,
  isRecord,
  PRODUCTION_WORKFLOW_STAGES,
  validateProductionJobData,
  validateProductionOriginationPrintDetails,
} from "@/lib/production-data";
import {
  getAuthorizedProductionJob,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const { jobId } = await params;
  const access = await getAuthorizedProductionJob(user.id, jobId, isProductionAdmin(user));
  if (!access) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }

  const job = await prisma.productionJob.findUnique({
    where: { id: jobId },
    select: { id: true, organizationId: true, data: true, createdAt: true, updatedAt: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }

  return NextResponse.json(
    { job, role: access.membership.role },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const { jobId } = await params;
  const isAdmin = isProductionAdmin(user);
  const access = await getAuthorizedProductionJob(user.id, jobId, isAdmin);
  if (!access) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }
  const isOriginationDesigner = access.membership.role === "DESIGNER";
  if (!isAdmin && !canEditProductionJobs(access.membership.role) && !isOriginationDesigner) {
    return NextResponse.json(
      { error: "Production role required to update jobs" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    !isRecord(body) ||
    !validateProductionJobData(body.data) ||
    (isOriginationDesigner && !isAdmin && !validateProductionOriginationPrintDetails(body.data))
  ) {
    return NextResponse.json(
      { error: "Invalid production job details" },
      { status: 400 },
    );
  }
  const requestedData = body.data as Prisma.InputJsonObject;

  const result = await prisma.$transaction(async (transaction) => {
    const currentJob = await transaction.productionJob.findUnique({
      where: { id: jobId },
      select: {
        data: true,
        flag: { select: { resolvedAt: true } },
      },
    });
    if (!currentJob) return null;

    const currentStage =
      isRecord(currentJob.data) && isProductionWorkflowStage(currentJob.data.workflowStage)
        ? currentJob.data.workflowStage
        : "Origination";
    if (
      isOriginationDesigner &&
      !isAdmin &&
      !isProductionOriginationQueueStage(currentStage)
    ) {
      return "forbidden" as const;
    }
    const requestedStage = isProductionWorkflowStage(requestedData.workflowStage)
      ? requestedData.workflowStage
      : currentStage;
    const advancesWorkflow =
      PRODUCTION_WORKFLOW_STAGES.indexOf(requestedStage) >
      PRODUCTION_WORKFLOW_STAGES.indexOf(currentStage);
    if (currentJob.flag && !currentJob.flag.resolvedAt && advancesWorkflow) {
      return false;
    }

    const updatedData = isOriginationDesigner && !isAdmin
      ? {
          ...(isRecord(currentJob.data) ? currentJob.data : {}),
          ...requestedData,
        }
      : requestedData;

    return transaction.productionJob.update({
      where: { id: jobId },
      data: { data: updatedData as Prisma.InputJsonObject },
      select: { id: true, organizationId: true, data: true, createdAt: true, updatedAt: true },
    });
  });
  if (result === null) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }
  if (result === false) {
    return NextResponse.json(
      { error: "Clear the active job flag before advancing its workflow stage." },
      { status: 409 },
    );
  }
  if (result === "forbidden") {
    return NextResponse.json(
      { error: "Origination can only update print details before printing begins." },
      { status: 403 },
    );
  }

  return NextResponse.json({ job: result });
}
