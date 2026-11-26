import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import {
  isProductionMaintenanceTransitionAllowed,
  validateProductionMaintenanceTicketUpdate,
} from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; ticketId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, ticketId } = await params;
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
  if (!validateProductionMaintenanceTicketUpdate(body)) {
    return NextResponse.json({ error: "Invalid maintenance ticket update" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.productionMaintenanceTicket.findFirst({
        where: { id: ticketId, workspaceId },
        select: {
          id: true,
          machineId: true,
          planId: true,
          status: true,
        },
      });
      if (!current) return { kind: "not_found" } as const;
      if (!isProductionMaintenanceTransitionAllowed(current.status, body.status)) {
        return { kind: "invalid_transition" } as const;
      }

      const now = new Date();
      const completed = body.status === "COMPLETED" || body.status === "CANCELLED";
      const ticket = await transaction.productionMaintenanceTicket.update({
        where: { id: current.id },
        data: {
          status: body.status,
          resolution: body.resolution.trim(),
          downtimeMinutes: Number(body.downtimeMinutes),
          closedAt: completed ? now : null,
          closedByUserId: completed ? user.id : null,
        },
        select: {
          id: true,
          ticketNo: true,
          status: true,
          resolution: true,
          downtimeMinutes: true,
          closedAt: true,
        },
      });

      if (body.status === "COMPLETED" && current.planId) {
        const plan = await transaction.productionMaintenancePlan.findFirst({
          where: { id: current.planId, workspaceId, active: true },
          select: { intervalDays: true },
        });
        if (plan) {
          const nextDueAt = new Date(now);
          nextDueAt.setUTCDate(nextDueAt.getUTCDate() + plan.intervalDays);
          await transaction.productionMaintenancePlan.update({
            where: { id: current.planId },
            data: { lastCompletedAt: now, nextDueAt },
          });
        }
      }

      if (completed) {
        const remainingOpenTickets = await transaction.productionMaintenanceTicket.count({
          where: {
            workspaceId,
            machineId: current.machineId,
            id: { not: current.id },
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        });
        if (remainingOpenTickets === 0) {
          await transaction.productionMachine.updateMany({
            where: { id: current.machineId, workspaceId, status: "MAINTENANCE" },
            data: { status: "ACTIVE" },
          });
        }
      }
      return { kind: "updated", ticket } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Maintenance ticket not found" }, { status: 404 });
    }
    if (result.kind === "invalid_transition") {
      return NextResponse.json(
        { error: "That maintenance ticket status transition is not allowed." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ticket: result.ticket },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "This ticket changed concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
