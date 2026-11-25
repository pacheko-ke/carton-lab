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
  PRODUCTION_WORKFLOW_STAGES,
  isRecord,
} from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import ProductionDashboard, {
  type ProductionDashboardJob,
  type ProductionDashboardOrganization,
  type ProductionDashboardMaterial,
  type ProductionDashboardNonconformance,
  type ProductionDashboardPaperReel,
  type ProductionDashboardQuote,
  type ProductionDashboardReelMovement,
  type ProductionDashboardQualityMetrics,
  type ProductionDashboardQualityInspection,
  type ProductionDashboardPurchaseOrder,
  type ProductionDashboardRun,
  type ProductionDashboardSchedule,
  type ProductionDashboardStockMovement,
  type ProductionDashboardSupplier,
  type ProductionDashboardWarehousePallet,
  type ProductionDashboardDispatch,
  type ProductionDashboardInvoice,
  type ProductionDashboardTooling,
  type ProductionDashboardCustomer,
  type ProductionDashboardMachine,
  type ProductionDashboardMaintenancePlan,
  type ProductionDashboardMaintenanceTicket,
  type ProductionDashboardEmployee,
  type ProductionDashboardShift,
  type ProductionDashboardLeaveRequest,
  type ProductionDashboardSafetyTraining,
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

function isProductionInvoiceStatus(
  value: string,
): value is ProductionDashboardInvoice["status"] {
  return value === "OPEN" ||
    value === "PARTIALLY_PAID" ||
    value === "PAID" ||
    value === "CREDITED";
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
          machineId: true,
          workCenter: true,
          machine: { select: { machineNo: true, name: true } },
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
                machine: { select: { machineNo: true, name: true } },
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
      machineLabel: schedule.machine
        ? `${schedule.machine.machineNo} — ${schedule.machine.name}`
        : schedule.workCenter,
      scheduledStartAt: schedule.scheduledStartAt.toISOString(),
      scheduledEndAt: schedule.scheduledEndAt.toISOString(),
      operation: schedule.operation,
      status: schedule.status,
      actualGoodQty: operationRunTotalsByScheduleId.get(schedule.id)?._sum.goodQty ?? 0,
      actualRejectedQty: operationRunTotalsByScheduleId.get(schedule.id)?._sum.rejectedQty ?? 0,
      runCount: operationRunTotalsByScheduleId.get(schedule.id)?._count._all ?? 0,
    };
  });
  const scheduledWorkflowStages = new Map<string, ProductionDashboardJob["workflowStage"]>();
  for (const schedule of dashboardSchedules) {
    let targetStage: ProductionDashboardJob["workflowStage"] | null = null;
    if (schedule.operation === "Corrugating") targetStage = "Board Production";
    if (schedule.operation === "Printing") {
      targetStage = schedule.status === "COMPLETED" ? "Dispatch" : "Printing";
    }
    if (!targetStage) continue;
    const job = jobsById.get(schedule.jobId);
    if (!job || job.flag) continue;
    const currentStage = scheduledWorkflowStages.get(job.id) ?? job.workflowStage;
    if (
      PRODUCTION_WORKFLOW_STAGES.indexOf(targetStage) >
      PRODUCTION_WORKFLOW_STAGES.indexOf(currentStage)
    ) {
      scheduledWorkflowStages.set(job.id, targetStage);
    }
  }
  const dashboardJobsWithScheduledStages = dashboardJobs.map((job) => {
    const workflowStage = scheduledWorkflowStages.get(job.id);
    return workflowStage ? { ...job, workflowStage } : job;
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
      machineLabel: run.schedule.machine
        ? `${run.schedule.machine.machineNo} — ${run.schedule.machine.name}`
        : run.schedule.workCenter,
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
  const [paperReelRows, reelMovementRows] = productionOrganizationIds.length
    ? await Promise.all([
        prisma.productionPaperReel.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
          take: 500,
          select: {
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
            material: { select: { id: true, code: true, name: true } },
            supplier: { select: { id: true, name: true } },
            purchaseOrderLine: {
              select: { purchaseOrder: { select: { orderNo: true } } },
            },
            parentReel: { select: { id: true, reelNo: true } },
          },
        }),
        prisma.productionReelMovement.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: { createdAt: "desc" },
          take: 300,
          select: {
            id: true,
            organizationId: true,
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
      ])
    : [[], []];
  const dashboardPaperReels: ProductionDashboardPaperReel[] = paperReelRows.map((reel) => ({
    ...reel,
    widthMm: reel.widthMm.toString(),
    gsm: reel.gsm.toString(),
    receivedWeightKg: reel.receivedWeightKg.toString(),
    availableWeightKg: reel.availableWeightKg.toString(),
    receivedAt: reel.receivedAt.toISOString(),
    purchaseOrderNo: reel.purchaseOrderLine?.purchaseOrder.orderNo ?? null,
  }));
  const dashboardReelMovements: ProductionDashboardReelMovement[] = reelMovementRows.map((movement) => ({
    ...movement,
    reelNo: movement.reel.reelNo,
    relatedReelNo: movement.relatedReel?.reelNo ?? null,
    jobNo: movement.job ? textValue(movement.job.data, "jobNo") : "",
    jobName: movement.job ? textValue(movement.job.data, "jobName") : "",
    deltaKg: movement.deltaKg.toString(),
    createdAt: movement.createdAt.toISOString(),
    createdByName: movement.createdBy?.name || "Production user",
  }));
  const [toolingRows, customerRows] = productionOrganizationIds.length
    ? await Promise.all([
        prisma.productionTooling.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: [{ status: "asc" }, { toolNo: "asc" }],
          take: 500,
          select: {
            id: true,
            organizationId: true,
            toolNo: true,
            name: true,
            category: true,
            ownerType: true,
            customerId: true,
            storageLocation: true,
            status: true,
            usageCount: true,
            wearNotes: true,
            notes: true,
            updatedAt: true,
            customer: { select: { name: true } },
            events: {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                eventType: true,
                description: true,
                createdAt: true,
                jobId: true,
                job: { select: { data: true } },
                createdBy: { select: { name: true } },
              },
            },
          },
        }),
        prisma.productionCustomer.findMany({
          orderBy: { name: "asc" },
          take: 500,
          select: {
            id: true,
            name: true,
            kraPin: true,
            contactPerson: true,
            phone: true,
            email: true,
            address: true,
          },
        }),
      ])
    : [[], []];
  const dashboardTooling: ProductionDashboardTooling[] = toolingRows.map((tool) => ({
    ...tool,
    customerName: tool.customer?.name ?? null,
    updatedAt: tool.updatedAt.toISOString(),
    events: tool.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      description: event.description,
      createdAt: event.createdAt.toISOString(),
      jobId: event.jobId,
      jobNo: event.job ? textValue(event.job.data, "jobNo") : "",
      createdByName: event.createdBy?.name || "Production user",
    })),
  }));
  const dashboardCustomers: ProductionDashboardCustomer[] = customerRows;
  const [machineRows, maintenancePlanRows, maintenanceTicketRows] =
    productionOrganizationIds.length
      ? await Promise.all([
          prisma.productionMachine.findMany({
            where: { organizationId: { in: productionOrganizationIds } },
            orderBy: [{ status: "asc" }, { machineNo: "asc" }],
            take: 300,
            select: {
              id: true,
              organizationId: true,
              machineNo: true,
              name: true,
              machineType: true,
              workCenter: true,
              location: true,
              status: true,
            },
          }),
          prisma.productionMaintenancePlan.findMany({
            where: { organizationId: { in: productionOrganizationIds } },
            orderBy: [{ active: "desc" }, { nextDueAt: "asc" }],
            take: 500,
            select: {
              id: true,
              organizationId: true,
              machineId: true,
              taskName: true,
              intervalDays: true,
              nextDueAt: true,
              lastCompletedAt: true,
              instructions: true,
              active: true,
              machine: { select: { machineNo: true, name: true } },
            },
          }),
          prisma.productionMaintenanceTicket.findMany({
            where: { organizationId: { in: productionOrganizationIds } },
            orderBy: [{ status: "asc" }, { openedAt: "desc" }],
            take: 500,
            select: {
              id: true,
              organizationId: true,
              machineId: true,
              planId: true,
              jobId: true,
              operationScheduleId: true,
              ticketNo: true,
              ticketType: true,
              priority: true,
              status: true,
              description: true,
              resolution: true,
              downtimeMinutes: true,
              openedAt: true,
              closedAt: true,
              machine: { select: { machineNo: true, name: true } },
              plan: { select: { taskName: true } },
              job: { select: { data: true } },
              operationSchedule: { select: { operation: true } },
              createdBy: { select: { name: true } },
              closedBy: { select: { name: true } },
              parts: {
                orderBy: { issuedAt: "desc" },
                select: {
                  id: true,
                  quantity: true,
                  issuedAt: true,
                  material: { select: { id: true, code: true, name: true, unit: true } },
                  issuedBy: { select: { name: true } },
                },
              },
            },
          }),
        ])
      : [[], [], []];
  const dashboardMachines: ProductionDashboardMachine[] = machineRows;
  const dashboardMaintenancePlans: ProductionDashboardMaintenancePlan[] =
    maintenancePlanRows.map((plan) => ({
      ...plan,
      nextDueAt: plan.nextDueAt.toISOString(),
      lastCompletedAt: plan.lastCompletedAt?.toISOString() ?? null,
      machineNo: plan.machine.machineNo,
      machineName: plan.machine.name,
    }));
  const dashboardMaintenanceTickets: ProductionDashboardMaintenanceTicket[] =
    maintenanceTicketRows.map((ticket) => ({
      id: ticket.id,
      organizationId: ticket.organizationId,
      machineId: ticket.machineId,
      planId: ticket.planId,
      jobId: ticket.jobId,
      operationScheduleId: ticket.operationScheduleId,
      ticketNo: ticket.ticketNo,
      ticketType: ticket.ticketType,
      priority: ticket.priority,
      status: ticket.status,
      description: ticket.description,
      resolution: ticket.resolution,
      downtimeMinutes: ticket.downtimeMinutes,
      openedAt: ticket.openedAt.toISOString(),
      closedAt: ticket.closedAt?.toISOString() ?? null,
      machineNo: ticket.machine.machineNo,
      machineName: ticket.machine.name,
      planName: ticket.plan?.taskName ?? null,
      jobNo: ticket.job ? textValue(ticket.job.data, "jobNo") : "",
      operation: ticket.operationSchedule?.operation ?? "",
      createdByName: ticket.createdBy?.name || "Production user",
      closedByName: ticket.closedBy?.name || "",
      parts: ticket.parts.map((part) => ({
        id: part.id,
        quantity: part.quantity.toString(),
        issuedAt: part.issuedAt.toISOString(),
        material: part.material,
        issuedByName: part.issuedBy?.name || "Production user",
      })),
    }));
  const [employeeRows, rosterShiftRows, leaveRequestRows, safetyTrainingRows] =
    productionOrganizationIds.length
      ? await Promise.all([
          prisma.productionEmployee.findMany({
            where: { organizationId: { in: productionOrganizationIds } },
            orderBy: [{ status: "asc" }, { name: "asc" }],
            take: 1000,
            select: {
              id: true,
              organizationId: true,
              employeeNo: true,
              name: true,
              department: true,
              jobTitle: true,
              status: true,
              hiredAt: true,
            },
          }),
          prisma.productionRosterShift.findMany({
            where: { organizationId: { in: productionOrganizationIds } },
            orderBy: { startsAt: "desc" },
            take: 1000,
            select: {
              id: true,
              organizationId: true,
              employeeId: true,
              shiftName: true,
              workCenter: true,
              startsAt: true,
              endsAt: true,
              breakMinutes: true,
              status: true,
              notes: true,
              employee: { select: { employeeNo: true, name: true, department: true } },
              attendance: {
                select: {
                  clockedInAt: true,
                  clockedOutAt: true,
                  overtimeMinutes: true,
                  notes: true,
                },
              },
            },
          }),
          prisma.productionLeaveRequest.findMany({
            where: { organizationId: { in: productionOrganizationIds } },
            orderBy: [{ status: "asc" }, { startsAt: "asc" }],
            take: 1000,
            select: {
              id: true,
              organizationId: true,
              employeeId: true,
              leaveType: true,
              startsAt: true,
              endsAt: true,
              reason: true,
              status: true,
              reviewNotes: true,
              createdAt: true,
              reviewedAt: true,
              employee: { select: { employeeNo: true, name: true, department: true } },
              reviewedBy: { select: { name: true } },
            },
          }),
          prisma.productionSafetyTraining.findMany({
            where: { organizationId: { in: productionOrganizationIds } },
            orderBy: [{ expiresAt: "asc" }, { completedAt: "desc" }],
            take: 1000,
            select: {
              id: true,
              organizationId: true,
              employeeId: true,
              trainingName: true,
              provider: true,
              completedAt: true,
              expiresAt: true,
              notes: true,
              employee: { select: { employeeNo: true, name: true, department: true } },
            },
          }),
        ])
      : [[], [], [], []];
  const dashboardEmployees: ProductionDashboardEmployee[] = employeeRows.map((employee) => ({
    ...employee,
    hiredAt: employee.hiredAt.toISOString(),
  }));
  const dashboardRosterShifts: ProductionDashboardShift[] = rosterShiftRows.map((shift) => ({
    ...shift,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    attendance: shift.attendance
      ? {
          ...shift.attendance,
          clockedInAt: shift.attendance.clockedInAt.toISOString(),
          clockedOutAt: shift.attendance.clockedOutAt?.toISOString() ?? null,
        }
      : null,
  }));
  const dashboardLeaveRequests: ProductionDashboardLeaveRequest[] = leaveRequestRows.map((request) => ({
    ...request,
    startsAt: request.startsAt.toISOString(),
    endsAt: request.endsAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
  }));
  const dashboardSafetyTrainings: ProductionDashboardSafetyTraining[] = safetyTrainingRows.map((training) => ({
    ...training,
    completedAt: training.completedAt.toISOString(),
    expiresAt: training.expiresAt?.toISOString() ?? null,
  }));
  const [warehousePalletRows, dispatchRows] = productionOrganizationIds.length
    ? await Promise.all([
        prisma.productionWarehousePallet.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: { receivedAt: "desc" },
          take: 500,
          select: {
            id: true,
            organizationId: true,
            jobId: true,
            palletNo: true,
            quantityReceived: true,
            quantityAvailable: true,
            location: true,
            notes: true,
            receivedAt: true,
            job: { select: { data: true } },
          },
        }),
        prisma.productionDispatch.findMany({
          where: { organizationId: { in: productionOrganizationIds } },
          orderBy: { dispatchedAt: "desc" },
          take: 300,
          select: {
            id: true,
            organizationId: true,
            jobId: true,
            dispatchNo: true,
            deliveryNoteNo: true,
            status: true,
            vehicleRegistration: true,
            driverName: true,
            route: true,
            notes: true,
            dispatchedAt: true,
            deliveredAt: true,
            receivedBy: true,
            deliveryNotes: true,
            job: {
              select: {
                data: true,
                quote: {
                  select: {
                    currency: true,
                    lines: { select: { itemCode: true, unitPrice: true } },
                  },
                },
              },
            },
            lines: {
              orderBy: { pallet: { palletNo: "asc" } },
              select: {
                quantity: true,
                pallet: { select: { id: true, palletNo: true, location: true } },
              },
            },
          },
        }),
      ])
    : [[], []];
  const dashboardWarehousePallets: ProductionDashboardWarehousePallet[] =
    warehousePalletRows.map((pallet) => ({
      ...pallet,
      jobNo: textValue(pallet.job.data, "jobNo"),
      jobName: textValue(pallet.job.data, "jobName"),
      customer: textValue(pallet.job.data, "customer"),
      receivedAt: pallet.receivedAt.toISOString(),
    }));
  const dashboardDispatches: ProductionDashboardDispatch[] = dispatchRows.map((dispatch) => {
    if (dispatch.status !== "DISPATCHED" && dispatch.status !== "DELIVERED") {
      throw new Error(`Dispatch ${dispatch.id} has an invalid shipment status.`);
    }
    const itemCode = textValue(dispatch.job.data, "itemCode");
    const quotedLine = dispatch.job.quote?.lines.find((line) => line.itemCode === itemCode);
    return {
      ...dispatch,
      status: dispatch.status,
      jobNo: textValue(dispatch.job.data, "jobNo"),
      jobName: textValue(dispatch.job.data, "jobName"),
      customer: textValue(dispatch.job.data, "customer"),
      quotedUnitPrice: quotedLine?.unitPrice.toString() ?? null,
      quoteCurrency: dispatch.job.quote?.currency ?? null,
      dispatchedAt: dispatch.dispatchedAt.toISOString(),
      deliveredAt: dispatch.deliveredAt?.toISOString() ?? null,
      lines: dispatch.lines.map((line) => ({
        palletId: line.pallet.id,
        palletNo: line.pallet.palletNo,
        location: line.pallet.location,
        quantity: line.quantity,
      })),
    };
  });
  const invoiceRows = productionOrganizationIds.length
    ? await prisma.productionInvoice.findMany({
        where: { organizationId: { in: productionOrganizationIds } },
        orderBy: { issuedAt: "desc" },
        take: 500,
        select: {
          id: true,
          organizationId: true,
          jobId: true,
          dispatchId: true,
          invoiceNo: true,
          customerName: true,
          jobNo: true,
          customerPO: true,
          status: true,
          currency: true,
          quantity: true,
          unitPrice: true,
          totalAmount: true,
          amountPaid: true,
          amountCredited: true,
          issuedAt: true,
          dueAt: true,
          job: { select: { data: true } },
          dispatch: { select: { dispatchNo: true, deliveryNoteNo: true } },
          payments: {
            orderBy: { paidAt: "desc" },
            select: {
              paymentNo: true,
              amount: true,
              method: true,
              reference: true,
              notes: true,
              paidAt: true,
            },
          },
          creditNotes: {
            orderBy: { issuedAt: "desc" },
            select: {
              creditNoteNo: true,
              amount: true,
              reason: true,
              notes: true,
              issuedAt: true,
            },
          },
        },
      })
    : [];
  const dashboardInvoices: ProductionDashboardInvoice[] = invoiceRows.map((invoice) => {
    if (!isProductionInvoiceStatus(invoice.status)) {
      throw new Error(`Invoice ${invoice.id} has an invalid payment status.`);
    }
    return {
      ...invoice,
      status: invoice.status,
      jobName: textValue(invoice.job.data, "jobName"),
      unitPrice: invoice.unitPrice.toString(),
      totalAmount: invoice.totalAmount.toString(),
      amountPaid: invoice.amountPaid.toString(),
      amountCredited: invoice.amountCredited.toString(),
      issuedAt: invoice.issuedAt.toISOString(),
      dueAt: invoice.dueAt.toISOString(),
      dispatchNo: invoice.dispatch.dispatchNo,
      deliveryNoteNo: invoice.dispatch.deliveryNoteNo,
      payments: invoice.payments.map((payment) => ({
        ...payment,
        amount: payment.amount.toString(),
        paidAt: payment.paidAt.toISOString(),
      })),
      creditNotes: invoice.creditNotes.map((creditNote) => ({
        ...creditNote,
        amount: creditNote.amount.toString(),
        issuedAt: creditNote.issuedAt.toISOString(),
      })),
    };
  });
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
      jobs={dashboardJobsWithScheduledStages}
      schedules={dashboardSchedules}
      operationRuns={dashboardOperationRuns}
      qualityInspections={dashboardQualityInspections}
      nonconformances={dashboardNonconformances}
      qualityMetrics={dashboardQualityMetrics}
      materials={dashboardMaterials}
      suppliers={dashboardSuppliers}
      purchaseOrders={dashboardPurchaseOrders}
      stockMovements={dashboardStockMovements}
      paperReels={dashboardPaperReels}
      reelMovements={dashboardReelMovements}
      warehousePallets={dashboardWarehousePallets}
      dispatches={dashboardDispatches}
      invoices={dashboardInvoices}
      tooling={dashboardTooling}
      customers={dashboardCustomers}
      machines={dashboardMachines}
      maintenancePlans={dashboardMaintenancePlans}
      maintenanceTickets={dashboardMaintenanceTickets}
      employees={dashboardEmployees}
      rosterShifts={dashboardRosterShifts}
      leaveRequests={dashboardLeaveRequests}
      safetyTrainings={dashboardSafetyTrainings}
      quotes={dashboardQuotes}
      isAdmin={isAdmin}
      canManageOrganizations={isAdminEmail(user.email)}
    />
  );
}
