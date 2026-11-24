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
  isProductionQualityCheck,
  isProductionQualityInspectionResult,
  isProductionQualityInspectionType,
  isProductionNonconformanceDisposition,
  isProductionNonconformanceSeverity,
  isProductionNonconformanceStatus,
  isProductionWorkflowStage,
  isRecord,
} from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import ProductionDashboard, {
  type ProductionDashboardJob,
  type ProductionDashboardOrganization,
  type ProductionDashboardMaterial,
  type ProductionDashboardNonconformance,
  type ProductionDashboardQuote,
  type ProductionDashboardQualityMetrics,
  type ProductionDashboardQualityInspection,
  type ProductionDashboardPurchaseOrder,
  type ProductionDashboardRun,
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
  const [operationRunTotals, operationRunRows] = productionOrganizationIds.length
    ? await Promise.all([
        prisma.productionOperationRun.groupBy({
          by: ["scheduleId"],
          where: { organizationId: { in: productionOrganizationIds } },
          _sum: { goodQty: true, rejectedQty: true },
          _count: { _all: true },
        }),
        prisma.productionOperationRun.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: { recordedAt: "desc" },
          take: 100,
          select: {
            id: true,
            organizationId: true,
            scheduleId: true,
            goodQty: true,
            rejectedQty: true,
            notes: true,
            recordedAt: true,
            createdBy: { select: { name: true } },
            schedule: {
              select: {
                operation: true,
                workCenter: true,
                job: { select: { data: true } },
              },
            },
          },
        }),
      ])
    : [[], []];
  const operationRunTotalsByScheduleId = new Map(
    operationRunTotals.map((total) => [total.scheduleId, total]),
  );
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
      actualGoodQty: operationRunTotalsByScheduleId.get(schedule.id)?._sum.goodQty ?? 0,
      actualRejectedQty: operationRunTotalsByScheduleId.get(schedule.id)?._sum.rejectedQty ?? 0,
      runCount: operationRunTotalsByScheduleId.get(schedule.id)?._count._all ?? 0,
    };
  });
  const dashboardOperationRuns: ProductionDashboardRun[] = operationRunRows.map((run) => {
    if (!isProductionOperation(run.schedule.operation)) {
      throw new Error(`Production operation run ${run.id} references an invalid operation.`);
    }
    return {
      id: run.id,
      organizationId: run.organizationId,
      scheduleId: run.scheduleId,
      operation: run.schedule.operation,
      jobNo: textValue(run.schedule.job.data, "jobNo"),
      workCenter: run.schedule.workCenter,
      goodQty: run.goodQty,
      rejectedQty: run.rejectedQty,
      notes: run.notes,
      recordedAt: run.recordedAt.toISOString(),
      recordedByName: run.createdBy?.name || "Production user",
    };
  });
  const [
    qualityInspectionRows,
    nonconformanceRows,
    qualityInspectionStats,
    nonconformanceStats,
  ] = productionOrganizationIds.length
    ? await Promise.all([
        prisma.productionQualityInspection.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: { inspectedAt: "desc" },
          take: 200,
          select: {
            id: true,
            organizationId: true,
            inspectionNo: true,
            jobId: true,
            scheduleId: true,
            inspectionType: true,
            sampleQty: true,
            rejectedQty: true,
            result: true,
            checks: true,
            notes: true,
            inspectedAt: true,
            job: { select: { data: true } },
            schedule: { select: { operation: true } },
            createdBy: { select: { name: true } },
          },
        }),
        prisma.productionNonconformance.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: [{ status: "desc" }, { createdAt: "desc" }],
          take: 200,
          select: {
            id: true,
            organizationId: true,
            ncrNo: true,
            job: { select: { data: true } },
            inspection: { select: { inspectionNo: true } },
            description: true,
            severity: true,
            affectedQty: true,
            disposition: true,
            status: true,
            rootCause: true,
            correctiveAction: true,
            resolutionNotes: true,
            createdAt: true,
            updatedAt: true,
            closedAt: true,
            createdBy: { select: { name: true } },
            updatedBy: { select: { name: true } },
            resolvedBy: { select: { name: true } },
          },
        }),
        prisma.productionQualityInspection.groupBy({
          by: ["organizationId", "result"],
          where: { organizationId: { in: productionOrganizationIds } },
          _count: { _all: true },
          _sum: { sampleQty: true, rejectedQty: true },
        }),
        prisma.productionNonconformance.groupBy({
          by: ["organizationId", "status"],
          where: { organizationId: { in: productionOrganizationIds } },
          _count: { _all: true },
        }),
      ])
    : [[], [], [], []];
  const dashboardQualityInspections: ProductionDashboardQualityInspection[] =
    qualityInspectionRows.map((inspection) => {
      const operation = inspection.schedule?.operation ?? null;
      if (
        !isProductionQualityInspectionType(inspection.inspectionType) ||
        !isProductionQualityInspectionResult(inspection.result) ||
        !Array.isArray(inspection.checks) ||
        !inspection.checks.every(isProductionQualityCheck)
      ) {
        throw new Error(`Quality inspection ${inspection.id} contains invalid inspection data.`);
      }
      if (operation !== null && !isProductionOperation(operation)) {
        throw new Error(`Quality inspection ${inspection.id} references an invalid operation.`);
      }
      const job = jobsById.get(inspection.jobId);
      if (!job) {
        throw new Error(`Quality inspection ${inspection.id} references an unavailable job.`);
      }
      return {
        id: inspection.id,
        organizationId: inspection.organizationId,
        inspectionNo: inspection.inspectionNo,
        jobId: inspection.jobId,
        jobNo: job.jobNo,
        jobName: job.jobName,
        scheduleId: inspection.scheduleId,
        operation,
        inspectionType: inspection.inspectionType,
        sampleQty: inspection.sampleQty,
        rejectedQty: inspection.rejectedQty,
        result: inspection.result,
        checks: inspection.checks,
        notes: inspection.notes,
        inspectedAt: inspection.inspectedAt.toISOString(),
        inspectorName: inspection.createdBy?.name || "Production user",
      };
    });
  const dashboardNonconformances: ProductionDashboardNonconformance[] =
    nonconformanceRows.map((nonconformance) => {
      if (
        !isProductionNonconformanceSeverity(nonconformance.severity) ||
        !isProductionNonconformanceDisposition(nonconformance.disposition) ||
        !isProductionNonconformanceStatus(nonconformance.status)
      ) {
        throw new Error(`Nonconformance ${nonconformance.id} contains invalid workflow data.`);
      }
      const jobNo = textValue(nonconformance.job.data, "jobNo");
      const jobName = textValue(nonconformance.job.data, "jobName");
      return {
        id: nonconformance.id,
        organizationId: nonconformance.organizationId,
        ncrNo: nonconformance.ncrNo,
        jobNo,
        jobName,
        inspectionNo: nonconformance.inspection?.inspectionNo ?? null,
        description: nonconformance.description,
        severity: nonconformance.severity,
        affectedQty: nonconformance.affectedQty,
        disposition: nonconformance.disposition,
        status: nonconformance.status,
        rootCause: nonconformance.rootCause,
        correctiveAction: nonconformance.correctiveAction,
        resolutionNotes: nonconformance.resolutionNotes,
        createdAt: nonconformance.createdAt.toISOString(),
        updatedAt: nonconformance.updatedAt.toISOString(),
        closedAt: nonconformance.closedAt?.toISOString() ?? null,
        createdByName: nonconformance.createdBy?.name || "Production user",
        updatedByName: nonconformance.updatedBy?.name || "Production user",
        resolvedByName: nonconformance.resolvedBy?.name || "Production user",
      };
    });
  const dashboardQualityMetrics: ProductionDashboardQualityMetrics[] =
    productionOrganizationIds.map((organizationId) => {
      const inspections = qualityInspectionStats.filter(
        (stat) => stat.organizationId === organizationId,
      );
      const ncrs = nonconformanceStats.filter(
        (stat) => stat.organizationId === organizationId,
      );
      return {
        organizationId,
        inspections: inspections.reduce((total, stat) => total + stat._count._all, 0),
        passed: inspections.find((stat) => stat.result === "PASS")?._count._all ?? 0,
        failed: inspections.find((stat) => stat.result === "FAIL")?._count._all ?? 0,
        sampledUnits: inspections.reduce((total, stat) => total + (stat._sum.sampleQty ?? 0), 0),
        rejectedUnits: inspections.reduce((total, stat) => total + (stat._sum.rejectedQty ?? 0), 0),
        openNcrs: ncrs
          .filter((stat) => stat.status !== "CLOSED")
          .reduce((total, stat) => total + stat._count._all, 0),
        totalNcrs: ncrs.reduce((total, stat) => total + stat._count._all, 0),
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
  const quoteOrganizationIds = organizations
    .filter((organization) =>
      organization.role === "ORDER_BOOKER" || organization.role === "PRODUCTION",
    )
    .map((organization) => organization.id);
  const quoteRows = quoteOrganizationIds.length
    ? await prisma.productionQuote.findMany({
        where: { organizationId: { in: quoteOrganizationIds } },
        orderBy: [{ createdAt: "desc" }, { version: "desc" }],
        take: 200,
        select: {
          id: true,
          organizationId: true,
          quoteNo: true,
          version: true,
          status: true,
          currency: true,
          validUntil: true,
          inquiryReference: true,
          notes: true,
          rejectionReason: true,
          totalCost: true,
          totalPrice: true,
          submittedAt: true,
          approvedAt: true,
          rejectedAt: true,
          convertedAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          lines: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              itemId: true,
              itemCode: true,
              itemName: true,
              boxType: true,
              topLiner: true,
              medium: true,
              bottomLiner: true,
              length: true,
              width: true,
              height: true,
              unit: true,
              quantity: true,
              boardAreaM2: true,
              boardGsm: true,
              paperCostPerKg: true,
              trimWastePercent: true,
              conversionCost: true,
              consumablesCost: true,
              marginPercent: true,
              materialCostPerUnit: true,
              unitCost: true,
              unitPrice: true,
              lineCostTotal: true,
              linePriceTotal: true,
            },
          },
        },
      })
    : [];
  const dashboardQuotes: ProductionDashboardQuote[] = quoteRows.map((quote) => ({
    ...quote,
    organizationName: organizationNames.get(quote.organizationId) ?? "Production organization",
    validUntil: quote.validUntil.toISOString(),
    totalCost: quote.totalCost.toString(),
    totalPrice: quote.totalPrice.toString(),
    submittedAt: quote.submittedAt?.toISOString() ?? null,
    approvedAt: quote.approvedAt?.toISOString() ?? null,
    rejectedAt: quote.rejectedAt?.toISOString() ?? null,
    convertedAt: quote.convertedAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    createdByName: quote.createdBy?.name || "Production user",
    approvedByName: quote.approvedBy?.name || "Production user",
    lines: quote.lines.map((line) => ({
      ...line,
      boardAreaM2: line.boardAreaM2.toString(),
      boardGsm: line.boardGsm.toString(),
      paperCostPerKg: line.paperCostPerKg.toString(),
      trimWastePercent: line.trimWastePercent.toString(),
      conversionCost: line.conversionCost.toString(),
      consumablesCost: line.consumablesCost.toString(),
      marginPercent: line.marginPercent.toString(),
      materialCostPerUnit: line.materialCostPerUnit.toString(),
      unitCost: line.unitCost.toString(),
      unitPrice: line.unitPrice.toString(),
      lineCostTotal: line.lineCostTotal.toString(),
      linePriceTotal: line.linePriceTotal.toString(),
    })),
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
      operationRuns={dashboardOperationRuns}
      qualityInspections={dashboardQualityInspections}
      nonconformances={dashboardNonconformances}
      qualityMetrics={dashboardQualityMetrics}
      materials={dashboardMaterials}
      suppliers={dashboardSuppliers}
      purchaseOrders={dashboardPurchaseOrders}
      stockMovements={dashboardStockMovements}
      quotes={dashboardQuotes}
      isAdmin={isAdmin}
      canManageOrganizations={isAdminEmail(user.email)}
    />
  );
}
