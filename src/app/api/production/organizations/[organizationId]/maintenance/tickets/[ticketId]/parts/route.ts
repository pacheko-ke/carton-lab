import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionMaintenancePart } from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; ticketId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId, ticketId } = await params;
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
  if (!validateProductionMaintenancePart(body)) {
    return NextResponse.json({ error: "Invalid spare-part issue details" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.productionMaintenanceTicket.findFirst({
        where: {
          id: ticketId,
          organizationId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        select: {
          id: true,
          ticketNo: true,
          machine: { select: { machineNo: true } },
        },
      });
      if (!ticket) return { kind: "ticket_unavailable" } as const;

      const material = await transaction.productionMaterial.findFirst({
        where: {
          id: body.materialId,
          organizationId,
          active: true,
          category: { not: "PAPER" },
        },
        select: { id: true, code: true, name: true, unit: true },
      });
      if (!material) return { kind: "material_not_found" } as const;

      const quantity = new Prisma.Decimal(body.quantity);
      const currentBalance = await transaction.productionStockMovement.aggregate({
        where: { organizationId, materialId: material.id },
        _sum: { quantity: true },
      });
      const available = currentBalance._sum.quantity ?? new Prisma.Decimal(0);
      if (available.lessThan(quantity)) return { kind: "insufficient_stock" } as const;

      const movement = await transaction.productionStockMovement.create({
        data: {
          organizationId,
          materialId: material.id,
          createdByUserId: user.id,
          type: "ISSUE",
          quantity: quantity.negated(),
          reference: ticket.ticketNo,
          notes: `Maintenance spare part for ${ticket.machine.machineNo}`,
        },
        select: { id: true, quantity: true, createdAt: true },
      });
      const part = await transaction.productionMaintenancePart.create({
        data: {
          ticketId: ticket.id,
          materialId: material.id,
          stockMovementId: movement.id,
          issuedByUserId: user.id,
          quantity,
        },
        select: { id: true, quantity: true, issuedAt: true },
      });
      return { kind: "issued", movement, part, material } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "ticket_unavailable") {
      return NextResponse.json(
        { error: "Spare parts can only be issued against an open maintenance ticket." },
        { status: 409 },
      );
    }
    if (result.kind === "material_not_found") {
      return NextResponse.json(
        { error: "Select an active non-paper material from this organization." },
        { status: 404 },
      );
    }
    if (result.kind === "insufficient_stock") {
      return NextResponse.json({ error: "Insufficient stock for this spare part." }, { status: 409 });
    }
    return NextResponse.json(
      {
        part: {
          ...result.part,
          quantity: result.part.quantity.toString(),
          material: result.material,
        },
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another inventory movement was posted concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
