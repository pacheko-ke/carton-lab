import { Suspense } from "react";
import { connection } from "next/server";
import QRCode from "qrcode";
import { isAdminEmail } from "@/lib/admin";
import { requireVerifiedUser } from "@/lib/account";
import { hasPremiumAccess } from "@/lib/billing";
import { createKeylineCatalog } from "@/lib/keyline-catalog";
import { isProductionAdmin } from "@/lib/production-access";
import {
  isProductionOperation,
  isProductionOperationStatus,
  isProductionWorkflowStage,
  isRecord,
} from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import ProductionDashboard, {
  type ProductionDashboardJob,
  type ProductionDashboardOrganization,
  type ProductionDashboardMaterial,
  type ProductionDashboardPurchaseOrder,
  type ProductionDashboardSchedule,
  type ProductionDashboardStockMovement,
  type ProductionDashboardSupplier,
} from "./production-dashboard";

function textValue(data: unknown, key: string): string {
  if (!isRecord(data) || typeof data[key] !== "string") return "";
  return data[key];
}

function quantityValue(data: unknown): number | null {
  const value = textValue(data, "orderQty").trim();
  if (!value) return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0
    ? Math.floor(quantity)
    : null;
}

function cartonSpecValue(data: unknown): string {
  return ["topLiner", "medium", "bottomLiner"]
    .map((key) => textValue(data, key).trim())
    .filter(Boolean)
    .join("/");
}

function sizeValue(data: unknown): string {
  const dimensions = ["length", "width", "height"].map((key) => textValue(data, key).trim());
  if (dimensions.every((dimension) => !dimension)) return "";
  const unit = textValue(data, "unit") === "in" ? "in" : "mm";
  return `${dimensions.map((dimension) => dimension || "—").join(" × ")} ${unit}`;
}

export default function ProductionAdminPage() {
  return (
    <Suspense
      fallback={
        <main className="grid h-dvh place-items-center bg-slate-950 text-slate-100">
          Loading production dashboard…
        </main>
      }
    >
      <AuthenticatedProductionAdminPage />
    </Suspense>
  );
}

