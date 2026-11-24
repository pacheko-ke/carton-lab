import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionMachineUpdate } from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; machineId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId, machineId } = await params;
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
  if (!validateProductionMachineUpdate(body)) {
    return NextResponse.json({ error: "Invalid machine update" }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const currentMachine = await transaction.productionMachine.findFirst({
        where: { id: machineId, organizationId },
        select: { id: true },
      });
      if (!currentMachine) return { kind: "not_found" } as const;
      if (body.status === "RETIRED") {
        const openTickets = await transaction.productionMaintenanceTicket.count({
          where: {
            organizationId,
            machineId,
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        });
        if (openTickets) return { kind: "has_open_tickets" } as const;
      }
      const updatedMachine = await transaction.productionMachine.update({
        where: { id: currentMachine.id },
        data: { status: body.status, location: body.location.trim() },
        select: { id: true, machineNo: true, status: true, location: true },
      });
      return { kind: "updated", machine: updatedMachine } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }
    if (result.kind === "has_open_tickets") {
      return NextResponse.json(
        { error: "Complete or cancel open maintenance tickets before retiring this machine." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { machine: result.machine },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Machine maintenance changed concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
