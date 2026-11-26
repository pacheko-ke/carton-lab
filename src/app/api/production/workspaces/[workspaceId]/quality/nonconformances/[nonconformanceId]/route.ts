import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import {
  canEditProductionJobs,
  validateProductionNonconformanceUpdate,
} from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; nonconformanceId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }

  const { workspaceId, nonconformanceId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required to manage nonconformances" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionNonconformanceUpdate(body)) {
    return NextResponse.json({ error: "Invalid nonconformance resolution details" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (transaction) => {
    const nonconformance = await transaction.productionNonconformance.findFirst({
      where: { id: nonconformanceId, workspaceId },
      select: { id: true, status: true },
    });
    if (!nonconformance) {
      return { error: "Nonconformance not found", status: 404 as const };
    }
    if (nonconformance.status === "CLOSED") {
      return { error: "A closed nonconformance cannot be changed", status: 409 as const };
    }
    if (nonconformance.status === "OPEN" && body.status !== "IN_PROGRESS") {
      return {
        error: "Move the nonconformance into progress before closing it",
        status: 409 as const,
      };
    }

    const updatedCount = await transaction.productionNonconformance.updateMany({
      where: { id: nonconformance.id, status: nonconformance.status },
      data: {
        status: body.status,
        updatedByUserId: user.id,
        rootCause: body.rootCause.trim(),
        correctiveAction: body.correctiveAction.trim(),
        disposition: body.disposition,
        resolutionNotes: body.resolutionNotes.trim(),
        ...(body.status === "CLOSED"
          ? { closedAt: new Date(), resolvedByUserId: user.id }
          : {}),
      },
    });
    if (updatedCount.count === 0) {
      return {
        error: "Another user updated this nonconformance. Refresh and retry.",
        status: 409 as const,
      };
    }

    const updated = await transaction.productionNonconformance.findUniqueOrThrow({
      where: { id: nonconformance.id },
      select: {
        id: true,
        ncrNo: true,
        status: true,
        rootCause: true,
        correctiveAction: true,
        disposition: true,
        resolutionNotes: true,
        closedAt: true,
        updatedAt: true,
      },
    });
    return { nonconformance: updated };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    result,
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
