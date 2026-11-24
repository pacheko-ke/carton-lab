import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import {
  canEditProductionJobs,
  isProductionOperationStatus,
  validateProductionOperationRun,
} from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; scheduleId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const { organizationId, scheduleId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
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
        where: { id: scheduleId, organizationId },
        select: { id: true, status: true },
      });
      if (!schedule) return { error: "Scheduled operation not found", status: 404 as const };
      if (!isProductionOperationStatus(schedule.status)) {
        throw new Error(`Operation schedule ${schedule.id} has an invalid status.`);
      }
      if (schedule.status === "COMPLETED") {
        return { error: "This operation is already complete", status: 409 as const };
      }

      const run = await transaction.productionOperationRun.create({
        data: {
          organizationId,
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
