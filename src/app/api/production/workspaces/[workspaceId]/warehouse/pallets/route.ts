import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs, isRecord } from "@/lib/production-data";
import {
  receivableFinishedGoodsQuantity,
  validateProductionWarehousePallet,
} from "@/lib/production-warehouse-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

function createPalletNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `PL-${date}-${suffix}`;
}

function orderQuantity(data: Prisma.JsonValue): number | null {
  if (!isRecord(data) || typeof data.orderQty !== "string") return null;
  const quantity = Number(data.orderQty);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId } = await params;
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
  if (!validateProductionWarehousePallet(body)) {
    return NextResponse.json({ error: "Invalid pallet receipt details" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const job = await transaction.productionJob.findFirst({
        where: { id: body.jobId, workspaceId },
        select: { id: true, data: true },
      });
      if (!job) return { error: "Select a job from this workspace", status: 404 as const };
      const orderedQuantity = orderQuantity(job.data);
      if (orderedQuantity === null) {
        return { error: "The job has no valid order quantity", status: 409 as const };
      }
      const packingSchedule = await transaction.productionOperationSchedule.findFirst({
        where: {
          workspaceId,
          jobId: job.id,
          operation: "Packing",
          status: "COMPLETED",
        },
        select: { runs: { select: { goodQty: true } } },
      });
      const packedQuantity = packingSchedule?.runs.reduce((total, run) => total + run.goodQty, 0) ?? 0;
      if (packedQuantity < 1) {
        return { error: "Complete a Packing operation report before receiving finished goods", status: 409 as const };
      }

      const latestFinalInspection = await transaction.productionQualityInspection.findFirst({
        where: { workspaceId, jobId: job.id, inspectionType: "FINAL" },
        orderBy: { inspectedAt: "desc" },
        select: { result: true },
      });
      if (latestFinalInspection?.result !== "PASS") {
        return { error: "A passing final quality inspection is required before warehouse receipt", status: 409 as const };
      }
      const openNcrCount = await transaction.productionNonconformance.count({
        where: { workspaceId, jobId: job.id, status: { not: "CLOSED" } },
      });
      if (openNcrCount > 0) {
        return { error: "Resolve open nonconformances before receiving finished goods", status: 409 as const };
      }

      const received = await transaction.productionWarehousePallet.aggregate({
        where: { workspaceId, jobId: job.id },
        _sum: { quantityReceived: true },
      });
      const remainingOrderQuantity = receivableFinishedGoodsQuantity(
        orderedQuantity,
        packedQuantity,
        received._sum.quantityReceived ?? 0,
      );
      const quantity = Number(body.quantity);
      if (quantity > remainingOrderQuantity) {
        return { error: "Pallet quantity exceeds the packed and unreceived finished-goods quantity", status: 409 as const };
      }

      const pallet = await transaction.productionWarehousePallet.create({
        data: {
          workspaceId,
          jobId: job.id,
          createdByUserId: user.id,
          palletNo: createPalletNumber(),
          quantityReceived: quantity,
          quantityAvailable: quantity,
          location: body.location.trim(),
          notes: body.notes.trim(),
        },
        select: {
          id: true,
          palletNo: true,
          quantityReceived: true,
          quantityAvailable: true,
          location: true,
          receivedAt: true,
        },
      });
      return { pallet };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pallet: result.pallet }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another warehouse receipt was recorded concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
