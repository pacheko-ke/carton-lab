import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs, isRecord } from "@/lib/production-data";
import {
  isProductionReelWeightUnit,
  validateProductionPaperReel,
} from "@/lib/production-reel-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

const reelSelection = {
  id: true,
  organizationId: true,
  materialId: true,
  supplierId: true,
  purchaseOrderLineId: true,
  parentReelId: true,
  reelNo: true,
  barcode: true,
  batchNo: true,
  widthMm: true,
  gsm: true,
  receivedWeightKg: true,
  availableWeightKg: true,
  status: true,
  storageLocation: true,
  notes: true,
  receivedAt: true,
  createdAt: true,
  material: { select: { id: true, code: true, name: true, unit: true } },
  supplier: { select: { id: true, name: true } },
  purchaseOrderLine: {
    select: { purchaseOrder: { select: { orderNo: true } } },
  },
  parentReel: { select: { id: true, reelNo: true } },
} as const;

function createReelNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `RL-${date}-${suffix}`;
}

function movementReference(data: Prisma.JsonValue): string {
  return isRecord(data) && typeof data.jobNo === "string" ? data.jobNo : "";
}

async function getProductionAccess(userId: string, organizationId: string, isAdmin: boolean) {
  const membership = await getProductionOrganizationMembership(userId, organizationId, isAdmin);
  if (!membership) return { response: NextResponse.json({ error: "Organization access denied" }, { status: 403 }) };
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return { response: NextResponse.json({ error: "Production role required" }, { status: 403 }) };
  }
  return { membership };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
  const isAdmin = isProductionAdmin(user);
  const access = await getProductionAccess(user.id, organizationId, isAdmin);
  if ("response" in access) return access.response;

  const [reels, movements] = await Promise.all([
    prisma.productionPaperReel.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
      take: 500,
      select: reelSelection,
    }),
    prisma.productionReelMovement.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        reelId: true,
        relatedReelId: true,
        jobId: true,
        type: true,
        deltaKg: true,
        notes: true,
        createdAt: true,
        reel: { select: { reelNo: true } },
        relatedReel: { select: { reelNo: true } },
        job: { select: { data: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);
  return NextResponse.json(
    {
      reels,
      movements: movements.map((movement) => ({
        ...movement,
        jobNo: movement.job ? movementReference(movement.job.data) : "",
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
  const isAdmin = isProductionAdmin(user);
  const access = await getProductionAccess(user.id, organizationId, isAdmin);
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionPaperReel(body)) {
    return NextResponse.json({ error: "Invalid paper reel details" }, { status: 400 });
  }
  const material = await prisma.productionMaterial.findFirst({
    where: { id: body.materialId, organizationId, category: "PAPER", active: true },
    select: { id: true, unit: true },
  });
  if (!material) {
    return NextResponse.json({ error: "Select an active paper material from this organization" }, { status: 404 });
  }
  if (!isProductionReelWeightUnit(material.unit)) {
    return NextResponse.json(
      { error: "Paper reel traceability requires the material stock unit to be kilograms." },
      { status: 409 },
    );
  }
  if (body.supplierId.trim()) {
    const supplier = await prisma.productionSupplier.findFirst({
      where: { id: body.supplierId, organizationId, active: true },
      select: { id: true },
    });
    if (!supplier) {
      return NextResponse.json({ error: "Select an active supplier from this organization" }, { status: 404 });
    }
  }

  const weight = new Prisma.Decimal(body.weightKg);
  const requestedSupplierId = body.supplierId.trim() || null;
  const requestedPurchaseOrderLineId = body.purchaseOrderLineId.trim() || null;
  const parentReelId = body.parentReelId.trim() || null;
  try {
    const result = await prisma.$transaction(async (transaction) => {
      let supplierId = requestedSupplierId;
      let purchaseOrderLineId = requestedPurchaseOrderLineId;
      let parent: {
        id: string;
        materialId: string;
        supplierId: string | null;
        purchaseOrderLineId: string | null;
        batchNo: string;
        widthMm: Prisma.Decimal;
        gsm: Prisma.Decimal;
        availableWeightKg: Prisma.Decimal;
        status: string;
        storageLocation: string;
      } | null = null;

      if (parentReelId) {
        parent = await transaction.productionPaperReel.findFirst({
          where: { id: parentReelId, organizationId },
          select: {
            id: true,
            materialId: true,
            supplierId: true,
            purchaseOrderLineId: true,
            batchNo: true,
            widthMm: true,
            gsm: true,
            availableWeightKg: true,
            status: true,
            storageLocation: true,
          },
        });
        if (!parent || parent.materialId !== material.id) {
          return { error: "Select a parent reel for the same paper grade", status: 404 as const };
        }
        if (parent.status === "QUARANTINED" || weight.gt(parent.availableWeightKg)) {
          return { error: "The parent reel is quarantined or has insufficient available weight", status: 409 as const };
        }
        if (Number(body.widthMm) > Number(parent.widthMm)) {
          return { error: "A remnant cannot be wider than its parent reel", status: 400 as const };
        }
        if (
          (supplierId && supplierId !== parent.supplierId) ||
          (purchaseOrderLineId && purchaseOrderLineId !== parent.purchaseOrderLineId)
        ) {
          return { error: "A remnant must retain its parent supplier and purchase-order trace", status: 400 as const };
        }
        supplierId = parent.supplierId;
        purchaseOrderLineId = parent.purchaseOrderLineId;
        const remaining = parent.availableWeightKg.minus(weight);
        await transaction.productionPaperReel.update({
          where: { id: parent.id },
          data: {
            availableWeightKg: remaining,
            status: remaining.isZero() ? "CONSUMED" : "AVAILABLE",
          },
        });
      } else {
        if (requestedPurchaseOrderLineId) {
          const purchaseOrderLine = await transaction.productionPurchaseOrderLine.findFirst({
            where: {
              id: requestedPurchaseOrderLineId,
              materialId: material.id,
              purchaseOrder: { organizationId },
            },
            select: {
              id: true,
              receivedQty: true,
              purchaseOrder: { select: { supplierId: true, orderNo: true } },
            },
          });
          if (!purchaseOrderLine) {
            return { error: "Select a received purchase-order line for this paper grade", status: 404 as const };
          }
          const registered = await transaction.productionPaperReel.aggregate({
            where: { purchaseOrderLineId: purchaseOrderLine.id, parentReelId: null },
            _sum: { receivedWeightKg: true },
          });
          const remainingReceipt = purchaseOrderLine.receivedQty.minus(
            registered._sum.receivedWeightKg ?? new Prisma.Decimal(0),
          );
          if (weight.gt(remainingReceipt)) {
            return { error: "Reel weight exceeds the unregistered received quantity on this purchase order", status: 409 as const };
          }
          if (supplierId && supplierId !== purchaseOrderLine.purchaseOrder.supplierId) {
            return { error: "Supplier must match the selected purchase order", status: 400 as const };
          }
          supplierId = purchaseOrderLine.purchaseOrder.supplierId;
          purchaseOrderLineId = purchaseOrderLine.id;
        }

        const [stock, tracked] = await Promise.all([
          transaction.productionStockMovement.aggregate({
            where: { organizationId, materialId: material.id },
            _sum: { quantity: true },
          }),
          transaction.productionPaperReel.aggregate({
            where: { organizationId, materialId: material.id },
            _sum: { availableWeightKg: true },
          }),
        ]);
        const unregistered = (stock._sum.quantity ?? new Prisma.Decimal(0)).minus(
          tracked._sum.availableWeightKg ?? new Prisma.Decimal(0),
        );
        if (weight.gt(unregistered)) {
          return { error: "Reel weight exceeds unregistered paper stock. Receive the paper or reconcile stock first.", status: 409 as const };
        }
      }

      const reelNo = createReelNumber();
      const reel = await transaction.productionPaperReel.create({
        data: {
          organizationId,
          materialId: material.id,
          supplierId,
          purchaseOrderLineId,
          parentReelId: parent?.id ?? null,
          createdByUserId: user.id,
          reelNo,
          barcode: randomUUID().replaceAll("-", "").toUpperCase(),
          batchNo: parent ? parent.batchNo : body.batchNo.trim(),
          widthMm: body.widthMm,
          gsm: parent ? parent.gsm : body.gsm,
          receivedWeightKg: weight,
          availableWeightKg: weight,
          storageLocation: body.storageLocation.trim() || parent?.storageLocation || "",
          notes: body.notes.trim(),
          movements: {
            create: {
              organizationId,
              relatedReelId: parent?.id ?? null,
              createdByUserId: user.id,
              type: parent ? "REMNANT_IN" : "REGISTER",
              deltaKg: weight,
              notes: body.notes.trim(),
            },
          },
        },
        select: reelSelection,
      });

      if (parent) {
        await transaction.productionReelMovement.create({
          data: {
            organizationId,
            reelId: parent.id,
            relatedReelId: reel.id,
            createdByUserId: user.id,
            type: "REMNANT_OUT",
            deltaKg: weight.neg(),
            notes: body.notes.trim() || `Split into remnant ${reel.reelNo}`,
          },
        });
      }
      return { reel };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { reel: result.reel },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another reel or stock movement was recorded concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
