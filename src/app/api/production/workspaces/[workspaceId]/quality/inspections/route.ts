import { randomUUID } from "node:crypto";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import {
  canEditProductionJobs,
  validateProductionQualityInspection,
} from "@/lib/production-data";
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
    return NextResponse.json({ error: "Production role required to record inspections" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionQualityInspection(body)) {
    return NextResponse.json({ error: "Invalid quality inspection details" }, { status: 400 });
  }

  const job = await prisma.productionJob.findFirst({
    where: { id: body.jobId, workspaceId },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }

  if (body.scheduleId) {
    const schedule = await prisma.productionOperationSchedule.findFirst({
      where: { id: body.scheduleId, workspaceId, jobId: job.id },
      select: { id: true },
    });
    if (!schedule) {
      return NextResponse.json(
        { error: "Select a scheduled operation belonging to this job and workspace" },
        { status: 404 },
      );
    }
  }

  const result = body.rejectedQty !== "0" || body.checks.some((check) => check.result === "FAIL")
    ? "FAIL"
    : "PASS";
  const inspectionNo = `QI-${randomUUID().toUpperCase()}`;
  const ncrNo = result === "FAIL" ? `NCR-${randomUUID().toUpperCase()}` : null;
  const saved = await prisma.$transaction(async (transaction) => {
    const inspection = await transaction.productionQualityInspection.create({
      data: {
        inspectionNo,
        workspaceId,
        jobId: job.id,
        scheduleId: body.scheduleId || null,
        createdByUserId: user.id,
        inspectionType: body.inspectionType,
        sampleQty: Number(body.sampleQty),
        rejectedQty: Number(body.rejectedQty),
        result,
        checks: body.checks.map((check) => ({
          ...check,
          checkpoint: check.checkpoint.trim(),
          target: check.target.trim(),
          observed: check.observed.trim(),
        })),
        notes: body.notes.trim(),
      },
      select: {
        id: true,
        inspectionNo: true,
        result: true,
        sampleQty: true,
        rejectedQty: true,
        inspectedAt: true,
      },
    });

    const nonconformance = ncrNo
      ? await transaction.productionNonconformance.create({
          data: {
            ncrNo,
            workspaceId,
            jobId: job.id,
            inspectionId: inspection.id,
            createdByUserId: user.id,
            description: body.ncrDescription.trim(),
            severity: body.ncrSeverity,
            affectedQty: Number(body.rejectedQty),
          },
          select: { id: true, ncrNo: true, status: true },
        })
      : null;
    return { inspection, nonconformance };
  });

  return NextResponse.json(
    saved,
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
