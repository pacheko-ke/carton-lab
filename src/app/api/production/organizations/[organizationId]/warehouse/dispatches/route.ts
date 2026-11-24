import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionDispatch } from "@/lib/production-warehouse-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

function createDocumentNumber(prefix: "DSP" | "DN"): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
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
  if (!validateProductionDispatch(body)) {
    return NextResponse.json({ error: "Invalid dispatch details" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const job = await transaction.productionJob.findFirst({
        where: { id: body.jobId, organizationId },
        select: { id: true },
      });
      if (!job) return { error: "Select a job from this organization", status: 404 as const };

      const latestFinalInspection = await transaction.productionQualityInspection.findFirst({
        where: { organizationId, jobId: job.id, inspectionType: "FINAL" },
        orderBy: { inspectedAt: "desc" },
        select: { result: true },
      });
      if (latestFinalInspection?.result !== "PASS") {
        return { error: "A passing final quality inspection is required before dispatch", status: 409 as const };
      }
      const openNcrCount = await transaction.productionNonconformance.count({
        where: { organizationId, jobId: job.id, status: { not: "CLOSED" } },
      });
      if (openNcrCount > 0) {
        return { error: "Resolve open nonconformances before dispatch", status: 409 as const };
      }

      const requestedPalletIds = body.lines.map((line) => line.palletId);
      const pallets = await transaction.productionWarehousePallet.findMany({
        where: {
          organizationId,
          jobId: job.id,
          id: { in: requestedPalletIds },
        },
        select: { id: true, palletNo: true, quantityAvailable: true },
      });
      if (pallets.length !== body.lines.length) {
        return { error: "Every pallet must belong to this job and organization", status: 404 as const };
      }
      for (const line of body.lines) {
        const pallet = pallets.find((candidate) => candidate.id === line.palletId);
        if (!pallet || Number(line.quantity) > pallet.quantityAvailable) {
          return { error: "Dispatch quantity exceeds the selected pallet's available stock", status: 409 as const };
        }
      }

      const dispatch = await transaction.productionDispatch.create({
        data: {
          organizationId,
          jobId: job.id,
          createdByUserId: user.id,
          dispatchNo: createDocumentNumber("DSP"),
          deliveryNoteNo: createDocumentNumber("DN"),
          status: "DISPATCHED",
          vehicleRegistration: body.vehicleRegistration.trim(),
          driverName: body.driverName.trim(),
          route: body.route.trim(),
          notes: body.notes.trim(),
          lines: {
            create: body.lines.map((line) => ({
              palletId: line.palletId,
              quantity: Number(line.quantity),
            })),
          },
        },
        select: {
          id: true,
          dispatchNo: true,
          deliveryNoteNo: true,
          status: true,
          dispatchedAt: true,
        },
      });
      for (const line of body.lines) {
        await transaction.productionWarehousePallet.update({
          where: { id: line.palletId },
          data: { quantityAvailable: { decrement: Number(line.quantity) } },
        });
      }
      return { dispatch };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ dispatch: result.dispatch }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another dispatch changed warehouse stock concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
