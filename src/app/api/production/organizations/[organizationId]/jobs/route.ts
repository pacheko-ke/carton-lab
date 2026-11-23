import { canEditProductionJobs, isRecord, validateProductionJobData } from "@/lib/production-data";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

function summaryValue(data: Prisma.JsonValue, key: string): string {
  if (isRecord(data) && typeof data[key] === "string") {
    return data[key];
  }
  return "";
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const { organizationId } = await params;
  const membership = await getProductionOrganizationMembership(
    user.id,
    organizationId,
    isProductionAdmin(user),
  );
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }

  const jobs = await prisma.productionJob.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, data: true, updatedAt: true },
  });

  return NextResponse.json(
    {
      jobs: jobs.map(({ id, data, updatedAt }) => ({
        id,
        jobNo: summaryValue(data, "jobNo"),
        jobName: summaryValue(data, "jobName"),
        customer: summaryValue(data, "customer"),
        updatedAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const { organizationId } = await params;
  const membership = await getProductionOrganizationMembership(
    user.id,
    organizationId,
    isProductionAdmin(user),
  );
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }
  if (!canEditProductionJobs(membership.role)) {
    return NextResponse.json(
      { error: "Production role required to create jobs" },
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

  const job = await prisma.productionJob.create({
    data: {
      organizationId,
      createdByUserId: user.id,
      data: body.data as Prisma.InputJsonObject,
    },
    select: { id: true, organizationId: true, data: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ job }, { status: 201 });
}
