import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs, isRecord } from "@/lib/production-data";
import { validateProductionStockMovement } from "@/lib/production-supply-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

function jobReference(data: Prisma.JsonValue): string {
  return isRecord(data) && typeof data.jobNo === "string" ? data.jobNo : "";
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
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
  if (!validateProductionStockMovement(body)) {
    return NextResponse.json({ error: "Invalid stock movement details" }, { status: 400 });
  }

  const material = await prisma.productionMaterial.findFirst({
    where: { id: body.materialId, organizationId, active: true },
    select: { id: true },
  });
  if (!material) {
    return NextResponse.json({ error: "Select an active material from this organization" }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      let reference = "";
      if (body.type === "ISSUE") {
        const job = await transaction.productionJob.findFirst({
          where: { id: body.jobId, organizationId },
          select: { data: true },
        });
        if (!job) return { error: "Select a job from this organization", status: 404 as const };
        reference = jobReference(job.data);
      }

      const currentBalance = await transaction.productionStockMovement.aggregate({
        where: { organizationId, materialId: body.materialId },
        _sum: { quantity: true },
      });
      const requestedQuantity = new Prisma.Decimal(body.quantity);
      const quantity = body.type === "ISSUE"
        ? requestedQuantity.neg()
        : requestedQuantity;
      const balance = currentBalance._sum.quantity ?? new Prisma.Decimal(0);
      if (balance.plus(quantity).isNegative()) {
        return { error: "Insufficient stock for this movement", status: 409 as const };
      }

      const movement = await transaction.productionStockMovement.create({
        data: {
          organizationId,
          materialId: body.materialId,
          jobId: body.type === "ISSUE" ? body.jobId : null,
          createdByUserId: user.id,
          type: body.type,
          quantity,
          reference: reference || null,
          notes: body.notes.trim(),
        },
        select: {
          id: true,
          type: true,
          quantity: true,
          reference: true,
          notes: true,
          createdAt: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
          jobId: true,
        },
      });
      return { movement, status: 201 as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { movement: result.movement },
      { status: result.status, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another stock movement was posted concurrently. Refresh the inventory and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
