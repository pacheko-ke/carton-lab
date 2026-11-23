import { canEditProductionJobs, isRecord, validateProductionJobData } from "@/lib/production-data";
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
  if (!isAdmin && !canEditProductionJobs(access.membership.role)) {
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
  if (!isRecord(body) || !validateProductionJobData(body.data)) {
    return NextResponse.json(
      { error: "Invalid production job details" },
      { status: 400 },
    );
  }

  const job = await prisma.productionJob.update({
    where: { id: jobId },
    data: { data: body.data as Prisma.InputJsonObject },
    select: { id: true, organizationId: true, data: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ job });
}
