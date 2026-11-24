import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionToolingEvent } from "@/lib/production-tooling-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; toolingId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId, toolingId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionToolingEvent(body)) {
    return NextResponse.json({ error: "Invalid tooling event" }, { status: 400 });
  }
  if (body.jobId) {
    const job = await prisma.productionJob.findFirst({
      where: { id: body.jobId, organizationId },
      select: { id: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Production job not found" }, { status: 404 });
    }
  }

  const result = await prisma.$transaction(async (transaction) => {
    const tooling = await transaction.productionTooling.findFirst({
      where: { id: toolingId, organizationId },
      select: { id: true, status: true },
    });
    if (!tooling) return { kind: "not_found" } as const;
    if (body.eventType === "USAGE") {
      const update = await transaction.productionTooling.updateMany({
        where: { id: tooling.id, organizationId, status: "AVAILABLE" },
        data: { usageCount: { increment: 1 } },
      });
      if (update.count === 0) return { kind: "unavailable" } as const;
    }
    const event = await transaction.productionToolingEvent.create({
      data: {
        organizationId,
        toolingId: tooling.id,
        createdByUserId: user.id,
        jobId: body.jobId || null,
        eventType: body.eventType,
        description: body.description.trim(),
      },
      select: { id: true, eventType: true, description: true, createdAt: true },
    });
    return { kind: "created", event } as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.kind === "not_found") {
    return NextResponse.json({ error: "Tooling record not found" }, { status: 404 });
  }
  if (result.kind === "unavailable") {
    return NextResponse.json(
      { error: "Only available tools can be issued to a job." },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { event: result.event },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
