import { isRecord } from "@/lib/production-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

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

  const { workspaceId } = await params;
  const membership = await getProductionWorkspaceMembership(
    user.id,
    workspaceId,
    isProductionAdmin(user),
  );
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  const jobs = await prisma.productionJob.findMany({
    where: { workspaceId },
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

  const { workspaceId } = await params;
  const membership = await getProductionWorkspaceMembership(
    user.id,
    workspaceId,
    isProductionAdmin(user),
  );
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  return NextResponse.json(
    { error: "Job sheets can only be created by booking a customer order." },
    { status: 405 },
  );
}
