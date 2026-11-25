import { Prisma } from "@prisma/client";
import {
  canFlagProductionJobs,
  canResolveProductionJobFlags,
  isRecord,
  isProductionOriginationQueueStage,
  isProductionWorkflowStage,
  validateProductionJobFlagReason,
} from "@/lib/production-data";
import {
  getAuthorizedProductionJob,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const { jobId } = await params;
  const isAdmin = isProductionAdmin(user);
  const access = await getAuthorizedProductionJob(user.id, jobId, isAdmin);
  if (!access) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }
  if (!isAdmin && !canFlagProductionJobs(access.membership.role)) {
    return NextResponse.json({ error: "Designer role required to flag jobs" }, { status: 403 });
  }

  const job = await prisma.productionJob.findUnique({
    where: { id: jobId },
    select: { data: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }
  const workflowStage = isRecord(job.data) && isProductionWorkflowStage(job.data.workflowStage)
    ? job.data.workflowStage
    : "Origination";
  if (!isProductionOriginationQueueStage(workflowStage)) {
    return NextResponse.json(
      { error: "Only jobs in the Origination queue can be flagged" },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body) || !validateProductionJobFlagReason(body.reason)) {
    return NextResponse.json(
      { error: "A flag reason of 1–1000 characters is required" },
      { status: 400 },
    );
  }

  const reason = body.reason.trim();
  const existing = await prisma.productionJobFlag.findUnique({
    where: { jobId },
    select: { id: true, resolvedAt: true },
  });
  if (existing && !existing.resolvedAt) {
    return NextResponse.json({ error: "This job already has an active flag" }, { status: 409 });
  }

  const data = {
    reason,
    createdByUserId: user.id,
    createdAt: new Date(),
    resolvedAt: null,
    resolvedByUserId: null,
  };
  let flag: { reason: string; createdAt: Date; resolvedAt: Date | null };
  if (existing) {
    flag = await prisma.productionJobFlag.update({
      where: { id: existing.id },
      data,
      select: { reason: true, createdAt: true, resolvedAt: true },
    });
  } else {
    try {
      flag = await prisma.productionJobFlag.create({
        data: { jobId, ...data },
        select: { reason: true, createdAt: true, resolvedAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "This job already has an active flag" }, { status: 409 });
      }
      throw error;
    }
  }

  return NextResponse.json(
    { flag },
    {
      status: existing ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function PATCH(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const { jobId } = await params;
  const isAdmin = isProductionAdmin(user);
  const access = await getAuthorizedProductionJob(user.id, jobId, isAdmin);
  if (!access) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }
  if (!isAdmin && !canResolveProductionJobFlags(access.membership.role)) {
    return NextResponse.json({ error: "Production role required to clear job flags" }, { status: 403 });
  }

  const result = await prisma.productionJobFlag.updateMany({
    where: { jobId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedByUserId: user.id },
  });
  if (!result.count) {
    return NextResponse.json({ error: "No active flag found for this job" }, { status: 404 });
  }

  return NextResponse.json(
    { resolved: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
