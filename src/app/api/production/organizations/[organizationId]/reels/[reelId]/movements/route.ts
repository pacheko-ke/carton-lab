import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionReelMovement } from "@/lib/production-reel-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; reelId: string }>;
};

function createReelNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `RL-${date}-${suffix}`;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId, reelId } = await params;
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
  if (!validateProductionReelMovement(body)) {
    return NextResponse.json({ error: "Invalid reel movement details" }, { status: 400 });
  }

  const quantity = new Prisma.Decimal(body.quantityKg);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const reel = await transaction.productionPaperReel.findFirst({
        where: { id: reelId, organizationId },
        select: {
          id: true,
          reelNo: true,
          organizationId: true,
          materialId: true,
          supplierId: true,
          purchaseOrderLineId: true,
          parentReelId: true,
          batchNo: true,
          widthMm: true,
          gsm: true,
          receivedWeightKg: true,
          availableWeightKg: true,
          status: true,
          storageLocation: true,
        },
      });
      if (!reel) return { error: "Paper reel not found", status: 404 as const };
      if (reel.status === "QUARANTINED") {
        return { error: "Quarantined reels cannot be issued or split", status: 409 as const };
      }

      let job: { id: string; data: Prisma.JsonValue } | null = null;
      if (body.jobId) {
        job = await transaction.productionJob.findFirst({
          where: { id: body.jobId, organizationId },
          select: { id: true, data: true },
        });
        if (!job) return { error: "Select a job from this organization", status: 404 as const };
      }

      if (body.action === "REMNANT") {
        if (quantity.gt(reel.availableWeightKg)) {
          return { error: "Remnant weight exceeds the reel's available weight", status: 409 as const };
        }
        if (new Prisma.Decimal(body.widthMm).gt(reel.widthMm)) {
          return { error: "A remnant cannot be wider than its parent reel", status: 400 as const };
        }
        const remaining = reel.availableWeightKg.minus(quantity);
        const child = await transaction.productionPaperReel.create({
          data: {
            organizationId,
            materialId: reel.materialId,
            supplierId: reel.supplierId,
            purchaseOrderLineId: reel.purchaseOrderLineId,
            parentReelId: reel.id,
            createdByUserId: user.id,
            reelNo: createReelNumber(),
            barcode: randomUUID().replaceAll("-", "").toUpperCase(),
            batchNo: reel.batchNo,
            widthMm: body.widthMm,
            gsm: reel.gsm,
            receivedWeightKg: quantity,
            availableWeightKg: quantity,
            status: "AVAILABLE",
            storageLocation: body.storageLocation.trim() || reel.storageLocation,
            notes: body.notes.trim(),
          },
          select: { id: true, reelNo: true, barcode: true },
        });
        await transaction.productionPaperReel.update({
          where: { id: reel.id },
          data: {
            availableWeightKg: remaining,
            status: remaining.isZero() ? "CONSUMED" : "AVAILABLE",
          },
        });
        await transaction.productionReelMovement.createMany({
          data: [
            {
              organizationId,
              reelId: reel.id,
              relatedReelId: child.id,
              createdByUserId: user.id,
              type: "REMNANT_OUT",
              deltaKg: quantity.neg(),
              notes: body.notes.trim() || `Split into remnant ${child.reelNo}`,
            },
            {
              organizationId,
              reelId: child.id,
              relatedReelId: reel.id,
              createdByUserId: user.id,
              type: "REMNANT_IN",
              deltaKg: quantity,
              notes: body.notes.trim() || `Created from reel ${reel.reelNo}`,
            },
          ],
        });
        return { child, status: 201 as const };
      }

      const delta = body.action === "ISSUE"
        ? quantity.neg()
        : body.action === "RETURN"
          ? quantity
          : quantity;
      const nextWeight = reel.availableWeightKg.plus(delta);
      if (nextWeight.isNegative() || nextWeight.gt(reel.receivedWeightKg)) {
        return { error: "Movement would make reel weight negative or exceed its original received weight", status: 409 as const };
      }
      if (body.action === "RETURN" && job) {
        const jobBalance = await transaction.productionReelMovement.aggregate({
          where: {
            reelId: reel.id,
            jobId: job.id,
            type: { in: ["ISSUE", "RETURN"] },
          },
          _sum: { deltaKg: true },
        });
        const outstandingIssue = (jobBalance._sum.deltaKg ?? new Prisma.Decimal(0)).neg();
        if (outstandingIssue.lte(0) || quantity.gt(outstandingIssue)) {
          return { error: "Return quantity exceeds the paper issued to this job", status: 409 as const };
        }
      }

      const stock = await transaction.productionStockMovement.aggregate({
        where: { organizationId, materialId: reel.materialId },
        _sum: { quantity: true },
      });
      const nextStock = (stock._sum.quantity ?? new Prisma.Decimal(0)).plus(delta);
      if (nextStock.isNegative()) {
        return { error: "Insufficient paper stock for this movement", status: 409 as const };
      }

      const reference = job ? movementJobNumber(job.data) : reel.reelNo;
      const notes = body.notes.trim() ||
        `${body.action} paper reel ${reel.reelNo}${job && reference ? ` for ${reference}` : ""}`;
      const nextStatus = nextWeight.isZero() ? "CONSUMED" : "AVAILABLE";
      const [updatedReel, reelMovement] = await Promise.all([
        transaction.productionPaperReel.update({
          where: { id: reel.id },
          data: { availableWeightKg: nextWeight, status: nextStatus },
          select: { id: true, reelNo: true, availableWeightKg: true, status: true },
        }),
        transaction.productionReelMovement.create({
          data: {
            organizationId,
            reelId: reel.id,
            jobId: job?.id ?? null,
            createdByUserId: user.id,
            type: body.action,
            deltaKg: delta,
            notes,
          },
          select: { id: true, type: true, deltaKg: true, createdAt: true },
        }),
      ]);
      await transaction.productionStockMovement.create({
        data: {
          organizationId,
          materialId: reel.materialId,
          jobId: job?.id ?? null,
          createdByUserId: user.id,
          type: body.action === "ISSUE" ? "ISSUE" : "ADJUSTMENT",
          quantity: delta,
          reference,
          notes,
        },
      });
      return { reel: updatedReel, movement: reelMovement, status: 201 as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      result,
      { status: result.status, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another reel movement was posted concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}

function movementJobNumber(data: Prisma.JsonValue): string {
  return typeof data === "object" && data !== null && !Array.isArray(data) &&
    "jobNo" in data && typeof data.jobNo === "string"
    ? data.jobNo
    : "";
}
