import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import {
  isProductionSafetyIncidentTransitionAllowed,
  validateProductionSafetyIncidentUpdate,
} from "@/lib/production-hr-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; incidentId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, incidentId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
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
  if (!validateProductionSafetyIncidentUpdate(body)) {
    return NextResponse.json({ error: "Invalid investigation update" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.productionSafetyIncident.findFirst({
        where: { id: incidentId, workspaceId },
        select: { id: true, status: true },
      });
      if (!current) return { kind: "not_found" } as const;
      if (!isProductionSafetyIncidentTransitionAllowed(current.status, body.status)) {
        return { kind: "invalid_transition" } as const;
      }

      const closed = body.status === "CLOSED";
      const updated = await transaction.productionSafetyIncident.updateMany({
        where: { id: incidentId, workspaceId, status: current.status },
        data: {
          status: body.status,
          investigationNotes: body.investigationNotes.trim(),
          correctiveAction: body.correctiveAction.trim(),
          closedAt: closed ? new Date() : null,
          closedByUserId: closed ? user.id : null,
        },
      });
      if (!updated.count) return { kind: "conflict" } as const;
      return { kind: "updated" } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Safety incident not found." }, { status: 404 });
    }
    if (result.kind === "invalid_transition") {
      return NextResponse.json({ error: "That incident status transition is not allowed." }, { status: 409 });
    }
    if (result.kind === "conflict") {
      return NextResponse.json({ error: "This incident was updated concurrently. Refresh and retry." }, { status: 409 });
    }
    return NextResponse.json(
      { incident: { id: incidentId, status: body.status } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "This incident changed concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