async function AuthenticatedProductionAdminPage() {
  await connection();
  const user = await requireVerifiedUser();
  const isAdmin = isProductionAdmin(user);
  const organizations: ProductionDashboardOrganization[] = isAdmin
    ? (await prisma.productionOrganization.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })).map((organization) => ({ ...organization, role: "PRODUCTION" }))
    : (await prisma.productionOrganizationMembership.findMany({
        where: { userId: user.id },
        select: {
          role: true,
          organization: { select: { id: true, name: true } },
        },
      })).map(({ role, organization }) => ({
        ...organization,
        role: role === "DESIGNER"
          ? "DESIGNER"
          : role === "ORDER_BOOKER"
            ? "ORDER_BOOKER"
            : "PRODUCTION",
      }));
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );
  const jobs = organizations.length
    ? await prisma.productionJob.findMany({
        where: {
          organizationId: { in: organizations.map((organization) => organization.id) },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          organizationId: true,
          data: true,
          updatedAt: true,
          flag: {
            select: {
              reason: true,
              resolvedAt: true,
            },
          },
          _count: { select: { attachments: true } },
        },
      })
    : [];
  const dashboardJobs: ProductionDashboardJob[] = jobs.map((job) => {
    const rawStage = textValue(job.data, "workflowStage");
    return {
      id: job.id,
      organizationId: job.organizationId,
      organizationName: organizationNames.get(job.organizationId) ?? "Production organization",
      jobNo: textValue(job.data, "jobNo"),
      jobName: textValue(job.data, "jobName"),
      customer: textValue(job.data, "customer"),
      cartonSpec: cartonSpecValue(job.data),
      size: sizeValue(job.data),
      flag: job.flag && !job.flag.resolvedAt ? { reason: job.flag.reason } : null,
      deliveryDate: textValue(job.data, "deliveryDate"),
      priority: textValue(job.data, "priority"),
      orderQty: quantityValue(job.data),
      workflowStage: isProductionWorkflowStage(rawStage)
        ? rawStage
        : "Origination",
      artworkCount: job._count.attachments,
      updatedAt: job.updatedAt.toISOString(),
    };
  });
  const productionOrganizationIds = organizations
    .filter((organization) => organization.role === "PRODUCTION")
    .map((organization) => organization.id);
  const operationSchedules = productionOrganizationIds.length
    ? await prisma.productionOperationSchedule.findMany({
        where: { organizationId: { in: productionOrganizationIds } },
        orderBy: { scheduledStartAt: "asc" },
        select: {
          id: true,
          organizationId: true,
          jobId: true,
          operation: true,
          workCenter: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          plannedQty: true,
          status: true,
          notes: true,
        },
      })
    : [];
  const jobsById = new Map(dashboardJobs.map((job) => [job.id, job]));
  const dashboardSchedules: ProductionDashboardSchedule[] = operationSchedules.map((schedule) => {
    const job = jobsById.get(schedule.jobId);
    if (!job) {
      throw new Error(`Production operation schedule ${schedule.id} references an unavailable job.`);
    }
    if (!isProductionOperation(schedule.operation) || !isProductionOperationStatus(schedule.status)) {
      throw new Error(`Production operation schedule ${schedule.id} has invalid operation data.`);
    }
    return {
      ...schedule,
      organizationName: organizationNames.get(schedule.organizationId) ?? "Production organization",
      jobNo: job.jobNo,
      jobName: job.jobName,
      customer: job.customer,
      scheduledStartAt: schedule.scheduledStartAt.toISOString(),
      scheduledEndAt: schedule.scheduledEndAt.toISOString(),
      operation: schedule.operation,
      status: schedule.status,
    };
  });
  const [materialRows, supplierRows, purchaseOrderRows, stockMovementRows, stockBalances] =
    await Promise.all([
      prisma.productionMaterial.findMany({
        where: { organizationId: { in: productionOrganizationIds } },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          id: true,
          organizationId: true,
          code: true,
          name: true,
          category: true,
          unit: true,
          reorderPoint: true,
          active: true,
        },
      }),
      prisma.productionSupplier.findMany({
        where: { organizationId: { in: productionOrganizationIds } },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          id: true,
          organizationId: true,
          code: true,
          name: true,
          contactPerson: true,
          phone: true,
          email: true,
          address: true,
          active: true,
        },
      }),
      prisma.productionPurchaseOrder.findMany({
        where: { organizationId: { in: productionOrganizationIds } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          organizationId: true,
          orderNo: true,
          status: true,
          expectedAt: true,
          notes: true,
          createdAt: true,
          supplier: { select: { id: true, code: true, name: true } },
          lines: {
            orderBy: { material: { name: "asc" } },
            select: {
              id: true,
              orderedQty: true,
              receivedQty: true,
              material: { select: { id: true, code: true, name: true, unit: true } },
            },
          },
        },
      }),
      prisma.productionStockMovement.findMany({
        where: { organizationId: { in: productionOrganizationIds } },
        orderBy: { createdAt: "desc" },
        take: 250,
        select: {
          id: true,
          organizationId: true,
          type: true,
          quantity: true,
          reference: true,
          notes: true,
          createdAt: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
          jobId: true,
          job: { select: { data: true } },
        },
      }),
      prisma.productionStockMovement.groupBy({
        by: ["organizationId", "materialId"],
        where: { organizationId: { in: productionOrganizationIds } },
        _sum: { quantity: true },
      }),
    ]);
  const balanceByMaterial = new Map(
    stockBalances.map((balance) => [
      `${balance.organizationId}:${balance.materialId}`,
      balance._sum.quantity?.toString() ?? "0",
    ]),
  );
  const dashboardMaterials: ProductionDashboardMaterial[] = materialRows.map((material) => ({
    ...material,
    reorderPoint: material.reorderPoint.toString(),
    onHand: balanceByMaterial.get(`${material.organizationId}:${material.id}`) ?? "0",
  }));
  const dashboardSuppliers: ProductionDashboardSupplier[] = supplierRows;
  const dashboardPurchaseOrders: ProductionDashboardPurchaseOrder[] = purchaseOrderRows.map((order) => ({
    ...order,
    expectedAt: order.expectedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    lines: order.lines.map((line) => ({
      ...line,
      orderedQty: line.orderedQty.toString(),
      receivedQty: line.receivedQty.toString(),
    })),
  }));
  const dashboardStockMovements: ProductionDashboardStockMovement[] = stockMovementRows.map((movement) => ({
    ...movement,
    quantity: movement.quantity.toString(),
    createdAt: movement.createdAt.toISOString(),
    jobNo: movement.job ? textValue(movement.job.data, "jobNo") : "",
  }));
  const cartonTypes = Array.from(new Set([
    "RSC 0201",
    ...createKeylineCatalog(
      hasPremiumAccess(
        user.subscriptions,
        user.premiumAccessGranted,
        user.trialEndsAt,
      ),
    ).definitions.map(({ name }) => name),
  ])).sort((left, right) => left.localeCompare(right));
  const profile = {
    createdBy: (user.name ?? "").slice(0, 100),
    companyName: (user.companyName ?? "").slice(0, 100),
    role: (user.role ?? "").slice(0, 100),
    contact: (user.contact ?? "").slice(0, 120),
    address: (user.address ?? "").slice(0, 120),
  };
  const qr = QRCode.create(JSON.stringify(profile), { errorCorrectionLevel: "M" });
  const profileQrCode = Array.from({ length: qr.modules.size }, (_, row) =>
    Array.from({ length: qr.modules.size }, (_, column) => qr.modules.get(row, column) !== 0),
  );

  return (
    <ProductionDashboard
      accountId={user.id}
      accountName={user.name || user.companyName || user.email || "Production user"}
      profile={profile}
      profileQrCode={profileQrCode}
      cartonTypes={cartonTypes}
      organizations={organizations}
      jobs={dashboardJobs}
      schedules={dashboardSchedules}
      materials={dashboardMaterials}
      suppliers={dashboardSuppliers}
      purchaseOrders={dashboardPurchaseOrders}
      stockMovements={dashboardStockMovements}
      isAdmin={isAdmin}
      canManageOrganizations={isAdminEmail(user.email)}
    />
  );
}
