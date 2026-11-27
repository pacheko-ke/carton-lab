"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiActivity,
  FiBell,
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronDown,
  FiClipboard,
  FiDollarSign,
  FiEdit2,
  FiFlag,
  FiGrid,
  FiLayers,
  FiLoader,
  FiMenu,
  FiPackage,
  FiPaperclip,
  FiPenTool,
  FiPlus,
  FiPrinter,
  FiRefreshCw,
  FiSettings,
  FiShoppingCart,
  FiTruck,
  FiTool,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import BrandLogo from "@/app/brand-logo";
import {
  getProductionOperationBalance,
  MAX_ARTWORK_FILE_BYTES,
  MAX_ARTWORK_REVISION_COMMENT_LENGTH,
  MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH,
  PRODUCTION_OPERATIONS,
  PRODUCTION_OPERATION_STATUSES,
  PRODUCTION_QUALITY_INSPECTION_TYPES,
  PRODUCTION_QUALITY_CHECK_RESULTS,
  PRODUCTION_NONCONFORMANCE_DISPOSITIONS,
  PRODUCTION_NONCONFORMANCE_SEVERITIES,
  PRODUCTION_NONCONFORMANCE_STATUSES,
  PRODUCTION_ORIGINATION_PRINT_FIELDS,
  PRODUCTION_WORKFLOW_STAGES,
  hasProductionRole,
  isProductionOriginationQueueStage,
  isProductionOperation,
  isProductionOperationStatus,
  isProductionQualityCheckResult,
  isProductionQualityInspectionType,
  isProductionNonconformanceDisposition,
  isProductionNonconformanceSeverity,
} from "@/lib/production-data";
import type {
  ProductionNonconformanceUpdateInput,
  ProductionOperation,
  ProductionOperationStatus,
  ProductionQualityCheckInput,
  ProductionQualityInspectionInput,
  ProductionWorkflowStage,
} from "@/lib/production-data";
import {
  PRODUCTION_MATERIAL_CATEGORIES,
  PRODUCTION_MATERIAL_UNITS,
} from "@/lib/production-supply-data";
import {
  isProductionInvoiceCurrency,
  isProductionPaymentMethod,
  PRODUCTION_INVOICE_CURRENCIES,
  PRODUCTION_PAYMENT_METHODS,
} from "@/lib/production-invoice-data";
import { receivableFinishedGoodsQuantity } from "@/lib/production-warehouse-data";
import {
  calculateProductionQuoteLineCosts,
  type ProductionQuoteLineInput,
} from "@/lib/production-quote-data";
import {
  PRODUCTION_TOOLING_CATEGORIES,
  PRODUCTION_TOOLING_EVENT_TYPES,
  PRODUCTION_TOOLING_OWNERS,
  PRODUCTION_TOOLING_STATUSES,
} from "@/lib/production-tooling-data";
import {
  getProductionMachineMaintenanceWarnings,
  isProductionMaintenanceTransitionAllowed,
  PRODUCTION_MAINTENANCE_PRIORITIES,
  PRODUCTION_MAINTENANCE_TICKET_TYPES,
  PRODUCTION_MAINTENANCE_TICKET_STATUSES,
} from "@/lib/production-maintenance-data";
import { notifyToast } from "@/app/toast-provider";

const ProductionArtworkPdfPreview = dynamic(
  () => import("./production-artwork-pdf-preview"),
  {
    ssr: false,
    loading: () => (
      <p className="production-chart-empty" role="status">
        Loading PDF preview…
      </p>
    ),
  },
);
import { PRODUCTION_LEAVE_TYPES } from "@/lib/production-hr-data";

export type ProductionDashboardWorkspace = {
  id: string;
  name: string;
  role: string;
};

type ProductionDashboardCustomerSummary = Pick<ProductionDashboardCustomer, "id" | "name">;

export type ProductionDashboardJob = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  itemId: string | null;
  productArtwork: boolean;
  latestArtworkVersion: number | null;
  jobNo: string;
  jobName: string;
  customer: string;
  cartonSpec: string;
  size: string;
  flag: { reason: string } | null;
  deliveryDate: string;
  priority: string;
  orderQty: number | null;
  workflowStage: ProductionWorkflowStage;
  artworkCount: number;
  updatedAt: string;
};

export type ProductionDashboardSchedule = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  jobId: string;
  jobNo: string;
  jobName: string;
  customer: string;
  operation: ProductionOperation;
  machineId: string | null;
  machineLabel: string;
  workCenter: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  plannedQty: number;
  actualGoodQty: number;
  actualRejectedQty: number;
  runCount: number;
  status: ProductionOperationStatus;
  notes: string;
};

type ProductionDashboardAttachment = {
  id: string;
  originalName: string;
  contentType: string;
  size: number;
  version: number;
  revisionComment: string;
  createdAt: string;
};

function isProductionDashboardAttachment(
  value: unknown,
): value is ProductionDashboardAttachment {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "originalName" in value &&
    typeof value.originalName === "string" &&
    "contentType" in value &&
    typeof value.contentType === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    "version" in value &&
    typeof value.version === "number" &&
    "revisionComment" in value &&
    typeof value.revisionComment === "string" &&
    "createdAt" in value &&
    typeof value.createdAt === "string"
  );
}

export type ProductionDashboardRun = {
  id: string;
  workspaceId: string;
  scheduleId: string;
  operation: ProductionOperation;
  jobNo: string;
  machineLabel: string;
  goodQty: number;
  rejectedQty: number;
  notes: string;
  recordedAt: string;
  recordedByName: string;
};

export type ProductionDashboardQualityInspection = {
  id: string;
  workspaceId: string;
  inspectionNo: string;
  jobId: string;
  jobNo: string;
  jobName: string;
  scheduleId: string | null;
  operation: ProductionOperation | null;
  inspectionType: (typeof PRODUCTION_QUALITY_INSPECTION_TYPES)[number];
  sampleQty: number;
  rejectedQty: number;
  result: "PASS" | "FAIL";
  checks: ProductionQualityCheckInput[];
  notes: string;
  inspectedAt: string;
  inspectorName: string;
};

export type ProductionDashboardNonconformance = {
  id: string;
  workspaceId: string;
  ncrNo: string;
  jobNo: string;
  jobName: string;
  inspectionNo: string | null;
  description: string;
  severity: (typeof PRODUCTION_NONCONFORMANCE_SEVERITIES)[number];
  affectedQty: number;
  disposition: (typeof PRODUCTION_NONCONFORMANCE_DISPOSITIONS)[number];
  status: (typeof PRODUCTION_NONCONFORMANCE_STATUSES)[number];
  rootCause: string;
  correctiveAction: string;
  resolutionNotes: string;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  createdByName: string;
  updatedByName: string;
  resolvedByName: string;
};

export type ProductionDashboardQualityMetrics = {
  workspaceId: string;
  inspections: number;
  passed: number;
  failed: number;
  sampledUnits: number;
  rejectedUnits: number;
  openNcrs: number;
  totalNcrs: number;
};

export type ProductionDashboardMaterial = {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  reorderPoint: string;
  onHand: string;
  active: boolean;
};

export type ProductionDashboardSupplier = {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
};

export type ProductionDashboardPurchaseOrderLine = {
  id: string;
  orderedQty: string;
  receivedQty: string;
  material: { id: string; code: string; name: string; unit: string };
};

export type ProductionDashboardPurchaseOrder = {
  id: string;
  workspaceId: string;
  orderNo: string;
  status: string;
  expectedAt: string | null;
  notes: string;
  createdAt: string;
  supplier: { id: string; code: string; name: string };
  lines: ProductionDashboardPurchaseOrderLine[];
};

export type ProductionDashboardStockMovement = {
  id: string;
  workspaceId: string;
  type: string;
  quantity: string;
  reference: string | null;
  notes: string;
  createdAt: string;
  material: { id: string; code: string; name: string; unit: string };
  jobId: string | null;
  jobNo: string;
};

export type ProductionDashboardPaperReel = {
  id: string;
  workspaceId: string;
  materialId: string;
  supplierId: string | null;
  purchaseOrderLineId: string | null;
  parentReelId: string | null;
  reelNo: string;
  barcode: string;
  batchNo: string;
  widthMm: string;
  gsm: string;
  receivedWeightKg: string;
  availableWeightKg: string;
  status: string;
  storageLocation: string;
  notes: string;
  receivedAt: string;
  material: { id: string; code: string; name: string };
  supplier: { id: string; name: string } | null;
  purchaseOrderNo: string | null;
  parentReel: { id: string; reelNo: string } | null;
};

export type ProductionDashboardReelMovement = {
  id: string;
  workspaceId: string;
  reelId: string;
  relatedReelId: string | null;
  jobId: string | null;
  reelNo: string;
  relatedReelNo: string | null;
  jobNo: string;
  jobName: string;
  type: string;
  deltaKg: string;
  notes: string;
  createdAt: string;
  createdByName: string;
};

type ProductionDashboardItem = {
  id: string;
  itemCode: string;
  customerId: string | null;
  name: string;
  boxType: string;
  topLiner: string;
  medium: string;
  bottomLiner: string;
  length: string;
  width: string;
  height: string;
  unit: "mm" | "in";
};

type ProductionOrderLineDraft = {
  id: string;
  itemId: string;
  orderQty: string;
};

export type ProductionDashboardCustomer = {
  id: string;
  name: string;
  kraPin: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type ProductionDashboardQuoteLine = {
  id: string;
  itemId: string | null;
  itemCode: string;
  itemName: string;
  boxType: string;
  topLiner: string;
  medium: string;
  bottomLiner: string;
  length: string;
  width: string;
  height: string;
  unit: string;
  quantity: number;
  boardAreaM2: string;
  boardGsm: string;
  paperCostPerKg: string;
  trimWastePercent: string;
  conversionCost: string;
  consumablesCost: string;
  marginPercent: string;
  materialCostPerUnit: string;
  unitCost: string;
  unitPrice: string;
  lineCostTotal: string;
  linePriceTotal: string;
};

export type ProductionDashboardQuote = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  quoteNo: string;
  version: number;
  status: string;
  currency: string;
  validUntil: string;
  inquiryReference: string;
  notes: string;
  rejectionReason: string;
  totalCost: string;
  totalPrice: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  createdByName: string;
  approvedByName: string;
  lines: ProductionDashboardQuoteLine[];
};

export type ProductionDashboardWarehousePallet = {
  id: string;
  workspaceId: string;
  jobId: string;
  palletNo: string;
  quantityReceived: number;
  quantityAvailable: number;
  location: string;
  notes: string;
  receivedAt: string;
  jobNo: string;
  jobName: string;
  customer: string;
};

export type ProductionDashboardDispatch = {
  id: string;
  workspaceId: string;
  jobId: string;
  dispatchNo: string;
  deliveryNoteNo: string;
  status: "DISPATCHED" | "DELIVERED";
  vehicleRegistration: string;
  driverName: string;
  route: string;
  notes: string;
  dispatchedAt: string;
  deliveredAt: string | null;
  receivedBy: string;
  deliveryNotes: string;
  jobNo: string;
  jobName: string;
  customer: string;
  quotedUnitPrice: string | null;
  quoteCurrency: string | null;
  lines: Array<{
    palletId: string;
    palletNo: string;
    location: string;
    quantity: number;
  }>;
};

export type ProductionDashboardInvoice = {
  id: string;
  workspaceId: string;
  jobId: string;
  dispatchId: string;
  invoiceNo: string;
  customerName: string;
  jobNo: string;
  jobName: string;
  customerPO: string;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID" | "CREDITED";
  currency: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  amountPaid: string;
  amountCredited: string;
  issuedAt: string;
  dueAt: string;
  dispatchNo: string;
  deliveryNoteNo: string;
  payments: Array<{
    paymentNo: string;
    amount: string;
    method: string;
    reference: string;
    notes: string;
    paidAt: string;
  }>;
  creditNotes: Array<{
    creditNoteNo: string;
    amount: string;
    reason: string;
    notes: string;
    issuedAt: string;
  }>;
};

export type ProductionDashboardToolingEvent = {
  id: string;
  eventType: string;
  description: string;
  createdAt: string;
  jobId: string | null;
  jobNo: string;
  createdByName: string;
};

export type ProductionDashboardTooling = {
  id: string;
  workspaceId: string;
  toolNo: string;
  name: string;
  category: string;
  ownerType: string;
  customerId: string | null;
  customerName: string | null;
  storageLocation: string;
  status: string;
  usageCount: number;
  wearNotes: string;
  notes: string;
  updatedAt: string;
  events: ProductionDashboardToolingEvent[];
};

export type ProductionDashboardMachine = {
  id: string;
  workspaceId: string;
  machineNo: string;
  name: string;
  machineType: string;
  workCenter: string;
  location: string;
  status: string;
};

export type ProductionDashboardMaintenancePlan = {
  id: string;
  workspaceId: string;
  machineId: string;
  taskName: string;
  intervalDays: number;
  nextDueAt: string;
  lastCompletedAt: string | null;
  instructions: string;
  active: boolean;
  machineNo: string;
  machineName: string;
};

export type ProductionDashboardMaintenanceTicket = {
  id: string;
  workspaceId: string;
  machineId: string;
  planId: string | null;
  jobId: string | null;
  operationScheduleId: string | null;
  ticketNo: string;
  ticketType: string;
  priority: string;
  status: string;
  description: string;
  resolution: string;
  downtimeMinutes: number;
  openedAt: string;
  closedAt: string | null;
  machineNo: string;
  machineName: string;
  planName: string | null;
  jobNo: string;
  operation: string;
  createdByName: string;
  closedByName: string;
  parts: Array<{
    id: string;
    quantity: string;
    issuedAt: string;
    material: { id: string; code: string; name: string; unit: string };
    issuedByName: string;
  }>;
};

export type ProductionDashboardEmployee = {
  id: string;
  workspaceId: string;
  employeeNo: string;
  name: string;
  department: string;
  jobTitle: string;
  status: string;
  hiredAt: string;
};

export type ProductionDashboardShift = {
  id: string;
  workspaceId: string;
  employeeId: string;
  shiftName: string;
  workCenter: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  status: string;
  notes: string;
  employee: { employeeNo: string; name: string; department: string };
  attendance: {
    clockedInAt: string;
    clockedOutAt: string | null;
    overtimeMinutes: number;
    notes: string;
  } | null;
};

export type ProductionDashboardLeaveRequest = {
  id: string;
  workspaceId: string;
  employeeId: string;
  leaveType: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: string;
  reviewNotes: string;
  createdAt: string;
  reviewedAt: string | null;
  employee: { employeeNo: string; name: string; department: string };
  reviewedBy: { name: string | null } | null;
};

export type ProductionDashboardSafetyTraining = {
  id: string;
  workspaceId: string;
  employeeId: string;
  trainingName: string;
  provider: string;
  completedAt: string;
  expiresAt: string | null;
  notes: string;
  employee: { employeeNo: string; name: string; department: string };
};

type ProductionDashboardNotification = {
  id: string;
  jobId: string;
  jobNo: string;
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

type Props = {
  accountId: string;
  accountName: string;
  profile: {
    createdBy: string;
    companyName: string;
    role: string;
    contact: string;
    address: string;
  };
  profileQrCode: boolean[][];
  cartonTypes: string[];
  workspaces: ProductionDashboardWorkspace[];
  jobs: ProductionDashboardJob[];
  originationJobs: ProductionDashboardJob[];
  schedules: ProductionDashboardSchedule[];
  operationRuns: ProductionDashboardRun[];
  qualityInspections: ProductionDashboardQualityInspection[];
  nonconformances: ProductionDashboardNonconformance[];
  qualityMetrics: ProductionDashboardQualityMetrics[];
  materials: ProductionDashboardMaterial[];
  suppliers: ProductionDashboardSupplier[];
  purchaseOrders: ProductionDashboardPurchaseOrder[];
  stockMovements: ProductionDashboardStockMovement[];
  paperReels: ProductionDashboardPaperReel[];
  reelMovements: ProductionDashboardReelMovement[];
  warehousePallets: ProductionDashboardWarehousePallet[];
  dispatches: ProductionDashboardDispatch[];
  invoices: ProductionDashboardInvoice[];
  tooling: ProductionDashboardTooling[];
  customers: ProductionDashboardCustomer[];
  machines: ProductionDashboardMachine[];
  maintenancePlans: ProductionDashboardMaintenancePlan[];
  maintenanceTickets: ProductionDashboardMaintenanceTicket[];
  employees: ProductionDashboardEmployee[];
  rosterShifts: ProductionDashboardShift[];
  leaveRequests: ProductionDashboardLeaveRequest[];
  safetyTrainings: ProductionDashboardSafetyTraining[];
  quotes: ProductionDashboardQuote[];
  isAdmin: boolean;
  canManageAccess: boolean;
  canManagePayroll: boolean;
};

type DashboardView =
  | "overview"
  | "jobs"
  | "origination"
  | "quotes"
  | "planning"
  | "execution"
  | "quality"
  | "Printing"
  | "customers"
  | "products"
  | "procurement"
  | "inventory"
  | "reels"
  | "warehouse"
  | "invoicing"
  | "tooling"
  | "maintenance"
  | "hr"
  | "job-sheet"
  | "order-detail"
  | "printing-detail"
  | ProductionWorkflowStage;

type WorkspaceNavGroup =
  | "orders"
  | "order-booking"
  | "customers"
  | "products"
  | "production"
  | "supply"
  | "fulfillment"
  | "assets"
  | "people";

const STAGE_DETAILS: Record<ProductionWorkflowStage | "planning" | "execution" | "quality" | "procurement" | "inventory" | "reels" | "warehouse" | "invoicing" | "tooling" | "maintenance" | "hr", string> = {
  "Order Booking": "Enter customer orders to start the production workflow",
  Origination: "Job details, customer requirements and carton specification",
  "Paper Booking": "Board specifications, material requirements and reel planning",
  "Board Production": "Converting, quality checks and board production tracking",
  Printing: "Print setup, artwork references and print instructions",
  Dispatch: "Packing, delivery details and final approvals",
  planning: "Schedule production operations by registered machine and planned quantity",
  execution: "Record actual production output, rejects, and operation completion",
  quality: "Inspect carton quality, manage nonconformances, and verify corrective actions",
  procurement: "Manage suppliers, material purchasing, and goods receipts",
  inventory: "Track material stock, job issues, and inventory adjustments",
  reels: "Register paper reels, issue them to jobs, trace batches, and manage remnants",
  warehouse: "Receive quality-released cartons, track pallet locations, and dispatch customer orders",
  invoicing: "Issue dispatch invoices, record collections, credits, and customer balances",
  tooling: "Track dies, print plates, cylinders, anilox rolls, storage, usage, and repairs",
  maintenance: "Maintain machine assets, preventive schedules, breakdown tickets, spare parts, and downtime",
  hr: "Maintain employee records, shift rosters, attendance, leave approvals, and safety training",
};

const WORKSPACE_GROUPS: Array<{ id: WorkspaceNavGroup; label: string }> = [
  { id: "orders", label: "Overview & orders" },
  { id: "order-booking", label: "Order Booking" },
  { id: "customers", label: "Customers" },
  { id: "products", label: "Products" },
  { id: "production", label: "Production" },
  { id: "supply", label: "Inventory & supply" },
  { id: "fulfillment", label: "Delivery & finance" },
  { id: "assets", label: "Assets & maintenance" },
  { id: "people", label: "People & safety" },
];

const WORKSPACE_ITEMS: Array<{
  id: "overview" | "jobs" | "Order Booking" | "origination" | "quotes" | "planning" | "execution" | "quality" | "Printing" | "customers" | "products" | "procurement" | "inventory" | "reels" | "warehouse" | "invoicing" | "tooling" | "maintenance" | "hr";
  label: string;
  icon: IconType;
  group: WorkspaceNavGroup;
}> = [
  { id: "overview", label: "Overview", icon: FiGrid, group: "orders" },
  { id: "jobs", label: "All jobs", icon: FiBriefcase, group: "orders" },
  { id: "Order Booking", label: "Order Booking", icon: FiClipboard, group: "order-booking" },
  { id: "origination", label: "Origination", icon: FiPenTool, group: "production" },
  { id: "quotes", label: "Costing & quotes", icon: FiDollarSign, group: "orders" },
  { id: "customers", label: "Customers", icon: FiUsers, group: "customers" },
  { id: "products", label: "Products", icon: FiPackage, group: "products" },
  { id: "planning", label: "Planning & scheduling", icon: FiCalendar, group: "production" },
  { id: "execution", label: "Shop floor execution", icon: FiActivity, group: "production" },
  { id: "quality", label: "Quality management", icon: FiCheckSquare, group: "production" },
  { id: "Printing", label: "Printing", icon: FiPrinter, group: "production" },
  { id: "procurement", label: "Procurement", icon: FiShoppingCart, group: "supply" },
  { id: "inventory", label: "Inventory & WIP", icon: FiPackage, group: "supply" },
  { id: "reels", label: "Paper reel traceability", icon: FiLayers, group: "supply" },
  { id: "warehouse", label: "Warehouse & dispatch", icon: FiTruck, group: "fulfillment" },
  { id: "invoicing", label: "Invoicing & collections", icon: FiDollarSign, group: "fulfillment" },
  { id: "tooling", label: "Tooling management", icon: FiTool, group: "assets" },
  { id: "maintenance", label: "Maintenance (CMMS)", icon: FiSettings, group: "assets" },
  { id: "hr", label: "HR & safety", icon: FiUsers, group: "people" },
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
}

function formatDate(value: string) {
  if (!isValidDateKey(value)) return "Not scheduled";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function stageClass(stage: ProductionWorkflowStage) {
  return `production-stage-tag stage-${stage.toLowerCase().replaceAll(" ", "-")}`;
}

function JobTable({
  jobs,
  onOpen,
  onArtworkUploaded,
  onCreate,
  actionLabel = "Open",
  numberLabel = "Job sheet no.",
  emptyHeading = "No shared jobs here yet",
  emptyDescription = "Create a job sheet or choose another workspace or stage.",
  showArtwork = false,
  showDelivery = true,
  showWorkspace = true,
  canOpenJobSheet = true,
  canOpenJobSheetForJob,
  jobNameOpensArtworkHistory = false,
  canFlagJobs = false,
  canResolveJobFlag,
  onFlagChanged,
  onEditPrintDetails,
  onArtworkHistory,
  onRegisterArtworkUploadTrigger,
}: {
  jobs: ProductionDashboardJob[];
  onOpen: (job: ProductionDashboardJob) => void;
  onCreate?: () => void;
  canOpenJobSheet?: boolean;
  canOpenJobSheetForJob?: (job: ProductionDashboardJob) => boolean;
  actionLabel?: string;
  numberLabel?: string;
  emptyHeading?: string;
  emptyDescription?: string;
  showArtwork?: boolean;
  showDelivery?: boolean;
  showWorkspace?: boolean;
  onArtworkUploaded?: () => void;
  onArtworkHistory?: (job: ProductionDashboardJob) => void;
  onRegisterArtworkUploadTrigger?: (
    jobId: string,
    trigger: (() => void) | null,
  ) => void;
  canFlagJobs?: boolean;
  canResolveJobFlag?: (job: ProductionDashboardJob) => boolean;
  onFlagChanged?: () => void;
  onEditPrintDetails?: (job: ProductionDashboardJob) => void;
  jobNameOpensArtworkHistory?: boolean;
}) {
  if (!jobs.length) {
    return (
      <div className="production-empty-state">
        <span className="production-empty-mark" aria-hidden="true"><FiBriefcase /></span>
        <h3>{emptyHeading}</h3>
        <p>{emptyDescription}</p>
        {onCreate && (
          <button className="production-primary-button" onClick={onCreate} type="button">
            Open job sheet
          </button>
        )}
      </div>
    );
  }

  const showJobSheetActions = canOpenJobSheet &&
    jobs.some((job) => canOpenJobSheetForJob?.(job) ?? true);

  return (
    <div className="production-table-scroll">
      <table className="production-jobs-table">
        <thead>
          <tr>
            <th scope="col">{numberLabel}</th>
            <th scope="col">Job</th>
            <th scope="col">Carton spec</th>
            <th scope="col">Size</th>
            <th scope="col">Customer</th>
            <th scope="col">Stage</th>
            <th scope="col">Flag / reason</th>
            {showArtwork && <th scope="col">Latest version</th>}
            {showDelivery && <th scope="col">Delivery</th>}
            <th scope="col" className="production-number-cell">Order qty</th>
            {showWorkspace && <th scope="col">Workspace</th>}
            {(showArtwork || showJobSheetActions) && (
              <th scope="col">
                {showArtwork ? "Artwork / print details" : <span className="sr-only">Action</span>}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const canOpenThisJob = canOpenJobSheet &&
              (canOpenJobSheetForJob?.(job) ?? true);

            return (
            <tr key={job.id}>
              <td>
                <strong>
                  {jobNameOpensArtworkHistory && canOpenThisJob ? (
                    <button
                      className="production-table-action"
                      onClick={() => onOpen(job)}
                      type="button"
                    >
                      {job.jobNo || "—"}
                    </button>
                  ) : job.jobNo || "—"}
                </strong>
              </td>
              <td>
                {jobNameOpensArtworkHistory && onArtworkHistory ? (
                  <button
                    className="production-table-action"
                    onClick={() => onArtworkHistory?.(job)}
                    type="button"
                  >
                    {job.jobName || "—"}
                  </button>
                ) : job.jobName || "—"}
              </td>
              <td>{job.cartonSpec || "—"}</td>
              <td>{job.size || "—"}</td>
              <td>{job.customer || "—"}</td>
              <td><span className={stageClass(job.workflowStage)}>{job.workflowStage}</span></td>
              <td>
                <JobFlagControl
                  canFlag={canFlagJobs && isProductionOriginationQueueStage(job.workflowStage)}
                  canResolve={canResolveJobFlag?.(job) ?? false}
                  job={job}
                  onChanged={onFlagChanged}
                />
              </td>
              {showArtwork && (
                <td>{job.latestArtworkVersion ? `V${job.latestArtworkVersion}` : "—"}</td>
              )}
              {showDelivery && <td>{formatDate(job.deliveryDate)}</td>}
              <td className="production-number-cell">
                {job.orderQty === null ? "—" : job.orderQty.toLocaleString("en-KE")}
              </td>
              {showWorkspace && <td>{job.workspaceName}</td>}
              {(showArtwork || showJobSheetActions) && (
                <td>
                  {showArtwork ? (
                    <div className="production-job-row-actions">
                      {onEditPrintDetails && (
                        <button
                          aria-label={`Update print details for ${job.jobNo || "job"}`}
                          className="production-table-action production-job-icon-action"
                          onClick={() => onEditPrintDetails(job)}
                          title="Update print details"
                          type="button"
                        >
                          <FiEdit2 aria-hidden="true" />
                        </button>
                      )}
                      <ArtworkUploadButton
                        job={job}
                        onRegisterUploadTrigger={onRegisterArtworkUploadTrigger}
                        onUploaded={onArtworkUploaded}
                      />
                    </div>
                  ) : canOpenJobSheet && (canOpenJobSheetForJob?.(job) ?? true) ? (
                    <button
                      className="production-table-action"
                      onClick={() => onOpen(job)}
                      type="button"
                    >
                      {actionLabel}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function filterProductionDashboardJobs(
  jobs: ProductionDashboardJob[],
  search: string,
  workflowStage: string,
): ProductionDashboardJob[] {
  const query = search.trim().toLowerCase();
  return jobs.filter((job) => {
    if (workflowStage !== "all" && job.workflowStage !== workflowStage) return false;
    if (!query) return true;

    return [
      job.jobNo,
      job.jobName,
      job.customer,
      job.cartonSpec,
      job.size,
      job.workflowStage,
      job.workspaceName,
      job.deliveryDate,
      job.priority,
      job.orderQty === null ? "" : String(job.orderQty),
    ].some((value) => value.toLowerCase().includes(query));
  });
}

function ProductionJobFilters({
  search,
  onSearchChange,
  workflowStage,
  onWorkflowStageChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  workflowStage: string;
  onWorkflowStageChange: (value: string) => void;
}) {
  return (
    <div className="production-job-filters">
      <label className="production-catalog-search">
        <span>Search jobs</span>
        <input
          aria-label="Search jobs"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="Job number, name, customer, specification…"
          type="search"
          value={search}
        />
      </label>
      <label className="production-workspace-filter">
        <span>Workflow stage</span>
        <select
          aria-label="Filter jobs by workflow stage"
          onChange={(event) => onWorkflowStageChange(event.currentTarget.value)}
          value={workflowStage}
        >
          <option value="all">All stages</option>
          {PRODUCTION_WORKFLOW_STAGES.map((stage) => (
            <option key={stage} value={stage}>{stage}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

type OriginationPrintField =
  (typeof PRODUCTION_ORIGINATION_PRINT_FIELDS)[number];

const ORIGINATION_PRINT_FIELD_DETAILS: Record<
  OriginationPrintField,
  { label: string; maxLength: number; multiline?: boolean }
> = {
  printing: { label: "Job print status", maxLength: 10 },
  printMethod: { label: "Printing method", maxLength: 80 },
  printColor: { label: "Individual print colours (one per line)", maxLength: 300, multiline: true },
  inkType: { label: "Ink type", maxLength: 60 },
  artwork: { label: "Artwork description", maxLength: 80 },
  artworkRef: { label: "Artwork reference", maxLength: 80 },
  plateRef: { label: "Plate / cylinder", maxLength: 80 },
  printArea: { label: "Print area", maxLength: 60 },
  registration: { label: "Registration", maxLength: 30 },
  registrationTolerance: { label: "Registration tolerance", maxLength: 30 },
  printPosition: { label: "Print position", maxLength: 80 },
  printInstructions: { label: "Print instructions", maxLength: 300, multiline: true },
};

function OriginationPrintDetailsForm({
  job,
  onCancel,
  onSaved,
}: {
  job: ProductionDashboardJob;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [details, setDetails] = useState<Record<OriginationPrintField, string>>({
    printing: "",
    printMethod: "",
    printColor: "",
    inkType: "",
    artwork: "",
    artworkRef: "",
    plateRef: "",
    printArea: "",
    registration: "",
    registrationTolerance: "",
    printPosition: "",
    printInstructions: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    requestProductionJson(`/api/production/jobs/${encodeURIComponent(job.id)}`, {
      method: "GET",
    })
      .then((result) => {
        if (!isRecord(result.job) || !isRecord(result.job.data)) {
          throw new Error("The server returned invalid job details.");
        }
        const jobData = result.job.data;
        const storedPrinting = typeof jobData.printing === "string"
          ? jobData.printing.trim()
          : "";
        const normalizedPrinting = storedPrinting.toLowerCase();
        const printing = normalizedPrinting === "plain" ||
          normalizedPrinting === "no" ||
          normalizedPrinting === "none" ||
          normalizedPrinting === "unprinted"
          ? "Plain"
          : storedPrinting
            ? "Printed"
            : "";
        const hasPrinting = printing === "Printed";
        if (active) {
          setDetails({
            printing,
            printMethod: hasPrinting && typeof jobData.printMethod === "string" ? jobData.printMethod : "",
            printColor: hasPrinting && typeof jobData.printColor === "string"
              ? jobData.printColor.split(/\r?\n|,\s*/).filter(Boolean).join("\n")
              : "",
            inkType: hasPrinting && typeof jobData.inkType === "string" ? jobData.inkType : "",
            artwork: hasPrinting && typeof jobData.artwork === "string" ? jobData.artwork : "",
            artworkRef: hasPrinting && typeof jobData.artworkRef === "string" ? jobData.artworkRef : "",
            plateRef: hasPrinting && typeof jobData.plateRef === "string" ? jobData.plateRef : "",
            printArea: hasPrinting && typeof jobData.printArea === "string" ? jobData.printArea : "",
            registration: hasPrinting && typeof jobData.registration === "string" ? jobData.registration : "",
            registrationTolerance: hasPrinting && typeof jobData.registrationTolerance === "string"
              ? jobData.registrationTolerance
              : "",
            printPosition: hasPrinting && typeof jobData.printPosition === "string" ? jobData.printPosition : "",
            printInstructions: hasPrinting && typeof jobData.printInstructions === "string"
              ? jobData.printInstructions
              : "",
          });
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load print details.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [job.id]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const result = await requestProductionJson(`/api/production/jobs/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ data: details }),
      });
      if (!isRecord(result.job) || result.job.id !== job.id) {
        throw new Error("Print details were not saved to the selected job.");
      }
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save print details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="production-origination-print-form production-planning-form" onSubmit={submit}>
      <div className="production-order-booking-heading">
        <h2>Printing details · {job.jobNo || job.jobName || "Selected job"}</h2>
        <p>Update the print specifications for this job. Other job details remain unchanged.</p>
      </div>
      {isLoading ? (
        <p className="production-quote-message" role="status">Loading print details…</p>
      ) : (
        <div className="production-origination-print-fields">
          {PRODUCTION_ORIGINATION_PRINT_FIELDS.map((field) => {
            const metadata = ORIGINATION_PRINT_FIELD_DETAILS[field];
            if (field !== "printing" && details.printing !== "Printed") return null;

            return (
              <label className="production-order-booking-field" key={field}>
                {metadata.label}
                {field === "printing" ? (
                  <select
                    onChange={(event) => {
                      const printing = event.currentTarget.value;
                      setDetails((current) => ({
                        ...current,
                        printing,
                        ...(printing === "Printed"
                          ? {}
                          : {
                              printMethod: "",
                              printColor: "",
                              inkType: "",
                              artwork: "",
                              artworkRef: "",
                              plateRef: "",
                              printArea: "",
                              registration: "",
                              registrationTolerance: "",
                              printPosition: "",
                              printInstructions: "",
                            }),
                      }));
                    }}
                    required
                    value={details.printing}
                  >
                    <option value="">Select plain or printed</option>
                    <option value="Plain">Plain</option>
                    <option value="Printed">Printed</option>
                  </select>
                ) : metadata.multiline ? (
                  <textarea
                    maxLength={metadata.maxLength}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDetails((current) => ({
                        ...current,
                        [field]: value,
                      }));
                    }}
                    placeholder={
                      field === "printColor"
                        ? "One colour per line (e.g. Red, Black)"
                        : undefined
                    }
                    required={
                      details.printing === "Printed" &&
                      (field === "printColor" || field === "printInstructions")
                    }
                    rows={field === "printColor" ? 4 : 3}
                    value={details[field]}
                  />
                ) : (
                  <input
                    maxLength={metadata.maxLength}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDetails((current) => ({
                        ...current,
                        [field]: value,
                      }));
                    }}
                    value={details[field]}
                  />
                )}
              </label>
            );
          })}
        </div>
      )}
      {error && <p className="production-order-booking-error" role="alert">{error}</p>}
      <div className="production-order-booking-actions">
        <button className="production-table-action" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="production-primary-button" disabled={isLoading || isSaving} type="submit">
          {isSaving ? "Saving…" : "Save print details"}
        </button>
      </div>
    </form>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductionDashboardItem(value: unknown): value is ProductionDashboardItem {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.itemCode === "string" &&
    (value.customerId === null || typeof value.customerId === "string") &&
    typeof value.name === "string" &&
    typeof value.boxType === "string" &&
    typeof value.topLiner === "string" &&
    typeof value.medium === "string" &&
    typeof value.bottomLiner === "string" &&
    typeof value.length === "string" &&
    typeof value.width === "string" &&
    typeof value.height === "string" &&
    (value.unit === "mm" || value.unit === "in");
}

function isProductionDashboardCustomer(value: unknown): value is ProductionDashboardCustomer {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.kraPin === null || typeof value.kraPin === "string") &&
    (value.contactPerson === null || typeof value.contactPerson === "string") &&
    (value.phone === null || typeof value.phone === "string") &&
    (value.email === null || typeof value.email === "string") &&
    (value.address === null || typeof value.address === "string");
}

function isProductionDashboardCustomerSummary(value: unknown): value is ProductionDashboardCustomerSummary {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function ProductionProductCatalog({
  workspaceId,
  customers,
  cartonTypes,
  canEdit,
  routerRefresh,
}: {
  workspaceId: string;
  customers: ProductionDashboardCustomer[];
  cartonTypes: string[];
  canEdit: boolean;
  routerRefresh: () => void;
}) {
  const [items, setItems] = useState<ProductionDashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductionDashboardItem | null>(null);
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    let active = true;
    if (!workspaceId) {
      queueMicrotask(() => {
        if (active) {
          setItems([]);
          setLoading(false);
          setStatus("");
        }
      });
      return () => {
        active = false;
      };
    }
    requestProductionJson(
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/items`,
      { method: "GET" },
    )
      .then((result) => {
        if (!Array.isArray(result.items) || !result.items.every(isProductionDashboardItem)) {
          throw new Error("The server returned invalid product details.");
        }
        if (active) setItems(result.items);
      })
      .catch((error) => {
        if (active) {
          setStatus(error instanceof Error ? error.message : "Could not load products.");
          setItems([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  if (isCreating || editingItem) {
    return (
      <CreateProductionItemForm
        cartonTypes={cartonTypes}
        item={editingItem ?? undefined}
        onCancel={() => {
          setIsCreating(false);
          setEditingItem(null);
        }}
        onCreated={(item) => {
          setItems((current) => {
            const nextItems = editingItem
              ? current.map((currentItem) => currentItem.id === item.id ? item : currentItem)
              : [...current, item];
            return nextItems.sort((left, right) => left.itemCode.localeCompare(right.itemCode));
          });
          setIsCreating(false);
          setEditingItem(null);
          routerRefresh();
        }}
        workspaceId={workspaceId}
        title={editingItem ? "Edit product" : "Add product"}
      />
    );
  }

  return (
    <>
      {status && <p className="production-order-booking-error" role="alert">{status}</p>}
      <label className="production-catalog-search">
        <span>Search products</span>
        <input
          onChange={(event) => setProductSearch(event.target.value)}
          placeholder="Item code, name, customer, carton or size"
          type="search"
          value={productSearch}
        />
      </label>
      {loading ? (
        <p className="production-quote-message" role="status">Loading products…</p>
      ) : (() => {
        const query = productSearch.trim().toLowerCase();
        const filteredItems = query
          ? items.filter((item) => {
            const customerName =
              customers.find((customer) => customer.id === item.customerId)?.name || "";
            const boardSpec = [item.topLiner, item.medium, item.bottomLiner]
              .filter(Boolean)
              .join("/");
            const size = `${item.length} × ${item.width} × ${item.height} ${item.unit}`;
            return [
              item.itemCode,
              item.name,
              customerName,
              item.boxType,
              boardSpec,
              size,
            ].some((value) => value.toLowerCase().includes(query));
          })
          : items;
        return filteredItems.length ? (
        <div className="production-table-scroll">
          <table className="production-jobs-table">
            <thead>
              <tr>
                <th>Item code</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Carton</th>
                <th>Board spec</th>
                <th>Size</th>
                <th>Artwork versions</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.itemCode}</strong></td>
                  <td>{item.name}</td>
                  <td>{customers.find((customer) => customer.id === item.customerId)?.name || "—"}</td>
                  <td>{item.boxType}</td>
                  <td>{[item.topLiner, item.medium, item.bottomLiner].filter(Boolean).join("/") || "—"}</td>
                  <td>{item.length} × {item.width} × {item.height} {item.unit}</td>
                  <td>
                    <ProductArtworkHistory
                      itemId={item.id}
                      workspaceId={workspaceId}
                    />
                  </td>
                  {canEdit && (
                    <td>
                      <button
                        className="production-text-action"
                        onClick={() => setEditingItem(item)}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="production-empty-state">
          <span className="production-empty-mark" aria-hidden="true"><FiPackage /></span>
          <h3>{productSearch.trim() ? "No matching products" : "No products yet"}</h3>
          <p>
            {productSearch.trim()
              ? "Try a different item code, name, customer, carton or size."
              : "Create a product and link it to a customer."}
          </p>
        </div>
        );
      })()}
    </>
  );
}

async function requestProductionJson(
  url: string,
  options: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(result) && typeof result.error === "string"
      ? result.error
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(result)) {
    throw new Error("The server returned an invalid response.");
  }
  return result;
}

type ProductionScheduleForm = {
  jobId: string;
  operation: ProductionOperation;
  machineId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  plannedQty: string;
  status: ProductionOperationStatus;
  notes: string;
};

function localDateTimeValue(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function dateOnlyLabel(value: string): string {
  return new Date(value.slice(0, 10) + "T00:00:00.000Z").toLocaleDateString(undefined, {
    timeZone: "UTC",
  });
}

function createProductionScheduleForm(jobId: string): ProductionScheduleForm {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    jobId,
    operation: PRODUCTION_OPERATIONS[0],
    machineId: "",
    scheduledStartAt: localDateTimeValue(start),
    scheduledEndAt: localDateTimeValue(end),
    plannedQty: "",
    status: "PLANNED",
    notes: "",
  };
}

function getScheduleBalance(
  job: ProductionDashboardJob,
  schedule?: ProductionDashboardSchedule,
): number | null {
  return getProductionOperationBalance(job.orderQty, schedule?.actualGoodQty ?? 0);
}

function isCompletedWithoutBalance(
  job: ProductionDashboardJob,
  schedule: ProductionDashboardSchedule | undefined,
): boolean {
  if (schedule?.status !== "COMPLETED") return false;
  const balance = getScheduleBalance(job, schedule);
  return balance === null || balance === 0;
}

type BulkProductionScheduleEntry = {
  jobId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  plannedQty: string;
};

function MachineMaintenanceNotice({
  machineId,
  scheduledStartAt,
  scheduledEndAt,
  plans,
  tickets,
}: {
  machineId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  plans: ProductionDashboardMaintenancePlan[];
  tickets: ProductionDashboardMaintenanceTicket[];
}) {
  const warnings = getProductionMachineMaintenanceWarnings(
    machineId,
    scheduledStartAt,
    scheduledEndAt,
    plans,
    tickets,
  );
  if (!warnings.length) return null;

  return (
    <div className="production-maintenance-planning-warning" role="status" aria-live="polite">
      <FiAlertTriangle aria-hidden="true" />
      <div>
        <strong>Maintenance conflict for this schedule</strong>
        <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </div>
    </div>
  );
}

function BulkScheduleForm({
  workspaceId,
  machines,
  jobs,
  schedules,
  maintenancePlans,
  maintenanceTickets,
  onSaved,
}: {
  workspaceId: string;
  machines: ProductionDashboardMachine[];
  jobs: ProductionDashboardJob[];
  schedules: ProductionDashboardSchedule[];
  maintenancePlans: ProductionDashboardMaintenancePlan[];
  maintenanceTickets: ProductionDashboardMaintenanceTicket[];
  onSaved: () => void;
}) {
  const [operation, setOperation] = useState<ProductionOperation>(PRODUCTION_OPERATIONS[0]);
  const [machineId, setMachineId] = useState("");
  const [entries, setEntries] = useState<BulkProductionScheduleEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const availableJobs = jobs.filter((job) => {
    const existingSchedule = schedules.find(
      (schedule) => schedule.jobId === job.id && schedule.operation === operation,
    );
    if (!existingSchedule) return true;
    if (existingSchedule.status !== "COMPLETED") return false;
    const balance = getScheduleBalance(job, existingSchedule);
    return balance !== null && balance > 0;
  });
  const availableMachines = machines.filter(
    (machine) => machine.workspaceId === workspaceId && machine.status !== "RETIRED",
  );
  const entryJobIds = new Set(entries.map((entry) => entry.jobId));

  const toggleJob = (job: ProductionDashboardJob, checked: boolean) => {
    setStatus("");
    setEntries((current) => {
      if (!checked) return current.filter((entry) => entry.jobId !== job.id);
      if (current.some((entry) => entry.jobId === job.id)) return current;

      const defaults = createProductionScheduleForm(job.id);
      const completedSchedule = schedules.find(
        (schedule) =>
          schedule.jobId === job.id &&
          schedule.operation === operation &&
          schedule.status === "COMPLETED",
      );
      const balance = completedSchedule
        ? getScheduleBalance(job, completedSchedule)
        : null;
      const lastEnd = current.length
        ? new Date(current[current.length - 1].scheduledEndAt)
        : new Date(defaults.scheduledStartAt);
      const start = Number.isNaN(lastEnd.getTime())
        ? new Date(defaults.scheduledStartAt)
        : new Date(lastEnd);
      if (current.length) start.setHours(start.getHours() + 1);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      return [...current, {
        jobId: job.id,
        scheduledStartAt: localDateTimeValue(start),
        scheduledEndAt: localDateTimeValue(end),
        plannedQty: balance !== null && balance > 0
          ? String(balance)
          : job.orderQty === null || job.orderQty < 1
            ? ""
            : String(job.orderQty),
      }];
    });
  };

  const updateEntry = (
    jobId: string,
    field: "scheduledStartAt" | "scheduledEndAt" | "plannedQty",
    value: string,
  ) => {
    setEntries((current) => current.map((entry) =>
      entry.jobId === jobId ? { ...entry, [field]: value } : entry,
    ));
  };

  const submitBulkSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    const failures: Array<{ entry: BulkProductionScheduleEntry; reason: string }> = [];
    let successCount = 0;
    try {
      for (const entry of entries) {
        try {
          await requestProductionJson(
            `/api/production/workspaces/${encodeURIComponent(workspaceId)}/operation-schedules`,
            {
              method: "POST",
              body: JSON.stringify({
                jobId: entry.jobId,
                operation,
                machineId,
                scheduledStartAt: new Date(entry.scheduledStartAt).toISOString(),
                scheduledEndAt: new Date(entry.scheduledEndAt).toISOString(),
                plannedQty: entry.plannedQty,
                status: "PLANNED",
                notes: "",
              }),
            },
          );
          successCount += 1;
        } catch (error) {
          failures.push({
            entry,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (failures.length) {
        const failureDetails = failures.map(({ entry, reason }) => {
          const job = jobs.find((candidate) => candidate.id === entry.jobId);
          return `${job?.jobNo || "Job"}: ${reason}`;
        });
        setEntries(failures.map(({ entry }) => entry));
        setStatus(
          `${successCount} scheduled; ${failures.length} failed. ${failureDetails.join(" ")}`,
        );
        setHasError(true);
      } else {
        setEntries([]);
        notifyToast(`${successCount} ${operation} schedules created.`);
        setStatus("");
      }
      if (successCount) onSaved();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="production-planning-form" onSubmit={submitBulkSchedule}>
      <div className="production-order-booking-row">
        <label className="production-order-booking-field">
          Operation
          <select
            onChange={(event) => {
              const nextOperation = event.currentTarget.value;
              if (!isProductionOperation(nextOperation)) return;
              setOperation(nextOperation);
              setEntries([]);
              setStatus("");
            }}
            value={operation}
          >
            {PRODUCTION_OPERATIONS.map((productionOperation) => (
              <option key={productionOperation} value={productionOperation}>
                {productionOperation}
              </option>
            ))}
          </select>
        </label>
        <label className="production-order-booking-field">
          Machine
          <select
            disabled={!availableMachines.length}
            onChange={(event) => setMachineId(event.currentTarget.value)}
            required
            value={machineId}
          >
            <option value="">
              {availableMachines.length ? "Select a machine" : "Register a machine first"}
            </option>
            {availableMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.machineNo} — {machine.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="production-bulk-job-picker">
        <legend>Select jobs to schedule</legend>
        {availableJobs.length ? (
          availableJobs.map((job) => {
            const existingSchedule = schedules.find(
              (schedule) => schedule.jobId === job.id && schedule.operation === operation,
            );
            const balance = existingSchedule?.status === "COMPLETED"
              ? getScheduleBalance(job, existingSchedule)
              : null;
            return (
            <label
              className={`production-bulk-job-option${job.flag ? " is-disabled" : ""}`}
              key={job.id}
            >
              <input
                checked={entryJobIds.has(job.id)}
                disabled={Boolean(job.flag) || isSaving}
                onChange={(event) => toggleJob(job, event.currentTarget.checked)}
                type="checkbox"
              />
              <span>
                <strong>{job.jobNo || "Unnumbered"}</strong>
                <small>{job.jobName || job.customer || "Untitled job"}</small>
                {balance !== null && balance > 0 && (
                  <small>Reschedule balance: {balance.toLocaleString("en-KE")}</small>
                )}
                {job.flag && <small>Flagged — clear the flag before scheduling</small>}
              </span>
              <span>{job.orderQty?.toLocaleString("en-KE") ?? "Quantity required"}</span>
            </label>
            );
          })
        ) : (
          <p className="production-chart-empty">
            No schedulable jobs are available for this operation.
          </p>
        )}
      </fieldset>
      {entries.length > 0 && (
        <div className="production-bulk-schedule-entries">
          <strong>Schedule details</strong>
          {entries.map((entry) => {
            const job = jobs.find((candidate) => candidate.id === entry.jobId);
            const existingCompletedSchedule = job && schedules.find(
              (candidate) =>
                candidate.jobId === job.id &&
                candidate.operation === operation &&
                candidate.status === "COMPLETED",
            );
            const balance = job && existingCompletedSchedule
              ? getScheduleBalance(job, existingCompletedSchedule)
              : null;
            return (
              <fieldset className="production-bulk-schedule-entry" key={entry.jobId}>
                <legend>{job?.jobNo || job?.jobName || "Selected job"}</legend>
                {balance !== null && balance > 0 && (
                  <p className="production-chart-empty">
                    Remaining order balance: {balance.toLocaleString("en-KE")}
                  </p>
                )}
                <div className="production-bulk-schedule-fields">
                  <label className="production-order-booking-field">
                    Start
                    <input
                      onChange={(event) => updateEntry(entry.jobId, "scheduledStartAt", event.target.value)}
                      required
                      type="datetime-local"
                      value={entry.scheduledStartAt}
                    />
                  </label>
                  <label className="production-order-booking-field">
                    End
                    <input
                      onChange={(event) => updateEntry(entry.jobId, "scheduledEndAt", event.target.value)}
                      required
                      type="datetime-local"
                      value={entry.scheduledEndAt}
                    />
                  </label>
                  <label className="production-order-booking-field">
                    Planned quantity
                    <input
                      max={balance !== null && balance > 0 ? balance : undefined}
                      min="1"
                      onChange={(event) => updateEntry(entry.jobId, "plannedQty", event.target.value)}
                      required
                      type="number"
                      value={entry.plannedQty}
                    />
                  </label>
                </div>
                <MachineMaintenanceNotice
                  machineId={machineId}
                  scheduledStartAt={entry.scheduledStartAt}
                  scheduledEndAt={entry.scheduledEndAt}
                  plans={maintenancePlans}
                  tickets={maintenanceTickets}
                />
              </fieldset>
            );
          })}
        </div>
      )}
      {status && (
        <p
          aria-live="polite"
          className={`production-bulk-schedule-status ${
            hasError ? "production-order-booking-error" : "production-order-booking-status"
          }`}
          role={hasError ? "alert" : "status"}
        >
          {status}
        </p>
      )}
      <div className="production-order-booking-actions">
        <button
          className="production-primary-button"
          disabled={isSaving || !entries.length || !availableMachines.length}
          type="submit"
        >
          {isSaving ? "Scheduling…" : `Schedule ${entries.length} jobs`}
        </button>
      </div>
    </form>
  );
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const JOB_SHEET_CORE_FIELDS = new Set([
  "jobNo",
  "jobName",
  "customer",
  "workflowStage",
  "customerPO",
  "itemCode",
  "itemId",
  "boxType",
  "length",
  "width",
  "height",
  "unit",
  "orderQty",
  "orderDate",
  "deliveryDate",
]);

const JOB_SHEET_FIELD_LABELS: Record<string, string> = {
  customerPO: "Customer PO",
  jobNo: "Job no.",
  itemCode: "Item code",
  workflowStage: "Workflow stage",
  topLiner: "Top liner",
  medium: "Medium",
  bottomLiner: "Bottom liner",
  printing: "Print status",
  printColor: "Print colours",
  printMethod: "Printing method",
  artwork: "Artwork description",
  printPosition: "Print position",
  printArea: "Print area",
  plateRef: "Plate / cylinder",
  artworkRef: "Artwork reference",
  inkType: "Ink type",
  registrationTolerance: "Registration tolerance",
  registration: "Registration",
  printInstructions: "Print instructions",
  boardGsm: "Nominal board weight",
  bwadd: "B/W add",
  bct: "BCT",
  slotWidth: "Slot width",
  jointType: "Joint type",
  stitches: "Stitches",
  stitchPosition: "Stitch position",
  boxSquareness: "Box squareness",
  pcsPerBundle: "Pieces per bundle",
  packAs: "Pack as",
  strapping: "Strapping",
  palletSize: "Pallet size",
  pcsPerPallet: "Pieces per pallet",
  qcApproved: "QC approved",
  dispatchBy: "Dispatched by",
  deliveryWindow: "Delivery window",
  deliveryAddress: "Delivery address",
  deliveryContact: "Delivery contact",
  specialInstructions: "Special instructions",
};

const JOB_SHEET_FIELD_SECTIONS: Record<
  string,
  "board" | "printing" | "converting" | "quality" | "packing" | "dispatch"
> = {
  topLiner: "board",
  medium: "board",
  bottomLiner: "board",
  boardGsm: "board",
  bwadd: "board",
  bct: "quality",
  printColor: "printing",
  printing: "printing",
  artwork: "printing",
  printMethod: "printing",
  printPosition: "printing",
  printArea: "printing",
  plateRef: "printing",
  artworkRef: "printing",
  inkType: "printing",
  registrationTolerance: "printing",
  registration: "printing",
  printInstructions: "printing",
  slotWidth: "converting",
  jointType: "converting",
  stitches: "converting",
  stitchPosition: "converting",
  boxSquareness: "converting",
  qcApproved: "quality",
  sizeTolerance: "quality",
  sampling: "quality",
  printCheck: "quality",
  jointCheck: "quality",
  packAs: "packing",
  pcsPerBundle: "packing",
  strapping: "packing",
  palletSize: "packing",
  pcsPerPallet: "packing",
  dispatchBy: "dispatch",
  deliveryWindow: "dispatch",
  deliveryAddress: "dispatch",
  deliveryContact: "dispatch",
};

function formatJobSheetFieldLabel(key: string) {
  return JOB_SHEET_FIELD_LABELS[key] ??
    key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function formatJobSheetValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(formatJobSheetValue).filter(Boolean).join("; ");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        const formatted = formatJobSheetValue(item);
        return formatted ? `${formatJobSheetFieldLabel(key)}: ${formatted}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return "";
}

function isProductionDashboardNotification(value: unknown): value is ProductionDashboardNotification {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.jobId === "string" &&
    typeof value.jobNo === "string" &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.href === "string" &&
    value.href.startsWith("/production/admin?jobId=") &&
    (typeof value.readAt === "string" || value.readAt === null) &&
    typeof value.createdAt === "string";
}

function decodeVapidPublicKey(encodedKey: string): ArrayBuffer {
  const paddedKey = encodedKey + "=".repeat((4 - encodedKey.length % 4) % 4);
  const base64Key = paddedKey.replace(/-/g, "+").replace(/_/g, "/");
  const rawKey = window.atob(base64Key);
  const keyBytes = new Uint8Array(rawKey.length);
  for (let index = 0; index < rawKey.length; index += 1) {
    keyBytes[index] = rawKey.charCodeAt(index);
  }
  return keyBytes.buffer;
}

function ProductionNotificationBell() {
  const [notifications, setNotifications] = useState<ProductionDashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const hasLoadedNotifications = useRef(false);
  const knownNotificationIds = useRef(new Set<string>());
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const isPushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined";

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/production/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load notifications.");
      const result: unknown = await response.json();
      if (!isRecord(result) || !Array.isArray(result.notifications)) {
        throw new Error("The server returned invalid notifications.");
      }
      const nextNotifications = result.notifications.filter(isProductionDashboardNotification);
      if (hasLoadedNotifications.current) {
        nextNotifications
          .filter((notification) =>
            !notification.readAt && !knownNotificationIds.current.has(notification.id),
          )
          .forEach((notification) => {
            notifyToast(`${notification.title}: ${notification.message}`, "info");
          });
      }
      nextNotifications.forEach((notification) => knownNotificationIds.current.add(notification.id));
      hasLoadedNotifications.current = true;
      setNotifications(nextNotifications);
      setUnreadCount(
        typeof result.unreadCount === "number"
          ? result.unreadCount
          : nextNotifications.filter((notification) => !notification.readAt).length,
      );
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load notifications.");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadNotifications);
    const handleFocus = () => void loadNotifications();
    const refreshTimer = window.setInterval(handleFocus, 60_000);
    window.addEventListener("focus", handleFocus);

    let active = true;
    if (isPushSupported) {
      void navigator.serviceWorker.register("/service-worker.js")
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => {
          if (active) setIsPushEnabled(Boolean(subscription));
        })
        .catch((error: unknown) => {
          if (active) {
            notifyToast(
              error instanceof Error ? error.message : "Could not prepare browser push.",
              "error",
            );
          }
        });
    }

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isPushSupported, loadNotifications]);

  const enablePush = async () => {
    setIsBusy(true);
    try {
      if (!vapidPublicKey) {
        throw new Error("Browser push is not configured. Add the VAPID keys to the deployment environment.");
      }
      if (!isPushSupported) throw new Error("This browser does not support push notifications.");
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Browser notification permission was not granted.");
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ??
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidPublicKey(vapidPublicKey),
        });
      const response = await fetch("/api/production/notifications/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("Could not save this browser's push subscription.");

      setIsPushEnabled(true);
      notifyToast("Browser push notifications are enabled on this device.");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "Could not enable browser push.", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const disablePush = async () => {
    setIsBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/production/notifications/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Could not remove this browser's push subscription.");
        await subscription.unsubscribe();
      }
      setIsPushEnabled(false);
      notifyToast("Browser push notifications are disabled on this device.", "info");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "Could not disable browser push.", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const markRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/production/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) throw new Error("Could not mark this notification as read.");
      setNotifications((current) => current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, readAt: new Date().toISOString() }
          : notification,
      ));
      setUnreadCount((current) => Math.max(0, current - 1));
      notifyToast("Notification marked as read.", "success");
    } catch (error) {
      notifyToast(
        error instanceof Error ? error.message : "Could not update this notification.",
        "error",
      );
    }
  };

  return (
    <div className="production-notification-container">
      <button
        aria-controls="production-notification-panel"
        aria-expanded={isOpen}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className="production-notification-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <FiBell aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="production-notification-count">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <section
          aria-label="Production notifications"
          className="production-notification-panel"
          id="production-notification-panel"
        >
          <div className="production-notification-heading">
            <div>
              <strong>Notifications</strong>
              <small>{unreadCount} unread</small>
            </div>
            <button
              aria-label="Close notifications"
              className="production-notification-close"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <FiX aria-hidden="true" />
            </button>
          </div>
          {!vapidPublicKey && (
            <p className="production-notification-hint">
              Browser push needs VAPID keys configured. In-app notifications are still available.
            </p>
          )}
          {!isPushSupported && (
            <p className="production-notification-hint">
              This browser does not support push notifications. In-app notifications are still available.
            </p>
          )}
          {isPushSupported && vapidPublicKey && (
            <button
              className="production-notification-push-toggle"
              disabled={isBusy}
              onClick={() => void (isPushEnabled ? disablePush() : enablePush())}
              type="button"
            >
              {isBusy
                ? "Updating…"
                : isPushEnabled
                  ? "Turn off browser push"
                  : "Enable browser push"}
            </button>
          )}
          {loadError && <p className="production-order-booking-error" role="alert">{loadError}</p>}
          {notifications.length ? (
            <ul className="production-notification-list">
              {notifications.map((notification) => (
                <li className={notification.readAt ? "" : "is-unread"} key={notification.id}>
                  <a href={notification.href}>
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>{new Date(notification.createdAt).toLocaleString("en-KE")}</small>
                  </a>
                  {!notification.readAt && (
                    <button
                      aria-label={`Mark job ${notification.jobNo} notification as read`}
                      className="production-notification-mark-read"
                      onClick={() => void markRead(notification.id)}
                      type="button"
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="production-notification-empty">No notifications yet.</p>
          )}
        </section>
      )}
    </div>
  );
}

function PlanningBoard({
  workspaces,
  jobs,
  machines,
  schedules,
  maintenancePlans,
  maintenanceTickets,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  jobs: ProductionDashboardJob[];
  machines: ProductionDashboardMachine[];
  schedules: ProductionDashboardSchedule[];
  maintenancePlans: ProductionDashboardMaintenancePlan[];
  maintenanceTickets: ProductionDashboardMaintenanceTicket[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const productionWorkspaces = workspaces.filter(
    (workspace) => hasProductionRole(workspace.role, "PRODUCTION"),
  );
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const [schedulingMode, setSchedulingMode] = useState<"single" | "bulk">("single");
  const workspaceJobs = jobs.filter((job) => job.workspaceId === workspaceId);
  const workspaceMachines = machines.filter(
    (machine) => machine.workspaceId === workspaceId && machine.status !== "RETIRED",
  );
  const workspaceMaintenancePlans = maintenancePlans.filter(
    (plan) => plan.workspaceId === workspaceId,
  );
  const workspaceMaintenanceTickets = maintenanceTickets.filter(
    (ticket) => ticket.workspaceId === workspaceId,
  );
  const workspaceSchedules = schedules
    .filter((schedule) => schedule.workspaceId === workspaceId)
    .sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt));
  const scheduleFor = (jobId: string, operation: ProductionOperation) =>
    workspaceSchedules.find(
      (schedule) => schedule.jobId === jobId && schedule.operation === operation,
    );
  const schedulableJobFor = (operation: ProductionOperation, preferredJobId?: string) => {
    const preferredJob = workspaceJobs.find((job) => job.id === preferredJobId);
    if (
      preferredJob &&
      !isCompletedWithoutBalance(preferredJob, scheduleFor(preferredJob.id, operation))
    ) {
      return preferredJob;
    }
    return workspaceJobs.find((job) =>
      !isCompletedWithoutBalance(job, scheduleFor(job.id, operation)),
    );
  };
  const initialJob = schedulableJobFor(PRODUCTION_OPERATIONS[0]);
  const initialSchedule = initialJob
    ? scheduleFor(initialJob.id, PRODUCTION_OPERATIONS[0])
    : undefined;
  const initialBalance = initialJob && initialSchedule?.status === "COMPLETED"
    ? getScheduleBalance(initialJob, initialSchedule)
    : null;
  const [form, setForm] = useState(() => ({
    ...createProductionScheduleForm(initialJob?.id ?? ""),
    plannedQty: initialBalance !== null && initialBalance > 0
      ? String(initialBalance)
      : "",
  }));
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const selectedJob = workspaceJobs.find((job) => job.id === form.jobId);
  const selectedSchedule = selectedJob
    ? scheduleFor(selectedJob.id, form.operation)
    : undefined;
  const selectedBalance = selectedJob
    ? getScheduleBalance(selectedJob, selectedSchedule)
    : null;

  const updateWorkspace = (nextWorkspaceId: string) => {
    const nextJobs = jobs.filter((job) => job.workspaceId === nextWorkspaceId);
    const nextSchedules = schedules.filter(
      (schedule) => schedule.workspaceId === nextWorkspaceId,
    );
    const nextJob = nextJobs.find((job) => {
      const schedule = nextSchedules.find(
        (entry) => entry.jobId === job.id && entry.operation === PRODUCTION_OPERATIONS[0],
      );
      return !isCompletedWithoutBalance(job, schedule);
    });
    const nextSchedule = nextJob && nextSchedules.find(
      (schedule) =>
        schedule.jobId === nextJob.id &&
        schedule.operation === PRODUCTION_OPERATIONS[0],
    );
    const nextBalance = nextJob && nextSchedule?.status === "COMPLETED"
      ? getScheduleBalance(nextJob, nextSchedule)
      : null;
    setWorkspaceId(nextWorkspaceId);
    setForm({
      ...createProductionScheduleForm(nextJob?.id ?? ""),
      plannedQty: nextBalance !== null && nextBalance > 0
        ? String(nextBalance)
        : "",
    });
    setEditingScheduleId("");
    setStatus("");
  };

  const editSchedule = (schedule: ProductionDashboardSchedule) => {
    const job = jobs.find((candidate) => candidate.id === schedule.jobId);
    const balance = job ? getScheduleBalance(job, schedule) : null;
    const isReschedulingBalance =
      schedule.status === "COMPLETED" && balance !== null && balance > 0;
    setWorkspaceId(schedule.workspaceId);
    setForm({
      jobId: schedule.jobId,
      operation: schedule.operation,
      machineId: schedule.machineId ?? "",
      scheduledStartAt: localDateTimeValue(new Date(schedule.scheduledStartAt)),
      scheduledEndAt: localDateTimeValue(new Date(schedule.scheduledEndAt)),
      plannedQty: isReschedulingBalance ? String(balance) : String(schedule.plannedQty),
      status: isReschedulingBalance ? "PLANNED" : schedule.status,
      notes: schedule.notes,
    });
    setEditingScheduleId(schedule.id);
    setStatus("");
  };

  const submitSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/operation-schedules`,
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            scheduledStartAt: new Date(form.scheduledStartAt).toISOString(),
            scheduledEndAt: new Date(form.scheduledEndAt).toISOString(),
          }),
        },
      );
      if (!isRecord(response.schedule)) {
        throw new Error("The server returned an invalid operation schedule.");
      }
      notifyToast("Production schedule saved.");
      setForm(createProductionScheduleForm(
        schedulableJobFor(form.operation)?.id ?? "",
      ));
      setEditingScheduleId("");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">CAPACITY & SEQUENCING</span>
            <h2>{editingScheduleId ? "Update operation schedule" : "Schedule a job operation"}</h2>
          </div>
          <div className="production-planning-mode-actions">
            <span className="production-panel-total">{workspaceJobs.length} jobs in workspace</span>
            <button
              aria-pressed={schedulingMode === "single"}
              className="production-text-action"
              onClick={() => setSchedulingMode("single")}
              type="button"
            >
              Single
            </button>
            <button
              aria-pressed={schedulingMode === "bulk"}
              className="production-text-action"
              disabled={Boolean(editingScheduleId)}
              onClick={() => setSchedulingMode("bulk")}
              type="button"
            >
              Bulk
            </button>
          </div>
        </div>
        {schedulingMode === "bulk" ? (
          <BulkScheduleForm
            key={workspaceId}
            jobs={workspaceJobs}
            machines={machines}
            maintenancePlans={workspaceMaintenancePlans}
            maintenanceTickets={workspaceMaintenanceTickets}
            onSaved={onSaved}
            workspaceId={workspaceId}
            schedules={workspaceSchedules}
          />
        ) : (
        <form className="production-planning-form" onSubmit={submitSchedule}>
          {productionWorkspaces.length > 1 && (
            <label className="production-order-booking-field">
              Production workspace
              <select
                onChange={(event) => updateWorkspace(event.target.value)}
                value={workspaceId}
              >
                {productionWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Job sheet
              <select
                disabled={Boolean(editingScheduleId)}
                onChange={(event) => {
                  const jobId = event.target.value;
                  const job = workspaceJobs.find((candidate) => candidate.id === jobId);
                  const schedule = job ? scheduleFor(job.id, form.operation) : undefined;
                  const balance = job && schedule?.status === "COMPLETED"
                    ? getScheduleBalance(job, schedule)
                    : null;
                  setForm((current) => ({
                    ...current,
                    jobId,
                    plannedQty: balance !== null && balance > 0
                      ? String(balance)
                      : current.plannedQty,
                  }));
                }}
                required
                value={form.jobId}
              >
                <option value="">Select a job</option>
                {workspaceJobs.map((job) => {
                  const schedule = scheduleFor(job.id, form.operation);
                  const balance = schedule?.status === "COMPLETED"
                    ? getScheduleBalance(job, schedule)
                    : null;
                  const completedWithoutBalance = isCompletedWithoutBalance(job, schedule);
                  return (
                    <option disabled={completedWithoutBalance} key={job.id} value={job.id}>
                      {job.jobNo || "Unnumbered"} — {job.jobName || job.customer || "Untitled job"}
                      {schedule?.status === "COMPLETED"
                        ? balance !== null && balance > 0
                          ? ` — Balance ${balance.toLocaleString("en-KE")}`
                          : " — Complete"
                        : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="production-order-booking-field">
              Operation
              <select
                disabled={Boolean(editingScheduleId)}
                onChange={(event) => {
                  const operation = event.currentTarget.value;
                  if (isProductionOperation(operation)) {
                    const job = schedulableJobFor(operation, form.jobId);
                    const schedule = job ? scheduleFor(job.id, operation) : undefined;
                    const balance = job && schedule?.status === "COMPLETED"
                      ? getScheduleBalance(job, schedule)
                      : null;
                    setForm((current) => ({
                      ...current,
                      operation,
                      jobId: job?.id ?? "",
                      plannedQty: balance !== null && balance > 0
                        ? String(balance)
                        : current.plannedQty,
                    }));
                  }
                }}
                value={form.operation}
              >
                {PRODUCTION_OPERATIONS.map((operation) => (
                  <option key={operation} value={operation}>{operation}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Machine
              <select
                disabled={!workspaceMachines.length}
                onChange={(event) => setForm((current) => ({ ...current, machineId: event.currentTarget.value }))}
                required
                value={form.machineId}
              >
                <option value="">
                  {workspaceMachines.length ? "Select a machine" : "Register a machine first"}
                </option>
                {workspaceMachines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.machineNo} — {machine.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              Planned quantity
              {selectedBalance !== null && selectedBalance > 0 && (
                <small>Remaining order balance: {selectedBalance.toLocaleString("en-KE")}</small>
              )}
              <input
                max={selectedBalance !== null && selectedBalance > 0
                  ? selectedBalance
                  : undefined}
                min="1"
                onChange={(event) => setForm((current) => ({ ...current, plannedQty: event.target.value }))}
                required
                type="number"
                value={form.plannedQty}
              />
            </label>
          </div>
          <MachineMaintenanceNotice
            machineId={form.machineId}
            scheduledStartAt={form.scheduledStartAt}
            scheduledEndAt={form.scheduledEndAt}
            plans={workspaceMaintenancePlans}
            tickets={workspaceMaintenanceTickets}
          />
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Start
              <input
                onChange={(event) => setForm((current) => ({ ...current, scheduledStartAt: event.target.value }))}
                required
                type="datetime-local"
                value={form.scheduledStartAt}
              />
            </label>
            <label className="production-order-booking-field">
              End
              <input
                onChange={(event) => setForm((current) => ({ ...current, scheduledEndAt: event.target.value }))}
                required
                type="datetime-local"
                value={form.scheduledEndAt}
              />
            </label>
          </div>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Status
              <select
                disabled={form.status === "COMPLETED"}
                onChange={(event) => {
                  const status = event.currentTarget.value;
                  if (isProductionOperationStatus(status)) {
                    setForm((current) => ({ ...current, status }));
                  }
                }}
                value={form.status}
              >
                {PRODUCTION_OPERATION_STATUSES
                  .filter((operationStatus) =>
                    operationStatus !== "COMPLETED" || form.status === "COMPLETED",
                  )
                  .map((operationStatus) => (
                  <option key={operationStatus} value={operationStatus}>
                    {operationStatus.replaceAll("_", " ")}
                  </option>
                  ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              Notes
              <input
                maxLength={500}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                value={form.notes}
              />
            </label>
          </div>
          {status && (
            <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
              {status}
            </p>
          )}
          {!workspaceJobs.length && (
            <p className="production-chart-empty">Create or book a job in this production workspace before scheduling an operation.</p>
          )}
          <div className="production-order-booking-actions">
            <button
              className="production-primary-button"
              disabled={isSaving || !workspaceJobs.length || !workspaceMachines.length}
              type="submit"
            >
              {isSaving ? "Saving…" : editingScheduleId ? "Update schedule" : "Schedule operation"}
            </button>
            {editingScheduleId && (
              <button
                className="production-text-action"
                onClick={() => {
                  setForm(createProductionScheduleForm(
                    schedulableJobFor(form.operation)?.id ?? "",
                  ));
                  setEditingScheduleId("");
                  setStatus("");
                }}
                type="button"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
        )}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">MACHINE LOAD</span>
            <h2>Scheduled operations</h2>
          </div>
          <span className="production-panel-total">{workspaceSchedules.length} operations</span>
        </div>
        {workspaceSchedules.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table production-schedule-table">
              <thead>
                <tr>
                  <th scope="col">Job sheet</th>
                  {productionWorkspaces.length > 1 && <th scope="col">Workspace</th>}
                  <th scope="col">Operation</th>
                  <th scope="col">Machine</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                  <th scope="col">Planned qty</th>
                  <th scope="col">Status</th>
                  <th scope="col">Notes</th>
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {workspaceSchedules.map((schedule) => {
                  const job = jobs.find((candidate) => candidate.id === schedule.jobId);
                  const balance = job ? getScheduleBalance(job, schedule) : null;
                  const completedWithoutBalance = !job ||
                    isCompletedWithoutBalance(job, schedule);
                  return (
                  <tr key={schedule.id}>
                    <td>
                      <strong>{schedule.jobNo || "—"}</strong>
                      <small className="production-schedule-job-name">{schedule.jobName || schedule.customer}</small>
                    </td>
                    {productionWorkspaces.length > 1 && <td>{schedule.workspaceName}</td>}
                    <td>{schedule.operation}</td>
                    <td>{schedule.machineLabel}</td>
                    <td>{formatScheduleDate(schedule.scheduledStartAt)}</td>
                    <td>{formatScheduleDate(schedule.scheduledEndAt)}</td>
                    <td>{schedule.plannedQty.toLocaleString("en-KE")}</td>
                    <td><span className={`production-schedule-status status-${schedule.status.toLowerCase()}`}>{schedule.status.replaceAll("_", " ")}</span></td>
                    <td className="production-schedule-notes">{schedule.notes || "—"}</td>
                    <td>
                      <button
                        className="production-table-action"
                        disabled={completedWithoutBalance}
                        onClick={() => editSchedule(schedule)}
                        type="button"
                      >
                        {schedule.status === "COMPLETED"
                          ? completedWithoutBalance
                            ? "Complete"
                            : `Reschedule balance (${balance?.toLocaleString("en-KE")})`
                          : "Edit"}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiCalendar /></span>
            <h3>No operations scheduled</h3>
            <p>Schedule a job operation to see machine capacity and timing here.</p>
          </div>
        )}
      </section>
    </>
  );
}

function CorrugatorScheduleForm({
  job,
  machines,
  maintenancePlans,
  maintenanceTickets,
  existingSchedule,
  onSaved,
  onCancel,
}: {
  job: ProductionDashboardJob;
  machines: ProductionDashboardMachine[];
  maintenancePlans: ProductionDashboardMaintenancePlan[];
  maintenanceTickets: ProductionDashboardMaintenanceTicket[];
  existingSchedule: ProductionDashboardSchedule | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const remainingBalance = getProductionOperationBalance(
    job.orderQty,
    existingSchedule?.actualGoodQty ?? 0,
  );
  const isReschedulingBalance =
    existingSchedule?.status === "COMPLETED" &&
    remainingBalance !== null &&
    remainingBalance > 0;
  const [form, setForm] = useState<ProductionScheduleForm>(() => {
    if (existingSchedule) {
      return {
        jobId: job.id,
        operation: "Corrugating",
        machineId: existingSchedule.machineId ?? "",
        scheduledStartAt: localDateTimeValue(new Date(existingSchedule.scheduledStartAt)),
        scheduledEndAt: localDateTimeValue(new Date(existingSchedule.scheduledEndAt)),
        plannedQty: isReschedulingBalance
          ? String(remainingBalance)
          : String(existingSchedule.plannedQty),
        status: isReschedulingBalance ? "PLANNED" : existingSchedule.status,
        notes: existingSchedule.notes,
      };
    }
    return {
      ...createProductionScheduleForm(job.id),
      operation: "Corrugating",
      plannedQty: job.orderQty === null ? "" : String(job.orderQty),
    };
  });
  const availableMachines = machines.filter(
    (machine) => machine.workspaceId === job.workspaceId && machine.status !== "RETIRED",
  );
  const workspaceMaintenancePlans = maintenancePlans.filter(
    (plan) => plan.workspaceId === job.workspaceId,
  );
  const workspaceMaintenanceTickets = maintenanceTickets.filter(
    (ticket) => ticket.workspaceId === job.workspaceId,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const submitSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(job.workspaceId)}/operation-schedules`,
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            scheduledStartAt: new Date(form.scheduledStartAt).toISOString(),
            scheduledEndAt: new Date(form.scheduledEndAt).toISOString(),
          }),
        },
      );
      if (!isRecord(response.schedule)) {
        throw new Error("The server returned an invalid operation schedule.");
      }
      notifyToast(existingSchedule ? "Corrugator schedule updated." : "Corrugator schedule created.");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="production-planning-form" onSubmit={submitSchedule}>
      <div>
        <span className="production-panel-kicker">CORRUGATING</span>
        <h3>
          {isReschedulingBalance
            ? "Reschedule corrugator balance"
            : existingSchedule
              ? "Update corrugator schedule"
              : "Schedule to Corrugator"}
        </h3>
      </div>
      <div className="production-order-booking-row">
        <label className="production-order-booking-field">
          Machine
          <select
            disabled={!availableMachines.length}
            onChange={(event) => setForm((current) => ({ ...current, machineId: event.currentTarget.value }))}
            required
            value={form.machineId}
          >
            <option value="">
              {availableMachines.length ? "Select a machine" : "Register a machine first"}
            </option>
            {availableMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.machineNo} — {machine.name}
              </option>
            ))}
          </select>
        </label>
        <label className="production-order-booking-field">
          Planned quantity
          {remainingBalance !== null && remainingBalance > 0 && (
            <small>Remaining order balance: {remainingBalance.toLocaleString("en-KE")}</small>
          )}
          <input
            max={remainingBalance !== null && remainingBalance > 0
              ? remainingBalance
              : undefined}
            min="1"
            onChange={(event) => setForm((current) => ({ ...current, plannedQty: event.target.value }))}
            required
            type="number"
            value={form.plannedQty}
          />
        </label>
      </div>
      <div className="production-order-booking-row">
        <label className="production-order-booking-field">
          Start
          <input
            onChange={(event) => setForm((current) => ({ ...current, scheduledStartAt: event.target.value }))}
            required
            type="datetime-local"
            value={form.scheduledStartAt}
          />
        </label>
        <label className="production-order-booking-field">
          End
          <input
            min={form.scheduledStartAt}
            onChange={(event) => setForm((current) => ({ ...current, scheduledEndAt: event.target.value }))}
            required
            type="datetime-local"
            value={form.scheduledEndAt}
          />
        </label>
      </div>
      <MachineMaintenanceNotice
        machineId={form.machineId}
        scheduledStartAt={form.scheduledStartAt}
        scheduledEndAt={form.scheduledEndAt}
        plans={workspaceMaintenancePlans}
        tickets={workspaceMaintenanceTickets}
      />
      <label className="production-order-booking-field">
        Notes
        <input
          maxLength={500}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          value={form.notes}
        />
      </label>
      {status && (
        <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
          {status}
        </p>
      )}
      <div className="production-order-booking-actions">
        <button
          className="production-primary-button"
          disabled={isSaving || !availableMachines.length}
          type="submit"
        >
          {isSaving ? "Saving…" : existingSchedule ? "Update schedule" : "Schedule operation"}
        </button>
        <button className="production-text-action" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ShopFloorExecutionBoard({
  workspaces,
  schedules,
  operationRuns,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  schedules: ProductionDashboardSchedule[];
  operationRuns: ProductionDashboardRun[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const productionWorkspaces = workspaces.filter(
    (workspace) => hasProductionRole(workspace.role, "PRODUCTION"),
  );
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [form, setForm] = useState({
    goodQty: "0",
    rejectedQty: "0",
    notes: "",
    completeOperation: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const workspaceSchedules = schedules
    .filter((schedule) => schedule.workspaceId === workspaceId)
    .sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt));
  const selectedSchedule = workspaceSchedules.find(
    (schedule) => schedule.id === selectedScheduleId && schedule.status !== "COMPLETED",
  );
  const recentRuns = operationRuns
    .filter((run) => run.workspaceId === workspaceId)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));

  const changeWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setSelectedScheduleId("");
    setStatus("");
  };

  const selectSchedule = (scheduleId: string) => {
    setSelectedScheduleId(scheduleId);
    setForm({ goodQty: "0", rejectedQty: "0", notes: "", completeOperation: false });
    setStatus("");
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSchedule) return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/operation-schedules/${encodeURIComponent(selectedSchedule.id)}/runs`,
        { method: "POST", body: JSON.stringify(form) },
      );
      if (!isRecord(response.run)) {
        throw new Error("The server returned an invalid production report.");
      }
      notifyToast("Production output recorded.");
      setSelectedScheduleId("");
      setForm({ goodQty: "0", rejectedQty: "0", notes: "", completeOperation: false });
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">SHOP FLOOR</span>
            <h2>Scheduled operations</h2>
          </div>
          <span className="production-panel-total">{workspaceSchedules.length} operations</span>
        </div>
        {productionWorkspaces.length > 1 && (
          <label className="production-order-booking-field production-execution-workspace">
            Production workspace
            <select onChange={(event) => changeWorkspace(event.target.value)} value={workspaceId}>
              {productionWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
        )}
        {workspaceSchedules.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table production-execution-table">
              <thead>
                <tr>
                  <th scope="col">Job sheet</th>
                  <th scope="col">Operation</th>
                  <th scope="col">Machine</th>
                  <th scope="col">Planned</th>
                  <th scope="col">Good output</th>
                  <th scope="col">Rejected</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {workspaceSchedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>
                      <strong>{schedule.jobNo || "—"}</strong>
                      <small className="production-schedule-job-name">{schedule.jobName || schedule.customer}</small>
                    </td>
                    <td>{schedule.operation}</td>
                    <td>{schedule.machineLabel}</td>
                    <td>{schedule.plannedQty.toLocaleString("en-KE")}</td>
                    <td>{schedule.actualGoodQty.toLocaleString("en-KE")}</td>
                    <td>{schedule.actualRejectedQty.toLocaleString("en-KE")}</td>
                    <td>
                      <span className={`production-schedule-status status-${schedule.status.toLowerCase()}`}>
                        {schedule.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      <button
                        className="production-table-action"
                        disabled={schedule.status === "COMPLETED"}
                        onClick={() => selectSchedule(schedule.id)}
                        type="button"
                      >
                        {schedule.status === "COMPLETED"
                          ? "Complete"
                          : selectedScheduleId === schedule.id
                            ? "Selected"
                            : "Record output"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiActivity /></span>
            <h3>No operations ready for reporting</h3>
            <p>Schedule a production operation before recording shop-floor output.</p>
          </div>
        )}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PRODUCTION REPORT</span>
            <h2>{selectedSchedule ? `${selectedSchedule.operation} — ${selectedSchedule.jobNo || selectedSchedule.jobName}` : "Record actual output"}</h2>
          </div>
          {selectedSchedule && (
            <span className="production-panel-total">
              Planned {selectedSchedule.plannedQty.toLocaleString("en-KE")}
            </span>
          )}
        </div>
        {selectedSchedule ? (
          <form className="production-planning-form" onSubmit={submitReport}>
            <div className="production-order-booking-row">
              <label className="production-order-booking-field">
                Good quantity
                <input
                  min="0"
                  onChange={(event) => setForm((current) => ({ ...current, goodQty: event.target.value }))}
                  required
                  type="number"
                  value={form.goodQty}
                />
              </label>
              <label className="production-order-booking-field">
                Rejected quantity
                <input
                  min="0"
                  onChange={(event) => setForm((current) => ({ ...current, rejectedQty: event.target.value }))}
                  required
                  type="number"
                  value={form.rejectedQty}
                />
              </label>
            </div>
            <label className="production-order-booking-field">
              Notes
              <input
                maxLength={500}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional shift notes or reject details"
                value={form.notes}
              />
            </label>
            <label className="production-execution-complete">
              <input
                checked={form.completeOperation}
                onChange={(event) => setForm((current) => ({ ...current, completeOperation: event.target.checked }))}
                type="checkbox"
              />
              Mark this operation complete after saving the report
            </label>
            {status && (
              <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
                {status}
              </p>
            )}
            <div className="production-order-booking-actions">
              <button className="production-primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Saving…" : "Record production"}
              </button>
              <button
                className="production-text-action"
                onClick={() => selectSchedule("")}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="production-chart-empty">
            Select a scheduled operation to report good output, rejects, and completion.
          </p>
        )}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">SHIFT REPORTS</span>
            <h2>Recent production output</h2>
          </div>
          <span className="production-panel-total">Latest {recentRuns.length} reports</span>
        </div>
        {recentRuns.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead>
                <tr>
                  <th scope="col">Recorded</th>
                  <th scope="col">Job sheet</th>
                  <th scope="col">Operation</th>
                  <th scope="col">Machine</th>
                  <th scope="col">Good</th>
                  <th scope="col">Rejected</th>
                  <th scope="col">Operator</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{formatScheduleDate(run.recordedAt)}</td>
                    <td>{run.jobNo || "—"}</td>
                    <td>{run.operation}</td>
                    <td>{run.machineLabel}</td>
                    <td>{run.goodQty.toLocaleString("en-KE")}</td>
                    <td>{run.rejectedQty.toLocaleString("en-KE")}</td>
                    <td>{run.recordedByName}</td>
                    <td className="production-schedule-notes">{run.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="production-chart-empty">Production reports will appear here as operators record output.</p>
        )}
      </section>
    </>
  );
}

const DEFAULT_QUALITY_CHECKPOINTS: ProductionQualityCheckInput[] = [
  { checkpoint: "Board grade / flute", target: "", observed: "", result: "PASS" },
  { checkpoint: "Sheet dimensions", target: "", observed: "", result: "PASS" },
  { checkpoint: "Print and color", target: "", observed: "", result: "PASS" },
  { checkpoint: "Die-cut and crease", target: "", observed: "", result: "PASS" },
  { checkpoint: "Joint and glue", target: "", observed: "", result: "PASS" },
];

function createQualityInspectionDraft(jobId: string): ProductionQualityInspectionInput {
  return {
    jobId,
    scheduleId: "",
    inspectionType: "IN_PROCESS",
    sampleQty: "1",
    rejectedQty: "0",
    checks: DEFAULT_QUALITY_CHECKPOINTS.map((check) => ({ ...check })),
    notes: "",
    ncrDescription: "",
    ncrSeverity: "MEDIUM",
  };
}

function QualityManagementBoard({
  workspaces,
  jobs,
  schedules,
  inspections,
  nonconformances,
  qualityMetrics,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  jobs: ProductionDashboardJob[];
  schedules: ProductionDashboardSchedule[];
  inspections: ProductionDashboardQualityInspection[];
  nonconformances: ProductionDashboardNonconformance[];
  qualityMetrics: ProductionDashboardQualityMetrics[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const productionWorkspaces = workspaces.filter(
    (workspace) => hasProductionRole(workspace.role, "PRODUCTION"),
  );
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const workspaceJobs = jobs.filter((job) => job.workspaceId === workspaceId);
  const [draft, setDraft] = useState(() =>
    createQualityInspectionDraft(workspaceJobs[0]?.id ?? ""),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const workspaceInspections = inspections.filter(
    (inspection) => inspection.workspaceId === workspaceId,
  );
  const workspaceNcrs = nonconformances.filter(
    (ncr) => ncr.workspaceId === workspaceId,
  );
  const workspaceQualityMetrics = qualityMetrics.find(
    (metrics) => metrics.workspaceId === workspaceId,
  );
  const inspectionCount = workspaceQualityMetrics?.inspections ?? 0;
  const passedInspectionCount = workspaceQualityMetrics?.passed ?? 0;
  const inspectionPassRate = inspectionCount
    ? Math.round((passedInspectionCount / inspectionCount) * 100)
    : 0;
  const openNcrCount = workspaceQualityMetrics?.openNcrs ?? 0;
  const rejectedUnitCount = workspaceQualityMetrics?.rejectedUnits ?? 0;
  const sampledUnitCount = workspaceQualityMetrics?.sampledUnits ?? 0;
  const sampleRejectRate = sampledUnitCount
    ? ((rejectedUnitCount / sampledUnitCount) * 100).toFixed(1)
    : "0.0";
  const productionSchedules = schedules.filter(
    (schedule) => schedule.workspaceId === workspaceId,
  );
  const hasInspectionFailure = Number(draft.rejectedQty) > 0 ||
    draft.checks.some((check) => check.result === "FAIL");

  const changeWorkspace = (nextWorkspaceId: string) => {
    const nextJobId = jobs.find((job) => job.workspaceId === nextWorkspaceId)?.id ?? "";
    setWorkspaceId(nextWorkspaceId);
    setDraft(createQualityInspectionDraft(nextJobId));
    setStatus("");
  };

  const updateCheck = (
    index: number,
    key: keyof ProductionQualityCheckInput,
    value: string,
  ) => {
    if (key === "result") {
      if (!isProductionQualityCheckResult(value)) return;
      setDraft((current) => ({
        ...current,
        checks: current.checks.map((check, checkIndex) =>
          checkIndex === index ? { ...check, result: value } : check,
        ),
      }));
      return;
    }
    setDraft((current) => ({
      ...current,
      checks: current.checks.map((check, checkIndex) =>
        checkIndex === index
          ? { ...check, [key]: value }
          : check,
      ),
    }));
  };

  const submitInspection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/quality/inspections`,
        { method: "POST", body: JSON.stringify(draft) },
      );
      if (!isRecord(response.inspection) || typeof response.inspection.inspectionNo !== "string") {
        throw new Error("The server returned an invalid quality inspection.");
      }
      const nonconformance = isRecord(response.nonconformance) ? response.nonconformance : null;
      setStatus(nonconformance
        ? `Inspection ${response.inspection.inspectionNo} saved; NCR ${String(nonconformance.ncrNo ?? "")} opened.`
        : `Inspection ${response.inspection.inspectionNo} saved with a pass result.`);
      setDraft(createQualityInspectionDraft(workspaceJobs[0]?.id ?? ""));
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-quality-summary-grid" aria-label="Quality metrics">
        <article className="production-kpi-card">
          <span className="production-kpi-icon kpi-blue" aria-hidden="true"><FiCheckSquare /></span>
          <p>Inspections recorded</p>
          <strong>{inspectionCount}</strong>
          <small>{workspaceQualityMetrics?.failed ?? 0} failed inspections</small>
        </article>
        <article className="production-kpi-card">
          <span className="production-kpi-icon kpi-green" aria-hidden="true"><FiCheckSquare /></span>
          <p>Inspection pass rate</p>
          <strong>{inspectionPassRate}%</strong>
          <small>{passedInspectionCount} passed inspections</small>
        </article>
        <article className="production-kpi-card">
          <span className="production-kpi-icon kpi-red" aria-hidden="true"><FiAlertTriangle /></span>
          <p>Open nonconformances</p>
          <strong>{openNcrCount}</strong>
          <small>Awaiting corrective action</small>
        </article>
        <article className="production-kpi-card">
          <span className="production-kpi-icon kpi-amber" aria-hidden="true"><FiFlag /></span>
          <p>Sample reject rate</p>
          <strong>{sampleRejectRate}%</strong>
          <small>{rejectedUnitCount.toLocaleString("en-KE")} rejected of {sampledUnitCount.toLocaleString("en-KE")} inspected</small>
        </article>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">QUALITY ASSURANCE</span>
            <h2>Record an inspection</h2>
          </div>
          {productionWorkspaces.length > 1 && (
            <label className="production-order-booking-field production-quality-workspace">
              Workspace
              <select onChange={(event) => changeWorkspace(event.target.value)} value={workspaceId}>
                {productionWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <form className="production-planning-form" onSubmit={submitInspection}>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Job sheet
              <select
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  jobId: event.target.value,
                  scheduleId: "",
                }))}
                required
                value={draft.jobId}
              >
                <option value="">Select a job</option>
                {workspaceJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNo || "Unnumbered"} — {job.jobName || job.customer || "Untitled job"}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              Inspection stage
              <select
                onChange={(event) => {
                  const inspectionType = event.target.value;
                  if (isProductionQualityInspectionType(inspectionType)) {
                    setDraft((current) => ({ ...current, inspectionType }));
                  }
                }}
                value={draft.inspectionType}
              >
                {PRODUCTION_QUALITY_INSPECTION_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="production-order-booking-field">
            Related operation (optional)
            <select
              disabled={!draft.jobId}
              onChange={(event) => setDraft((current) => ({ ...current, scheduleId: event.target.value }))}
              value={draft.scheduleId}
            >
              <option value="">Not linked to an operation</option>
              {productionSchedules
                .filter((schedule) => schedule.jobId === draft.jobId)
                .map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.operation} — {schedule.machineLabel} ({schedule.status.replaceAll("_", " ")})
                  </option>
                ))}
            </select>
          </label>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Sample quantity
              <input
                max="1000000000"
                min="1"
                onChange={(event) => setDraft((current) => ({ ...current, sampleQty: event.target.value }))}
                required
                type="number"
                value={draft.sampleQty}
              />
            </label>
            <label className="production-order-booking-field">
              Rejected units in sample
              <input
                max={draft.sampleQty || undefined}
                min="0"
                onChange={(event) => setDraft((current) => ({ ...current, rejectedQty: event.target.value }))}
                required
                type="number"
                value={draft.rejectedQty}
              />
            </label>
          </div>
          <div className="production-quality-checks">
            <div className="production-panel-heading">
              <div>
                <span className="production-panel-kicker">CARTON CHECKPOINTS</span>
                <h3>Specification checks</h3>
              </div>
              <button
                className="production-text-action"
                disabled={draft.checks.length >= 30}
                onClick={() => setDraft((current) => ({
                  ...current,
                  checks: [
                    ...current.checks,
                    { checkpoint: "", target: "", observed: "", result: "PASS" },
                  ],
                }))}
                type="button"
              >
                <FiPlus aria-hidden="true" /> Add check
              </button>
            </div>
            {draft.checks.map((check, index) => (
              <div className="production-quality-check-row" key={`quality-check-${index}`}>
                <label className="production-order-booking-field">
                  Checkpoint
                  <input
                    maxLength={100}
                    onChange={(event) => updateCheck(index, "checkpoint", event.target.value)}
                    required
                    value={check.checkpoint}
                  />
                </label>
                <label className="production-order-booking-field">
                  Target / specification
                  <input
                    maxLength={120}
                    onChange={(event) => updateCheck(index, "target", event.target.value)}
                    required
                    value={check.target}
                  />
                </label>
                <label className="production-order-booking-field">
                  Observed
                  <input
                    maxLength={120}
                    onChange={(event) => updateCheck(index, "observed", event.target.value)}
                    required
                    value={check.observed}
                  />
                </label>
                <label className="production-order-booking-field">
                  Result
                  <select
                    onChange={(event) => updateCheck(index, "result", event.target.value)}
                    value={check.result}
                  >
                    {PRODUCTION_QUALITY_CHECK_RESULTS.map((result) => (
                      <option key={result} value={result}>{result.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </label>
                {draft.checks.length > 1 && (
                  <button
                    aria-label={`Remove checkpoint ${index + 1}`}
                    className="production-table-action production-quality-remove"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      checks: current.checks.filter((_, checkIndex) => checkIndex !== index),
                    }))}
                    type="button"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <label className="production-order-booking-field">
            Inspection notes
            <input
              maxLength={1000}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              value={draft.notes}
            />
          </label>
          {hasInspectionFailure && (
            <div className="production-quality-ncr-prompt">
              <strong>Failure detected — an NCR will be opened with this inspection.</strong>
              <label className="production-order-booking-field">
                Nonconformance description
                <textarea
                  maxLength={1000}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    ncrDescription: event.target.value,
                  }))}
                  required
                  rows={3}
                  value={draft.ncrDescription}
                />
              </label>
              <label className="production-order-booking-field">
                Severity
                <select
                  onChange={(event) => {
                    const ncrSeverity = event.target.value;
                    if (isProductionNonconformanceSeverity(ncrSeverity)) {
                      setDraft((current) => ({ ...current, ncrSeverity }));
                    }
                  }}
                  value={draft.ncrSeverity}
                >
                  {PRODUCTION_NONCONFORMANCE_SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {status && (
            <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
              {status}
            </p>
          )}
          <div className="production-order-booking-actions">
            <button className="production-primary-button" disabled={isSaving || !workspaceJobs.length} type="submit">
              {isSaving ? "Saving…" : "Save inspection"}
            </button>
          </div>
          {!workspaceJobs.length && (
            <p className="production-chart-empty">Book a job in this workspace before recording an inspection.</p>
          )}
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">INSPECTION REGISTER</span>
            <h2>Recent quality inspections</h2>
          </div>
          <span className="production-panel-total">Latest {workspaceInspections.length} records</span>
        </div>
        {workspaceInspections.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table production-quality-table">
              <thead>
                <tr>
                  <th scope="col">Inspection</th>
                  <th scope="col">Job sheet</th>
                  <th scope="col">Stage / operation</th>
                  <th scope="col">Sample</th>
                  <th scope="col">Rejected</th>
                  <th scope="col">Result</th>
                  <th scope="col">Inspector</th>
                  <th scope="col">Date</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Checks</th>
                </tr>
              </thead>
              <tbody>
                {workspaceInspections.map((inspection) => (
                  <tr key={inspection.id}>
                    <td><strong>{inspection.inspectionNo}</strong></td>
                    <td>
                      <strong>{inspection.jobNo || "—"}</strong>
                      <small className="production-schedule-job-name">{inspection.jobName}</small>
                    </td>
                    <td>
                      {inspection.inspectionType.replaceAll("_", " ")}
                      {inspection.operation && <small className="production-schedule-job-name">{inspection.operation}</small>}
                    </td>
                    <td>{inspection.sampleQty.toLocaleString("en-KE")}</td>
                    <td>{inspection.rejectedQty.toLocaleString("en-KE")}</td>
                    <td>
                      <span className={`production-schedule-status status-${inspection.result.toLowerCase()}`}>
                        {inspection.result}
                      </span>
                    </td>
                    <td>{inspection.inspectorName}</td>
                    <td>{formatScheduleDate(inspection.inspectedAt)}</td>
                    <td className="production-schedule-notes">{inspection.notes || "—"}</td>
                    <td>
                      <details className="production-quality-check-details">
                        <summary>{inspection.checks.length} checks</summary>
                        <ul>
                          {inspection.checks.map((check, index) => (
                            <li key={`${inspection.id}-check-${index}`}>
                              <strong>{check.checkpoint}</strong>
                              <span>{check.target} → {check.observed}</span>
                              <span className={`production-quality-result result-${check.result.toLowerCase()}`}>
                                {check.result.replaceAll("_", " ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiCheckSquare /></span>
            <h3>No inspections recorded</h3>
            <p>Inspection results will appear here as quality checks are completed.</p>
          </div>
        )}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">CORRECTIVE ACTION</span>
            <h2>Nonconformance register</h2>
          </div>
          <span className="production-panel-total">
            Latest {workspaceNcrs.length} of {workspaceQualityMetrics?.totalNcrs ?? 0}
          </span>
        </div>
        {workspaceNcrs.length ? (
          <div className="production-quality-ncr-list">
            {workspaceNcrs.map((ncr) => (
              <QualityNonconformanceCard
                key={`${ncr.id}:${ncr.updatedAt}`}
                nonconformance={ncr}
                onSaved={onSaved}
                workspaceId={workspaceId}
              />
            ))}
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiCheckSquare /></span>
            <h3>No nonconformances</h3>
            <p>Failed inspections automatically open a corrective-action record here.</p>
          </div>
        )}
      </section>
    </>
  );
}

function QualityNonconformanceCard({
  nonconformance,
  workspaceId,
  onSaved,
}: {
  nonconformance: ProductionDashboardNonconformance;
  workspaceId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProductionNonconformanceUpdateInput>(() => ({
    status: "IN_PROGRESS",
    rootCause: nonconformance.rootCause,
    correctiveAction: nonconformance.correctiveAction,
    disposition: nonconformance.disposition,
    resolutionNotes: nonconformance.resolutionNotes,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hasError, setHasError] = useState(false);

  const submitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatusMessage("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/quality/nonconformances/${encodeURIComponent(nonconformance.id)}`,
        { method: "PATCH", body: JSON.stringify(form) },
      );
      notifyToast(form.status === "CLOSED" ? "Nonconformance closed." : "Corrective-action plan saved.");
      setStatusMessage("");
      onSaved();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="production-quality-ncr-card">
      <div className="production-quality-ncr-heading">
        <div>
          <strong>{nonconformance.ncrNo}</strong>
          <span>{nonconformance.jobNo || "Job"} — {nonconformance.jobName}</span>
        </div>
        <div className="production-quality-ncr-badges">
          <span className={`production-quality-severity severity-${nonconformance.severity.toLowerCase()}`}>
            {nonconformance.severity}
          </span>
          <span className={`production-schedule-status status-${nonconformance.status.toLowerCase()}`}>
            {nonconformance.status.replaceAll("_", " ")}
          </span>
        </div>
      </div>
      <p className="production-quality-ncr-description">{nonconformance.description}</p>
      <div className="production-quality-ncr-meta">
        <span>Affected: {nonconformance.affectedQty.toLocaleString("en-KE")} units</span>
        <span>Disposition: {nonconformance.disposition.replaceAll("_", " ")}</span>
        <span>Raised {formatScheduleDate(nonconformance.createdAt)} by {nonconformance.createdByName}</span>
        {nonconformance.inspectionNo && <span>Inspection {nonconformance.inspectionNo}</span>}
        {nonconformance.status !== "OPEN" && (
          <span>Last updated by {nonconformance.updatedByName}</span>
        )}
        {nonconformance.closedAt && (
          <span>Closed {formatScheduleDate(nonconformance.closedAt)} by {nonconformance.resolvedByName}</span>
        )}
      </div>
      {nonconformance.status !== "CLOSED" ? (
        <form className="production-quality-resolution-form" onSubmit={submitUpdate}>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Root cause
              <textarea
                maxLength={1000}
                onChange={(event) => setForm((current) => ({ ...current, rootCause: event.target.value }))}
                required={form.status === "CLOSED"}
                rows={2}
                value={form.rootCause}
              />
            </label>
            <label className="production-order-booking-field">
              Corrective action
              <textarea
                maxLength={1000}
                onChange={(event) => setForm((current) => ({ ...current, correctiveAction: event.target.value }))}
                required={form.status === "CLOSED"}
                rows={2}
                value={form.correctiveAction}
              />
            </label>
          </div>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Disposition
              <select
                onChange={(event) => {
                  const disposition = event.target.value;
                  if (isProductionNonconformanceDisposition(disposition)) {
                    setForm((current) => ({ ...current, disposition }));
                  }
                }}
                required={form.status === "CLOSED"}
                value={form.disposition}
              >
                {PRODUCTION_NONCONFORMANCE_DISPOSITIONS.map((disposition) => (
                  <option key={disposition} value={disposition}>
                    {disposition.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              Resolution / verification notes
              <textarea
                maxLength={1000}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  resolutionNotes: event.target.value,
                }))}
                required={form.status === "CLOSED"}
                rows={2}
                value={form.resolutionNotes}
              />
            </label>
          </div>
          {nonconformance.status === "IN_PROGRESS" && (
            <label className="production-order-booking-field production-quality-status-field">
              Workflow status
              <select
                onChange={(event) => setForm((current) => ({
                  ...current,
                  status: event.target.value === "CLOSED" ? "CLOSED" : "IN_PROGRESS",
                }))}
                value={form.status}
              >
                <option value="IN_PROGRESS">In progress</option>
                <option value="CLOSED">Close NCR</option>
              </select>
            </label>
          )}
          {statusMessage && (
            <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
              {statusMessage}
            </p>
          )}
          <button className="production-primary-button" disabled={isSaving} type="submit">
            {isSaving
              ? "Saving…"
              : nonconformance.status === "OPEN"
                ? "Start investigation"
                : form.status === "CLOSED"
                  ? "Close nonconformance"
                  : "Save action plan"}
          </button>
        </form>
      ) : (
        <div className="production-quality-closed-summary">
          <p><strong>Root cause:</strong> {nonconformance.rootCause}</p>
          <p><strong>Corrective action:</strong> {nonconformance.correctiveAction}</p>
          <p><strong>Verification:</strong> {nonconformance.resolutionNotes}</p>
        </div>
      )}
    </article>
  );
}

function formatSupplyQuantity(value: string) {
  const quantity = Number(value);
  return Number.isFinite(quantity)
    ? quantity.toLocaleString("en-KE", { maximumFractionDigits: 3 })
    : value;
}

function ProcurementBoard({
  workspaces,
  materials,
  suppliers,
  purchaseOrders,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  materials: ProductionDashboardMaterial[];
  suppliers: ProductionDashboardSupplier[];
  purchaseOrders: ProductionDashboardPurchaseOrder[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const workspaceMaterials = materials.filter((material) => material.workspaceId === workspaceId);
  const activeMaterials = workspaceMaterials.filter((material) => material.active);
  const workspaceSuppliers = suppliers.filter((supplier) => supplier.workspaceId === workspaceId);
  const activeSuppliers = workspaceSuppliers.filter((supplier) => supplier.active);
  const workspaceOrders = purchaseOrders.filter((order) => order.workspaceId === workspaceId);
  const [materialForm, setMaterialForm] = useState({
    name: "",
    category: "PAPER",
    unit: "kg",
    reorderPoint: "0",
  });
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderLines, setOrderLines] = useState<Array<{ materialId: string; quantity: string }>>([
    { materialId: "", quantity: "" },
  ]);
  const [receivingOrderId, setReceivingOrderId] = useState("");
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const changeWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setSelectedSupplierId("");
    setOrderLines([{ materialId: "", quantity: "" }]);
    setReceivingOrderId("");
    setReceiptQuantities({});
    setStatus("");
  };

  const createMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/materials`,
        { method: "POST", body: JSON.stringify(materialForm) },
      );
      if (!isRecord(response.material) || typeof response.material.code !== "string") {
        throw new Error("The server returned an invalid material.");
      }
      setMaterialForm({ name: "", category: "PAPER", unit: "kg", reorderPoint: "0" });
      notifyToast(`Material created with code ${response.material.code}.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const createSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/suppliers`,
        { method: "POST", body: JSON.stringify(supplierForm) },
      );
      if (!isRecord(response.supplier) || typeof response.supplier.code !== "string") {
        throw new Error("The server returned an invalid supplier.");
      }
      setSupplierForm({ name: "", contactPerson: "", phone: "", email: "", address: "" });
      notifyToast(`Supplier created with code ${response.supplier.code}.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const createPurchaseOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/purchase-orders`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierId: selectedSupplierId,
            expectedAt,
            notes: orderNotes,
            lines: orderLines,
          }),
        },
      );
      if (!isRecord(response.purchaseOrder) || typeof response.purchaseOrder.orderNo !== "string") {
        throw new Error("The server returned an invalid purchase order.");
      }
      setSelectedSupplierId("");
      setExpectedAt("");
      setOrderNotes("");
      setOrderLines([{ materialId: activeMaterials[0]?.id ?? "", quantity: "" }]);
      notifyToast(`Purchase order ${response.purchaseOrder.orderNo} created.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const openReceipt = (purchaseOrder: ProductionDashboardPurchaseOrder) => {
    setReceivingOrderId(purchaseOrder.id);
    setReceiptQuantities(Object.fromEntries(
      purchaseOrder.lines.map((line) => [line.id, ""]),
    ));
    setStatus("");
  };

  const receivePurchaseOrder = async (
    event: FormEvent<HTMLFormElement>,
    purchaseOrder: ProductionDashboardPurchaseOrder,
  ) => {
    event.preventDefault();
    const lines = Object.entries(receiptQuantities)
      .filter(([, quantity]) => quantity.trim())
      .map(([purchaseOrderLineId, quantity]) => ({ purchaseOrderLineId, quantity }));
    if (!lines.length) {
      setStatus("Enter a receipt quantity for at least one line.");
      setHasError(true);
      return;
    }
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/purchase-orders/${encodeURIComponent(purchaseOrder.id)}/receipts`,
        { method: "POST", body: JSON.stringify({ lines }) },
      );
      setReceivingOrderId("");
      setReceiptQuantities({});
      notifyToast(`Goods received against ${purchaseOrder.orderNo}.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">SUPPLY SETUP</span>
            <h2>Materials and suppliers</h2>
          </div>
          {workspaces.length > 1 && (
            <label className="production-workspace-filter">
              <span>Workspace</span>
              <select onChange={(event) => changeWorkspace(event.target.value)} value={workspaceId}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="production-supply-setup-grid">
          <details className="production-supply-details">
            <summary>Add material</summary>
            <form className="production-supply-form" onSubmit={createMaterial}>
              <label className="production-order-booking-field">
                Material name
                <input maxLength={120} onChange={(event) => setMaterialForm((current) => ({ ...current, name: event.target.value }))} required value={materialForm.name} />
              </label>
              <div className="production-order-booking-row">
                <label className="production-order-booking-field">
                  Category
                  <select onChange={(event) => setMaterialForm((current) => ({ ...current, category: event.target.value }))} value={materialForm.category}>
                    {PRODUCTION_MATERIAL_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="production-order-booking-field">
                  Unit
                  <select onChange={(event) => setMaterialForm((current) => ({ ...current, unit: event.target.value }))} value={materialForm.unit}>
                    {PRODUCTION_MATERIAL_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </label>
              </div>
              <label className="production-order-booking-field">
                Reorder point ({materialForm.unit})
                <input min="0" onChange={(event) => setMaterialForm((current) => ({ ...current, reorderPoint: event.target.value }))} required step="0.001" type="number" value={materialForm.reorderPoint} />
              </label>
              <button className="production-primary-button" disabled={isSaving} type="submit">Save material</button>
            </form>
          </details>
          <details className="production-supply-details">
            <summary>Add supplier</summary>
            <form className="production-supply-form" onSubmit={createSupplier}>
              <label className="production-order-booking-field">
                Supplier name
                <input maxLength={120} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required value={supplierForm.name} />
              </label>
              <label className="production-order-booking-field">
                Contact person
                <input maxLength={120} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))} value={supplierForm.contactPerson} />
              </label>
              <div className="production-order-booking-row">
                <label className="production-order-booking-field">
                  Phone
                  <input maxLength={40} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} value={supplierForm.phone} />
                </label>
                <label className="production-order-booking-field">
                  Email
                  <input maxLength={254} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} type="email" value={supplierForm.email} />
                </label>
              </div>
              <label className="production-order-booking-field">
                Address
                <input maxLength={500} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} value={supplierForm.address} />
              </label>
              <button className="production-primary-button" disabled={isSaving} type="submit">Save supplier</button>
            </form>
          </details>
        </div>
        <div className="production-supply-register-grid">
          <div>
            <h3>Material register</h3>
            {workspaceMaterials.length ? (
              <ul className="production-supply-compact-list">
                {workspaceMaterials.map((material) => (
                  <li key={material.id}>
                    <span><strong>{material.code}</strong> {material.name}</span>
                    <small>{material.category} · {material.unit}{material.active ? "" : " · Inactive"}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="production-chart-empty">Add materials to begin purchasing stock.</p>}
          </div>
          <div>
            <h3>Supplier register</h3>
            {workspaceSuppliers.length ? (
              <ul className="production-supply-compact-list">
                {workspaceSuppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <span><strong>{supplier.code}</strong> {supplier.name}</span>
                    <small>{supplier.contactPerson || supplier.email || supplier.phone || (supplier.active ? "Active" : "Inactive")}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="production-chart-empty">Add suppliers to create purchase orders.</p>}
          </div>
        </div>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PROCUREMENT</span>
            <h2>Create purchase order</h2>
          </div>
          <span className="production-panel-total">{workspaceOrders.length} purchase orders</span>
        </div>
        <form className="production-planning-form" onSubmit={createPurchaseOrder}>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Supplier
              <select onChange={(event) => setSelectedSupplierId(event.target.value)} required value={selectedSupplierId}>
                <option value="">Select a supplier</option>
                {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}
              </select>
            </label>
            <label className="production-order-booking-field">
              Expected delivery
              <input onChange={(event) => setExpectedAt(event.target.value)} type="date" value={expectedAt} />
            </label>
          </div>
          {orderLines.map((line, index) => (
            <div className="production-order-booking-row" key={`purchase-line-${index}`}>
              <label className="production-order-booking-field">
                Material
                <select
                  onChange={(event) => setOrderLines((current) => current.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, materialId: event.target.value } : entry,
                  ))}
                  required
                  value={line.materialId}
                >
                  <option value="">Select a material</option>
                  {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.code} — {material.name} ({material.unit})</option>)}
                </select>
              </label>
              <label className="production-order-booking-field">
                Order quantity
                <input min="0.001" onChange={(event) => setOrderLines((current) => current.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, quantity: event.target.value } : entry,
                ))} required step="0.001" type="number" value={line.quantity} />
              </label>
            </div>
          ))}
          <div className="production-supply-form-actions">
            <button className="production-text-action" disabled={orderLines.length >= 50} onClick={() => setOrderLines((current) => [...current, { materialId: "", quantity: "" }])} type="button"><FiPlus aria-hidden="true" /> Add material line</button>
            <button className="production-primary-button" disabled={isSaving || !activeMaterials.length || !activeSuppliers.length} type="submit">
              {isSaving ? "Saving…" : "Create purchase order"}
            </button>
          </div>
          <label className="production-order-booking-field">
            Notes
            <input maxLength={1000} onChange={(event) => setOrderNotes(event.target.value)} value={orderNotes} />
          </label>
          {status && <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>{status}</p>}
          {(!activeMaterials.length || !activeSuppliers.length) && (
            <p className="production-chart-empty">Add at least one active material and supplier before creating a purchase order.</p>
          )}
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PURCHASE REGISTER</span>
            <h2>Purchase orders and receipts</h2>
          </div>
          <span className="production-panel-total">{workspaceOrders.length} orders</span>
        </div>
        {workspaceOrders.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Order</th><th scope="col">Supplier</th><th scope="col">Materials</th><th scope="col">Status</th><th scope="col">Expected</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {workspaceOrders.map((purchaseOrder) => (
                  <Fragment key={purchaseOrder.id}>
                    <tr>
                      <td><strong>{purchaseOrder.orderNo}</strong></td>
                      <td>{purchaseOrder.supplier.name}</td>
                      <td className="production-schedule-notes">{purchaseOrder.lines.map((line) => `${line.material.name}: ${formatSupplyQuantity(line.receivedQty)}/${formatSupplyQuantity(line.orderedQty)} ${line.material.unit}`).join("; ")}</td>
                      <td><span className={`production-schedule-status status-${purchaseOrder.status.toLowerCase()}`}>{purchaseOrder.status.replaceAll("_", " ")}</span></td>
                      <td>{purchaseOrder.expectedAt ? formatDate(purchaseOrder.expectedAt.slice(0, 10)) : "—"}</td>
                      <td>
                        {purchaseOrder.status !== "RECEIVED" && purchaseOrder.status !== "CANCELLED" ? (
                          <button className="production-table-action" onClick={() => openReceipt(purchaseOrder)} type="button">
                            {purchaseOrder.status === "OPEN" ? "Receive goods" : "Receive more"}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                    {receivingOrderId === purchaseOrder.id && (
                      <tr>
                        <td colSpan={6}>
                          <form className="production-supply-receipt" onSubmit={(event) => receivePurchaseOrder(event, purchaseOrder)}>
                            <strong>Receive against {purchaseOrder.orderNo}</strong>
                            <div className="production-supply-receipt-lines">
                              {purchaseOrder.lines.map((line) => {
                                const outstanding = Math.max(0, Number(line.orderedQty) - Number(line.receivedQty));
                                return (
                                  <label className="production-order-booking-field" key={line.id}>
                                    {line.material.name} · {formatSupplyQuantity(line.receivedQty)}/{formatSupplyQuantity(line.orderedQty)} {line.material.unit}
                                    <input
                                      max={outstanding}
                                      min="0.001"
                                      onChange={(event) => setReceiptQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                                      placeholder={`Outstanding ${formatSupplyQuantity(String(outstanding))}`}
                                      required={false}
                                      step="0.001"
                                      type="number"
                                      value={receiptQuantities[line.id] ?? ""}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                            <div className="production-order-booking-actions">
                              <button className="production-primary-button" disabled={isSaving} type="submit">{isSaving ? "Receiving…" : "Post goods receipt"}</button>
                              <button className="production-text-action" onClick={() => setReceivingOrderId("")} type="button">Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="production-empty-state"><span className="production-empty-mark" aria-hidden="true"><FiShoppingCart /></span><h3>No purchase orders</h3><p>Create a purchase order to start tracking procurement and goods received.</p></div>}
      </section>
    </>
  );
}

function InventoryBoard({
  workspaces,
  jobs,
  materials,
  stockMovements,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  jobs: ProductionDashboardJob[];
  materials: ProductionDashboardMaterial[];
  stockMovements: ProductionDashboardStockMovement[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const workspaceMaterials = materials.filter((material) => material.workspaceId === workspaceId);
  const activeMaterials = workspaceMaterials.filter((material) => material.active);
  const workspaceJobs = jobs.filter((job) => job.workspaceId === workspaceId);
  const workspaceMovements = stockMovements.filter((movement) => movement.workspaceId === workspaceId);
  const wipMovements = workspaceMovements.filter((movement) => movement.type === "ISSUE" && movement.jobId);
  const [type, setType] = useState<"ISSUE" | "ADJUSTMENT">("ISSUE");
  const [materialId, setMaterialId] = useState("");
  const [jobId, setJobId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const changeWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setMaterialId("");
    setJobId("");
    setQuantity("");
    setStatus("");
  };

  const postMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/inventory/movements`,
        {
          method: "POST",
          body: JSON.stringify({ type, materialId, jobId, quantity, notes }),
        },
      );
      setQuantity("");
      setNotes("");
      setStatus(type === "ISSUE" ? "Material issued to the job." : "Inventory adjustment posted.");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">RAW MATERIAL STOCK</span>
            <h2>Inventory on hand</h2>
          </div>
          {workspaces.length > 1 && (
            <label className="production-workspace-filter">
              <span>Workspace</span>
              <select onChange={(event) => changeWorkspace(event.target.value)} value={workspaceId}>
                {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {workspaceMaterials.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Material</th><th scope="col">Category</th><th scope="col">On hand</th><th scope="col">Reorder point</th><th scope="col">Stock level</th></tr></thead>
              <tbody>
                {workspaceMaterials.map((material) => {
                  const lowStock = material.active &&
                    Number(material.reorderPoint) > 0 &&
                    Number(material.onHand) <= Number(material.reorderPoint);
                  return (
                    <tr key={material.id}>
                      <td><strong>{material.code}</strong><small>{material.name}</small></td>
                      <td>{material.category}</td>
                      <td>{formatSupplyQuantity(material.onHand)} {material.unit}</td>
                      <td>{formatSupplyQuantity(material.reorderPoint)} {material.unit}</td>
                      <td>
                        <span className={`production-schedule-status${lowStock ? " status-on_hold" : material.active ? " status-completed" : ""}`}>
                          {!material.active ? "INACTIVE" : lowStock ? "REORDER" : "IN STOCK"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="production-empty-state"><span className="production-empty-mark" aria-hidden="true"><FiPackage /></span><h3>No materials registered</h3><p>Create materials and purchase orders in Procurement to start tracking stock.</p></div>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">STORE TRANSACTION</span>
            <h2>Issue to job or adjust stock</h2>
          </div>
        </div>
        <form className="production-planning-form" onSubmit={postMovement}>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Movement
              <select
                onChange={(event) => {
                  const movementType = event.currentTarget.value;
                  if (movementType === "ISSUE" || movementType === "ADJUSTMENT") {
                    setType(movementType);
                  }
                }}
                value={type}
              >
                <option value="ISSUE">Issue to job</option>
                <option value="ADJUSTMENT">Stock adjustment</option>
              </select>
            </label>
            <label className="production-order-booking-field">
              Material
              <select onChange={(event) => setMaterialId(event.target.value)} required value={materialId}>
                <option value="">Select a material</option>
                {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.code} — {material.name} ({material.unit})</option>)}
              </select>
            </label>
          </div>
          <div className="production-order-booking-row">
            {type === "ISSUE" && (
              <label className="production-order-booking-field">
                Job sheet
                <select onChange={(event) => setJobId(event.target.value)} required value={jobId}>
                  <option value="">Select a job</option>
                  {workspaceJobs.map((job) => <option key={job.id} value={job.id}>{job.jobNo || "Unnumbered"} — {job.jobName || job.customer || "Untitled job"}</option>)}
                </select>
              </label>
            )}
            <label className="production-order-booking-field">
              {type === "ISSUE" ? `Quantity to issue (${activeMaterials.find((material) => material.id === materialId)?.unit ?? "unit"})` : "Adjustment (+/-)"}
              <input
                min={type === "ISSUE" ? "0.001" : undefined}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder={type === "ADJUSTMENT" ? "e.g. 10 or -2.5" : ""}
                required
                step="0.001"
                type="number"
                value={quantity}
              />
            </label>
          </div>
          <label className="production-order-booking-field">
            {type === "ADJUSTMENT" ? "Reason for adjustment" : "Notes"}
            <input maxLength={500} onChange={(event) => setNotes(event.target.value)} required={type === "ADJUSTMENT"} value={notes} />
          </label>
          {status && <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>{status}</p>}
          <div className="production-order-booking-actions">
            <button className="production-primary-button" disabled={isSaving || !activeMaterials.length || (type === "ISSUE" && !workspaceJobs.length)} type="submit">
              {isSaving ? "Posting…" : type === "ISSUE" ? "Issue material to job" : "Post adjustment"}
            </button>
          </div>
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">WORK IN PROGRESS</span>
            <h2>Materials issued to jobs</h2>
          </div>
          <span className="production-panel-total">{wipMovements.length} issues</span>
        </div>
        {wipMovements.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Job sheet</th><th scope="col">Material</th><th scope="col">Issued</th><th scope="col">Notes</th></tr></thead>
              <tbody>
                {wipMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatScheduleDate(movement.createdAt)}</td>
                    <td><strong>{movement.jobNo || "—"}</strong></td>
                    <td>{movement.material.code} — {movement.material.name}</td>
                    <td>{formatSupplyQuantity(String(Math.abs(Number(movement.quantity))))} {movement.material.unit}</td>
                    <td className="production-schedule-notes">{movement.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="production-chart-empty">Job-linked material issues will appear here as work moves into production.</p>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">STOCK LEDGER</span>
            <h2>Recent material movements</h2>
          </div>
          <span className="production-panel-total">{workspaceMovements.length} movements</span>
        </div>
        {workspaceMovements.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Movement</th><th scope="col">Material</th><th scope="col">Quantity</th><th scope="col">Reference</th><th scope="col">Notes</th></tr></thead>
              <tbody>
                {workspaceMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatScheduleDate(movement.createdAt)}</td>
                    <td>{movement.type}</td>
                    <td>{movement.material.code} — {movement.material.name}</td>
                    <td>{formatSupplyQuantity(movement.quantity)} {movement.material.unit}</td>
                    <td>{movement.reference || movement.jobNo || "—"}</td>
                    <td className="production-schedule-notes">{movement.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="production-chart-empty">Receipts, job issues, and adjustments will appear in the ledger.</p>}
      </section>
    </>
  );
}

function PaperReelBoard({
  workspaces,
  jobs,
  materials,
  suppliers,
  purchaseOrders,
  paperReels,
  reelMovements,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  jobs: ProductionDashboardJob[];
  materials: ProductionDashboardMaterial[];
  suppliers: ProductionDashboardSupplier[];
  purchaseOrders: ProductionDashboardPurchaseOrder[];
  paperReels: ProductionDashboardPaperReel[];
  reelMovements: ProductionDashboardReelMovement[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const [reelDraft, setReelDraft] = useState({
    materialId: "",
    supplierId: "",
    purchaseOrderLineId: "",
    batchNo: "",
    widthMm: "",
    gsm: "",
    weightKg: "",
    storageLocation: "",
    notes: "",
  });
  const [selectedReelId, setSelectedReelId] = useState("");
  const [movementAction, setMovementAction] = useState<
    "ISSUE" | "RETURN" | "REMNANT" | "ADJUSTMENT"
  >("ISSUE");
  const [movementForm, setMovementForm] = useState({
    quantityKg: "",
    jobId: "",
    widthMm: "",
    storageLocation: "",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const workspaceMaterials = materials.filter(
    (material) => material.workspaceId === workspaceId,
  );
  const paperMaterials = workspaceMaterials.filter(
    (material) =>
      material.active &&
      material.category === "PAPER" &&
      material.unit === "kg",
  );
  const paperMaterialsWithoutKgUnit = workspaceMaterials.filter(
    (material) =>
      material.active &&
      material.category === "PAPER" &&
      material.unit !== "kg",
  );
  const workspaceSuppliers = suppliers.filter(
    (supplier) => supplier.workspaceId === workspaceId && supplier.active,
  );
  const workspaceJobs = jobs.filter((job) => job.workspaceId === workspaceId);
  const workspaceReels = paperReels.filter(
    (reel) => reel.workspaceId === workspaceId,
  );
  const workspaceMovements = reelMovements.filter(
    (movement) => movement.workspaceId === workspaceId,
  );
  const selectedReel = workspaceReels.find((reel) => reel.id === selectedReelId);
  const paperMaterialIds = new Set(paperMaterials.map((material) => material.id));
  const receivedPaperOrderLines = purchaseOrders
    .filter((order) =>
      order.workspaceId === workspaceId &&
      order.status !== "CANCELLED",
    )
    .flatMap((order) => order.lines
      .filter((line) =>
        paperMaterialIds.has(line.material.id) &&
        Number(line.receivedQty) > 0,
      )
      .map((line) => ({ ...line, orderNo: order.orderNo, supplier: order.supplier })));
  const trackedWeightByMaterial = workspaceReels.reduce((totals, reel) => {
    totals.set(
      reel.materialId,
      (totals.get(reel.materialId) ?? 0) + Number(reel.availableWeightKg),
    );
    return totals;
  }, new Map<string, number>());
  const selectedMaterial = workspaceMaterials.find(
    (material) => material.id === reelDraft.materialId,
  );
  const unregisteredWeight = selectedMaterial
    ? Math.max(0, Number(selectedMaterial.onHand) - (trackedWeightByMaterial.get(selectedMaterial.id) ?? 0))
    : 0;
  const selectedPurchaseLine = receivedPaperOrderLines.find(
    (line) => line.id === reelDraft.purchaseOrderLineId,
  );
  const registeredOrderLineWeight = selectedPurchaseLine
    ? workspaceReels
      .filter((reel) =>
        reel.purchaseOrderLineId === selectedPurchaseLine.id &&
        !reel.parentReelId,
      )
      .reduce((total, reel) => total + Number(reel.receivedWeightKg), 0)
    : 0;
  const unregisteredOrderLineWeight = selectedPurchaseLine
    ? Math.max(0, Number(selectedPurchaseLine.receivedQty) - registeredOrderLineWeight)
    : Number.POSITIVE_INFINITY;
  const registrationLimit = Math.min(unregisteredWeight, unregisteredOrderLineWeight);

  const changeWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setReelDraft({
      materialId: "",
      supplierId: "",
      purchaseOrderLineId: "",
      batchNo: "",
      widthMm: "",
      gsm: "",
      weightKg: "",
      storageLocation: "",
      notes: "",
    });
    setSelectedReelId("");
    setStatus("");
    setHasError(false);
  };

  const registerReel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/reels`,
        {
          method: "POST",
          body: JSON.stringify({ ...reelDraft, parentReelId: "" }),
        },
      );
      const reel = isRecord(result.reel) ? result.reel : null;
      setStatus(
        typeof reel?.reelNo === "string"
          ? `Reel ${reel.reelNo} registered with its batch and barcode.`
          : "Paper reel registered.",
      );
      setReelDraft((current) => ({
        ...current,
        purchaseOrderLineId: "",
        weightKg: "",
        notes: "",
      }));
      onSaved();
    } catch (error) {
      setStatus(`Could not register reel: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const postReelMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReel) return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/reels/${encodeURIComponent(selectedReel.id)}/movements`,
        { method: "POST", body: JSON.stringify({ action: movementAction, ...movementForm }) },
      );
      if (movementAction === "REMNANT" && isRecord(result.child) && typeof result.child.reelNo === "string") {
        notifyToast(`Remnant ${result.child.reelNo} created and linked to ${selectedReel.reelNo}.`);
      } else {
        setStatus(
          movementAction === "ISSUE"
            ? `${movementForm.quantityKg} kg issued from ${selectedReel.reelNo} to the job.`
            : movementAction === "RETURN"
              ? `Paper returned to ${selectedReel.reelNo}.`
              : "Reel stock adjustment posted.",
        );
      }
      setSelectedReelId("");
      setMovementForm({
        quantityKg: "",
        jobId: "",
        widthMm: "",
        storageLocation: "",
        notes: "",
      });
      onSaved();
    } catch (error) {
      setStatus(`Could not post reel movement: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const openMovement = (
    reel: ProductionDashboardPaperReel,
    action: "ISSUE" | "RETURN" | "REMNANT" | "ADJUSTMENT",
  ) => {
    setSelectedReelId(reel.id);
    setMovementAction(action);
    setMovementForm({
      quantityKg: "",
      jobId: "",
      widthMm: action === "REMNANT" ? reel.widthMm : "",
      storageLocation: reel.storageLocation,
      notes: "",
    });
    setStatus("");
    setHasError(false);
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PAPER INVENTORY</span>
            <h2>Paper reel register</h2>
          </div>
          {workspaces.length > 1 && (
            <label className="production-workspace-filter">
              <span>Workspace</span>
              <select onChange={(event) => changeWorkspace(event.target.value)} value={workspaceId}>
                {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="production-reel-explainer">
          Register reels against received paper stock. Registration does not add stock a second time; issues and returns update both the reel and material ledgers.
        </p>
        {paperMaterialsWithoutKgUnit.length > 0 && (
          <p className="production-reel-stock-note" role="note">
            Reel tracking is limited to paper materials stocked in kilograms. {paperMaterialsWithoutKgUnit.length} paper material(s) with other units are excluded until their stock is safely reconciled in kg.
          </p>
        )}
        <form className="production-reel-form" onSubmit={registerReel}>
          <div className="production-reel-form-grid">
            <label className="production-order-booking-field">
              <span>Paper grade</span>
              <select
                onChange={(event) => setReelDraft((current) => ({
                  ...current,
                  materialId: event.target.value,
                  purchaseOrderLineId: "",
                  supplierId: "",
                }))}
                required
                value={reelDraft.materialId}
              >
                <option value="">Select paper material</option>
                {paperMaterials.map((material) => (
                  <option key={material.id} value={material.id}>{material.code} · {material.name}</option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              <span>Received purchase-order line (optional)</span>
              <select
                onChange={(event) => {
                  const line = receivedPaperOrderLines.find((candidate) => candidate.id === event.target.value);
                  setReelDraft((current) => ({
                    ...current,
                    purchaseOrderLineId: event.target.value,
                    materialId: line?.material.id ?? current.materialId,
                    supplierId: line?.supplier.id ?? current.supplierId,
                  }));
                }}
                value={reelDraft.purchaseOrderLineId}
              >
                <option value="">Register against unassigned stock</option>
                {receivedPaperOrderLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.orderNo} · {line.material.code} · {formatSupplyQuantity(line.receivedQty)} {line.material.unit} received
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              <span>Supplier</span>
              <select
                onChange={(event) => setReelDraft((current) => ({ ...current, supplierId: event.target.value }))}
                value={reelDraft.supplierId}
              >
                <option value="">No supplier recorded</option>
                {workspaceSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              <span>Supplier batch / paper lot</span>
              <input
                maxLength={80}
                onChange={(event) => setReelDraft((current) => ({ ...current, batchNo: event.target.value }))}
                required
                value={reelDraft.batchNo}
              />
            </label>
            <label className="production-order-booking-field">
              <span>Reel width (mm)</span>
              <input
                max="3000"
                min="1"
                onChange={(event) => setReelDraft((current) => ({ ...current, widthMm: event.target.value }))}
                required
                step="0.01"
                type="number"
                value={reelDraft.widthMm}
              />
            </label>
            <label className="production-order-booking-field">
              <span>GSM</span>
              <input
                max="5000"
                min="1"
                onChange={(event) => setReelDraft((current) => ({ ...current, gsm: event.target.value }))}
                required
                step="0.001"
                type="number"
                value={reelDraft.gsm}
              />
            </label>
            <label className="production-order-booking-field">
              <span>Reel weight (kg)</span>
              <input
                max={Number.isFinite(registrationLimit) ? registrationLimit : 1000000}
                min="0.001"
                onChange={(event) => setReelDraft((current) => ({ ...current, weightKg: event.target.value }))}
                required
                step="0.001"
                type="number"
                value={reelDraft.weightKg}
              />
            </label>
            <label className="production-order-booking-field">
              <span>Storage bay / location</span>
              <input
                maxLength={120}
                onChange={(event) => setReelDraft((current) => ({ ...current, storageLocation: event.target.value }))}
                value={reelDraft.storageLocation}
              />
            </label>
          </div>
          {selectedMaterial && (
            <p className="production-reel-stock-note">
              {formatSupplyQuantity(String(unregisteredWeight))} {selectedMaterial.unit} available to register against {selectedMaterial.name}.
              {selectedPurchaseLine && ` This PO line has ${formatSupplyQuantity(String(unregisteredOrderLineWeight))} ${selectedMaterial.unit} not yet assigned to reels.`}
            </p>
          )}
          <label className="production-order-booking-field">
            <span>Receipt notes</span>
            <textarea
              maxLength={500}
              onChange={(event) => setReelDraft((current) => ({ ...current, notes: event.target.value }))}
              value={reelDraft.notes}
            />
          </label>
          <div className="production-supply-form-actions">
            <span>A unique reel number and machine-readable barcode are generated automatically.</span>
            <button
              className="production-primary-button"
              disabled={isSaving || !paperMaterials.length}
              type="submit"
            >
              {isSaving ? "Registering…" : "Register paper reel"}
            </button>
          </div>
        </form>
        {status && <p className="production-quote-message" role={hasError ? "alert" : "status"}>{status}</p>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">REEL AND BATCH TRACEABILITY</span>
            <h2>Available paper reels</h2>
          </div>
          <span className="production-panel-total">
            {workspaceReels.filter((reel) => Number(reel.availableWeightKg) > 0).length} active · {formatSupplyQuantity(String(workspaceReels.reduce((total, reel) => total + Number(reel.availableWeightKg), 0)))} kg
          </span>
        </div>
        {workspaceReels.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table production-reel-table">
              <thead>
                <tr>
                  <th>Reel / barcode</th>
                  <th>Paper grade / batch</th>
                  <th>Width / GSM</th>
                  <th className="production-number-cell">Available / received</th>
                  <th>Supplier / PO</th>
                  <th>Parent / location</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {workspaceReels.map((reel) => (
                  <tr key={reel.id}>
                    <td>
                      <strong>{reel.reelNo}</strong>
                      <small className="production-reel-barcode">{reel.barcode}</small>
                    </td>
                    <td>
                      {reel.material.code} · {reel.material.name}
                      <small>{reel.batchNo || "No batch recorded"}</small>
                    </td>
                    <td>{formatSupplyQuantity(reel.widthMm)} mm · {formatSupplyQuantity(reel.gsm)} GSM</td>
                    <td className="production-number-cell">
                      {formatSupplyQuantity(reel.availableWeightKg)} / {formatSupplyQuantity(reel.receivedWeightKg)} kg
                    </td>
                    <td>{reel.supplier?.name || "—"}<small>{reel.purchaseOrderNo || "No PO reference"}</small></td>
                    <td>{reel.parentReel?.reelNo || "—"}<small>{reel.storageLocation || "No location"}</small></td>
                    <td>
                      <span className={`production-schedule-status${reel.status === "AVAILABLE" ? " status-completed" : ""}`}>
                        {reel.status}
                      </span>
                    </td>
                    <td>
                      {reel.status !== "QUARANTINED" && Number(reel.availableWeightKg) > 0 ? (
                        <div className="production-reel-row-actions">
                          <button className="production-table-action" onClick={() => openMovement(reel, "ISSUE")} type="button">Issue</button>
                          <button className="production-table-action" onClick={() => openMovement(reel, "REMNANT")} type="button">Split remnant</button>
                          <button className="production-table-action" onClick={() => openMovement(reel, "ADJUSTMENT")} type="button">Adjust</button>
                          <button className="production-table-action" onClick={() => openMovement(reel, "RETURN")} type="button">Return from job</button>
                        </div>
                      ) : reel.status !== "QUARANTINED" ? (
                        <button className="production-table-action" onClick={() => openMovement(reel, "RETURN")} type="button">Return from job</button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiLayers /></span>
            <h3>No paper reels registered</h3>
            <p>Receive paper through Procurement, then register its reel, grade, width, GSM, batch, supplier, and location.</p>
          </div>
        )}
        {selectedReel && (
          <form className="production-reel-movement-form" onSubmit={postReelMovement}>
            <div className="production-quote-form-heading">
              <div>
                <h3>
                  {movementAction === "ISSUE" ? "Issue reel to job"
                    : movementAction === "RETURN" ? "Return paper from job"
                      : movementAction === "REMNANT" ? "Split a remnant"
                        : "Adjust reel weight"}
                </h3>
                <p>{selectedReel.reelNo} · {selectedReel.material.name} · {formatSupplyQuantity(selectedReel.availableWeightKg)} kg available</p>
              </div>
              <button className="production-table-action" onClick={() => setSelectedReelId("")} type="button">Cancel</button>
            </div>
            <div className="production-reel-movement-grid">
              {movementAction !== "ADJUSTMENT" && (
                <label className="production-order-booking-field">
                  <span>{movementAction === "REMNANT" ? "Remnant weight (kg)" : `${movementAction === "ISSUE" ? "Issue" : "Return"} weight (kg)`}</span>
                  <input
                    max={movementAction === "RETURN"
                      ? Number(selectedReel.receivedWeightKg) - Number(selectedReel.availableWeightKg)
                      : Number(selectedReel.availableWeightKg)}
                    min="0.001"
                    onChange={(event) => setMovementForm((current) => ({ ...current, quantityKg: event.target.value }))}
                    required
                    step="0.001"
                    type="number"
                    value={movementForm.quantityKg}
                  />
                </label>
              )}
              {movementAction === "ADJUSTMENT" && (
                <label className="production-order-booking-field">
                  <span>Weight adjustment (+/- kg)</span>
                  <input
                    onChange={(event) => setMovementForm((current) => ({ ...current, quantityKg: event.target.value }))}
                    required
                    step="0.001"
                    type="number"
                    value={movementForm.quantityKg}
                  />
                </label>
              )}
              {(movementAction === "ISSUE" || movementAction === "RETURN") && (
                <label className="production-order-booking-field">
                  <span>Job sheet</span>
                  <select
                    onChange={(event) => setMovementForm((current) => ({ ...current, jobId: event.target.value }))}
                    required
                    value={movementForm.jobId}
                  >
                    <option value="">Select a job</option>
                    {workspaceJobs.map((job) => (
                      <option key={job.id} value={job.id}>{job.jobNo || "Unnumbered"} · {job.jobName || job.customer}</option>
                    ))}
                  </select>
                </label>
              )}
              {movementAction === "REMNANT" && (
                <label className="production-order-booking-field">
                  <span>Remnant width (mm)</span>
                  <input
                    max={Number(selectedReel.widthMm)}
                    min="1"
                    onChange={(event) => setMovementForm((current) => ({ ...current, widthMm: event.target.value }))}
                    required
                    step="0.01"
                    type="number"
                    value={movementForm.widthMm}
                  />
                </label>
              )}
              {movementAction === "REMNANT" && (
                <label className="production-order-booking-field">
                  <span>Remnant storage location</span>
                  <input
                    maxLength={120}
                    onChange={(event) => setMovementForm((current) => ({ ...current, storageLocation: event.target.value }))}
                    value={movementForm.storageLocation}
                  />
                </label>
              )}
            </div>
            <label className="production-order-booking-field">
              <span>{movementAction === "ADJUSTMENT" ? "Reason (required)" : "Movement notes"}</span>
              <textarea
                maxLength={500}
                onChange={(event) => setMovementForm((current) => ({ ...current, notes: event.target.value }))}
                required={movementAction === "ADJUSTMENT"}
                value={movementForm.notes}
              />
            </label>
            <div className="production-supply-form-actions">
              <span>Reel actions are recorded in the batch ledger; job issues and returns also update paper stock.</span>
              <button className="production-primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Posting…" : movementAction === "ISSUE" ? "Issue paper"
                  : movementAction === "RETURN" ? "Return paper"
                    : movementAction === "REMNANT" ? "Create remnant reel"
                      : "Post adjustment"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">REEL MOVEMENT HISTORY</span>
            <h2>Paper-to-job traceability</h2>
          </div>
          <span className="production-panel-total">Latest {Math.min(workspaceMovements.length, 100)} movements</span>
        </div>
        {workspaceMovements.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead>
                <tr><th>Date</th><th>Reel</th><th>Movement</th><th>Related reel / job</th><th>Weight delta</th><th>Operator / notes</th></tr>
              </thead>
              <tbody>
                {workspaceMovements.slice(0, 100).map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatScheduleDate(movement.createdAt)}</td>
                    <td><strong>{movement.reelNo}</strong></td>
                    <td>{movement.type.replaceAll("_", " ")}</td>
                    <td>{movement.relatedReelNo || movement.jobNo || "—"}<small>{movement.jobName}</small></td>
                    <td>{Number(movement.deltaKg) > 0 ? "+" : ""}{formatSupplyQuantity(movement.deltaKg)} kg</td>
                    <td>{movement.createdByName}<small>{movement.notes || "—"}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="production-chart-empty">Reel registration, job issues, returns, and remnant splits will appear in the traceability ledger.</p>
        )}
      </section>
    </>
  );
}

function JobFlagControl({
  job,
  canFlag,
  canResolve,
  onChanged,
}: {
  job: ProductionDashboardJob;
  canFlag: boolean;
  canResolve: boolean;
  onChanged?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isEditing && !dialog.open) {
      dialog.showModal();
      reasonInputRef.current?.focus();
    } else if (!isEditing && dialog.open) {
      dialog.close();
    }
  }, [isEditing]);

  const openFlagDialog = () => {
    setReason("");
    setStatus("");
    setHasError(false);
    setIsEditing(true);
  };

  const closeFlagDialog = () => {
    setIsEditing(false);
    setStatus("");
    setHasError(false);
  };

  const submitFlag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(`/api/production/jobs/${encodeURIComponent(job.id)}/flag`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setReason("");
      setIsEditing(false);
      notifyToast("Job flagged.");
      onChanged?.();
    } catch (error) {
      console.error("Could not flag the production job:", error);
      setStatus(`Could not flag job: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const resolveFlag = async () => {
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(`/api/production/jobs/${encodeURIComponent(job.id)}/flag`, {
        method: "PATCH",
      });
      notifyToast("Job flag cleared.");
      onChanged?.();
    } catch (error) {
      console.error("Could not clear the production job flag:", error);
      setStatus(`Could not clear flag: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="production-job-flag">
      {job.flag ? (
        <>
          <strong className="production-job-flag-status">
            <FiFlag aria-hidden="true" focusable="false" />
            Flagged
          </strong>
          <small>{job.flag.reason}</small>
          {canResolve && (
            <button
              className="production-table-action"
              disabled={isSaving}
              onClick={resolveFlag}
              type="button"
            >
              {isSaving ? "Clearing…" : "Clear flag"}
            </button>
          )}
        </>
      ) : canFlag ? (
        <button
          aria-controls={`flag-dialog-${job.id}`}
          aria-haspopup="dialog"
          aria-label={`Flag job ${job.jobNo || ""}`.trim()}
          className="production-job-flag-trigger"
          onClick={openFlagDialog}
          title="Flag job"
          type="button"
        >
          <FiFlag aria-hidden="true" focusable="false" />
        </button>
      ) : (
        <span
          aria-label="Not flagged"
          className="production-job-flag-clear-icon"
          title="Not flagged"
        >
          <FiFlag aria-hidden="true" focusable="false" />
        </span>
      )}
      {canFlag && (
        <dialog
          aria-labelledby={`flag-dialog-title-${job.id}`}
          className="production-flag-dialog"
          id={`flag-dialog-${job.id}`}
          onCancel={(event) => {
            event.preventDefault();
            closeFlagDialog();
          }}
          onClose={() => {
            if (isEditing) closeFlagDialog();
          }}
          ref={dialogRef}
        >
          <form onSubmit={submitFlag}>
            <div className="production-flag-dialog-heading">
              <span className="production-panel-kicker">JOB FLAG</span>
              <h2 id={`flag-dialog-title-${job.id}`}>Flag job</h2>
              <p>{[job.jobNo, job.jobName].filter(Boolean).join(" · ")}</p>
            </div>
            <label htmlFor={`flag-reason-${job.id}`}>Reason</label>
            <textarea
              ref={reasonInputRef}
              id={`flag-reason-${job.id}`}
              maxLength={MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH}
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Describe the issue with this job"
              required
              value={reason}
            />
            {status && (
              <small aria-live="polite" role={hasError ? "alert" : "status"}>
                {status}
              </small>
            )}
            <div className="production-flag-dialog-actions">
              <button className="production-primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Submitting…" : "Submit flag"}
              </button>
              <button
                className="production-text-action"
                disabled={isSaving}
                onClick={closeFlagDialog}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </dialog>
      )}
      {!isEditing && status && (
        <small aria-live="polite" role={hasError ? "alert" : "status"}>{status}</small>
      )}
    </div>
  );
}

function ProductArtworkHistory({
  workspaceId,
  itemId,
}: {
  workspaceId: string;
  itemId: string;
}) {
  const [versions, setVersions] = useState<ProductionDashboardAttachment[] | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleVersions = async () => {
    if (versions) {
      setShowVersions((current) => !current);
      return;
    }

    setShowVersions(true);
    setIsLoading(true);
    setError("");
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}/artwork`,
        { method: "GET" },
      );
      if (
        !Array.isArray(result.attachments) ||
        !result.attachments.every(isProductionDashboardAttachment)
      ) {
        throw new Error("The server returned an invalid artwork history.");
      }
      setVersions(result.attachments);
    } catch (loadError) {
      console.error("Could not load product artwork history:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Could not load artwork history.");
      setShowVersions(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="production-artwork-product-history">
      <button
        aria-expanded={showVersions}
        className="production-text-action"
        disabled={isLoading}
        onClick={() => void toggleVersions()}
        type="button"
      >
        {isLoading ? "Loading…" : showVersions ? "Hide versions" : "View versions"}
      </button>
      {error && <small aria-live="polite" role="alert">{error}</small>}
      {showVersions && versions && (
        versions.length ? (
          <ol className="production-artwork-version-list">
            {versions.map((attachment) => {
              const fileUrl = `/api/production/artwork/${encodeURIComponent(attachment.id)}`;
              const canPreview = ["application/pdf", "image/jpeg", "image/png", "image/svg+xml"]
                .includes(attachment.contentType);
              return (
                <li key={attachment.id}>
                  <span>
                    <strong>Artwork name: {attachment.originalName}</strong>
                    <small>Version: {attachment.version}</small>
                    <small>Date: {new Date(attachment.createdAt).toLocaleString()}</small>
                    <small className="production-artwork-revision-comment">
                      Revision comments: {attachment.revisionComment || "—"}
                    </small>
                  </span>
                  <a
                    href={canPreview ? `${fileUrl}?preview=1` : fileUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {canPreview ? "View" : "Download"}
                  </a>
                </li>
              );
            })}
          </ol>
        ) : (
          <small>No artwork versions saved.</small>
        )
      )}
    </div>
  );
}

function ArtworkHistoryDialog({
  job,
  onClose,
  onUploadRevision,
}: {
  job: ProductionDashboardJob | null;
  onClose: () => void;
  onUploadRevision: (job: ProductionDashboardJob) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<{
    jobId: string;
    attachments: ProductionDashboardAttachment[];
    error: string;
  } | null>(null);
  const currentHistory = job && history?.jobId === job.id ? history : null;
  const isLoading = Boolean(job && !currentHistory);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (job && !dialog.open) dialog.showModal();
    if (!job && dialog.open) dialog.close();
  }, [job]);

  useEffect(() => {
    if (!job) return;
    let active = true;
    requestProductionJson(
      `/api/production/jobs/${encodeURIComponent(job.id)}/artwork`,
      { method: "GET" },
    )
      .then((result) => {
        if (
          !Array.isArray(result.attachments) ||
          !result.attachments.every(isProductionDashboardAttachment)
        ) {
          throw new Error("The server returned an invalid artwork history.");
        }
        if (active) {
          setHistory({
            jobId: job.id,
            attachments: result.attachments,
            error: "",
          });
        }
      })
      .catch((loadError) => {
        if (!active) return;
        console.error("Could not load artwork history for the selected job:", loadError);
        setHistory({
          jobId: job.id,
          attachments: [],
          error: loadError instanceof Error ? loadError.message : "Could not load artwork history.",
        });
      });

    return () => {
      active = false;
    };
  }, [job]);

  const attachments = currentHistory?.attachments ?? [];
  const currentArtwork = attachments[0] ?? null;
  const previousVersions = attachments.slice(1);

  return (
    <dialog
      aria-labelledby="production-artwork-history-title"
      className="production-artwork-history-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div>
        <header className="production-artwork-history-heading">
          <div>
            <span className="production-panel-kicker">ARTWORK HISTORY</span>
            <h2 id="production-artwork-history-title">
              {job?.jobName || job?.jobNo || "Artwork"}
            </h2>
            {job?.jobNo && job.jobName && <p>{job.jobNo}</p>}
          </div>
          <div className="production-artwork-history-actions">
            <button
              className="production-primary-button"
              disabled={!job}
              onClick={() => {
                if (job) onUploadRevision(job);
              }}
              type="button"
            >
              <FiPlus aria-hidden="true" />
              Upload revision
            </button>
            <button
              aria-label="Close artwork history"
              className="production-table-action"
              onClick={onClose}
              type="button"
            >
              <FiX aria-hidden="true" />
            </button>
          </div>
        </header>
        {isLoading ? (
          <p className="production-quote-message" role="status">Loading artwork history…</p>
        ) : currentHistory?.error ? (
          <p className="production-order-booking-error" role="alert">{currentHistory.error}</p>
        ) : currentArtwork ? (
          <>
            <article className="production-artwork-current-version">
              <h3>Latest artwork version</h3>
              <dl className="production-artwork-version-details">
                <div>
                  <dt>Artwork name</dt>
                  <dd>{currentArtwork.originalName}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{currentArtwork.version}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{new Date(currentArtwork.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Revision comments</dt>
                  <dd>{currentArtwork.revisionComment || "—"}</dd>
                </div>
              </dl>
              {(() => {
                const fileUrl = `/api/production/artwork/${encodeURIComponent(currentArtwork.id)}`;
                const canPreview = ["application/pdf", "image/jpeg", "image/png", "image/svg+xml"]
                  .includes(currentArtwork.contentType);
                return (
                  <a
                    className="production-artwork-current-version-link"
                    href={canPreview ? `${fileUrl}?preview=1` : fileUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {canPreview ? "View latest artwork" : "Download latest artwork"}
                  </a>
                );
              })()}
            </article>
            {previousVersions.length > 0 && (
              <section className="production-artwork-previous-versions">
                <h3>Previous versions</h3>
                <ol className="production-artwork-version-list">
                  {previousVersions.map((attachment) => {
                    const fileUrl = `/api/production/artwork/${encodeURIComponent(attachment.id)}`;
                    const canPreview = ["application/pdf", "image/jpeg", "image/png", "image/svg+xml"]
                      .includes(attachment.contentType);
                    return (
                      <li key={attachment.id}>
                        <span>
                          <strong>Artwork name: {attachment.originalName}</strong>
                          <small>Version: {attachment.version}</small>
                          <small>Date: {new Date(attachment.createdAt).toLocaleString()}</small>
                          <small className="production-artwork-revision-comment">
                            Revision comments: {attachment.revisionComment || "—"}
                          </small>
                        </span>
                        <a
                          href={canPreview ? `${fileUrl}?preview=1` : fileUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {canPreview ? "View" : "Download"}
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </>
        ) : currentHistory ? (
          <p className="production-chart-empty">No artwork versions have been uploaded for this job.</p>
        ) : (
          <p className="production-chart-empty">Loading artwork history…</p>
        )}
      </div>
    </dialog>
  );
}

function CreateProductionItemForm({
  workspaceId,
  cartonTypes,
  item,
  title = "Create an item",
  onCreated,
  onCustomerCreated,
  onCancel,
}: {
  workspaceId: string;
  cartonTypes: string[];
  item?: ProductionDashboardItem;
  title?: string;
  onCreated: (item: ProductionDashboardItem) => void;
  onCustomerCreated?: (customer: ProductionDashboardCustomer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [boxType, setBoxType] = useState(item?.boxType ?? "");
  const [customers, setCustomers] = useState<ProductionDashboardCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(item?.customerId ?? "");
  const [topLiner, setTopLiner] = useState(item?.topLiner ?? "");
  const [medium, setMedium] = useState(item?.medium ?? "");
  const [bottomLiner, setBottomLiner] = useState(item?.bottomLiner ?? "");
  const [length, setLength] = useState(item?.length ?? "");
  const [width, setWidth] = useState(item?.width ?? "");
  const [height, setHeight] = useState(item?.height ?? "");
  const [unit, setUnit] = useState<"mm" | "in">(item?.unit ?? "mm");
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    requestProductionJson(
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/customers`,
      { method: "GET" },
    )
      .then((result) => {
        if (!Array.isArray(result.customers) || !result.customers.every(isProductionDashboardCustomer)) {
          throw new Error("The server returned invalid customer details.");
        }
        if (active) setCustomers(result.customers);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load customers for the product:", error);
        setStatus(`Could not load customers: ${error instanceof Error ? error.message : String(error)}`);
        setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoadingCustomers(false);
      });

    return () => {
      active = false;
    };
  }, [workspaceId]);

  const submitItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        item
          ? `/api/production/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(item.id)}`
          : `/api/production/workspaces/${encodeURIComponent(workspaceId)}/items`,
        {
          method: item ? "PATCH" : "POST",
          body: JSON.stringify({
            customerId: selectedCustomerId,
            name,
            boxType,
            topLiner,
            medium,
            bottomLiner,
            length,
            width,
            height,
            unit,
          }),
        },
      );
      if (!isProductionDashboardItem(result.item)) {
        throw new Error("The server returned invalid item details.");
      }
      onCreated(result.item);
    } catch (error) {
      console.error("Could not create the production item:", error);
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (isCreatingCustomer) {
    return (
      <CreateProductionCustomerForm
        onCancel={() => setIsCreatingCustomer(false)}
        onCreated={(customer) => {
          setCustomers((current) =>
            [...current, customer].sort((left, right) => left.name.localeCompare(right.name)),
          );
          setSelectedCustomerId(customer.id);
          onCustomerCreated?.(customer);
          setIsCreatingCustomer(false);
          notifyToast(`Customer ${customer.name} added and selected.`);
          setHasError(false);
        }}
        workspaceId={workspaceId}
      />
    );
  }

  return (
    <form className="production-item-create-form" onSubmit={submitItem}>
      <h3>{title}</h3>
      <div className="production-order-item-picker">
        <label className="production-order-booking-field" htmlFor="production-item-customer">
          Customer
          <select
            disabled={isLoadingCustomers}
            id="production-item-customer"
            onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}
            required
            value={selectedCustomerId}
          >
            <option value="">
              {isLoadingCustomers
                ? "Loading customers…"
                : customers.length
                  ? "Select a customer"
                  : "No customers yet"}
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}{customer.contactPerson ? ` — ${customer.contactPerson}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="production-text-action"
          disabled={isLoadingCustomers || isSaving}
          onClick={() => {
            setStatus("");
            setIsCreatingCustomer(true);
          }}
          type="button"
        >
          <FiPlus aria-hidden="true" /> Add customer
        </button>
      </div>
      <label className="production-order-booking-field">
        Item name
        <input
          maxLength={100}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          value={name}
        />
      </label>
      <label className="production-order-booking-field">
        Carton type
        <select
          onChange={(event) => setBoxType(event.currentTarget.value)}
          required
          value={boxType}
        >
          <option value="">Select a carton type</option>
          {cartonTypes.map((cartonType) => (
            <option key={cartonType} value={cartonType}>{cartonType}</option>
          ))}
        </select>
      </label>
      <div className="production-item-paper-row">
        <label className="production-order-booking-field">
          Top liner
          <input
            maxLength={60}
            onChange={(event) => setTopLiner(event.currentTarget.value)}
            placeholder="150k"
            required
            value={topLiner}
          />
        </label>
        <label className="production-order-booking-field">
          Medium
          <input
            maxLength={60}
            onChange={(event) => setMedium(event.currentTarget.value)}
            placeholder="150b"
            required
            value={medium}
          />
        </label>
        <label className="production-order-booking-field">
          Bottom liner
          <input
            maxLength={60}
            onChange={(event) => setBottomLiner(event.currentTarget.value)}
            placeholder="150c"
            required
            value={bottomLiner}
          />
        </label>
      </div>
      <div className="production-item-size-row">
        <label className="production-order-booking-field">
          Length
          <input
            min="0.001"
            onChange={(event) => setLength(event.currentTarget.value)}
            required
            step="any"
            type="number"
            value={length}
          />
        </label>
        <label className="production-order-booking-field">
          Width
          <input
            min="0.001"
            onChange={(event) => setWidth(event.currentTarget.value)}
            required
            step="any"
            type="number"
            value={width}
          />
        </label>
        <label className="production-order-booking-field">
          Height
          <input
            min="0.001"
            onChange={(event) => setHeight(event.currentTarget.value)}
            required
            step="any"
            type="number"
            value={height}
          />
        </label>
        <label className="production-order-booking-field">
          Unit
          <select
            onChange={(event) => {
              const nextUnit = event.currentTarget.value;
              if (nextUnit === "mm" || nextUnit === "in") setUnit(nextUnit);
            }}
            value={unit}
          >
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
        </label>
      </div>
      {status && (
        <p
          className={hasError ? "production-order-booking-error" : "production-order-booking-status"}
          role={hasError ? "alert" : "status"}
        >
          {status}
        </p>
      )}
      <div className="production-order-booking-actions">
        <button
          className="production-primary-button"
          disabled={isSaving || isLoadingCustomers}
          type="submit"
        >
          {isSaving ? "Saving…" : item ? "Save changes" : "Save item"}
        </button>
        <button className="production-text-action" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CreateProductionItemDialog({
  open,
  workspaces,
  cartonTypes,
  defaultWorkspaceId,
  onClose,
  onCreated,
}: {
  open: boolean;
  workspaces: ProductionDashboardWorkspace[];
  cartonTypes: string[];
  defaultWorkspaceId: string;
  onClose: () => void;
  onCreated: (item: ProductionDashboardItem) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setWorkspaceId(defaultWorkspaceId);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [defaultWorkspaceId, open]);

  return (
    <dialog
      aria-labelledby="production-create-product-title"
      className="production-order-booking-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      ref={dialogRef}
    >
      <div className="production-order-booking-content">
        <div className="production-order-booking-heading">
          <span className="production-panel-kicker">PRODUCT CATALOG</span>
          <h2 id="production-create-product-title">Create a product</h2>
          <p>Add a product to the selected workspace catalog.</p>
        </div>
        {workspaces.length > 1 && (
          <label className="production-order-booking-field">
            Workspace
            <select
              onChange={(event) => setWorkspaceId(event.currentTarget.value)}
              required
              value={workspaceId}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <CreateProductionItemForm
          cartonTypes={cartonTypes}
          key={workspaceId}
          onCancel={onClose}
          onCreated={onCreated}
          workspaceId={workspaceId}
          title="Product details"
        />
      </div>
    </dialog>
  );
}

function CreateProductionCustomerForm({
  workspaceId,
  customer,
  onCreated,
  onCancel,
}: {
  workspaceId: string;
  customer?: ProductionDashboardCustomer;
  onCreated: (customer: ProductionDashboardCustomer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [kraPin, setKraPin] = useState(customer?.kraPin ?? "");
  const [contactPerson, setContactPerson] = useState(customer?.contactPerson ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");

  const submitCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    try {
      const result = await requestProductionJson(
        customer
          ? `/api/production/workspaces/${encodeURIComponent(workspaceId)}/customers/${encodeURIComponent(customer.id)}`
          : `/api/production/workspaces/${encodeURIComponent(workspaceId)}/customers`,
        {
          method: customer ? "PATCH" : "POST",
          body: JSON.stringify({ name, kraPin, contactPerson, phone, email, address }),
        },
      );
      if (!isProductionDashboardCustomer(result.customer)) {
        throw new Error("The server returned invalid customer details.");
      }
      onCreated(result.customer);
    } catch (error) {
      console.error(
        customer ? "Could not update the production customer:" : "Could not create the production customer:",
        error,
      );
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="production-item-create-form" onSubmit={submitCustomer}>
      <h3>{customer ? "Update customer" : "Add a customer"}</h3>
      <label className="production-order-booking-field">
        Customer name
        <input
          disabled={Boolean(customer)}
          maxLength={120}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          value={name}
        />
      </label>
      <label className="production-order-booking-field">
        KRA PIN{customer ? " (optional)" : ""}
        <input
          autoCapitalize="characters"
          disabled={Boolean(customer)}
          maxLength={20}
          onChange={(event) => setKraPin(event.currentTarget.value)}
          required={!customer}
          value={kraPin}
        />
      </label>
      <label className="production-order-booking-field">
        Contact person{customer ? " (optional)" : ""}
        <input
          maxLength={120}
          onChange={(event) => setContactPerson(event.currentTarget.value)}
          required={!customer}
          value={contactPerson}
        />
      </label>
      <div className="production-customer-details-row">
        <label className="production-order-booking-field">
          Phone{customer ? " (optional)" : ""}
          <input
            maxLength={40}
            onChange={(event) => setPhone(event.currentTarget.value)}
            required={!customer}
            type="tel"
            value={phone}
          />
        </label>
        <label className="production-order-booking-field">
          Email{customer ? " (optional)" : ""}
          <input
            maxLength={254}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required={!customer}
            type="email"
            value={email}
          />
        </label>
      </div>
      <label className="production-order-booking-field">
        Address{customer ? " (optional)" : ""}
        <input
          maxLength={300}
          onChange={(event) => setAddress(event.currentTarget.value)}
          required={!customer}
          value={address}
        />
      </label>
      {status && <p className="production-order-booking-error" role="alert">{status}</p>}
      <div className="production-order-booking-actions">
        <button className="production-primary-button" disabled={isSaving} type="submit">
          {isSaving ? "Saving…" : customer ? "Save changes" : "Save customer"}
        </button>
        <button className="production-text-action" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CreateProductionCustomerDialog({
  open,
  workspaces,
  defaultWorkspaceId,
  customer,
  onClose,
  onCreated,
}: {
  open: boolean;
  workspaces: ProductionDashboardWorkspace[];
  defaultWorkspaceId: string;
  customer?: ProductionDashboardCustomer;
  onClose: () => void;
  onCreated: (customer: ProductionDashboardCustomer) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setWorkspaceId(defaultWorkspaceId);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [defaultWorkspaceId, open]);

  return (
    <dialog
      aria-labelledby="production-create-customer-title"
      className="production-order-booking-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      ref={dialogRef}
    >
      <div className="production-order-booking-content">
        <div className="production-order-booking-heading">
          <span className="production-panel-kicker">CUSTOMER CATALOG</span>
          <h2 id="production-create-customer-title">{customer ? "Update customer" : "Create a customer"}</h2>
          <p>Customer details are shared across workspaces.</p>
        </div>
        {!customer && workspaces.length > 1 && (
          <label className="production-order-booking-field">
            Workspace
            <select
              onChange={(event) => setWorkspaceId(event.currentTarget.value)}
              required
              value={workspaceId}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <CreateProductionCustomerForm
          customer={customer}
          key={`${workspaceId}-${customer?.id ?? "new"}`}
          onCancel={onClose}
          onCreated={onCreated}
          workspaceId={workspaceId}
        />
      </div>
    </dialog>
  );
}

function OrderBookingDialog({
  open,
  workspaces,
  cartonTypes,
  defaultWorkspaceId,
  onClose,
  onBooked,
}: {
  open: boolean;
  workspaces: ProductionDashboardWorkspace[];
  cartonTypes: string[];
  defaultWorkspaceId: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itemSelectRef = useRef<HTMLSelectElement>(null);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [items, setItems] = useState<ProductionDashboardItem[]>([]);
  const [customers, setCustomers] = useState<ProductionDashboardCustomer[]>([]);
  const [orderLines, setOrderLines] = useState<ProductionOrderLineDraft[]>([
    { id: "order-line-1", itemId: "", orderQty: "" },
  ]);
  const orderLineSequence = useRef(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerPO, setCustomerPO] = useState("");
  const [orderDate, setOrderDate] = useState(() => dateKey(new Date()));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setWorkspaceId(defaultWorkspaceId);
      setItems([]);
      setCustomers([]);
      setOrderLines([{ id: "order-line-1", itemId: "", orderQty: "" }]);
      orderLineSequence.current = 1;
      setSelectedCustomerId("");
      setCustomerPO("");
      setOrderDate(dateKey(new Date()));
      setDeliveryDate("");
      setIsCreatingItem(false);
      setIsCreatingCustomer(false);
      setIsLoadingItems(true);
      setIsLoadingCustomers(true);
      setStatus("");
      setHasError(false);
      dialog.showModal();
      itemSelectRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [defaultWorkspaceId, open]);

  useEffect(() => {
    if (!open || !workspaceId) return;

    let active = true;
    requestProductionJson(
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/items`,
      { method: "GET" },
    )
      .then((result) => {
        if (!Array.isArray(result.items) || !result.items.every(isProductionDashboardItem)) {
          throw new Error("The server returned invalid item details.");
        }
        if (active) setItems(result.items);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load production items:", error);
        setStatus(`Could not load items: ${error instanceof Error ? error.message : String(error)}`);
        setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoadingItems(false);
      });

    return () => {
      active = false;
    };
  }, [open, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId) return;

    let active = true;
    requestProductionJson(
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/customers`,
      { method: "GET" },
    )
      .then((result) => {
        if (!Array.isArray(result.customers) || !result.customers.every(isProductionDashboardCustomer)) {
          throw new Error("The server returned invalid customer details.");
        }
        if (active) setCustomers(result.customers);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load production customers:", error);
        setStatus(`Could not load customers: ${error instanceof Error ? error.message : String(error)}`);
        setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoadingCustomers(false);
      });

    return () => {
      active = false;
    };
  }, [open, workspaceId]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const createOrderLineId = () => {
    orderLineSequence.current += 1;
    return `order-line-${orderLineSequence.current}`;
  };
  const updateOrderLine = (
    lineId: string,
    field: "itemId" | "orderQty",
    value: string,
  ) => {
    setOrderLines((current) => current.map((line) =>
      line.id === lineId ? { ...line, [field]: value } : line,
    ));
  };
  const removeOrderLine = (lineId: string) => {
    const replacementLine = {
      id: createOrderLineId(),
      itemId: "",
      orderQty: "",
    };
    setOrderLines((current) => {
      const remaining = current.filter((line) => line.id !== lineId);
      return remaining.length
        ? remaining
        : [replacementLine];
    });
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/order-bookings`,
        {
          method: "POST",
          body: JSON.stringify({
            customerId: selectedCustomerId,
            customerPO,
            orderDate,
            deliveryDate,
            lines: orderLines.map(({ itemId, orderQty: lineOrderQty }) => ({
              itemId,
              orderQty: lineOrderQty,
            })),
          }),
        },
      );
      const bookedJobs = Array.isArray(result.jobs)
        ? result.jobs.filter(isRecord)
        : isRecord(result.job)
          ? [result.job]
          : [];
      const jobNumbers = bookedJobs
        .map((job) => isRecord(job.data) && typeof job.data.jobNo === "string" ? job.data.jobNo : "")
        .filter(Boolean);
      setStatus(
        jobNumbers.length
          ? `${jobNumbers.length} order line${jobNumbers.length === 1 ? "" : "s"} booked: ${jobNumbers.join(", ")}.`
          : `${orderLines.length} order line${orderLines.length === 1 ? "" : "s"} booked.`,
      );
      setOrderLines([{ id: createOrderLineId(), itemId: "", orderQty: "" }]);
      setSelectedCustomerId("");
      setCustomerPO("");
      setDeliveryDate("");
      onBooked();
    } catch (error) {
      console.error("Could not book the production order:", error);
      setStatus(`Could not book order: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog
      aria-labelledby="production-order-booking-title"
      className="production-order-booking-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      ref={dialogRef}
    >
      <div className="production-order-booking-content">
        <div className="production-order-booking-heading">
          <span className="production-panel-kicker">ORDER BOOKING</span>
          <h2 id="production-order-booking-title">Book a customer order</h2>
          <p>A job sheet number will be generated automatically.</p>
        </div>
        {workspaces.length > 1 && (
          <label className="production-order-booking-field">
            Workspace
            <select
              onChange={(event) => {
                setWorkspaceId(event.currentTarget.value);
                setItems([]);
                setCustomers([]);
                setOrderLines([{ id: createOrderLineId(), itemId: "", orderQty: "" }]);
                setSelectedCustomerId("");
                setIsLoadingItems(true);
                setIsLoadingCustomers(true);
                setStatus("");
                setHasError(false);
              }}
              required
              value={workspaceId}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {isCreatingItem ? (
          <CreateProductionItemForm
            cartonTypes={cartonTypes}
            onCustomerCreated={(customer) => {
              setCustomers((current) =>
                [...current, customer].sort((left, right) => left.name.localeCompare(right.name)),
              );
              setSelectedCustomerId(customer.id);
            }}
            onCancel={() => setIsCreatingItem(false)}
            onCreated={(item) => {
              setItems((current) =>
                [...current, item].sort((left, right) => left.itemCode.localeCompare(right.itemCode)),
              );
              const newLineId = createOrderLineId();
              setOrderLines((current) => {
                const emptyLine = current.find((line) => !line.itemId);
                return emptyLine
                  ? current.map((line) => line.id === emptyLine.id ? { ...line, itemId: item.id } : line)
                  : [...current, { id: newLineId, itemId: item.id, orderQty: "" }];
              });
              if (!selectedCustomerId && item.customerId) setSelectedCustomerId(item.customerId);
              setIsCreatingItem(false);
              notifyToast(`Item ${item.itemCode} saved and selected.`);
              setHasError(false);
            }}
            workspaceId={workspaceId}
          />
        ) : isCreatingCustomer ? (
          <CreateProductionCustomerForm
            onCancel={() => setIsCreatingCustomer(false)}
            onCreated={(customer) => {
              setCustomers((current) =>
                [...current, customer].sort((left, right) => left.name.localeCompare(right.name)),
              );
              setSelectedCustomerId(customer.id);
              setIsCreatingCustomer(false);
              notifyToast(`Customer ${customer.name} added and selected.`);
              setHasError(false);
            }}
            workspaceId={workspaceId}
          />
        ) : (
          <form className="production-order-booking-form" onSubmit={submitOrder}>
          <div className="production-order-lines">
            {orderLines.map((line, index) => {
              const item = items.find((entry) => entry.id === line.itemId);
              return (
                <section className="production-order-line" key={line.id}>
                  <div className="production-order-line-heading">
                    <strong>Order line {index + 1}</strong>
                    {orderLines.length > 1 && (
                      <button
                        aria-label={`Remove order line ${index + 1}`}
                        className="production-text-action"
                        onClick={() => removeOrderLine(line.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="production-order-booking-row">
                    <label className="production-order-booking-field">
                      Product
                      <select
                        onChange={(event) => {
                          const itemId = event.currentTarget.value;
                          const selectedProduct = items.find((entry) => entry.id === itemId);
                          updateOrderLine(line.id, "itemId", itemId);
                          if (!selectedCustomerId && selectedProduct?.customerId) {
                            setSelectedCustomerId(selectedProduct.customerId);
                          }
                        }}
                        ref={index === 0 ? itemSelectRef : undefined}
                        required
                        value={line.itemId}
                      >
                        <option value="">
                          {isLoadingItems
                            ? "Loading items…"
                            : items.length
                              ? "Select a product"
                              : "No products yet"}
                        </option>
                        {items.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.itemCode} — {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="production-order-booking-field">
                      Quantity
                      <input
                        inputMode="numeric"
                        min="1"
                        onChange={(event) => updateOrderLine(line.id, "orderQty", event.currentTarget.value)}
                        required
                        step="1"
                        type="number"
                        value={line.orderQty}
                      />
                    </label>
                  </div>
                  {item && (
                    <div className="production-order-item-summary">
                      <strong>{item.itemCode} · {item.name}</strong>
                      <span>{item.boxType}</span>
                      <span>{item.topLiner}/{item.medium}/{item.bottomLiner}</span>
                      <span>{item.length} × {item.width} × {item.height} {item.unit}</span>
                    </div>
                  )}
                </section>
              );
            })}
            <div className="production-order-line-actions">
              <button
                className="production-text-action"
                disabled={isLoadingItems}
                onClick={() => {
                  const lineId = createOrderLineId();
                  setOrderLines((current) => [
                    ...current,
                    { id: lineId, itemId: "", orderQty: "" },
                  ]);
                }}
                type="button"
              >
                <FiPlus aria-hidden="true" /> Add order line
              </button>
              <button
                className="production-text-action"
                disabled={isLoadingItems || !workspaceId}
                onClick={() => {
                  setStatus("");
                  setHasError(false);
                  setIsCreatingItem(true);
                }}
                type="button"
              >
                <FiPlus aria-hidden="true" /> Create product
              </button>
            </div>
          </div>
          <div className="production-order-item-picker">
            <label className="production-order-booking-field" htmlFor="production-order-customer">
              Customer
              <select
                id="production-order-customer"
                disabled={isLoadingCustomers}
                onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}
                required
                value={selectedCustomerId}
              >
                <option value="">
                  {isLoadingCustomers
                    ? "Loading customers…"
                    : customers.length
                      ? "Select a customer"
                      : "No customers yet"}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.contactPerson ? ` — ${customer.contactPerson}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="production-text-action"
              disabled={isLoadingCustomers || !workspaceId}
              onClick={() => {
                setStatus("");
                setHasError(false);
                setIsCreatingCustomer(true);
              }}
              type="button"
            >
              <FiPlus aria-hidden="true" /> Add customer
            </button>
          </div>
          {selectedCustomer && (
            <div className="production-order-item-summary">
              <strong>{selectedCustomer.name}</strong>
              {selectedCustomer.kraPin && <span>KRA PIN: {selectedCustomer.kraPin}</span>}
              {selectedCustomer.contactPerson && <span>Contact: {selectedCustomer.contactPerson}</span>}
              {selectedCustomer.phone && <span>Phone: {selectedCustomer.phone}</span>}
              {selectedCustomer.email && <span>Email: {selectedCustomer.email}</span>}
              {selectedCustomer.address && <span>Address: {selectedCustomer.address}</span>}
            </div>
          )}
          <label className="production-order-booking-field">
            Customer PO number (optional)
            <input
              maxLength={60}
              onChange={(event) => setCustomerPO(event.currentTarget.value)}
              value={customerPO}
            />
          </label>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Order date
              <input
                onChange={(event) => setOrderDate(event.currentTarget.value)}
                required
                type="date"
                value={orderDate}
              />
            </label>
            <label className="production-order-booking-field">
              Delivery date
              <input
                onChange={(event) => setDeliveryDate(event.currentTarget.value)}
                required
                type="date"
                value={deliveryDate}
              />
            </label>
          </div>
          {status && (
            <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
              {status}
            </p>
          )}
          <div className="production-order-booking-actions">
            <button
              className="production-primary-button"
              disabled={isSaving || isLoadingItems || isLoadingCustomers}
              type="submit"
            >
              {isSaving ? "Booking…" : `Book ${orderLines.length} order line${orderLines.length === 1 ? "" : "s"}`}
            </button>
            <button
              className="production-text-action"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

function ArtworkUploadButton({
  job,
  onUploaded,
  onRegisterUploadTrigger,
}: {
  job: ProductionDashboardJob;
  onUploaded?: () => void;
  onRegisterUploadTrigger?: (
    jobId: string,
    trigger: (() => void) | null,
  ) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDialogRef = useRef<HTMLDialogElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [revisionComment, setRevisionComment] = useState("");

  useEffect(() => {
    const dialog = uploadDialogRef.current;
    if (!dialog) return;
    if (pendingUploadFile && !dialog.open) dialog.showModal();
    if (!pendingUploadFile && dialog.open) dialog.close();
  }, [pendingUploadFile]);

  useEffect(() => {
    if (!onRegisterUploadTrigger) return;
    const trigger = () => fileInputRef.current?.click();
    onRegisterUploadTrigger(job.id, trigger);
    return () => onRegisterUploadTrigger(job.id, null);
  }, [job.id, onRegisterUploadTrigger]);

  const selectArtwork = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    if (file.size > MAX_ARTWORK_FILE_BYTES) {
      setStatus("Artwork files must be 5 MB or smaller.");
      setHasError(true);
      return;
    }
    setStatus("");
    setHasError(false);
    setRevisionComment("");
    setPendingUploadFile(file);
  };

  const uploadArtwork = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = pendingUploadFile;
    if (!file) return;
    setIsUploading(true);
    setStatus("Uploading artwork…");
    setHasError(false);
    try {
      const jobPath = `/api/production/jobs/${encodeURIComponent(job.id)}/artwork`;
      const upload = await requestProductionJson(`${jobPath}/upload-url`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      });
      if (
        typeof upload.pathname !== "string" ||
        typeof upload.presignedUrl !== "string" ||
        typeof upload.contentType !== "string"
      ) {
        throw new Error("The server returned an invalid artwork upload URL.");
      }

      const response = await fetch(upload.presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": upload.contentType },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Artwork upload failed (${response.status}).`);
      }

      await requestProductionJson(jobPath, {
        method: "POST",
        body: JSON.stringify({
          pathname: upload.pathname,
          fileName: file.name,
          revisionComment,
        }),
      });
      notifyToast(job.itemId
        ? "New artwork version uploaded."
        : "Artwork attached.");
      setStatus("");
      setPendingUploadFile(null);
      setRevisionComment("");
      onUploaded?.();
    } catch (error) {
      console.error("Could not attach artwork to the production job:", error);
      setStatus(`Could not attach artwork: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsUploading(false);
    }
  };

  const deleteArtwork = async () => {
    if (!window.confirm(`Delete the artwork attached to ${job.jobNo || "this job"}?`)) return;

    setIsDeleting(true);
    setStatus("Deleting artwork…");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/jobs/${encodeURIComponent(job.id)}/artwork`,
        { method: "DELETE" },
      );
      notifyToast("Artwork deleted.");
      onUploaded?.();
    } catch (error) {
      console.error("Could not delete artwork from the production job:", error);
      setStatus(`Could not delete artwork: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsDeleting(false);
    }
  };

  if (job.artworkCount > 0 && !job.productArtwork && !job.itemId) {
    return (
      <div className="production-artwork-upload">
        <span className="production-artwork-attached">
          <FiCheckCircle aria-hidden="true" />
          {job.productArtwork ? "Product artwork saved" : "Artwork attached"}
        </span>
        <button
          aria-label={`Delete artwork for ${job.jobNo || "job"}`}
          className="production-table-action production-artwork-delete-button"
          disabled={isDeleting}
          onClick={() => void deleteArtwork()}
          type="button"
        >
          <FiTrash2 aria-hidden="true" />
          {isDeleting ? "Deleting…" : "Delete artwork"}
        </button>
        {status && <small aria-live="polite" role={hasError ? "alert" : "status"}>{status}</small>}
      </div>
    );
  }

  return (
    <div className="production-artwork-upload">
      {job.productArtwork && (
        <span className="production-artwork-attached">
          <FiCheckCircle aria-hidden="true" />
          {job.artworkCount} artwork version{job.artworkCount === 1 ? "" : "s"}
        </span>
      )}
      <input
        ref={fileInputRef}
        accept=".ai,.cdr,.eps,.indd,.jpeg,.jpg,.pdf,.png,.ps,.psd,.svg,.tif,.tiff"
        aria-label={`${job.productArtwork ? "New artwork version" : "Artwork file"} for ${job.jobNo || "untitled job"}`}
        className="sr-only"
        disabled={isUploading}
        onChange={selectArtwork}
        type="file"
      />
      <button
        aria-label={isUploading
          ? `Uploading artwork for ${job.jobNo || "job"}`
          : job.productArtwork
            ? `Upload new artwork version for ${job.jobNo || "product"}`
            : `Attach artwork to ${job.jobNo || "job"}`}
        className="production-table-action production-artwork-attach-button"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        title={isUploading
          ? "Uploading artwork"
          : job.productArtwork
            ? "Upload new artwork version"
            : "Attach artwork"}
        type="button"
      >
        {isUploading
          ? <FiLoader className="production-refresh-spinner" aria-hidden="true" />
          : <FiPaperclip aria-hidden="true" />}
      </button>
      <dialog
        aria-labelledby={`artwork-upload-title-${job.id}`}
        className="production-artwork-upload-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!isUploading) setPendingUploadFile(null);
        }}
        ref={uploadDialogRef}
      >
        <form onSubmit={uploadArtwork}>
          <div className="production-artwork-history-heading">
            <div>
              <span className="production-panel-kicker">NEW ARTWORK VERSION</span>
              <h2 id={`artwork-upload-title-${job.id}`}>Upload artwork</h2>
              <p>{pendingUploadFile?.name}</p>
            </div>
          </div>
          <label className="production-order-booking-field">
            Revision comments (optional)
            <textarea
              maxLength={MAX_ARTWORK_REVISION_COMMENT_LENGTH}
              onChange={(event) => setRevisionComment(event.currentTarget.value)}
              placeholder="Describe what changed in this version"
              rows={4}
              value={revisionComment}
            />
          </label>
          {status && (
            <small aria-live="polite" role={hasError ? "alert" : "status"}>
              {status}
            </small>
          )}
          <div className="production-artwork-upload-actions">
            <button
              className="production-primary-button"
              disabled={isUploading}
              type="submit"
            >
              {isUploading ? "Uploading…" : "Upload version"}
            </button>
            <button
              className="production-text-action"
              disabled={isUploading}
              onClick={() => {
                setStatus("");
                setPendingUploadFile(null);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
      {!pendingUploadFile && status && (
        <small aria-live="polite" role={hasError ? "alert" : "status"}>{status}</small>
      )}
    </div>
  );
}

function PrintingArtworkViewer({
  attachment,
}: {
  attachment: ProductionDashboardAttachment;
}) {
  const [zoom, setZoom] = useState(100);
  const fileUrl = `/api/production/artwork/${encodeURIComponent(attachment.id)}`;
  const isPdf = attachment.contentType === "application/pdf";
  const previewUrl = `${fileUrl}?preview=1`;

  return (
    <article className="production-printing-artwork-file">
      {isPdf ? (
        <>
          <div className="production-printing-artwork-toolbar">
            <strong>{attachment.originalName}</strong>
            <div
              aria-label={`PDF controls for ${attachment.originalName}`}
              className="production-printing-artwork-controls"
              role="group"
            >
              <button
                aria-label="Zoom out"
                disabled={zoom <= 50}
                onClick={() => setZoom((current) => Math.max(50, current - 25))}
                type="button"
              >
                −
              </button>
              <output aria-live="polite">{zoom}%</output>
              <button
                aria-label="Zoom in"
                disabled={zoom >= 200}
                onClick={() => setZoom((current) => Math.min(200, current + 25))}
                type="button"
              >
                +
              </button>
              <button onClick={() => setZoom(100)} type="button">Reset zoom</button>
              <a download={attachment.originalName} href={fileUrl}>Download</a>
            </div>
          </div>
          <ProductionArtworkPdfPreview
            downloadUrl={fileUrl}
            src={previewUrl}
            zoom={zoom}
          />
        </>
      ) : (
        <div className="production-printing-artwork-toolbar">
          <div>
            <strong>{attachment.originalName}</strong>
            <p>Inline preview is available for PDF artwork.</p>
          </div>
          <a download={attachment.originalName} href={fileUrl}>Download artwork</a>
        </div>
      )}
    </article>
  );
}

type QuoteFormState = {
  customerId: string;
  currency: "KES" | "USD" | "EUR";
  validUntil: string;
  inquiryReference: string;
  notes: string;
  lines: ProductionQuoteLineInput[];
};

function emptyQuoteLine(): ProductionQuoteLineInput {
  return {
    itemId: "",
    quantity: "1000",
    boardAreaM2: "",
    boardGsm: "",
    paperCostPerKg: "",
    trimWastePercent: "0",
    conversionCost: "",
    consumablesCost: "0",
    marginPercent: "",
  };
}

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function formatQuoteAmount(amount: string | number, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatInvoiceUnitPrice(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(amount) || 0);
}

function quoteLineSpec(line: ProductionDashboardQuoteLine): string {
  const board = [line.topLiner, line.medium, line.bottomLiner].filter(Boolean).join("/");
  return [line.boxType, board, `${line.length} × ${line.width} × ${line.height} ${line.unit}`]
    .filter(Boolean)
    .join(" · ");
}

function WarehouseDispatchBoard({
  workspaces,
  jobs,
  schedules,
  warehousePallets,
  dispatches,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  jobs: ProductionDashboardJob[];
  schedules: ProductionDashboardSchedule[];
  warehousePallets: ProductionDashboardWarehousePallet[];
  dispatches: ProductionDashboardDispatch[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const [receipt, setReceipt] = useState({ jobId: "", quantity: "", location: "", notes: "" });
  const [dispatchJobId, setDispatchJobId] = useState("");
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({});
  const [dispatchForm, setDispatchForm] = useState({
    vehicleRegistration: "",
    driverName: "",
    route: "",
    notes: "",
  });
  const [deliveryDispatchId, setDeliveryDispatchId] = useState("");
  const [deliveryForm, setDeliveryForm] = useState({ receivedBy: "", deliveryNotes: "" });
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const workspaceJobs = jobs.filter((job) => job.workspaceId === workspaceId);
  const workspacePallets = warehousePallets.filter(
    (pallet) => pallet.workspaceId === workspaceId,
  );
  const workspaceDispatches = dispatches.filter(
    (dispatch) => dispatch.workspaceId === workspaceId,
  );
  const selectedDispatchJob = workspaceJobs.find((job) => job.id === dispatchJobId);
  const selectedReceiptJob = workspaceJobs.find((job) => job.id === receipt.jobId);
  const selectedPackingSchedule = selectedReceiptJob
    ? schedules.find((schedule) =>
      schedule.workspaceId === workspaceId &&
      schedule.jobId === selectedReceiptJob.id &&
      schedule.operation === "Packing" &&
      schedule.status === "COMPLETED",
    )
    : undefined;
  const packedQuantity = selectedPackingSchedule?.actualGoodQty ?? 0;
  const receivedForSelectedJob = selectedReceiptJob
    ? workspacePallets
      .filter((pallet) => pallet.jobId === selectedReceiptJob.id)
      .reduce((total, pallet) => total + pallet.quantityReceived, 0)
    : 0;
  const remainingForSelectedJob = selectedReceiptJob?.orderQty !== null &&
    selectedReceiptJob?.orderQty !== undefined
    ? receivableFinishedGoodsQuantity(
      selectedReceiptJob.orderQty,
      packedQuantity,
      receivedForSelectedJob,
    )
    : undefined;
  const dispatchPallets = workspacePallets.filter(
    (pallet) => pallet.jobId === dispatchJobId && pallet.quantityAvailable > 0,
  );
  const selectedNote = workspaceDispatches.find((dispatch) => dispatch.id === selectedNoteId);
  const selectedLabel = workspacePallets.find((pallet) => pallet.id === selectedLabelId);

  const changeWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setReceipt({ jobId: "", quantity: "", location: "", notes: "" });
    setDispatchJobId("");
    setDispatchQuantities({});
    setDeliveryDispatchId("");
    setSelectedNoteId("");
    setSelectedLabelId("");
    setStatus("");
    setHasError(false);
  };

  const receivePallet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/warehouse/pallets`,
        { method: "POST", body: JSON.stringify(receipt) },
      );
      const pallet = isRecord(result.pallet) ? result.pallet : null;
      notifyToast(
        typeof pallet?.palletNo === "string"
          ? `Pallet ${pallet.palletNo} received into the warehouse.`
          : "Finished goods received into the warehouse.",
      );
      setReceipt((current) => ({ ...current, quantity: "", notes: "" }));
      onSaved();
    } catch (error) {
      setStatus(`Could not receive finished goods: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const submitDispatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lines = dispatchPalletsFromForm();
    if (!selectedDispatchJob || !lines.length) return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/warehouse/dispatches`,
        {
          method: "POST",
          body: JSON.stringify({ ...dispatchForm, jobId: selectedDispatchJob.id, lines }),
        },
      );
      const dispatch = isRecord(result.dispatch) ? result.dispatch : null;
      notifyToast(
        typeof dispatch?.deliveryNoteNo === "string"
          ? `Dispatch created. Delivery note ${dispatch.deliveryNoteNo} is ready to print.`
          : "Finished goods dispatched.",
      );
      setDispatchQuantities({});
      setDispatchForm({ vehicleRegistration: "", driverName: "", route: "", notes: "" });
      onSaved();
    } catch (error) {
      setStatus(`Could not dispatch pallets: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  function dispatchPalletsFromForm() {
    return Object.entries(dispatchQuantities)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([palletId, quantity]) => ({ palletId, quantity }));
  }

  const recordDelivery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deliveryDispatchId) return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/warehouse/dispatches/${encodeURIComponent(deliveryDispatchId)}`,
        { method: "PATCH", body: JSON.stringify(deliveryForm) },
      );
      notifyToast("Delivery acknowledgement recorded.");
      setDeliveryDispatchId("");
      setDeliveryForm({ receivedBy: "", deliveryNotes: "" });
      onSaved();
    } catch (error) {
      setStatus(`Could not confirm delivery: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const printDocument = (target: "delivery-note" | "pallet-label") => {
    document.body.dataset.printTarget = target;
    window.print();
  };

  return (
    <div className="production-warehouse-board">
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">FINISHED GOODS</span>
            <h2>Receive cartons into warehouse</h2>
          </div>
          {workspaces.length > 1 && (
            <label className="production-workspace-filter">
              <span>Workspace</span>
              <select onChange={(event) => changeWorkspace(event.target.value)} value={workspaceId}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="production-reel-explainer">
          Receiving requires a completed Packing report, a passing final inspection, and no open nonconformances. Each receipt creates a traceable pallet label.
        </p>
        <form className="production-reel-form" onSubmit={receivePallet}>
          <div className="production-reel-form-grid">
            <label className="production-order-booking-field">
              <span>Production job</span>
              <select
                onChange={(event) => setReceipt((current) => ({ ...current, jobId: event.target.value }))}
                required
                value={receipt.jobId}
              >
                <option value="">Select job</option>
                {workspaceJobs.filter((job) => job.orderQty).map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNo} · {job.jobName} · {job.customer}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              <span>Finished quantity</span>
              <input
                max={remainingForSelectedJob}
                min="1"
                onChange={(event) => setReceipt((current) => ({ ...current, quantity: event.target.value }))}
                required
                step="1"
                type="number"
                value={receipt.quantity}
              />
            </label>
            <label className="production-order-booking-field">
              <span>Warehouse bay / location</span>
              <input
                maxLength={120}
                onChange={(event) => setReceipt((current) => ({ ...current, location: event.target.value }))}
                required
                value={receipt.location}
              />
            </label>
            <label className="production-order-booking-field">
              <span>Receipt notes</span>
              <input
                maxLength={500}
                onChange={(event) => setReceipt((current) => ({ ...current, notes: event.target.value }))}
                value={receipt.notes}
              />
            </label>
          </div>
          <div className="production-supply-form-actions">
            <span>
              {selectedReceiptJob && !selectedPackingSchedule
                ? "Complete and report the Packing operation before warehouse receipt."
                : "Receipt quantity is limited to reported packed output and the remaining order quantity."}
            </span>
            <button className="production-primary-button" disabled={isSaving || !workspaceJobs.length} type="submit">
              {isSaving ? "Receiving…" : "Receive finished goods"}
            </button>
          </div>
        </form>
        {status && <p className="production-quote-message" role={hasError ? "alert" : "status"}>{status}</p>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PALLET REGISTER</span>
            <h2>Warehouse stock by location</h2>
          </div>
          <span className="production-panel-total">
            {workspacePallets.reduce((total, pallet) => total + pallet.quantityAvailable, 0).toLocaleString("en-KE")} units available
          </span>
        </div>
        {workspacePallets.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table production-warehouse-table">
              <thead>
                <tr>
                  <th>Pallet label</th>
                  <th>Job / Customer</th>
                  <th>Bay / location</th>
                  <th className="production-number-cell">Available / received</th>
                  <th>Received</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {workspacePallets.map((pallet) => (
                  <tr key={pallet.id}>
                    <td><strong>{pallet.palletNo}</strong></td>
                    <td>{pallet.jobNo} · {pallet.jobName}<small>{pallet.customer}</small></td>
                    <td>{pallet.location}</td>
                    <td className="production-number-cell">
                      {pallet.quantityAvailable.toLocaleString("en-KE")} / {pallet.quantityReceived.toLocaleString("en-KE")} units
                    </td>
                    <td>{new Date(pallet.receivedAt).toLocaleDateString("en-KE")}</td>
                    <td>
                      <button className="production-table-action" onClick={() => setSelectedLabelId(pallet.id)} type="button">
                        Print pallet label
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiPackage /></span>
            <h3>No finished goods in warehouse</h3>
            <p>Final-QC-released pallets will appear here with their storage bay and available quantity.</p>
          </div>
        )}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">DELIVERY PLANNING</span>
            <h2>Pack and dispatch a customer order</h2>
          </div>
        </div>
        <form className="production-reel-form" onSubmit={submitDispatch}>
          <div className="production-warehouse-form-grid">
            <label className="production-order-booking-field">
              <span>Job / delivery</span>
              <select
                onChange={(event) => {
                  setDispatchJobId(event.target.value);
                  setDispatchQuantities({});
                }}
                required
                value={dispatchJobId}
              >
                <option value="">Select job</option>
                {workspaceJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNo} · {job.customer} · Due {job.deliveryDate || "date not set"}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              <span>Vehicle registration</span>
              <input
                maxLength={40}
                onChange={(event) => setDispatchForm((current) => ({ ...current, vehicleRegistration: event.target.value }))}
                required
                value={dispatchForm.vehicleRegistration}
              />
            </label>
            <label className="production-order-booking-field">
              <span>Driver</span>
              <input
                maxLength={120}
                onChange={(event) => setDispatchForm((current) => ({ ...current, driverName: event.target.value }))}
                required
                value={dispatchForm.driverName}
              />
            </label>
            <label className="production-order-booking-field">
              <span>Route / destination</span>
              <input
                maxLength={200}
                onChange={(event) => setDispatchForm((current) => ({ ...current, route: event.target.value }))}
                value={dispatchForm.route}
              />
            </label>
          </div>
          {selectedDispatchJob && (
            <div className="production-warehouse-pallet-picklist">
              <div className="production-panel-heading">
                <div>
                  <span className="production-panel-kicker">PACKING LIST</span>
                  <h3>{selectedDispatchJob.jobNo} · {selectedDispatchJob.customer}</h3>
                </div>
              </div>
              {dispatchPallets.length ? dispatchPallets.map((pallet) => (
                <label className="production-warehouse-pallet-option" key={pallet.id}>
                  <span>
                    <strong>{pallet.palletNo}</strong>
                    <small>{pallet.location} · {pallet.quantityAvailable.toLocaleString("en-KE")} units available</small>
                  </span>
                  <input
                    aria-label={`Quantity from ${pallet.palletNo}`}
                    max={pallet.quantityAvailable}
                    min="0"
                    onChange={(event) => setDispatchQuantities((current) => ({
                      ...current,
                      [pallet.id]: event.target.value,
                    }))}
                    step="1"
                    type="number"
                    value={dispatchQuantities[pallet.id] ?? ""}
                  />
                </label>
              )) : (
                <p className="production-chart-empty">No available pallets are currently assigned to this job.</p>
              )}
            </div>
          )}
          <label className="production-order-booking-field">
            <span>Dispatch notes</span>
            <textarea
              maxLength={500}
              onChange={(event) => setDispatchForm((current) => ({ ...current, notes: event.target.value }))}
              value={dispatchForm.notes}
            />
          </label>
          <div className="production-supply-form-actions">
            <span>Select pallet quantities to create a delivery note and reduce warehouse stock.</span>
            <button
              className="production-primary-button"
              disabled={isSaving || !dispatchPalletsFromForm().length || !selectedDispatchJob}
              type="submit"
            >
              {isSaving ? "Dispatching…" : "Create dispatch"}
            </button>
          </div>
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">SHIPMENT REGISTER</span>
            <h2>Dispatches and proof of delivery</h2>
          </div>
          <span className="production-panel-total">{workspaceDispatches.length} dispatches</span>
        </div>
        {workspaceDispatches.length ? (
          <div className="production-warehouse-dispatch-list">
            {workspaceDispatches.map((dispatch) => (
              <article className="production-warehouse-dispatch-card" key={dispatch.id}>
                <div className="production-warehouse-dispatch-heading">
                  <div>
                    <strong>{dispatch.deliveryNoteNo}</strong>
                    <span>{dispatch.jobNo} · {dispatch.jobName} · {dispatch.customer}</span>
                  </div>
                  <span className={`production-schedule-status${dispatch.status === "DELIVERED" ? " status-completed" : ""}`}>
                    {dispatch.status}
                  </span>
                </div>
                <div className="production-warehouse-dispatch-meta">
                  <span>{dispatch.vehicleRegistration} · {dispatch.driverName}</span>
                  <span>{dispatch.route || "No route recorded"}</span>
                  <span>{dispatch.lines.reduce((total, line) => total + line.quantity, 0).toLocaleString("en-KE")} units · {dispatch.lines.length} pallets</span>
                  <span>{new Date(dispatch.dispatchedAt).toLocaleString("en-KE")}</span>
                </div>
                <div className="production-warehouse-dispatch-actions">
                  <button className="production-table-action" onClick={() => setSelectedNoteId(dispatch.id)} type="button">
                    View / print delivery note
                  </button>
                  {dispatch.status === "DISPATCHED" && (
                    <button
                      className="production-table-action"
                      onClick={() => {
                        setDeliveryDispatchId(dispatch.id);
                        setDeliveryForm({ receivedBy: "", deliveryNotes: "" });
                      }}
                      type="button"
                    >
                      Record delivery acknowledgement
                    </button>
                  )}
                  {dispatch.status === "DELIVERED" && (
                    <span className="production-warehouse-recipient">
                      Received by {dispatch.receivedBy} · {dispatch.deliveredAt ? new Date(dispatch.deliveredAt).toLocaleString("en-KE") : ""}
                    </span>
                  )}
                </div>
                {deliveryDispatchId === dispatch.id && (
                  <form className="production-warehouse-delivery-form" onSubmit={recordDelivery}>
                    <label className="production-order-booking-field">
                      <span>Recipient / typed acknowledgement</span>
                      <input
                        maxLength={120}
                        onChange={(event) => setDeliveryForm((current) => ({ ...current, receivedBy: event.target.value }))}
                        required
                        value={deliveryForm.receivedBy}
                      />
                    </label>
                    <label className="production-order-booking-field">
                      <span>Proof-of-delivery notes</span>
                      <textarea
                        maxLength={500}
                        onChange={(event) => setDeliveryForm((current) => ({ ...current, deliveryNotes: event.target.value }))}
                        value={deliveryForm.deliveryNotes}
                      />
                    </label>
                    <div className="production-supply-form-actions">
                      <button className="production-table-action" onClick={() => setDeliveryDispatchId("")} type="button">Cancel</button>
                      <button className="production-primary-button" disabled={isSaving} type="submit">
                        {isSaving ? "Saving…" : "Confirm delivery"}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="production-chart-empty">Dispatches and their delivery notes will be listed here.</p>
        )}
      </section>

      {selectedNote && (
        <section className="production-delivery-note">
          <div className="production-delivery-note-heading">
            <div>
              <span>PACKSTUDIO · DELIVERY NOTE</span>
              <h2>{selectedNote.deliveryNoteNo}</h2>
            </div>
            <button className="production-primary-button production-no-print" onClick={() => printDocument("delivery-note")} type="button">
              Print delivery note
            </button>
          </div>
          <dl className="production-delivery-note-details">
            <div><dt>Customer</dt><dd>{selectedNote.customer}</dd></div>
            <div><dt>Job</dt><dd>{selectedNote.jobNo} · {selectedNote.jobName}</dd></div>
            <div><dt>Dispatch reference</dt><dd>{selectedNote.dispatchNo}</dd></div>
            <div><dt>Vehicle / driver</dt><dd>{selectedNote.vehicleRegistration} · {selectedNote.driverName}</dd></div>
            <div><dt>Route</dt><dd>{selectedNote.route || "—"}</dd></div>
            <div><dt>Dispatched</dt><dd>{new Date(selectedNote.dispatchedAt).toLocaleString("en-KE")}</dd></div>
          </dl>
          <table className="production-delivery-note-table">
            <thead><tr><th>Pallet</th><th>Warehouse location</th><th>Quantity</th></tr></thead>
            <tbody>
              {selectedNote.lines.map((line) => (
                <tr key={line.palletId}><td>{line.palletNo}</td><td>{line.location}</td><td>{line.quantity.toLocaleString("en-KE")}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={2}>Total units</th><th>{selectedNote.lines.reduce((total, line) => total + line.quantity, 0).toLocaleString("en-KE")}</th></tr>
            </tfoot>
          </table>
          {selectedNote.status === "DELIVERED" && (
            <p className="production-delivery-note-signature">
              Received by: <strong>{selectedNote.receivedBy}</strong>
              {selectedNote.deliveryNotes && <span>{selectedNote.deliveryNotes}</span>}
            </p>
          )}
        </section>
      )}
      {selectedLabel && (
        <section className="production-pallet-label">
          <div>
            <span>PACKSTUDIO · FINISHED GOODS</span>
            <h2>{selectedLabel.palletNo}</h2>
          </div>
          <dl>
            <div><dt>Job</dt><dd>{selectedLabel.jobNo} · {selectedLabel.jobName}</dd></div>
            <div><dt>Customer</dt><dd>{selectedLabel.customer}</dd></div>
            <div><dt>Location</dt><dd>{selectedLabel.location}</dd></div>
            <div><dt>Available / received</dt><dd>{selectedLabel.quantityAvailable.toLocaleString("en-KE")} / {selectedLabel.quantityReceived.toLocaleString("en-KE")} units</dd></div>
            <div><dt>Received</dt><dd>{new Date(selectedLabel.receivedAt).toLocaleDateString("en-KE")}</dd></div>
          </dl>
          <button className="production-primary-button production-no-print" onClick={() => printDocument("pallet-label")} type="button">
            Print pallet label
          </button>
        </section>
      )}
    </div>
  );
}

function MaintenanceBoard({
  workspaces,
  machines,
  maintenancePlans,
  maintenanceTickets,
  materials,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  machines: ProductionDashboardMachine[];
  maintenancePlans: ProductionDashboardMaintenancePlan[];
  maintenanceTickets: ProductionDashboardMaintenanceTicket[];
  materials: ProductionDashboardMaterial[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const orgMachines = machines.filter((machine) => machine.workspaceId === workspaceId);
  const orgPlans = maintenancePlans.filter((plan) => plan.workspaceId === workspaceId);
  const orgTickets = maintenanceTickets.filter((ticket) => ticket.workspaceId === workspaceId);
  const orgMaterials = materials.filter(
    (material) => material.workspaceId === workspaceId &&
      material.active &&
      material.category !== "PAPER",
  );
  const openTicketCount = orgTickets.filter(
    (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS",
  ).length;
  const downtimeMinutes = orgTickets.reduce((total, ticket) => total + ticket.downtimeMinutes, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overduePlans = orgPlans.filter(
    (plan) => plan.active && new Date(plan.nextDueAt) < today,
  ).length;

  const showError = (error: unknown, fallback: string) => {
    notifyToast(error instanceof Error ? error.message : fallback, "error");
  };

  const createMachine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/maintenance/assets`,
        {
          method: "POST",
          body: JSON.stringify({
            machineNo: String(data.get("machineNo") ?? ""),
            name: String(data.get("name") ?? ""),
            machineType: String(data.get("machineType") ?? ""),
            workCenter: String(data.get("workCenter") ?? ""),
            location: String(data.get("location") ?? ""),
          }),
        },
      );
      form.reset();
      notifyToast("Machine registered.");
      onSaved();
    } catch (error) {
      showError(error, "Could not register machine.");
    }
  };

  const createPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/maintenance/schedules`,
        {
          method: "POST",
          body: JSON.stringify({
            machineId: String(data.get("machineId") ?? ""),
            taskName: String(data.get("taskName") ?? ""),
            intervalDays: String(data.get("intervalDays") ?? ""),
            nextDueAt: String(data.get("nextDueAt") ?? ""),
            instructions: String(data.get("instructions") ?? ""),
          }),
        },
      );
      form.reset();
      notifyToast("Preventive maintenance plan created.");
      onSaved();
    } catch (error) {
      showError(error, "Could not create preventive plan.");
    }
  };

  const createTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ticketType = String(data.get("ticketType") ?? "");
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/maintenance/tickets`,
        {
          method: "POST",
          body: JSON.stringify({
            machineId: String(data.get("machineId") ?? ""),
            ticketType,
            planId: ticketType === "PREVENTIVE" ? String(data.get("planId") ?? "") : "",
            jobId: "",
            operationScheduleId: "",
            priority: String(data.get("priority") ?? ""),
            description: String(data.get("description") ?? ""),
            downtimeMinutes: String(data.get("downtimeMinutes") ?? "0"),
          }),
        },
      );
      form.reset();
      notifyToast("Maintenance ticket opened.");
      onSaved();
    } catch (error) {
      showError(error, "Could not open maintenance ticket.");
    }
  };

  const updateTicket = async (event: FormEvent<HTMLFormElement>, ticket: ProductionDashboardMaintenanceTicket) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/maintenance/tickets/${encodeURIComponent(ticket.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: String(data.get("status") ?? ""),
            resolution: String(data.get("resolution") ?? ""),
            downtimeMinutes: String(data.get("downtimeMinutes") ?? ""),
          }),
        },
      );
      notifyToast(`${ticket.ticketNo} updated.`);
      onSaved();
    } catch (error) {
      showError(error, "Could not update maintenance ticket.");
    }
  };

  const issuePart = async (event: FormEvent<HTMLFormElement>, ticket: ProductionDashboardMaintenanceTicket) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/maintenance/tickets/${encodeURIComponent(ticket.id)}/parts`,
        {
          method: "POST",
          body: JSON.stringify({
            materialId: String(data.get("materialId") ?? ""),
            quantity: String(data.get("quantity") ?? ""),
          }),
        },
      );
      form.reset();
      notifyToast(`Spare part issued to ${ticket.ticketNo}.`);
      onSaved();
    } catch (error) {
      showError(error, "Could not issue spare part.");
    }
  };

  const setPlanActive = async (plan: ProductionDashboardMaintenancePlan, active: boolean) => {
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/maintenance/schedules/${encodeURIComponent(plan.id)}`,
        { method: "PATCH", body: JSON.stringify({ active }) },
      );
      notifyToast(`${plan.taskName} ${active ? "activated" : "paused"}.`);
      onSaved();
    } catch (error) {
      showError(error, "Could not update preventive plan.");
    }
  };

  const updateMachine = async (
    event: FormEvent<HTMLFormElement>,
    machine: ProductionDashboardMachine,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/maintenance/assets/${encodeURIComponent(machine.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: String(data.get("status") ?? ""),
            location: String(data.get("location") ?? ""),
          }),
        },
      );
      notifyToast(`${machine.machineNo} updated.`);
      onSaved();
    } catch (error) {
      showError(error, "Could not update machine.");
    }
  };

  return (
    <div className="production-board-stack production-maintenance-board">
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">CMMS · ASSET RELIABILITY</span>
            <h2>Maintenance control center</h2>
            <p>Manage equipment, preventive care, breakdowns, downtime, and spare parts.</p>
          </div>
          <label>
            <span className="sr-only">Production workspace</span>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="production-kpi-grid">
          <article className="production-kpi-card"><span>Registered machines</span><strong>{orgMachines.length}</strong></article>
          <article className="production-kpi-card"><span>Open tickets</span><strong>{openTicketCount}</strong></article>
          <article className="production-kpi-card"><span>Overdue PM plans</span><strong>{overduePlans}</strong></article>
          <article className="production-kpi-card"><span>Downtime logged</span><strong>{downtimeMinutes.toLocaleString("en-KE")} min</strong></article>
        </div>
        <h3>Register a machine</h3>
        <form
          className="production-reel-form production-maintenance-form production-maintenance-register-form"
          onSubmit={createMachine}
        >
          <label><span>Asset number</span><input name="machineNo" required maxLength={60} /></label>
          <label><span>Machine name</span><input name="name" required maxLength={120} /></label>
          <label><span>Machine type</span><input name="machineType" placeholder="Corrugator, flexo, die-cutter…" required maxLength={80} /></label>
          <label><span>Work center</span><input name="workCenter" placeholder="Match the production schedule work center" required maxLength={80} /></label>
          <label><span>Plant / location</span><input name="location" maxLength={120} /></label>
          <button className="production-primary-button" disabled={!workspaceId} type="submit">Register machine</button>
        </form>

        <h3>Machine register</h3>
        {orgMachines.length ? (
          <div className="production-machine-register-grid">
            {orgMachines.map((machine) => (
              <article className="production-machine-register-card" key={machine.id}>
                <div className="production-machine-register-heading">
                  <div>
                    <span className="production-panel-kicker">{machine.machineType}</span>
                    <h4>{machine.name}</h4>
                    <p>{machine.machineNo}</p>
                  </div>
                  <span className={`production-machine-status status-${machine.status.toLowerCase()}`}>
                    {machine.status}
                  </span>
                </div>
                <dl className="production-machine-register-details">
                  <div>
                    <dt>Work center</dt>
                    <dd>{machine.workCenter}</dd>
                  </div>
                  <div>
                    <dt>Plant / location</dt>
                    <dd>{machine.location || "Not set"}</dd>
                  </div>
                </dl>
                {machine.status === "MAINTENANCE" ? (
                  <p className="production-machine-maintenance-note">
                    Status is managed by the active maintenance ticket.
                  </p>
                ) : (
                  <form
                    className="production-maintenance-machine-form"
                    key={`${machine.id}:${machine.status}:${machine.location}`}
                    onSubmit={(event) => updateMachine(event, machine)}
                  >
                    <label>
                      <span>Machine status</span>
                      <select name="status" defaultValue={machine.status}>
                        <option value="ACTIVE">Active</option>
                        <option value="RETIRED">Retired</option>
                      </select>
                    </label>
                    <label>
                      <span>Plant / location</span>
                      <input name="location" defaultValue={machine.location} maxLength={120} />
                    </label>
                    <button className="production-table-action" type="submit">Save changes</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : <p className="production-chart-empty">No machine assets registered.</p>}

        <h3>Preventive maintenance schedule</h3>
        <form className="production-reel-form production-maintenance-form" onSubmit={createPlan}>
          <label>
            <span>Machine</span>
            <select name="machineId" required defaultValue="">
              <option value="" disabled>Select machine</option>
              {orgMachines.filter((machine) => machine.status !== "RETIRED").map((machine) => (
                <option key={machine.id} value={machine.id}>{machine.machineNo} · {machine.name}</option>
              ))}
            </select>
          </label>
          <label><span>Maintenance task</span><input name="taskName" required maxLength={160} /></label>
          <label><span>Interval (days)</span><input name="intervalDays" type="number" min="1" max="3650" required /></label>
          <label><span>Next due</span><input name="nextDueAt" type="date" required /></label>
          <label><span>Work instructions</span><input name="instructions" maxLength={1000} /></label>
          <button className="production-primary-button" disabled={!orgMachines.length} type="submit">Add PM plan</button>
        </form>

        <h3>Open maintenance ticket</h3>
        <form className="production-reel-form production-maintenance-form" onSubmit={createTicket}>
          <label>
            <span>Machine</span>
            <select name="machineId" required defaultValue="">
              <option value="" disabled>Select machine</option>
              {orgMachines.filter((machine) => machine.status !== "RETIRED").map((machine) => (
                <option key={machine.id} value={machine.id}>{machine.machineNo} · {machine.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ticket type</span>
            <select name="ticketType" defaultValue={PRODUCTION_MAINTENANCE_TICKET_TYPES[0]}>
              {PRODUCTION_MAINTENANCE_TICKET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <span>Preventive plan (for PREVENTIVE)</span>
            <select name="planId" defaultValue="">
              <option value="">Select preventive plan</option>
              {orgPlans.filter((plan) => plan.active).map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.machineNo} · {plan.taskName}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select name="priority" defaultValue="MEDIUM">
              {PRODUCTION_MAINTENANCE_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label><span>Initial downtime (minutes)</span><input name="downtimeMinutes" type="number" min="0" max="1000000" defaultValue="0" required /></label>
          <label><span>Problem / task details</span><input name="description" required maxLength={1000} /></label>
          <button className="production-primary-button" disabled={!orgMachines.length} type="submit">Open ticket</button>
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">DUE DATE · FREQUENCY · MACHINE</span>
            <h2>Preventive plans</h2>
          </div>
          <span className="production-panel-total">{orgPlans.length} plans</span>
        </div>
        {orgPlans.length ? (
          <div className="production-table-scroll">
            <table className="production-data-table">
              <thead><tr><th>Machine</th><th>Task</th><th>Frequency</th><th>Last done</th><th>Next due</th><th>Status</th><th>Instructions</th><th>Action</th></tr></thead>
              <tbody>
                {orgPlans.map((plan) => {
                  const due = new Date(plan.nextDueAt);
                  const isOverdue = plan.active && due < today;
                  return (
                    <tr key={plan.id}>
                      <td><strong>{plan.machineNo}</strong><small>{plan.machineName}</small></td>
                      <td>{plan.taskName}</td>
                      <td>Every {plan.intervalDays} days</td>
                      <td>{plan.lastCompletedAt ? new Date(plan.lastCompletedAt).toLocaleDateString("en-KE") : "—"}</td>
                      <td>{due.toLocaleDateString("en-KE")}</td>
                      <td>{!plan.active ? "PAUSED" : isOverdue ? "OVERDUE" : "ACTIVE"}</td>
                      <td>{plan.instructions || "—"}</td>
                      <td>
                        <button className="production-table-action" onClick={() => setPlanActive(plan, !plan.active)} type="button">
                          {plan.active ? "Pause" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="production-chart-empty">No preventive maintenance plans yet.</p>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">BREAKDOWN · PREVENTIVE · SPARE-PARTS LEDGER</span>
            <h2>Maintenance tickets</h2>
          </div>
          <span className="production-panel-total">{orgTickets.length} tickets</span>
        </div>
        {orgTickets.length ? (
          <div className="production-maintenance-tickets">
            {orgTickets.map((ticket) => {
              const canUpdate = ticket.status === "OPEN" || ticket.status === "IN_PROGRESS";
              const nextStatuses = PRODUCTION_MAINTENANCE_TICKET_STATUSES.filter((next) =>
                isProductionMaintenanceTransitionAllowed(ticket.status, next as "IN_PROGRESS" | "COMPLETED" | "CANCELLED"),
              );
              return (
                <article className="production-maintenance-ticket" key={ticket.id}>
                  <div className="production-panel-heading">
                    <div>
                      <span className="production-panel-kicker">{ticket.ticketType} · {ticket.priority}</span>
                      <h3>{ticket.ticketNo} · {ticket.machineNo} · {ticket.machineName}</h3>
                    </div>
                    <span className={`production-schedule-status status-${ticket.status.toLowerCase()}`}>{ticket.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>{ticket.description}</p>
                  <div className="production-maintenance-meta">
                    <span>Downtime: {ticket.downtimeMinutes.toLocaleString("en-KE")} min</span>
                    {ticket.operation && <span>Operation: {ticket.operation}</span>}
                    {ticket.jobNo && <span>Job: {ticket.jobNo}</span>}
                    {ticket.planName && <span>PM task: {ticket.planName}</span>}
                    <span>Opened {new Date(ticket.openedAt).toLocaleString("en-KE")} by {ticket.createdByName}</span>
                  </div>
                  {ticket.resolution && <p><strong>Resolution:</strong> {ticket.resolution}</p>}
                  {ticket.parts.length > 0 && (
                    <ul className="production-tooling-events">
                      {ticket.parts.map((part) => (
                        <li key={part.id}>
                          <strong>{part.material.code} · {part.material.name} — {part.quantity} {part.material.unit}</strong>
                          <small>Issued {new Date(part.issuedAt).toLocaleString("en-KE")} by {part.issuedByName}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canUpdate && (
                    <>
                      <form
                        className="production-reel-form production-maintenance-update-form"
                        key={`${ticket.id}:${ticket.status}:${ticket.downtimeMinutes}`}
                        onSubmit={(event) => updateTicket(event, ticket)}
                      >
                        <label>
                          <span>Next status</span>
                          <select name="status" defaultValue={nextStatuses[0]}>
                            {nextStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </label>
                        <label><span>Downtime total (minutes)</span><input name="downtimeMinutes" type="number" min="0" max="1000000" defaultValue={String(ticket.downtimeMinutes)} required /></label>
                        <label><span>Resolution / cancellation reason</span><input name="resolution" maxLength={1000} defaultValue={ticket.resolution} /></label>
                        <button className="production-primary-button" type="submit">Update ticket</button>
                      </form>
                      <form className="production-reel-form production-maintenance-parts-form" onSubmit={(event) => issuePart(event, ticket)}>
                        <label>
                          <span>Issue spare part (non-paper inventory)</span>
                          <select name="materialId" required defaultValue="">
                            <option value="" disabled>Select material</option>
                            {orgMaterials.map((material) => (
                              <option key={material.id} value={material.id}>
                                {material.code} · {material.name} · on hand {material.onHand} {material.unit}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label><span>Quantity</span><input name="quantity" type="number" min="0.001" step="0.001" required /></label>
                        <button className="production-table-action" type="submit" disabled={!orgMaterials.length}>Issue part</button>
                      </form>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        ) : <p className="production-chart-empty">No maintenance tickets recorded.</p>}
      </section>
    </div>
  );
}

function ToolingManagementBoard({
  workspaces,
  tooling,
  customers,
  jobs,
  onSaved,
  preferredWorkspaceId,
}: {
  workspaces: ProductionDashboardWorkspace[];
  tooling: ProductionDashboardTooling[];
  customers: ProductionDashboardCustomer[];
  jobs: ProductionDashboardJob[];
  onSaved: () => void;
  preferredWorkspaceId: string;
}) {
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const [ownerType, setOwnerType] = useState<(typeof PRODUCTION_TOOLING_OWNERS)[number]>("COMPANY");
  const [status, setStatus] = useState("");
  const workspaceTooling = tooling.filter((tool) => tool.workspaceId === workspaceId);
  const workspaceJobs = jobs.filter((job) => job.workspaceId === workspaceId);

  const createTool = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/tooling`,
        {
          method: "POST",
          body: JSON.stringify({
            toolNo: String(data.get("toolNo") ?? ""),
            name: String(data.get("name") ?? ""),
            category: String(data.get("category") ?? ""),
            ownerType,
            customerId: ownerType === "CUSTOMER" ? String(data.get("customerId") ?? "") : "",
            storageLocation: String(data.get("storageLocation") ?? ""),
            wearNotes: String(data.get("wearNotes") ?? ""),
            notes: String(data.get("notes") ?? ""),
          }),
        },
      );
      form.reset();
      setOwnerType("COMPANY");
      notifyToast("Tooling record created.");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create tooling record.");
    }
  };

  const updateTool = async (event: FormEvent<HTMLFormElement>, tool: ProductionDashboardTooling) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/tooling/${encodeURIComponent(tool.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: String(data.get("status") ?? ""),
            storageLocation: String(data.get("storageLocation") ?? ""),
            wearNotes: String(data.get("wearNotes") ?? ""),
            notes: String(data.get("notes") ?? ""),
          }),
        },
      );
      notifyToast(`${tool.toolNo} updated.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update tooling record.");
    }
  };

  const recordToolEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const toolingId = String(data.get("toolingId") ?? "");
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/tooling/${encodeURIComponent(toolingId)}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            eventType: String(data.get("eventType") ?? ""),
            description: String(data.get("description") ?? ""),
            jobId: String(data.get("jobId") ?? ""),
          }),
        },
      );
      form.reset();
      notifyToast("Tooling history recorded.");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not record tooling history.");
    }
  };

  return (
    <div className="production-board-stack">
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">DIES · PLATES · CYLINDERS · ANILOX</span>
            <h2>Tooling register</h2>
          </div>
          <label>
            <span className="sr-only">Production workspace</span>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
        </div>
        <form className="production-reel-form production-tooling-entry-form" onSubmit={createTool}>
          <label><span>Tool number</span><input name="toolNo" required maxLength={60} /></label>
          <label><span>Name / description</span><input name="name" required maxLength={120} /></label>
          <label>
            <span>Tool type</span>
            <select name="category" defaultValue={PRODUCTION_TOOLING_CATEGORIES[0]}>
              {PRODUCTION_TOOLING_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ownership</span>
            <select
              value={ownerType}
              onChange={(event) => {
                if (PRODUCTION_TOOLING_OWNERS.includes(event.target.value as typeof ownerType)) {
                  setOwnerType(event.target.value as typeof ownerType);
                }
              }}
            >
              {PRODUCTION_TOOLING_OWNERS.map((owner) => (
                <option key={owner} value={owner}>{owner === "COMPANY" ? "Company-owned" : "Customer-owned"}</option>
              ))}
            </select>
          </label>
          {ownerType === "CUSTOMER" && (
            <label>
              <span>Customer</span>
              <select name="customerId" required defaultValue="">
                <option value="" disabled>Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
          )}
          <label><span>Storage location</span><input name="storageLocation" maxLength={120} /></label>
          <label><span>Wear / condition notes</span><input name="wearNotes" maxLength={500} /></label>
          <label><span>Additional notes</span><input name="notes" maxLength={500} /></label>
          <button className="production-primary-button" disabled={!workspaceId} type="submit">Register tool</button>
        </form>
        <form className="production-reel-form production-tooling-event-form" onSubmit={recordToolEvent}>
          <label>
            <span>Tool history</span>
            <select name="toolingId" required defaultValue="">
              <option value="" disabled>Select tool</option>
              {workspaceTooling.map((tool) => (
                <option key={tool.id} value={tool.id}>{tool.toolNo} · {tool.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>History type</span>
            <select name="eventType" defaultValue="USAGE">
              {PRODUCTION_TOOLING_EVENT_TYPES.filter((type) => type !== "STATUS_CHANGE").map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Job (required for usage)</span>
            <select name="jobId" defaultValue="">
              <option value="">No job reference</option>
              {workspaceJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.jobNo} · {job.jobName}</option>
              ))}
            </select>
          </label>
          <label><span>Work performed / details</span><input name="description" required maxLength={500} /></label>
          <button className="production-primary-button" disabled={!workspaceId} type="submit">Record history</button>
        </form>
        {status && <p className="production-status" role="status">{status}</p>}
      </section>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">OWNERSHIP · CONDITION · USAGE HISTORY</span>
            <h2>Registered tooling</h2>
          </div>
          <span className="production-panel-total">{workspaceTooling.length} tools</span>
        </div>
        {workspaceTooling.length ? (
          <div className="production-tooling-grid">
            {workspaceTooling.map((tool) => (
              <article className="production-tooling-card" key={tool.id}>
                <div className="production-panel-heading">
                  <div>
                    <span className="production-panel-kicker">{tool.category.replaceAll("_", " ")}</span>
                    <h3>{tool.toolNo} · {tool.name}</h3>
                  </div>
                  <span className={`production-workflow-badge ${tool.status === "AVAILABLE" ? "is-complete" : ""}`}>
                    {tool.status}
                  </span>
                </div>
                <dl>
                  <div><dt>Owner</dt><dd>{tool.ownerType === "CUSTOMER" ? tool.customerName ?? "Customer" : "Company"}</dd></div>
                  <div><dt>Location</dt><dd>{tool.storageLocation || "Not recorded"}</dd></div>
                  <div><dt>Usage count</dt><dd>{tool.usageCount.toLocaleString("en-KE")}</dd></div>
                  <div><dt>Condition</dt><dd>{tool.wearNotes || "No wear notes"}</dd></div>
                </dl>
                <form className="production-reel-form" onSubmit={(event) => updateTool(event, tool)}>
                  <label>
                    <span>Status</span>
                    <select name="status" defaultValue={tool.status}>
                      {PRODUCTION_TOOLING_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label><span>Location</span><input name="storageLocation" defaultValue={tool.storageLocation} maxLength={120} /></label>
                  <label><span>Wear notes</span><input name="wearNotes" defaultValue={tool.wearNotes} maxLength={500} /></label>
                  <label><span>Notes</span><input name="notes" defaultValue={tool.notes} maxLength={500} /></label>
                  <button className="production-table-action" type="submit">Save tool details</button>
                </form>
                <h4>Recent history</h4>
                {tool.events.length ? (
                  <ul className="production-tooling-events">
                    {tool.events.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.eventType}</strong>
                        <span>{entry.description}</span>
                        <small>
                          {entry.jobNo ? `${entry.jobNo} · ` : ""}
                          {entry.createdByName} · {new Date(entry.createdAt).toLocaleString("en-KE")}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : <p className="production-chart-empty">No usage or maintenance history recorded.</p>}
              </article>
            ))}
          </div>
        ) : <p className="production-chart-empty">No tooling has been registered for this workspace.</p>}
      </section>
    </div>
  );
}

function ProductionInvoiceBoard({
  workspaces,
  dispatches,
  invoices,
  preferredWorkspaceId,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  dispatches: ProductionDashboardDispatch[];
  invoices: ProductionDashboardInvoice[];
  preferredWorkspaceId: string;
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(preferredWorkspaceId);
  const [selectedDispatchId, setSelectedDispatchId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [manualUnitPrice, setManualUnitPrice] = useState("");
  const [manualCurrency, setManualCurrency] = useState<(typeof PRODUCTION_INVOICE_CURRENCIES)[number]>("KES");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [editor, setEditor] = useState<{ invoiceId: string; mode: "payment" | "credit" } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "BANK_TRANSFER" as (typeof PRODUCTION_PAYMENT_METHODS)[number],
    reference: "",
    notes: "",
    paidAt: dateKey(new Date()),
  });
  const [creditForm, setCreditForm] = useState({ amount: "", reason: "", notes: "" });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const workspaceDispatches = dispatches.filter(
    (dispatch) => dispatch.workspaceId === workspaceId,
  );
  const workspaceInvoices = invoices.filter(
    (invoice) => invoice.workspaceId === workspaceId,
  );
  const invoicedDispatchIds = new Set(workspaceInvoices.map((invoice) => invoice.dispatchId));
  const deliveredDispatches = workspaceDispatches.filter(
    (dispatch) => dispatch.status === "DELIVERED" && !invoicedDispatchIds.has(dispatch.id),
  );
  const selectedDispatch = deliveredDispatches.find(
    (dispatch) => dispatch.id === selectedDispatchId,
  );
  const customers = Array.from(new Set(workspaceInvoices.map((invoice) => invoice.customerName)))
    .sort((left, right) => left.localeCompare(right));
  const statementInvoices = workspaceInvoices
    .filter((invoice) => customerFilter === "all" || invoice.customerName === customerFilter)
    .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
  const selectedInvoice = workspaceInvoices.find((invoice) => invoice.id === selectedInvoiceId);

  const changeWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setSelectedDispatchId("");
    setDueDate("");
    setManualUnitPrice("");
    setCustomerFilter("all");
    setEditor(null);
    setSelectedInvoiceId("");
    setStatus("");
    setHasError(false);
  };

  const changeDispatch = (dispatchId: string) => {
    const dispatch = deliveredDispatches.find((candidate) => candidate.id === dispatchId);
    setSelectedDispatchId(dispatchId);
    setManualUnitPrice(dispatch?.quotedUnitPrice ?? "");
    setManualCurrency(
      dispatch?.quoteCurrency && isProductionInvoiceCurrency(dispatch.quoteCurrency)
        ? dispatch.quoteCurrency
        : "KES",
    );
  };

  const createInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDispatch) return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/invoices`,
        {
          method: "POST",
          body: JSON.stringify({
            dispatchId: selectedDispatch.id,
            dueDate,
            currency: selectedDispatch.quoteCurrency ?? manualCurrency,
            unitPrice: selectedDispatch.quotedUnitPrice ?? manualUnitPrice,
          }),
        },
      );
      const invoice = isRecord(result.invoice) ? result.invoice : null;
      notifyToast(
        typeof invoice?.invoiceNo === "string"
          ? `Invoice ${invoice.invoiceNo} issued.`
          : "Invoice issued.",
      );
      setSelectedDispatchId("");
      setDueDate("");
      setManualUnitPrice("");
      onSaved();
    } catch (error) {
      setStatus(`Could not issue invoice: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const openEditor = (invoice: ProductionDashboardInvoice, mode: "payment" | "credit") => {
    setEditor({ invoiceId: invoice.id, mode });
    setPaymentForm({
      amount: "",
      method: "BANK_TRANSFER",
      reference: "",
      notes: "",
      paidAt: dateKey(new Date()),
    });
    setCreditForm({ amount: "", reason: "", notes: "" });
    setStatus("");
    setHasError(false);
  };

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || editor.mode !== "payment") return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/invoices/${encodeURIComponent(editor.invoiceId)}/payments`,
        { method: "POST", body: JSON.stringify(paymentForm) },
      );
      notifyToast("Payment recorded against the invoice.");
      setEditor(null);
      onSaved();
    } catch (error) {
      setStatus(`Could not record payment: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const submitCreditNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || editor.mode !== "credit") return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/invoices/${encodeURIComponent(editor.invoiceId)}/credit-notes`,
        { method: "POST", body: JSON.stringify(creditForm) },
      );
      notifyToast("Credit note issued and applied to the invoice balance.");
      setEditor(null);
      onSaved();
    } catch (error) {
      setStatus(`Could not issue credit note: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const printInvoice = () => {
    document.body.dataset.printTarget = "invoice";
    window.print();
  };

  const customerBalances = Array.from(new Set(statementInvoices.map((invoice) => invoice.currency)))
    .sort()
    .map((currency) => {
      const invoicesInCurrency = statementInvoices.filter((invoice) => invoice.currency === currency);
      const bucketAmount = (predicate: (daysOverdue: number) => boolean) =>
        invoicesInCurrency.reduce((total, invoice) => {
          const balance = Number(invoice.totalAmount) -
            Number(invoice.amountPaid) -
            Number(invoice.amountCredited);
          if (balance <= 0) return total;
          const daysOverdue = Math.max(
            0,
            Math.floor((Date.now() - new Date(`${invoice.dueAt.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000),
          );
          return predicate(daysOverdue) ? total + balance : total;
        }, 0);
      return {
        currency,
        current: bucketAmount((days) => days === 0),
        days1To30: bucketAmount((days) => days >= 1 && days <= 30),
        days31To60: bucketAmount((days) => days >= 31 && days <= 60),
        days61To90: bucketAmount((days) => days >= 61 && days <= 90),
        daysOver90: bucketAmount((days) => days > 90),
      };
    });

  return (
    <div className="production-invoice-board">
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">ACCOUNTS RECEIVABLE</span>
            <h2>Issue a customer invoice</h2>
          </div>
          {workspaces.length > 1 && (
            <label className="production-workspace-filter">
              <span>Workspace</span>
              <select onChange={(event) => changeWorkspace(event.target.value)} value={workspaceId}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="production-invoice-disclaimer">
          Invoices are created from delivered dispatches and approved quote prices. Tax and eTIMS handling are not configured; verify requirements before using these as statutory tax invoices.
        </p>
        <form className="production-reel-form" onSubmit={createInvoice}>
          <div className="production-invoice-form-grid">
            <label className="production-order-booking-field">
              <span>Delivered dispatch</span>
              <select
                onChange={(event) => changeDispatch(event.target.value)}
                required
                value={selectedDispatchId}
              >
                <option value="">Select an uninvoiced delivery</option>
                {deliveredDispatches.map((dispatch) => (
                  <option key={dispatch.id} value={dispatch.id}>
                    {dispatch.deliveryNoteNo} · {dispatch.jobNo} · {dispatch.customer}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              <span>Due date</span>
              <input onChange={(event) => setDueDate(event.target.value)} required type="date" value={dueDate} />
            </label>
            {selectedDispatch?.quotedUnitPrice ? (
              <div className="production-invoice-rate">
                <span>Approved quote rate</span>
                <strong>
                  {formatInvoiceUnitPrice(selectedDispatch.quotedUnitPrice, selectedDispatch.quoteCurrency ?? "KES")} / unit
                </strong>
              </div>
            ) : (
              <>
                <label className="production-order-booking-field">
                  <span>Unit price (required when no quote price is available)</span>
                  <input
                    min="0.0001"
                    onChange={(event) => setManualUnitPrice(event.target.value)}
                    required
                    step="0.0001"
                    type="number"
                    value={manualUnitPrice}
                  />
                </label>
                <label className="production-order-booking-field">
                  <span>Currency</span>
                  <select
                    onChange={(event) => {
                      const currency = event.target.value;
                      if (isProductionInvoiceCurrency(currency)) {
                        setManualCurrency(currency);
                      }
                    }}
                    value={manualCurrency}
                  >
                    {PRODUCTION_INVOICE_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {selectedDispatch && (
            <p className="production-reel-stock-note">
              {selectedDispatch.jobNo} · {selectedDispatch.customer} · {selectedDispatch.lines.reduce((total, line) => total + line.quantity, 0).toLocaleString("en-KE")} delivered units
              {selectedDispatch.quotedUnitPrice
                ? " · Invoice rate will use the converted quote snapshot."
                : " · Enter the agreed unit rate; this value will be stored as the invoice price snapshot."}
            </p>
          )}
          <div className="production-supply-form-actions">
            <span>Each delivered dispatch can be invoiced once; partial deliveries are invoiced separately.</span>
            <button className="production-primary-button" disabled={isSaving || !deliveredDispatches.length} type="submit">
              {isSaving ? "Issuing…" : "Issue invoice"}
            </button>
          </div>
        </form>
        {status && <p className="production-quote-message" role={hasError ? "alert" : "status"}>{status}</p>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">CUSTOMER STATEMENT & AGING</span>
            <h2>{customerFilter === "all" ? "All customer balances" : customerFilter}</h2>
          </div>
          <label className="production-workspace-filter">
            <span>Customer statement</span>
            <select onChange={(event) => setCustomerFilter(event.target.value)} value={customerFilter}>
              <option value="all">All customers</option>
              {customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
            </select>
          </label>
        </div>
        {customerBalances.length ? (
          <div className="production-invoice-aging-grid">
            {customerBalances.map((balance) => (
              <article className="production-invoice-aging-card" key={balance.currency}>
                <strong>{balance.currency} aging</strong>
                <span>Current · {formatQuoteAmount(String(balance.current), balance.currency)}</span>
                <span>1–30 days · {formatQuoteAmount(String(balance.days1To30), balance.currency)}</span>
                <span>31–60 days · {formatQuoteAmount(String(balance.days31To60), balance.currency)}</span>
                <span>61–90 days · {formatQuoteAmount(String(balance.days61To90), balance.currency)}</span>
                <span>Over 90 days · {formatQuoteAmount(String(balance.daysOver90), balance.currency)}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="production-chart-empty">Customer statements and aging will appear when invoices are issued.</p>
        )}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">INVOICE REGISTER</span>
            <h2>{customerFilter === "all" ? "Invoices and collections" : `Statement · ${customerFilter}`}</h2>
          </div>
          <span className="production-panel-total">{statementInvoices.length} invoices</span>
        </div>
        {statementInvoices.length ? (
          <div className="production-invoice-list">
            {statementInvoices.map((invoice) => {
              const balance = Math.max(
                0,
                Number(invoice.totalAmount) - Number(invoice.amountPaid) - Number(invoice.amountCredited),
              );
              return (
                <article className="production-invoice-card" key={invoice.id}>
                  <div className="production-warehouse-dispatch-heading">
                    <div>
                      <strong>{invoice.invoiceNo} · {invoice.customerName}</strong>
                      <span>{invoice.jobNo} · {invoice.jobName} · {invoice.deliveryNoteNo}</span>
                    </div>
                    <span className={`production-schedule-status${invoice.status === "PAID" || invoice.status === "CREDITED" ? " status-completed" : ""}`}>
                      {invoice.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="production-invoice-amount-grid">
                    <div><span>Issued / due</span><strong>{new Date(invoice.issuedAt).toLocaleDateString("en-KE")} / {new Date(invoice.dueAt).toLocaleDateString("en-KE")}</strong></div>
                    <div><span>Delivered quantity</span><strong>{invoice.quantity.toLocaleString("en-KE")} units</strong></div>
                    <div><span>Invoice total</span><strong>{formatQuoteAmount(invoice.totalAmount, invoice.currency)}</strong></div>
                    <div><span>Collected</span><strong>{formatQuoteAmount(invoice.amountPaid, invoice.currency)}</strong></div>
                    <div><span>Credited</span><strong>{formatQuoteAmount(invoice.amountCredited, invoice.currency)}</strong></div>
                    <div><span>Balance due</span><strong>{formatQuoteAmount(String(balance), invoice.currency)}</strong></div>
                  </div>
                  {invoice.customerPO && <p className="production-invoice-reference">Customer PO: {invoice.customerPO}</p>}
                  {(invoice.payments.length > 0 || invoice.creditNotes.length > 0) && (
                    <details className="production-invoice-transactions">
                      <summary>{invoice.payments.length} payments · {invoice.creditNotes.length} credit notes</summary>
                      <ul>
                        {invoice.payments.map((payment) => (
                          <li key={payment.paymentNo}>
                            {payment.paymentNo} · {payment.method.replaceAll("_", " ")} · {formatQuoteAmount(payment.amount, invoice.currency)} · {new Date(payment.paidAt).toLocaleDateString("en-KE")}
                            {payment.reference && ` · ${payment.reference}`}
                          </li>
                        ))}
                        {invoice.creditNotes.map((credit) => (
                          <li key={credit.creditNoteNo}>
                            {credit.creditNoteNo} · credit {formatQuoteAmount(credit.amount, invoice.currency)} · {credit.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="production-warehouse-dispatch-actions">
                    <button className="production-table-action" onClick={() => setSelectedInvoiceId(invoice.id)} type="button">
                      View / print invoice
                    </button>
                    {balance > 0 && (
                      <>
                        <button className="production-table-action" onClick={() => openEditor(invoice, "payment")} type="button">
                          Record payment
                        </button>
                        <button className="production-table-action" onClick={() => openEditor(invoice, "credit")} type="button">
                          Issue credit note
                        </button>
                      </>
                    )}
                  </div>
                  {editor?.invoiceId === invoice.id && (
                    editor.mode === "payment" ? (
                      <form className="production-invoice-adjustment-form" onSubmit={submitPayment}>
                        <label className="production-order-booking-field">
                          <span>Payment amount ({invoice.currency})</span>
                          <input min="0.01" onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} required step="0.01" type="number" value={paymentForm.amount} />
                        </label>
                        <label className="production-order-booking-field">
                          <span>Method</span>
                          <select
                            onChange={(event) => {
                              const method = event.target.value;
                              if (isProductionPaymentMethod(method)) {
                                setPaymentForm((current) => ({ ...current, method }));
                              }
                            }}
                            value={paymentForm.method}
                          >
                            {PRODUCTION_PAYMENT_METHODS.map((method) => (
                              <option key={method} value={method}>{method.replaceAll("_", " ")}</option>
                            ))}
                          </select>
                        </label>
                        <label className="production-order-booking-field">
                          <span>Payment date</span>
                          <input onChange={(event) => setPaymentForm((current) => ({ ...current, paidAt: event.target.value }))} required type="date" value={paymentForm.paidAt} />
                        </label>
                        <label className="production-order-booking-field">
                          <span>Reference</span>
                          <input maxLength={120} onChange={(event) => setPaymentForm((current) => ({ ...current, reference: event.target.value }))} value={paymentForm.reference} />
                        </label>
                        <label className="production-order-booking-field">
                          <span>Notes</span>
                          <input maxLength={500} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} value={paymentForm.notes} />
                        </label>
                        <div className="production-supply-form-actions">
                          <button className="production-table-action" onClick={() => setEditor(null)} type="button">Cancel</button>
                          <button className="production-primary-button" disabled={isSaving} type="submit">{isSaving ? "Saving…" : "Save payment"}</button>
                        </div>
                      </form>
                    ) : (
                      <form className="production-invoice-adjustment-form" onSubmit={submitCreditNote}>
                        <label className="production-order-booking-field">
                          <span>Credit amount ({invoice.currency})</span>
                          <input min="0.01" onChange={(event) => setCreditForm((current) => ({ ...current, amount: event.target.value }))} required step="0.01" type="number" value={creditForm.amount} />
                        </label>
                        <label className="production-order-booking-field">
                          <span>Reason</span>
                          <input maxLength={500} onChange={(event) => setCreditForm((current) => ({ ...current, reason: event.target.value }))} required value={creditForm.reason} />
                        </label>
                        <label className="production-order-booking-field">
                          <span>Notes</span>
                          <input maxLength={500} onChange={(event) => setCreditForm((current) => ({ ...current, notes: event.target.value }))} value={creditForm.notes} />
                        </label>
                        <div className="production-supply-form-actions">
                          <button className="production-table-action" onClick={() => setEditor(null)} type="button">Cancel</button>
                          <button className="production-primary-button" disabled={isSaving} type="submit">{isSaving ? "Saving…" : "Issue credit note"}</button>
                        </div>
                      </form>
                    )
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiDollarSign /></span>
            <h3>No invoices for this statement</h3>
            <p>Delivered orders can be invoiced above; payment and credit activity will appear in the customer statement.</p>
          </div>
        )}
      </section>

      {selectedInvoice && (
        <section className="production-print-invoice">
          <div className="production-delivery-note-heading">
            <div>
              <span>PACKSTUDIO · CUSTOMER INVOICE</span>
              <h2>{selectedInvoice.invoiceNo}</h2>
            </div>
            <button className="production-primary-button production-no-print" onClick={printInvoice} type="button">
              Print invoice
            </button>
          </div>
          <dl className="production-delivery-note-details">
            <div><dt>Customer</dt><dd>{selectedInvoice.customerName}</dd></div>
            <div><dt>Job</dt><dd>{selectedInvoice.jobNo} · {selectedInvoice.jobName}</dd></div>
            <div><dt>Customer PO</dt><dd>{selectedInvoice.customerPO || "—"}</dd></div>
            <div><dt>Issue date</dt><dd>{new Date(selectedInvoice.issuedAt).toLocaleDateString("en-KE")}</dd></div>
            <div><dt>Due date</dt><dd>{new Date(selectedInvoice.dueAt).toLocaleDateString("en-KE")}</dd></div>
            <div><dt>Delivery note</dt><dd>{selectedInvoice.deliveryNoteNo}</dd></div>
          </dl>
          <table className="production-delivery-note-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
            <tbody>
              <tr>
                <td>Carton order · {selectedInvoice.jobName}</td>
                <td>{selectedInvoice.quantity.toLocaleString("en-KE")}</td>
                <td>{formatInvoiceUnitPrice(selectedInvoice.unitPrice, selectedInvoice.currency)}</td>
                <td>{formatQuoteAmount(selectedInvoice.totalAmount, selectedInvoice.currency)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><th colSpan={3}>Invoice total (tax treatment not configured)</th><th>{formatQuoteAmount(selectedInvoice.totalAmount, selectedInvoice.currency)}</th></tr>
              <tr><th colSpan={3}>Payments / credits</th><th>{formatQuoteAmount(String(Number(selectedInvoice.amountPaid) + Number(selectedInvoice.amountCredited)), selectedInvoice.currency)}</th></tr>
              <tr><th colSpan={3}>Balance due</th><th>{formatQuoteAmount(String(Number(selectedInvoice.totalAmount) - Number(selectedInvoice.amountPaid) - Number(selectedInvoice.amountCredited)), selectedInvoice.currency)}</th></tr>
            </tfoot>
          </table>
          <p className="production-invoice-disclaimer">
            Operational invoice record only. VAT and KRA eTIMS requirements have not been configured or verified.
          </p>
        </section>
      )}
    </div>
  );
}

function ProductionQuotesBoard({
  workspaces,
  preferredWorkspaceId,
  quotes,
  isAdmin,
  onSaved,
}: {
  workspaces: ProductionDashboardWorkspace[];
  preferredWorkspaceId: string;
  quotes: ProductionDashboardQuote[];
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(
    preferredWorkspaceId || workspaces[0]?.id || "",
  );
  const [form, setForm] = useState<QuoteFormState>(() => ({
    customerId: "",
    currency: "KES",
    validUntil: dateAfterDays(30),
    inquiryReference: "",
    notes: "",
    lines: [emptyQuoteLine()],
  }));
  const [revisionOf, setRevisionOf] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [items, setItems] = useState<ProductionDashboardItem[]>([]);
  const [customers, setCustomers] = useState<ProductionDashboardCustomerSummary[]>([]);
  const [catalogLoadedWorkspaceId, setCatalogLoadedWorkspaceId] = useState("");
  const [catalogRefreshCount, setCatalogRefreshCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [actionQuoteId, setActionQuoteId] = useState<string | null>(null);
  const [rejectQuoteId, setRejectQuoteId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [conversionQuoteId, setConversionQuoteId] = useState<string | null>(null);
  const [conversionForm, setConversionForm] = useState({
    customerPO: "",
    orderDate: dateKey(new Date()),
    deliveryDate: dateAfterDays(30),
  });
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const isLoadingCatalog = Boolean(
    workspaceId && catalogLoadedWorkspaceId !== workspaceId,
  );

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    requestProductionJson(
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/quotes?catalog=true`,
      { method: "GET" },
    )
      .then((catalog) => {
        if (!active) return;
        if (!Array.isArray(catalog.items) || !Array.isArray(catalog.customers)) {
          throw new Error("The server returned an invalid product or customer list.");
        }
        setItems(catalog.items.filter(isProductionDashboardItem));
        setCustomers(catalog.customers.filter(isProductionDashboardCustomerSummary));
        setCatalogLoadedWorkspaceId(workspaceId);
      })
      .catch((error) => {
        if (!active) return;
        setStatus(`Could not load quotation catalogs: ${error instanceof Error ? error.message : String(error)}`);
        setHasError(true);
        setCatalogLoadedWorkspaceId(workspaceId);
      })
    return () => {
      active = false;
    };
  }, [workspaceId, catalogRefreshCount]);

  const updateLine = (
    index: number,
    field: keyof ProductionQuoteLineInput,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  };

  const resetForm = () => {
    setForm({
      customerId: "",
      currency: "KES",
      validUntil: dateAfterDays(30),
      inquiryReference: "",
      notes: "",
      lines: [emptyQuoteLine()],
    });
    setRevisionOf(null);
    setIsFormOpen(false);
  };

  const submitQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId) return;
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/quotes`,
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            ...(revisionOf ? { revisionOf } : {}),
          }),
        },
      );
      notifyToast(revisionOf ? "Quote revision created as a new draft." : "Draft quote created.");
      setStatus("");
      resetForm();
      onSaved();
    } catch (error) {
      setStatus(`Could not save quote: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const updateQuote = async (
    quote: ProductionDashboardQuote,
    action: "SUBMIT" | "APPROVE" | "REJECT",
    reason = "",
  ) => {
    setActionQuoteId(quote.id);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(quote.workspaceId)}/quotes/${encodeURIComponent(quote.id)}`,
        { method: "PATCH", body: JSON.stringify({ action, reason }) },
      );
      notifyToast(
        action === "SUBMIT"
          ? "Quote submitted for approval."
          : action === "APPROVE"
            ? "Quote approved."
            : "Quote rejected.",
      );
      setRejectQuoteId(null);
      setRejectReason("");
      onSaved();
    } catch (error) {
      setStatus(`Could not update quote: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setActionQuoteId(null);
    }
  };

  const reviseQuote = (quote: ProductionDashboardQuote) => {
    if (quote.lines.some((line) => !line.itemId)) {
      setStatus("A revision needs each quoted product to still exist in the product catalog.");
      setHasError(true);
      return;
    }
    setWorkspaceId(quote.workspaceId);
    setRevisionOf(quote.id);
    setForm({
      customerId: quote.customer.id,
      currency: quote.currency as QuoteFormState["currency"],
      validUntil: quote.validUntil.slice(0, 10),
      inquiryReference: quote.inquiryReference,
      notes: quote.notes,
      lines: quote.lines.map((line) => ({
        itemId: line.itemId ?? "",
        quantity: String(line.quantity),
        boardAreaM2: line.boardAreaM2,
        boardGsm: line.boardGsm,
        paperCostPerKg: line.paperCostPerKg,
        trimWastePercent: line.trimWastePercent,
        conversionCost: line.conversionCost,
        consumablesCost: line.consumablesCost,
        marginPercent: line.marginPercent,
      })),
    });
    setIsFormOpen(true);
    notifyToast(`Preparing revision of ${quote.quoteNo} v${quote.version}.`, "info");
    setStatus("");
    setHasError(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const convertQuote = async (event: FormEvent<HTMLFormElement>, quote: ProductionDashboardQuote) => {
    event.preventDefault();
    setActionQuoteId(quote.id);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(quote.workspaceId)}/quotes/${encodeURIComponent(quote.id)}/convert`,
        { method: "POST", body: JSON.stringify(conversionForm) },
      );
      const jobCount = Array.isArray(result.jobs) ? result.jobs.length : 0;
      notifyToast(`${quote.quoteNo} converted into ${jobCount} order job${jobCount === 1 ? "" : "s"}.`);
      setConversionQuoteId(null);
      onSaved();
    } catch (error) {
      setStatus(`Could not convert quote: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setActionQuoteId(null);
    }
  };

  const previewTotals = form.lines.reduce(
    (total, line) => {
      const costs = calculateProductionQuoteLineCosts(line);
      return {
        cost: total.cost + Number(costs?.lineCostTotal ?? 0),
        price: total.price + Number(costs?.linePriceTotal ?? 0),
      };
    },
    { cost: 0, price: 0 },
  );
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="production-quotes-board">
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">SALES & COSTING</span>
            <h2>Customer quotes</h2>
          </div>
          <button
            className="production-primary-button"
            disabled={!workspaceId || isLoadingCatalog}
            onClick={() => setIsFormOpen((open) => !open)}
            type="button"
          >
            {isFormOpen ? "Close quote form" : "Create quote"}
          </button>
        </div>
        {workspaces.length > 1 && (
          <label className="production-order-booking-field production-quote-workspace">
            <span>Quotation workspace</span>
            <select
              onChange={(event) => {
                setWorkspaceId(event.target.value);
                setItems([]);
                setCustomers([]);
                setCatalogLoadedWorkspaceId("");
                setForm((current) => ({ ...current, customerId: "", lines: [emptyQuoteLine()] }));
                setRevisionOf(null);
                setStatus("");
                setHasError(false);
              }}
              value={workspaceId}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
        )}
        {isFormOpen && (
          <form className="production-quote-form" onSubmit={submitQuote}>
            <div className="production-quote-form-heading">
              <div>
                <h3>{revisionOf ? "Create quote revision" : "New customer quotation"}</h3>
                <p>Enter the developed board area and actual paper rates; no carton-area dimensions are inferred.</p>
              </div>
              <span>{workspaces.find((workspace) => workspace.id === workspaceId)?.name}</span>
            </div>
            <div className="production-quote-header-grid">
              <label className="production-order-booking-field">
                <span>Customer</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
                  required
                  value={form.customerId}
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>
              <label className="production-order-booking-field">
                <span>Currency</span>
                <select
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currency: event.target.value as QuoteFormState["currency"] }))
                  }
                  value={form.currency}
                >
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
              <label className="production-order-booking-field">
                <span>Valid until</span>
                <input
                  min={todayKey}
                  onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
                  required
                  type="date"
                  value={form.validUntil}
                />
              </label>
              <label className="production-order-booking-field">
                <span>Inquiry / RFQ reference</span>
                <input
                  maxLength={80}
                  onChange={(event) => setForm((current) => ({ ...current, inquiryReference: event.target.value }))}
                  value={form.inquiryReference}
                />
              </label>
              <label className="production-order-booking-field production-quote-notes">
                <span>Requirements / notes</span>
                <textarea
                  maxLength={2000}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  value={form.notes}
                />
              </label>
            </div>
            <div className="production-quote-lines">
              <div className="production-quote-lines-heading">
                <h3>Costed products</h3>
                <button
                  className="production-table-action"
                  onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, emptyQuoteLine()] }))}
                  type="button"
                >
                  Add product line
                </button>
              </div>
              {form.lines.map((line, index) => {
                const costs = calculateProductionQuoteLineCosts(line);
                return (
                  <fieldset className="production-quote-line" key={`${index}-${line.itemId}`}>
                    <legend>Product {index + 1}</legend>
                    <div className="production-quote-line-grid">
                      <label className="production-order-booking-field">
                        <span>Product</span>
                        <select
                          onChange={(event) => updateLine(index, "itemId", event.target.value)}
                          required
                          value={line.itemId}
                        >
                          <option value="">Select an item</option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>{item.itemCode} · {item.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="production-order-booking-field">
                        <span>Quantity</span>
                        <input
                          min="1"
                          max="2147483647"
                          onChange={(event) => updateLine(index, "quantity", event.target.value)}
                          required
                          step="1"
                          type="number"
                          value={line.quantity}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Developed board area (m² / unit)</span>
                        <input
                          min="0.0001"
                          max="1000"
                          onChange={(event) => updateLine(index, "boardAreaM2", event.target.value)}
                          required
                          step="0.0001"
                          type="number"
                          value={line.boardAreaM2}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Board GSM</span>
                        <input
                          min="0.0001"
                          max="5000"
                          onChange={(event) => updateLine(index, "boardGsm", event.target.value)}
                          required
                          step="0.001"
                          type="number"
                          value={line.boardGsm}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Paper cost / kg ({form.currency})</span>
                        <input
                          min="0.0001"
                          max="1000000"
                          onChange={(event) => updateLine(index, "paperCostPerKg", event.target.value)}
                          required
                          step="0.0001"
                          type="number"
                          value={line.paperCostPerKg}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Trim waste (%)</span>
                        <input
                          min="0"
                          max="200"
                          onChange={(event) => updateLine(index, "trimWastePercent", event.target.value)}
                          required
                          step="0.001"
                          type="number"
                          value={line.trimWastePercent}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Conversion cost / unit ({form.currency})</span>
                        <input
                          min="0"
                          max="1000000"
                          onChange={(event) => updateLine(index, "conversionCost", event.target.value)}
                          required
                          step="0.0001"
                          type="number"
                          value={line.conversionCost}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Consumables / unit ({form.currency})</span>
                        <input
                          min="0"
                          max="1000000"
                          onChange={(event) => updateLine(index, "consumablesCost", event.target.value)}
                          required
                          step="0.0001"
                          type="number"
                          value={line.consumablesCost}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Gross margin (%)</span>
                        <input
                          min="0"
                          max="80"
                          onChange={(event) => updateLine(index, "marginPercent", event.target.value)}
                          required
                          step="0.001"
                          type="number"
                          value={line.marginPercent}
                        />
                      </label>
                    </div>
                    <div className="production-quote-line-summary">
                      {costs
                        ? <>Unit cost <strong>{formatQuoteAmount(costs.unitCost, form.currency)}</strong> · Quote price / unit <strong>{formatQuoteAmount(costs.unitPrice, form.currency)}</strong> · Line total <strong>{formatQuoteAmount(costs.linePriceTotal, form.currency)}</strong></>
                        : "Complete valid cost inputs to preview this line."}
                      {form.lines.length > 1 && (
                        <button
                          aria-label={`Remove product ${index + 1}`}
                          className="production-table-action"
                          onClick={() => setForm((current) => ({
                            ...current,
                            lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
                          }))}
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="production-quote-preview">
              <span>Estimated cost <strong>{formatQuoteAmount(previewTotals.cost, form.currency)}</strong></span>
              <span>Quote total <strong>{formatQuoteAmount(previewTotals.price, form.currency)}</strong></span>
            </div>
            <div className="production-supply-form-actions">
              <span>Material cost = area × GSM × paper rate, adjusted for trim waste; selling price uses gross margin.</span>
              <div>
                <button className="production-table-action" onClick={resetForm} type="button">Cancel</button>
                <button className="production-primary-button" disabled={isSaving || isLoadingCatalog} type="submit">
                  {isSaving ? "Saving…" : revisionOf ? "Save revision draft" : "Save draft quote"}
                </button>
              </div>
            </div>
          </form>
        )}

        {status && (
          <p className="production-quote-message" role={hasError ? "alert" : "status"}>
            {status}
            {status.startsWith("Could not load quotation catalogs:") && (
              <button
                className="production-table-action"
                onClick={() => {
                  setCatalogLoadedWorkspaceId("");
                  setCatalogRefreshCount((count) => count + 1);
                }}
                type="button"
              >
                Retry catalog load
              </button>
            )}
          </p>
        )}
        {!quotes.length ? (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiDollarSign /></span>
            <h3>No quotations yet</h3>
            <p>Create a costed quote using customer requirements and current paper rates.</p>
          </div>
        ) : (
          <div className="production-quote-list">
            {quotes.map((quote) => {
              const role = workspaces.find((workspace) => workspace.id === quote.workspaceId)?.role;
              const canApprove = isAdmin || hasProductionRole(role ?? "", "PRODUCTION");
              const canSubmit = isAdmin ||
                hasProductionRole(role ?? "", "ORDER_BOOKER") ||
                hasProductionRole(role ?? "", "PRODUCTION");
              const expired = quote.validUntil.slice(0, 10) < todayKey;
              const isExpired = expired && (quote.status === "SUBMITTED" || quote.status === "APPROVED");
              const displayStatus = isExpired ? "EXPIRED" : quote.status;
              return (
                <article className="production-quote-card" key={quote.id}>
                  <div className="production-quote-card-header">
                    <div>
                      <span className={`production-quote-status status-${displayStatus.toLowerCase()}`}>{displayStatus}</span>
                      <h3>{quote.quoteNo} <small>v{quote.version}</small></h3>
                      <p>{quote.customer.name} · {quote.workspaceName}</p>
                    </div>
                    <div className="production-quote-total">
                      <span>Quote total</span>
                      <strong>{formatQuoteAmount(quote.totalPrice, quote.currency)}</strong>
                      <small>Cost {formatQuoteAmount(quote.totalCost, quote.currency)}</small>
                    </div>
                  </div>
                  <div className="production-quote-meta">
                    <span>Valid until {formatDate(quote.validUntil.slice(0, 10))}</span>
                    <span>{quote.inquiryReference ? `RFQ ${quote.inquiryReference}` : "No RFQ reference"}</span>
                    <span>Prepared by {quote.createdByName}</span>
                    {quote.approvedAt && <span>Approved by {quote.approvedByName}</span>}
                  </div>
                  <div className="production-table-scroll">
                    <table className="production-jobs-table production-quote-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Carton / board spec</th>
                          <th className="production-number-cell">Qty</th>
                          <th className="production-number-cell">Unit cost</th>
                          <th className="production-number-cell">Unit price</th>
                          <th className="production-number-cell">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.lines.map((line) => (
                          <tr key={line.id}>
                            <td><strong>{line.itemCode}</strong><br />{line.itemName}</td>
                            <td>{quoteLineSpec(line)}</td>
                            <td className="production-number-cell">{line.quantity.toLocaleString("en-KE")}</td>
                            <td className="production-number-cell">{formatQuoteAmount(line.unitCost, quote.currency)}</td>
                            <td className="production-number-cell">{formatQuoteAmount(line.unitPrice, quote.currency)}</td>
                            <td className="production-number-cell">{formatQuoteAmount(line.linePriceTotal, quote.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {quote.notes && <p className="production-quote-notes-display">{quote.notes}</p>}
                  {quote.rejectionReason && <p className="production-quote-rejection">Rejection reason: {quote.rejectionReason}</p>}
                  <div className="production-quote-actions">
                    {quote.status === "DRAFT" && canSubmit && (
                      <button
                        className="production-table-action"
                        disabled={actionQuoteId === quote.id}
                        onClick={() => updateQuote(quote, "SUBMIT")}
                        type="button"
                      >
                        Submit for approval
                      </button>
                    )}
                    {quote.status === "SUBMITTED" && canApprove && !isExpired && (
                      <>
                        <button
                          className="production-table-action"
                          disabled={actionQuoteId === quote.id}
                          onClick={() => updateQuote(quote, "APPROVE")}
                          type="button"
                        >
                          Approve
                        </button>
                        <button
                          className="production-table-action"
                          onClick={() => {
                            setRejectQuoteId(rejectQuoteId === quote.id ? null : quote.id);
                            setRejectReason("");
                          }}
                          type="button"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {quote.status === "APPROVED" && !isExpired && (
                      <button
                        className="production-table-action"
                        onClick={() => {
                          setConversionQuoteId(conversionQuoteId === quote.id ? null : quote.id);
                          setConversionForm({
                            customerPO: "",
                            orderDate: dateKey(new Date()),
                            deliveryDate: dateAfterDays(30),
                          });
                        }}
                        type="button"
                      >
                        Convert to order
                      </button>
                    )}
                    {["DRAFT", "REJECTED", "APPROVED"].includes(quote.status) && (
                      <button
                        className="production-table-action"
                        onClick={() => reviseQuote(quote)}
                        type="button"
                      >
                        Create revision
                      </button>
                    )}
                  </div>
                  {rejectQuoteId === quote.id && (
                    <form
                      className="production-quote-inline-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void updateQuote(quote, "REJECT", rejectReason);
                      }}
                    >
                      <label className="production-order-booking-field">
                        <span>Reason for rejection</span>
                        <input
                          onChange={(event) => setRejectReason(event.target.value)}
                          required
                          value={rejectReason}
                        />
                      </label>
                      <button className="production-table-action" disabled={actionQuoteId === quote.id} type="submit">Confirm rejection</button>
                    </form>
                  )}
                  {conversionQuoteId === quote.id && (
                    <form className="production-quote-inline-form" onSubmit={(event) => void convertQuote(event, quote)}>
                      <label className="production-order-booking-field">
                        <span>Customer PO</span>
                        <input
                          maxLength={60}
                          onChange={(event) => setConversionForm((current) => ({ ...current, customerPO: event.target.value }))}
                          required
                          value={conversionForm.customerPO}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Order date</span>
                        <input
                          onChange={(event) => setConversionForm((current) => ({ ...current, orderDate: event.target.value }))}
                          required
                          type="date"
                          value={conversionForm.orderDate}
                        />
                      </label>
                      <label className="production-order-booking-field">
                        <span>Delivery date</span>
                        <input
                          min={conversionForm.orderDate}
                          onChange={(event) => setConversionForm((current) => ({ ...current, deliveryDate: event.target.value }))}
                          required
                          type="date"
                          value={conversionForm.deliveryDate}
                        />
                      </label>
                      <button className="production-table-action" disabled={actionQuoteId === quote.id} type="submit">
                        {actionQuoteId === quote.id ? "Creating orders…" : "Create order jobs"}
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ProductionJobSheetOperationSummary({
  schedules,
  emptyMessage,
}: {
  schedules: ProductionDashboardSchedule[];
  emptyMessage: string;
}) {
  if (!schedules.length) {
    return <p className="production-chart-empty">{emptyMessage}</p>;
  }

  return (
    <div className="production-job-sheet-operations">
      {schedules.map((schedule) => (
        <article className="production-job-sheet-operation" key={schedule.id}>
          <div className="production-job-sheet-operation-heading">
            <strong>{schedule.operation}</strong>
            <span className={`production-schedule-status status-${schedule.status.toLowerCase()}`}>
              {schedule.status.replaceAll("_", " ")}
            </span>
          </div>
          <div className="production-printing-details">
            {[
              ["Machine", schedule.machineLabel],
              ["Start", formatScheduleDate(schedule.scheduledStartAt)],
              ["End", formatScheduleDate(schedule.scheduledEndAt)],
              ["Planned quantity", schedule.plannedQty.toLocaleString("en-KE")],
              ["Good quantity", schedule.actualGoodQty.toLocaleString("en-KE")],
              ["Rejected quantity", schedule.actualRejectedQty.toLocaleString("en-KE")],
            ].map(([label, value]) => (
              <div className="production-printing-detail" key={label}>
                <span>{label}</span>
                <strong>{value || "—"}</strong>
              </div>
            ))}
          </div>
          {schedule.notes && <p>{schedule.notes}</p>}
        </article>
      ))}
    </div>
  );
}

function ProductionJobSheetFieldGrid({
  fields,
}: {
  fields: Array<[string, string]>;
}) {
  return (
    <div className="production-job-sheet-fields">
      {fields.map(([label, value]) => (
        <div className="production-job-sheet-field" key={label}>
          <span>{label}</span>
          <strong>{value || "—"}</strong>
        </div>
      ))}
    </div>
  );
}

function ProductionJobSheetArtworkPreviews({
  attachments,
}: {
  attachments: ProductionDashboardAttachment[];
}) {
  if (!attachments.length) {
    return (
      <p className="production-chart-empty">
        No artwork is attached to this job.
      </p>
    );
  }

  return (
    <div className="production-job-sheet-artwork-previews">
      {attachments.map((attachment, index) => {
        const fileUrl = `/api/production/artwork/${encodeURIComponent(attachment.id)}`;
        const isPdf = attachment.contentType === "application/pdf";
        const canPreviewImage = ["image/jpeg", "image/png", "image/svg+xml"]
          .includes(attachment.contentType);

        return (
          <div className="production-job-sheet-artwork-preview" key={attachment.id}>
            {isPdf ? (
              <ProductionArtworkPdfPreview
                downloadUrl={fileUrl}
                src={`${fileUrl}?preview=1`}
              />
            ) : canPreviewImage ? (
              <iframe
                loading="eager"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts"
                src={`${fileUrl}?preview=1`}
                title={`Attached artwork preview ${index + 1}`}
              />
            ) : (
              <p>
                Preview is not available for this file type.{" "}
                <a download href={fileUrl}>Download attached artwork</a>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ProductionDashboard({
  accountName,
  cartonTypes,
  workspaces,
  jobs,
  originationJobs: originationQueueJobs,
  schedules,
  operationRuns,
  qualityInspections,
  nonconformances,
  qualityMetrics,
  materials,
  suppliers,
  purchaseOrders,
  stockMovements,
  paperReels,
  reelMovements,
  warehousePallets,
  dispatches,
  invoices,
  tooling,
  customers,
  machines,
  maintenancePlans,
  maintenanceTickets,
  employees,
  rosterShifts,
  leaveRequests,
  safetyTrainings,
  quotes,
  isAdmin,
  canManageAccess,
  canManagePayroll,
}: Props) {
  const hasDesignerRole = !isAdmin &&
    workspaces.some((workspace) => hasProductionRole(workspace.role, "DESIGNER")) &&
    !workspaces.some((workspace) =>
      hasProductionRole(workspace.role, "PRODUCTION") ||
      hasProductionRole(workspace.role, "ORDER_BOOKER"),
    );
  const router = useRouter();
  const [view, setView] = useState<DashboardView>(
    hasDesignerRole ? "origination" : "overview",
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedNavGroup, setExpandedNavGroup] = useState<WorkspaceNavGroup | null>(
    hasDesignerRole ? "production" : "orders",
  );
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<ProductionDashboardJob | null>(null);
  const [artworkHistoryJob, setArtworkHistoryJob] = useState<ProductionDashboardJob | null>(null);
  const artworkUploadTriggers = useRef(new Map<string, () => void>());
  const registerArtworkUploadTrigger = useCallback((
    jobId: string,
    trigger: (() => void) | null,
  ) => {
    if (trigger) artworkUploadTriggers.current.set(jobId, trigger);
    else artworkUploadTriggers.current.delete(jobId);
  }, []);
  const uploadRevisionFromHistory = useCallback((job: ProductionDashboardJob) => {
    setArtworkHistoryJob(null);
    artworkUploadTriggers.current.get(job.id)?.();
  }, []);
  const [editingOriginationJob, setEditingOriginationJob] = useState<ProductionDashboardJob | null>(null);
  const handledJobDeepLink = useRef("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [jobsSearch, setJobsSearch] = useState("");
  const [jobsWorkflowStageFilter, setJobsWorkflowStageFilter] = useState("all");
  const [printingData, setPrintingData] = useState<Record<string, unknown> | null>(null);
  const [jobSheetData, setJobSheetData] = useState<Record<string, unknown> | null>(null);
  const [jobSheetAttachments, setJobSheetAttachments] = useState<ProductionDashboardAttachment[]>([]);
  const [jobSheetLoading, setJobSheetLoading] = useState(false);
  const [jobSheetError, setJobSheetError] = useState("");
  const [jobSheetShareStatus, setJobSheetShareStatus] = useState("");
  const [isSchedulingCorrugator, setIsSchedulingCorrugator] = useState(false);
  const [printingAttachments, setPrintingAttachments] = useState<ProductionDashboardAttachment[]>([]);
  const [printingLoading, setPrintingLoading] = useState(false);
  const [isBookingOrder, setIsBookingOrder] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<ProductionDashboardCustomer | null>(null);
  const [productCreationStatus, setProductCreationStatus] = useState("");
  const [customerCreationStatus, setCustomerCreationStatus] = useState("");
  const [isRefreshing, startRefresh] = useTransition();
  const visibleJobs = useMemo(
    () => workspaceFilter === "all"
      ? jobs
      : jobs.filter((job) => job.workspaceId === workspaceFilter),
    [jobs, workspaceFilter],
  );
  const jobsScheduledForProduction = new Set(
    schedules
      .filter((schedule) => schedule.operation === "Corrugating" || schedule.operation === "Printing")
      .map((schedule) => schedule.jobId),
  );
  const allJobs = visibleJobs.filter((job) =>
    job.workflowStage !== "Order Booking" || jobsScheduledForProduction.has(job.id),
  );
  const designerWorkspaceIds = useMemo(
    () => new Set(isAdmin
      ? workspaces.map((workspace) => workspace.id)
      : workspaces.filter((workspace) => hasProductionRole(workspace.role, "DESIGNER"))
        .map((workspace) => workspace.id)),
    [isAdmin, workspaces],
  );
  const productionWorkspaceIds = useMemo(
    () => new Set(isAdmin
      ? workspaces.map((workspace) => workspace.id)
      : workspaces.filter((workspace) => hasProductionRole(workspace.role, "PRODUCTION"))
        .map((workspace) => workspace.id)),
    [isAdmin, workspaces],
  );
  const orderBookingOrganizations = useMemo(
    () => workspaces.filter((workspace) =>
      hasProductionRole(workspace.role, "ORDER_BOOKER"),
    ),
    [workspaces],
  );
  const quoteOrganizations = useMemo(
    () => isAdmin
      ? workspaces
      : workspaces.filter((workspace) =>
        hasProductionRole(workspace.role, "ORDER_BOOKER") ||
        hasProductionRole(workspace.role, "PRODUCTION"),
      ),
    [isAdmin, workspaces],
  );
  const navigateTo = (nextView: DashboardView) => {
    if (hasDesignerRole && nextView !== "origination") return;
    setView(nextView);
    setIsMobileMenuOpen(false);
    const group = WORKSPACE_ITEMS.find((item) => item.id === nextView)?.group;
    if (group) setExpandedNavGroup(group);
  };
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);
  const canBookOrders = !hasDesignerRole && (orderBookingOrganizations.some(
    (workspace) => workspaceFilter === "all" || workspace.id === workspaceFilter,
  ) || isAdmin);
  const defaultOrderBookingWorkspaceId =
    orderBookingOrganizations.find((workspace) => workspace.id === workspaceFilter)?.id ??
    orderBookingOrganizations[0]?.id ??
    "";
  const defaultQuoteWorkspaceId =
    quoteOrganizations.find((workspace) => workspace.id === workspaceFilter)?.id ??
    quoteOrganizations[0]?.id ??
    "";
  const productOrganizations = workspaceFilter === "all"
    ? orderBookingOrganizations
    : orderBookingOrganizations.filter((workspace) => workspace.id === workspaceFilter);
  const originationJobs = useMemo(
    () => originationQueueJobs.filter((job) =>
      workspaceFilter === "all" || job.workspaceId === workspaceFilter,
    ),
    [originationQueueJobs, workspaceFilter],
  );
  const filteredOriginationJobs = useMemo(
    () => filterProductionDashboardJobs(
      originationJobs,
      jobsSearch,
      jobsWorkflowStageFilter,
    ),
    [originationJobs, jobsSearch, jobsWorkflowStageFilter],
  );
  const filteredAllJobs = useMemo(
    () => filterProductionDashboardJobs(allJobs, jobsSearch, jobsWorkflowStageFilter),
    [allJobs, jobsSearch, jobsWorkflowStageFilter],
  );
  const workspaceFilterOptions = useMemo(() => {
    if (!hasDesignerRole) {
      return workspaces.map(({ id, name }) => ({ id, name }));
    }

    const options = new Map<string, { id: string; name: string }>();
    for (const job of originationQueueJobs) {
      options.set(job.workspaceId, {
        id: job.workspaceId,
        name: job.workspaceName,
      });
    }
    return Array.from(options.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [hasDesignerRole, workspaces, originationQueueJobs]);
  const hasActiveJobsFilter = Boolean(
    jobsSearch.trim() ||
    jobsWorkflowStageFilter !== "all" ||
    workspaceFilter !== "all",
  );
  const canManageJobs = isAdmin || workspaces.some(
    (workspace) => hasProductionRole(workspace.role, "PRODUCTION") &&
      (workspaceFilter === "all" || workspace.id === workspaceFilter),
  );
  const visibleWorkspaceItems = WORKSPACE_ITEMS.filter((item) => {
    if (hasDesignerRole && item.id !== "origination") return false;
    if (item.id === "origination" && !designerWorkspaceIds.size) return false;
    if (hasDesignerRole && ["Order Booking", "customers", "products"].includes(item.id)) return false;
    if (
      ["planning", "execution", "quality", "procurement", "inventory", "reels", "warehouse", "invoicing", "tooling", "maintenance", "hr"].includes(item.id) &&
      !productionWorkspaceIds.size
    ) return false;
    if (item.id === "quotes" && !quoteOrganizations.length) return false;
    if (item.id === "Order Booking" && !canBookOrders) return false;
    if (item.id === "Printing" && !productionWorkspaceIds.size) return false;
    if (["customers", "products"].includes(item.id) && !canBookOrders) return false;
    return true;
  });
  const planningWorkspaceId =
    workspaces.find((workspace) =>
      hasProductionRole(workspace.role, "PRODUCTION") &&
      (workspaceFilter === "all" || workspace.id === workspaceFilter),
    )?.id ??
    workspaces.find((workspace) =>
      hasProductionRole(workspace.role, "PRODUCTION"),
    )?.id ??
    "";
  const jobsForWorkflowStage = (stage: ProductionWorkflowStage) => {
    if (stage === "Board Production") {
      return visibleJobs.filter((job) =>
        !job.flag &&
        job.workflowStage === stage &&
        !jobsScheduledForProduction.has(job.id),
      );
    }
    if (stage === "Printing") {
      return visibleJobs.filter((job) =>
        !job.flag &&
        schedules.some((schedule) =>
          schedule.jobId === job.id &&
          schedule.operation === "Printing" &&
          schedule.status !== "COMPLETED",
        ),
      );
    }
    return visibleJobs.filter((job) =>
      (stage === "Origination" || !job.flag) &&
      job.workflowStage === stage,
    );
  };
  const boardProductionJobs = jobsForWorkflowStage("Board Production");
  const printingJobs = jobsForWorkflowStage("Printing");
  const stageCounts = PRODUCTION_WORKFLOW_STAGES.map((stage) => ({
    stage,
    count: jobsForWorkflowStage(stage).length,
  }));
  const stageOrderUnits = PRODUCTION_WORKFLOW_STAGES.map((stage) => ({
    stage,
    units: visibleJobs
      .filter((job) => job.workflowStage === stage)
      .reduce((total, job) => total + (job.orderQty ?? 0), 0),
  }));
  const maxStageOrderUnits = Math.max(1, ...stageOrderUnits.map(({ units }) => units));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndKey = dateKey(weekEnd);
  const overdueJobs = visibleJobs.filter(
    (job) =>
      isValidDateKey(job.deliveryDate) &&
      job.deliveryDate < todayKey,
  );
  const dueThisWeek = visibleJobs.filter(
    (job) =>
      isValidDateKey(job.deliveryDate) &&
      job.deliveryDate >= todayKey &&
      job.deliveryDate <= weekEndKey,
  );
  const orderUnits = visibleJobs.reduce((total, job) => total + (job.orderQty ?? 0), 0);
  const selectedCorrugatorSchedule = selectedJob
    ? schedules.find((schedule) =>
      schedule.jobId === selectedJob.id && schedule.operation === "Corrugating",
    ) ?? null
    : null;
  const selectedCorrugatorBalance = selectedJob
    ? getProductionOperationBalance(
      selectedJob.orderQty,
      selectedCorrugatorSchedule?.actualGoodQty ?? 0,
    )
    : null;
  const canRescheduleCorrugator =
    selectedCorrugatorSchedule?.status === "COMPLETED" &&
    selectedCorrugatorBalance !== null &&
    selectedCorrugatorBalance > 0;
  const jobSheetSchedules = selectedJob
    ? schedules
      .filter((schedule) => schedule.jobId === selectedJob.id)
      .sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt))
    : [];
  const schedulesForOperations = (operations: ProductionOperation[]) =>
    jobSheetSchedules.filter((schedule) => operations.includes(schedule.operation));
  const jobSheetBoardSchedules = schedulesForOperations(["Corrugating"]);
  const jobSheetPrintingSchedules = schedulesForOperations(["Printing"]);
  const jobSheetConvertingSchedules = schedulesForOperations([
    "Die Cutting",
    "Folder Gluing",
    "Stitching",
  ]);
  const jobSheetQualitySchedules = schedulesForOperations(["Quality Control"]);
  const jobSheetPackingSchedules = schedulesForOperations(["Packing"]);
  const jobSheetScheduleIds = new Set(jobSheetSchedules.map((schedule) => schedule.id));
  const jobSheetRuns = operationRuns
    .filter((run) => jobSheetScheduleIds.has(run.scheduleId))
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const jobSheetInspections = selectedJob
    ? qualityInspections.filter((inspection) => inspection.jobId === selectedJob.id)
    : [];
  const jobSheetNonconformances = selectedJob
    ? nonconformances.filter((nonconformance) => nonconformance.jobNo === selectedJob.jobNo)
    : [];
  const jobSheetPallets = selectedJob
    ? warehousePallets.filter((pallet) => pallet.jobId === selectedJob.id)
    : [];
  const jobSheetStockMovements = selectedJob
    ? stockMovements.filter((movement) => movement.jobId === selectedJob.id)
    : [];
  const jobSheetReelMovements = selectedJob
    ? reelMovements.filter((movement) => movement.jobId === selectedJob.id)
    : [];
  const jobSheetDispatches = selectedJob
    ? dispatches
      .filter((dispatch) => dispatch.jobId === selectedJob.id)
      .sort((left, right) => left.dispatchedAt.localeCompare(right.dispatchedAt))
    : [];
  const jobSheetSectionDetails: Record<
    "board" | "printing" | "converting" | "quality" | "packing" | "dispatch",
    Array<[string, string]>
  > = {
    board: [],
    printing: [],
    converting: [],
    quality: [],
    packing: [],
    dispatch: [],
  };
  const jobSheetAdditionalDetails: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(jobSheetData ?? {})) {
    const formattedValue = formatJobSheetValue(value);
    if (
      JOB_SHEET_CORE_FIELDS.has(key) ||
      key === "instructions" ||
      key === "specialInstructions" ||
      !formattedValue
    ) continue;
    const section = JOB_SHEET_FIELD_SECTIONS[key];
    const detail: [string, string] = [formatJobSheetFieldLabel(key), formattedValue];
    if (section) jobSheetSectionDetails[section].push(detail);
    else jobSheetAdditionalDetails.push(detail);
  }
  const jobSheetValue = (key: string) => formatJobSheetValue(jobSheetData?.[key]);
  const jobSheetJobDetails: Array<[string, string]> = [
    ["Customer", selectedJob?.customer ?? ""],
    ["Job name", selectedJob?.jobName ?? ""],
    ["Customer PO no.", jobSheetValue("customerPO")],
    ["Order date", jobSheetValue("orderDate")],
    ["Delivery date", selectedJob?.deliveryDate ? formatDate(selectedJob.deliveryDate) : jobSheetValue("deliveryDate")],
    ["Priority", selectedJob?.priority ?? ""],
  ];
  const jobSheetBoxDetails: Array<[string, string]> = [
    ["Box type", jobSheetValue("boxType") || selectedJob?.cartonSpec || ""],
    ["Size (OD) L x W x H", selectedJob?.size ?? ""],
    ["Plies / flute", jobSheetValue("pliesFlute") || [jobSheetValue("plies"), jobSheetValue("flute")].filter(Boolean).join(", ")],
    ["Glue flap / slot width", [jobSheetValue("glueFlap"), jobSheetValue("slotWidth")].filter(Boolean).join(" / ")],
    ["Joint", jobSheetValue("jointType")],
  ];
  const jobSheetBoardSpecificationDetails: Array<[string, string]> = [
    ["Top liner", jobSheetValue("topLiner")],
    ["Medium (fluting)", jobSheetValue("medium")],
    ["Bottom liner", jobSheetValue("bottomLiner")],
    ["Nominal board weight", jobSheetValue("boardGsm")],
    ["Moisture content", jobSheetValue("moistureContent")],
    ["Board supplier / batch", jobSheetValue("boardSupplierBatch")],
  ];
  const jobSheetBoardCuttingDetails: Array<[string, string]> = [
    ["Board length (cut-off)", jobSheetValue("boardLength")],
    ["Board width", jobSheetValue("boardWidth")],
    ["Creasing dimension", jobSheetValue("creasingDimension")],
    ["Reel width / ups", jobSheetValue("reelWidthUps")],
    ["Trim", jobSheetValue("trim")],
    ["Grain / flute direction", jobSheetValue("grainDirection")],
    ["B/W add", jobSheetValue("bwadd")],
  ];
  const jobSheetBoardKnownLabels = new Set([
    "Top liner",
    "Medium",
    "Bottom liner",
    "Nominal board weight",
    "B/W add",
  ]);
  const jobSheetBoardAdditionalDetails = jobSheetSectionDetails.board.filter(
    ([label]) => !jobSheetBoardKnownLabels.has(label),
  );
  const jobSheetQuantityDetails: Array<[string, string]> = [
    ["Order quantity", selectedJob?.orderQty?.toLocaleString("en-KE") ?? ""],
    ["Production quantity", jobSheetValue("productionQty")],
    ["Reel run length (approx.)", jobSheetValue("reelRunLength")],
    ["Spoilage allowance", jobSheetValue("spoilageAllowance")],
    ["Cuts to run", jobSheetValue("cutsToRun")],
    ["Board area (approx.)", jobSheetValue("boardArea")],
  ];
  const jobSheetDetails = [
    ...jobSheetJobDetails,
    ...jobSheetBoxDetails,
    ...jobSheetBoardSpecificationDetails,
    ...jobSheetBoardCuttingDetails,
    ...jobSheetQuantityDetails,
    ...Object.values(jobSheetSectionDetails).flat(),
    ...jobSheetAdditionalDetails,
  ].filter(([, value]) => Boolean(value));
  const barMax = Math.max(1, ...stageCounts.map(({ count }) => count));
  const deliveryDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
      count: visibleJobs.filter((job) => job.deliveryDate === key).length,
    };
  });
  const deliveryMax = Math.max(1, ...deliveryDays.map(({ count }) => count));
  const pageTitle =
    view === "overview" ? "Production overview"
      : view === "jobs" ? "All production jobs"
        : view === "customers" ? "Customers"
        : view === "products" ? "Products"
        : view === "order-detail" ? "Order details"
        : view === "job-sheet" ? "Production job sheet"
        : view === "printing-detail" ? "Printing job"
        : view === "origination" ? "Origination"
          : view === "quotes" ? "Costing & quotes"
            : view === "reels" ? "Paper reel traceability"
              : view === "warehouse" ? "Warehouse & dispatch"
            : view === "invoicing" ? "Invoicing & collections"
            : view === "tooling" ? "Tooling management"
              : view === "maintenance" ? "Maintenance (CMMS)"
                : view === "hr" ? "HR & safety"
          : view === "planning" ? "Production planning & scheduling"
            : view === "execution" ? "Shop floor execution"
            : view === "quality" ? "Quality management"
            : view === "procurement" ? "Procurement"
              : view === "inventory" ? "Inventory & WIP"
          : view;
  const pageDescription =
    view === "overview"
      ? "Live snapshot of your shared production work."
      : view === "jobs"
        ? "Track and open jobs across your production workspaces."
        : view === "customers"
          ? "Manage customer accounts and contact details."
          : view === "products"
            ? "Manage product specifications and customer-linked carton items."
            : view === "order-detail"
              ? "Review the booked customer order and its product and delivery details."
        : view === "job-sheet"
          ? "View production job-sheet details without opening an embedded page."
        : view === "printing-detail"
          ? "Printing details and artwork for the selected job."
          : view === "origination"
            ? "Review Origination jobs across workspaces, update print details, and attach artwork."
            : view === "quotes"
              ? "Cost carton products, manage quotation approvals, and convert approved quotes into orders."
              : view === "planning"
                ? STAGE_DETAILS.planning
                : view === "execution"
                  ? STAGE_DETAILS.execution
                  : view === "quality"
                    ? STAGE_DETAILS.quality
                    : view === "Printing"
                      ? STAGE_DETAILS.Printing
                      : view === "procurement"
                        ? STAGE_DETAILS.procurement
                        : view === "inventory"
                          ? STAGE_DETAILS.inventory
                          : view === "reels"
                            ? STAGE_DETAILS.reels
                            : view === "warehouse"
                              ? STAGE_DETAILS.warehouse
                              : view === "invoicing"
                                ? STAGE_DETAILS.invoicing
                                : view === "tooling"
                                  ? STAGE_DETAILS.tooling
                                  : view === "maintenance"
                                    ? STAGE_DETAILS.maintenance
                                    : view === "hr"
                                      ? STAGE_DETAILS.hr
                                      : view in STAGE_DETAILS
                                        ? STAGE_DETAILS[view as ProductionWorkflowStage]
                                        : "";

  const openJob = useCallback((job: ProductionDashboardJob) => {
    setSelectedJob(job);
    setIsSchedulingCorrugator(false);
    setJobSheetError("");
    setJobSheetShareStatus("");
    if (view === "Printing") {
      setView("printing-detail");
      setPrintingLoading(true);
      setPrintingData(null);
      setPrintingAttachments([]);
      void Promise.all([
        fetch(`/api/production/jobs/${encodeURIComponent(job.id)}`, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error("Could not load printing job.");
            return response.json();
          }),
        fetch(`/api/production/jobs/${encodeURIComponent(job.id)}/artwork`, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error("Could not load artwork.");
            return response.json();
          }),
      ]).then(([jobResult, artworkResult]) => {
        const data = jobResult.job?.data;
        setPrintingData(data && typeof data === "object" && !Array.isArray(data)
          ? data as Record<string, unknown>
          : {});
        setPrintingAttachments(Array.isArray(artworkResult.attachments)
          ? artworkResult.attachments
          : []);
      }).catch(() => {
        setPrintingData({});
        setPrintingAttachments([]);
      }).finally(() => setPrintingLoading(false));
    } else {
      const isOrderBooking = view === "Order Booking";
      setView(isOrderBooking ? "order-detail" : "job-sheet");
      setJobSheetLoading(true);
      setJobSheetData(null);
      setJobSheetAttachments([]);
      setJobSheetError("");
      const jobRequest = fetch(`/api/production/jobs/${encodeURIComponent(job.id)}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(isOrderBooking ? "Could not load order details." : "Could not load job sheet.");
          return response.json();
        });
      const artworkRequest = isOrderBooking
        ? Promise.resolve(null)
        : fetch(`/api/production/jobs/${encodeURIComponent(job.id)}/artwork`, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error("Could not load job-sheet artwork.");
            return response.json();
          });
      void Promise.all([jobRequest, artworkRequest])
        .then(([result, artworkResult]) => {
          const data = result.job?.data;
          const jobDetails = data && typeof data === "object" && !Array.isArray(data)
            ? data as Record<string, unknown>
            : {};
          setJobSheetData({ ...jobDetails, workflowStage: job.workflowStage });
          setJobSheetAttachments(
            artworkResult && Array.isArray(artworkResult.attachments)
              ? artworkResult.attachments
              : [],
          );
        })
        .catch((error) => {
          setJobSheetData(null);
          setJobSheetAttachments([]);
          setJobSheetError(error instanceof Error ? error.message : "Could not load job details.");
        })
        .finally(() => setJobSheetLoading(false));
    }
  }, [view]);
  const openJobRef = useRef(openJob);
  useEffect(() => {
    openJobRef.current = openJob;
  }, [openJob]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const jobId = url.searchParams.get("jobId");
    if (!jobId || handledJobDeepLink.current === jobId) return;
    const job = [...jobs, ...originationQueueJobs].find((entry) => entry.id === jobId);
    if (!job) return;
    handledJobDeepLink.current = jobId;
    openJobRef.current(job);
    url.searchParams.delete("jobId");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [jobs, originationQueueJobs]);

  const printJobSheet = () => {
    document.body.dataset.printTarget = "job-sheet";
    window.addEventListener(
      "afterprint",
      () => {
        delete document.body.dataset.printTarget;
      },
      { once: true },
    );
    window.print();
  };

  const shareJobSheet = async () => {
    if (!selectedJob) return;
    const lines = [
      `JOB SHEET: ${selectedJob.jobNo || selectedJob.jobName}`,
      ...jobSheetDetails.map(([label, value]) => `${label}: ${value}`),
    ];

    if (jobSheetSchedules.length) {
      lines.push("", "PRODUCTION SCHEDULES");
      for (const schedule of jobSheetSchedules) {
        lines.push(
          `${schedule.operation} — ${schedule.machineLabel}`,
          `Status: ${schedule.status.replaceAll("_", " ")} | Planned: ${schedule.plannedQty.toLocaleString("en-KE")} | Good: ${schedule.actualGoodQty.toLocaleString("en-KE")} | Rejected: ${schedule.actualRejectedQty.toLocaleString("en-KE")}`,
          `Start: ${formatScheduleDate(schedule.scheduledStartAt)} | End: ${formatScheduleDate(schedule.scheduledEndAt)}`,
          `Notes: ${schedule.notes || "—"}`,
        );
        for (const run of jobSheetRuns.filter((entry) => entry.scheduleId === schedule.id)) {
          lines.push(
            `Run ${new Date(run.recordedAt).toLocaleString("en-KE")} by ${run.recordedByName}: Good ${run.goodQty.toLocaleString("en-KE")}, rejected ${run.rejectedQty.toLocaleString("en-KE")}${run.notes ? ` — ${run.notes}` : ""}`,
          );
        }
      }
    }

    if (jobSheetInspections.length) {
      lines.push("", "QUALITY INSPECTIONS");
      for (const inspection of jobSheetInspections) {
        lines.push(
          `${inspection.inspectionNo}: ${inspection.result} | ${inspection.inspectionType} | ${inspection.operation || "General"}`,
          `Sample: ${inspection.sampleQty.toLocaleString("en-KE")} | Rejected: ${inspection.rejectedQty.toLocaleString("en-KE")} | Inspector: ${inspection.inspectorName} | ${new Date(inspection.inspectedAt).toLocaleString("en-KE")}`,
          `Checks: ${formatJobSheetValue(inspection.checks) || "—"} | Notes: ${inspection.notes || "—"}`,
        );
      }
    }

    if (jobSheetNonconformances.length) {
      lines.push("", "NONCONFORMANCES");
      for (const nonconformance of jobSheetNonconformances) {
        lines.push(
          `${nonconformance.ncrNo}: ${nonconformance.status} | ${nonconformance.severity} | Affected qty: ${nonconformance.affectedQty.toLocaleString("en-KE")}`,
          `Description: ${nonconformance.description}`,
          `Disposition: ${nonconformance.disposition} | Root cause: ${nonconformance.rootCause || "—"} | Corrective action: ${nonconformance.correctiveAction || "—"}`,
          `Resolution: ${nonconformance.resolutionNotes || "—"}`,
        );
      }
    }

    if (jobSheetPallets.length) {
      lines.push("", "WAREHOUSE PALLETS");
      for (const pallet of jobSheetPallets) {
        lines.push(
          `${pallet.palletNo}: Received ${pallet.quantityReceived.toLocaleString("en-KE")} | Available ${pallet.quantityAvailable.toLocaleString("en-KE")} | Location ${pallet.location || "—"} | ${new Date(pallet.receivedAt).toLocaleString("en-KE")}`,
          `Notes: ${pallet.notes || "—"}`,
        );
      }
    }

    if (jobSheetStockMovements.length) {
      lines.push("", "MATERIAL MOVEMENTS");
      for (const movement of jobSheetStockMovements) {
        lines.push(
          `${movement.type}: ${movement.material.code} ${movement.material.name} · ${movement.quantity} ${movement.material.unit} · ${new Date(movement.createdAt).toLocaleString("en-KE")}`,
          `Reference: ${movement.reference || "—"} | Notes: ${movement.notes || "—"}`,
        );
      }
    }

    if (jobSheetReelMovements.length) {
      lines.push("", "PAPER REEL MOVEMENTS");
      for (const movement of jobSheetReelMovements) {
        lines.push(
          `${movement.type}: Reel ${movement.reelNo} · ${movement.deltaKg} kg · ${new Date(movement.createdAt).toLocaleString("en-KE")}`,
          `Related reel: ${movement.relatedReelNo || "—"} | Notes: ${movement.notes || "—"}`,
        );
      }
    }

    if (jobSheetDispatches.length) {
      lines.push("", "DISPATCHES");
      for (const dispatch of jobSheetDispatches) {
        lines.push(
          `${dispatch.dispatchNo} | Delivery note: ${dispatch.deliveryNoteNo || "—"} | ${dispatch.status}`,
          `Vehicle: ${dispatch.vehicleRegistration || "—"} | Driver: ${dispatch.driverName || "—"} | Route: ${dispatch.route || "—"}`,
          `Dispatched: ${new Date(dispatch.dispatchedAt).toLocaleString("en-KE")} | Delivered: ${dispatch.deliveredAt ? new Date(dispatch.deliveredAt).toLocaleString("en-KE") : "—"} | Received by: ${dispatch.receivedBy || "—"}`,
          `Delivery notes: ${dispatch.deliveryNotes || "—"} | Notes: ${dispatch.notes || "—"}`,
          ...dispatch.lines.map((line) =>
            `Pallet ${line.palletNo} · ${line.location || "—"} · ${line.quantity.toLocaleString("en-KE")} units`,
          ),
        );
      }
    }

    const text = lines.join("\n");
    setJobSheetShareStatus("");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `Job sheet ${selectedJob.jobNo}`, text });
        setJobSheetShareStatus("Job sheet shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setJobSheetShareStatus("Job sheet copied to clipboard. Paste it into a message to share.");
      } else {
        throw new Error("Sharing is not supported in this browser.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setJobSheetShareStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="production-dashboard-shell">
      {isMobileMenuOpen && (
        <button
          aria-label="Close production menu"
          className="production-sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          type="button"
        />
      )}
      <aside className={`production-sidebar${isMobileMenuOpen ? " is-open" : ""}`}>
        <div className="production-brand">
          <div className="production-brand-lockup">
            <BrandLogo className="production-brand-wordmark" />
            <small>Production</small>
          </div>
          <button
            aria-label="Close production menu"
            className="production-mobile-menu-close"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>

        <nav className="production-side-nav" id="production-side-navigation" aria-label="Production navigation">
          {WORKSPACE_GROUPS.map((group) => {
            const groupItems = visibleWorkspaceItems.filter((item) => item.group === group.id);
            if (!groupItems.length) return null;
            const isExpanded = expandedNavGroup === group.id;
            const contentId = `production-nav-${group.id}`;
            return (
              <section className="production-nav-group" key={group.id}>
                <button
                  aria-controls={contentId}
                  aria-expanded={isExpanded}
                  className="production-nav-group-toggle"
                  onClick={() => setExpandedNavGroup(isExpanded ? null : group.id)}
                  type="button"
                >
                  <span>{group.label}</span>
                  <span className="production-nav-group-count">{groupItems.length}</span>
                  <FiChevronDown className={isExpanded ? "is-expanded" : ""} aria-hidden="true" />
                </button>
                {isExpanded && (
                  <div className="production-nav-group-items" id={contentId}>
                    {groupItems.map((item) => (
                      <button
                        aria-current={view === item.id ? "page" : undefined}
                        className={`production-nav-item${view === item.id ? " is-active" : ""}`}
                        key={item.id}
                        onClick={() => navigateTo(item.id)}
                        type="button"
                      >
                        <span className="production-nav-icon" aria-hidden="true"><item.icon /></span>
                        {item.label}
                        {item.id === "jobs" && <span className="production-nav-count">{allJobs.length}</span>}
                        {item.id === "origination" && <span className="production-nav-count">{originationJobs.length}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

        </nav>

        <div className="production-sidebar-footer">
          {canManageAccess && (
            <Link className="production-footer-link" href="/admin/access-control">
              <span className="production-nav-icon" aria-hidden="true"><FiUsers /></span>
              Access control
            </Link>
          )}
          {canManageAccess && (
            <Link className="production-footer-link" href="/admin#system-metrics">
              <span className="production-nav-icon" aria-hidden="true"><FiActivity /></span>
              Metrics dashboard
            </Link>
          )}
          <Link className="production-footer-link" href="/app">
            <span className="production-nav-icon" aria-hidden="true"><FiArrowLeft /></span>
            Back to Studio
          </Link>
          <div className="production-user-card">
            <span className="production-user-avatar" aria-hidden="true">
              {accountName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{accountName}</strong>
              <small>
                {workspaces.length
                  ? `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`
                  : "No workspace access"}
              </small>
            </span>
          </div>
        </div>
      </aside>

      <div className="production-dashboard-main">
        <header className="production-topbar">
          <div className="production-topbar-heading">
            <button
              aria-controls="production-side-navigation"
              aria-expanded={isMobileMenuOpen}
              aria-label="Open production menu"
              className="production-mobile-menu-button"
              onClick={() => setIsMobileMenuOpen(true)}
              type="button"
            >
              <FiMenu aria-hidden="true" />
            </button>
            <div>
              <p className="production-breadcrumb">Production <span>/</span> {pageTitle}</p>
              <h1>{pageTitle}</h1>
            </div>
          </div>
          <div className="production-topbar-actions">
            <ProductionNotificationBell />
            <label className="production-workspace-filter">
              <span>Workspace</span>
              <select
                aria-label="Filter dashboard by workspace"
                onChange={(event) => {
                  setWorkspaceFilter(event.target.value);
                  setSelectedJob(null);
                  setEditingOriginationJob(null);
                  setProductCreationStatus("");
                  setCustomerCreationStatus("");
                }}
                value={workspaceFilter}
              >
                <option value="all">All workspaces</option>
                {workspaceFilterOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
            <button
              aria-label="Refresh dashboard data"
              className="production-refresh-button"
              disabled={isRefreshing}
              onClick={() => startRefresh(() => router.refresh())}
              type="button"
            >
              {isRefreshing ? (
                <FiLoader className="production-refresh-spinner" aria-hidden="true" />
              ) : (
                <FiRefreshCw aria-hidden="true" />
              )}
              Refresh
            </button>
          </div>
        </header>

        <main className="production-dashboard-content">
          {view === "order-detail" ? (
            <div className="production-page-content">
              <section className="production-panel production-list-panel">
                <div className="production-panel-heading">
                  <div>
                    <span className="production-panel-kicker">BOOKED ORDER</span>
                    <h2>{selectedJob?.jobNo || "Order details"}</h2>
                  </div>
                  <div className="production-quote-actions">
                    <button
                      className="production-table-action"
                      onClick={() => {
                        setIsSchedulingCorrugator(false);
                        setView("Order Booking");
                      }}
                      type="button"
                    >
                      Back to Order Booking
                    </button>
                    {selectedJob && (isAdmin || productionWorkspaceIds.has(selectedJob.workspaceId)) && (
                      <button
                        className="production-primary-button"
                        disabled={
                          selectedCorrugatorSchedule?.status === "COMPLETED" &&
                          !canRescheduleCorrugator
                        }
                        onClick={() => setIsSchedulingCorrugator((open) => !open)}
                        type="button"
                      >
                        {selectedCorrugatorSchedule?.status === "COMPLETED"
                          ? canRescheduleCorrugator
                            ? `Reschedule balance (${selectedCorrugatorBalance.toLocaleString("en-KE")})`
                            : "Corrugating completed"
                          : selectedCorrugatorSchedule
                            ? "Update corrugator schedule"
                            : "Schedule to Corrugator"}
                      </button>
                    )}
                  </div>
                </div>
                {jobSheetLoading ? (
                  <p className="production-quote-message" role="status">Loading order details…</p>
                ) : (
                  <div className="production-printing-details">
                    {[
                      ["Order no.", typeof jobSheetData?.jobNo === "string" ? jobSheetData.jobNo : selectedJob?.jobNo],
                      ["Customer", typeof jobSheetData?.customer === "string" ? jobSheetData.customer : selectedJob?.customer],
                      ["Customer PO", typeof jobSheetData?.customerPO === "string" ? jobSheetData.customerPO : ""],
                      ["Product", typeof jobSheetData?.jobName === "string" ? jobSheetData.jobName : selectedJob?.jobName],
                      ["Item code", typeof jobSheetData?.itemCode === "string" ? jobSheetData.itemCode : ""],
                      ["Carton type", typeof jobSheetData?.boxType === "string" ? jobSheetData.boxType : selectedJob?.cartonSpec],
                      ["Size", selectedJob?.size],
                      ["Order quantity", typeof jobSheetData?.orderQty === "string"
                        ? Number(jobSheetData.orderQty).toLocaleString("en-KE")
                        : selectedJob?.orderQty?.toLocaleString("en-KE")],
                      ["Order date", typeof jobSheetData?.orderDate === "string" ? jobSheetData.orderDate : ""],
                      ["Delivery date", typeof jobSheetData?.deliveryDate === "string" ? jobSheetData.deliveryDate : selectedJob?.deliveryDate],
                      ["Workflow stage", typeof jobSheetData?.workflowStage === "string" ? jobSheetData.workflowStage : selectedJob?.workflowStage],
                      ["Top liner", typeof jobSheetData?.topLiner === "string" ? jobSheetData.topLiner : ""],
                      ["Medium", typeof jobSheetData?.medium === "string" ? jobSheetData.medium : ""],
                      ["Bottom liner", typeof jobSheetData?.bottomLiner === "string" ? jobSheetData.bottomLiner : ""],
                    ].map(([label, value]) => (
                      <div className="production-printing-detail" key={label}>
                        <span>{label}</span>
                        <strong>{value || "—"}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {selectedCorrugatorSchedule && (
                  <p className="production-quote-message" role="status">
                    Corrugator: {selectedCorrugatorSchedule.status.replaceAll("_", " ")} ·{" "}
                    {formatScheduleDate(selectedCorrugatorSchedule.scheduledStartAt)}
                    {" – "}
                    {formatScheduleDate(selectedCorrugatorSchedule.scheduledEndAt)}
                  </p>
                )}
                {isSchedulingCorrugator && selectedJob && (
                  <CorrugatorScheduleForm
                    existingSchedule={selectedCorrugatorSchedule}
                    job={selectedJob}
                    machines={machines}
                    maintenancePlans={maintenancePlans}
                    maintenanceTickets={maintenanceTickets}
                    onCancel={() => setIsSchedulingCorrugator(false)}
                    onSaved={() => {
                      setIsSchedulingCorrugator(false);
                      setSelectedJob((current) =>
                        current ? { ...current, workflowStage: "Board Production" } : current,
                      );
                      setJobSheetData((current) =>
                        current ? { ...current, workflowStage: "Board Production" } : current,
                      );
                      router.refresh();
                    }}
                  />
                )}
              </section>
            </div>
          ) : view === "job-sheet" ? (
            <div className="production-page-content">
              <section
                className="production-panel production-list-panel production-job-sheet"
                id="production-job-sheet"
              >
                <div className="production-panel-heading production-no-print">
                  <div>
                    <span className="production-panel-kicker">JOB SHEET</span>
                    <h2>{selectedJob?.jobName || selectedJob?.jobNo || "Production job sheet"}</h2>
                  </div>
                  <div className="production-quote-actions production-no-print">
                    <button
                      className="production-table-action"
                      onClick={() => navigateTo(hasDesignerRole ? "origination" : "jobs")}
                      type="button"
                    >
                      {hasDesignerRole ? "Back to Origination" : "Back to jobs"}
                    </button>
                    <button
                      className="production-table-action"
                      disabled={jobSheetLoading || Boolean(jobSheetError)}
                      onClick={printJobSheet}
                      type="button"
                    >
                      Print job sheet
                    </button>
                    <button
                      className="production-primary-button"
                      disabled={jobSheetLoading || Boolean(jobSheetError) || !selectedJob}
                      onClick={() => void shareJobSheet()}
                      type="button"
                    >
                      Share job sheet
                    </button>
                  </div>
                </div>
                {jobSheetShareStatus && (
                  <p className="production-quote-message production-no-print" role="status">
                    {jobSheetShareStatus}
                  </p>
                )}
                {jobSheetLoading ? (
                  <p className="production-quote-message" role="status">Loading job sheet…</p>
                ) : jobSheetError ? (
                  <p className="production-order-booking-error" role="alert">{jobSheetError}</p>
                ) : (
                  <div className="production-job-sheet-template">
                    <div className="production-job-sheet-page">
                      <header className="production-job-sheet-template-header">
                        <BrandLogo className="production-job-sheet-logo" />
                        <dl>
                          <div><dt>No.</dt><dd>{selectedJob?.jobNo || "—"}</dd></div>
                          <div>
                            <dt>Issued</dt>
                            <dd>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}</dd>
                          </div>
                        </dl>
                      </header>
                    <section className="production-job-sheet-section">
                      <h3>JOB</h3>
                      <ProductionJobSheetFieldGrid fields={jobSheetJobDetails} />
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>BOX SPECIFICATION</h3>
                      <ProductionJobSheetFieldGrid fields={jobSheetBoxDetails} />
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>ARTWORK</h3>
                      <ProductionJobSheetArtworkPreviews attachments={jobSheetAttachments} />
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>BOARD SPECIFICATION</h3>
                      <ProductionJobSheetFieldGrid fields={jobSheetBoardSpecificationDetails} />
                      {jobSheetBoardAdditionalDetails.length > 0 && (
                        <ProductionJobSheetFieldGrid fields={jobSheetBoardAdditionalDetails} />
                      )}
                      <div className="production-job-sheet-subsection">
                        <h4>BOARD &amp; CUTTING</h4>
                        <ProductionJobSheetFieldGrid fields={jobSheetBoardCuttingDetails} />
                      </div>
                      <div className="production-job-sheet-subsection">
                        <h4>QUANTITY &amp; MATERIAL REQUIREMENT</h4>
                        <ProductionJobSheetFieldGrid fields={jobSheetQuantityDetails} />
                      </div>
                      <div className="production-job-sheet-subsection">
                        <h4>Corrugating schedule</h4>
                        <ProductionJobSheetOperationSummary
                          emptyMessage="No corrugating operation has been scheduled."
                          schedules={jobSheetBoardSchedules}
                        />
                      </div>
                      <div className="production-job-sheet-subsection">
                        <h4>Board and material movements</h4>
                        {jobSheetStockMovements.length || jobSheetReelMovements.length ? (
                          <div className="production-table-scroll">
                            <table className="production-jobs-table">
                              <thead>
                                <tr>
                                  <th>Recorded</th>
                                  <th>Movement</th>
                                  <th>Material / reel</th>
                                  <th>Quantity</th>
                                  <th>Reference</th>
                                  <th>Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {jobSheetStockMovements.map((movement) => (
                                  <tr key={`stock-${movement.id}`}>
                                    <td>{new Date(movement.createdAt).toLocaleString("en-KE")}</td>
                                    <td>{movement.type}</td>
                                    <td>{movement.material.code} · {movement.material.name}</td>
                                    <td>{movement.quantity} {movement.material.unit}</td>
                                    <td>{movement.reference || "—"}</td>
                                    <td>{movement.notes || "—"}</td>
                                  </tr>
                                ))}
                                {jobSheetReelMovements.map((movement) => (
                                  <tr key={`reel-${movement.id}`}>
                                    <td>{new Date(movement.createdAt).toLocaleString("en-KE")}</td>
                                    <td>{movement.type}</td>
                                    <td>Reel {movement.reelNo}{movement.relatedReelNo ? ` · related ${movement.relatedReelNo}` : ""}</td>
                                    <td>{movement.deltaKg} kg</td>
                                    <td>{movement.jobNo || "—"}</td>
                                    <td>{movement.notes || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="production-chart-empty">No board or material movements recorded.</p>
                        )}
                      </div>
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>SPECIAL INSTRUCTIONS</h3>
                      <p className="production-job-sheet-instructions">
                        {jobSheetValue("specialInstructions") || jobSheetValue("instructions") || "—"}
                      </p>
                      {jobSheetAdditionalDetails.length > 0 && (
                        <ProductionJobSheetFieldGrid fields={jobSheetAdditionalDetails} />
                      )}
                    </section>

                    <div className="production-job-sheet-signatures">
                      {["Prepared by", "Approved by", "Received by (production)"].map((label) => (
                        <div key={label}><span>{label}</span><i /></div>
                      ))}
                    </div>
                    <footer className="production-job-sheet-page-footer">Powered by PackStudio.app · Page 1 of 2</footer>
                    </div>

                    <div className="production-job-sheet-page">
                      <header className="production-job-sheet-template-header production-job-sheet-template-header-compact">
                        <BrandLogo className="production-job-sheet-logo" />
                        <span>{selectedJob?.jobNo || "—"} · {selectedJob?.jobName || "—"} · {selectedJob?.size || "—"}</span>
                      </header>

                    <section className="production-job-sheet-section">
                      <h3>PRINTING</h3>
                      {jobSheetSectionDetails.printing.length > 0 && (
                        <ProductionJobSheetFieldGrid fields={jobSheetSectionDetails.printing} />
                      )}
                      <ProductionJobSheetOperationSummary
                        emptyMessage="No printing operation has been scheduled."
                        schedules={jobSheetPrintingSchedules}
                      />
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>CONVERTING (SLOT, JOINT)</h3>
                      {jobSheetSectionDetails.converting.length > 0 && (
                        <ProductionJobSheetFieldGrid fields={jobSheetSectionDetails.converting} />
                      )}
                      <ProductionJobSheetOperationSummary
                        emptyMessage="No converting operations have been scheduled."
                        schedules={jobSheetConvertingSchedules}
                      />
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>QUALITY CONTROL</h3>
                      {jobSheetSectionDetails.quality.length > 0 && (
                        <ProductionJobSheetFieldGrid fields={jobSheetSectionDetails.quality} />
                      )}
                      <ProductionJobSheetOperationSummary
                        emptyMessage="No quality-control operation has been scheduled."
                        schedules={jobSheetQualitySchedules}
                      />
                      {jobSheetInspections.length ? (
                        <div className="production-table-scroll">
                          <table className="production-jobs-table">
                            <thead>
                              <tr>
                                <th>Inspection</th>
                                <th>Type / operation</th>
                                <th>Result</th>
                                <th>Sample</th>
                                <th>Rejected</th>
                                <th>Inspector / date</th>
                                <th>Checks</th>
                                <th>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {jobSheetInspections.map((inspection) => (
                                <tr key={inspection.inspectionNo}>
                                  <td>{inspection.inspectionNo}</td>
                                  <td>{inspection.inspectionType} / {inspection.operation || "General"}</td>
                                  <td>{inspection.result}</td>
                                  <td>{inspection.sampleQty.toLocaleString("en-KE")}</td>
                                  <td>{inspection.rejectedQty.toLocaleString("en-KE")}</td>
                                  <td>{inspection.inspectorName} · {new Date(inspection.inspectedAt).toLocaleString("en-KE")}</td>
                                  <td>{formatJobSheetValue(inspection.checks) || "—"}</td>
                                  <td>{inspection.notes || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="production-chart-empty">No quality inspections recorded.</p>
                      )}

                      <div className="production-job-sheet-subsection">
                        <h4>Nonconformances</h4>
                      {jobSheetNonconformances.length ? (
                        <div className="production-table-scroll">
                          <table className="production-jobs-table">
                            <thead>
                              <tr>
                                <th>NCR</th>
                                <th>Status / severity</th>
                                <th>Description</th>
                                <th>Affected qty</th>
                                <th>Disposition</th>
                                <th>Root cause</th>
                                <th>Corrective action</th>
                                <th>Resolution</th>
                              </tr>
                            </thead>
                            <tbody>
                              {jobSheetNonconformances.map((nonconformance) => (
                                <tr key={nonconformance.ncrNo}>
                                  <td>{nonconformance.ncrNo}</td>
                                  <td>{nonconformance.status} / {nonconformance.severity}</td>
                                  <td>{nonconformance.description}</td>
                                  <td>{nonconformance.affectedQty.toLocaleString("en-KE")}</td>
                                  <td>{nonconformance.disposition}</td>
                                  <td>{nonconformance.rootCause || "—"}</td>
                                  <td>{nonconformance.correctiveAction || "—"}</td>
                                  <td>{nonconformance.resolutionNotes || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="production-chart-empty">No nonconformances recorded.</p>
                      )}
                      </div>
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>PACKING</h3>
                      {jobSheetSectionDetails.packing.length > 0 && (
                        <ProductionJobSheetFieldGrid fields={jobSheetSectionDetails.packing} />
                      )}
                      <ProductionJobSheetOperationSummary
                        emptyMessage="No packing operation has been scheduled."
                        schedules={jobSheetPackingSchedules}
                      />
                      {jobSheetPallets.length ? (
                        <div className="production-table-scroll">
                          <table className="production-jobs-table">
                            <thead>
                              <tr>
                                <th>Pallet</th>
                                <th>Received</th>
                                <th>Available</th>
                                <th>Location</th>
                                <th>Received at</th>
                                <th>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {jobSheetPallets.map((pallet) => (
                                <tr key={pallet.id}>
                                  <td>{pallet.palletNo}</td>
                                  <td>{pallet.quantityReceived.toLocaleString("en-KE")}</td>
                                  <td>{pallet.quantityAvailable.toLocaleString("en-KE")}</td>
                                  <td>{pallet.location || "—"}</td>
                                  <td>{new Date(pallet.receivedAt).toLocaleString("en-KE")}</td>
                                  <td>{pallet.notes || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="production-chart-empty">No warehouse pallets received.</p>
                      )}
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>DISPATCH</h3>
                      {jobSheetSectionDetails.dispatch.length > 0 && (
                        <ProductionJobSheetFieldGrid fields={jobSheetSectionDetails.dispatch} />
                      )}
                      {jobSheetDispatches.length ? (
                        jobSheetDispatches.map((dispatch) => (
                          <article className="production-quote-card production-job-sheet-dispatch" key={dispatch.id}>
                            <div className="production-quote-card-header">
                              <div>
                                <span className={`production-schedule-status status-${dispatch.status.toLowerCase()}`}>{dispatch.status}</span>
                                <h4>{dispatch.dispatchNo}</h4>
                                <p>Delivery note {dispatch.deliveryNoteNo || "—"}</p>
                              </div>
                              <div className="production-quote-total">
                                <span>Dispatched</span>
                                <strong>{new Date(dispatch.dispatchedAt).toLocaleString("en-KE")}</strong>
                              </div>
                            </div>
                            <div className="production-printing-details">
                              {[
                                ["Vehicle", dispatch.vehicleRegistration],
                                ["Driver", dispatch.driverName],
                                ["Route", dispatch.route],
                                ["Status", dispatch.status],
                                ["Delivered", dispatch.deliveredAt ? new Date(dispatch.deliveredAt).toLocaleString("en-KE") : ""],
                                ["Received by", dispatch.receivedBy],
                                ["Delivery notes", dispatch.deliveryNotes],
                                ["Dispatch notes", dispatch.notes],
                              ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                                <div className="production-printing-detail" key={label}>
                                  <span>{label}</span>
                                  <strong>{value || "—"}</strong>
                                </div>
                              ))}
                            </div>
                            {dispatch.lines.length ? (
                              <div className="production-table-scroll">
                                <table className="production-jobs-table">
                                  <thead>
                                    <tr>
                                      <th>Pallet</th>
                                      <th>Location</th>
                                      <th>Quantity</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dispatch.lines.map((line) => (
                                      <tr key={`${dispatch.id}-${line.palletId}`}>
                                        <td>{line.palletNo}</td>
                                        <td>{line.location || "—"}</td>
                                        <td>{line.quantity.toLocaleString("en-KE")}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="production-chart-empty">No pallet lines recorded for this dispatch.</p>
                            )}
                          </article>
                        ))
                      ) : (
                        <p className="production-chart-empty">No dispatches recorded.</p>
                      )}
                    </section>

                    <section className="production-job-sheet-section">
                      <h3>PRODUCTION TRACKING</h3>
                      {jobSheetRuns.length ? (
                        <div className="production-table-scroll">
                          <table className="production-jobs-table">
                            <thead>
                              <tr>
                                <th>Stage</th>
                                <th>Date</th>
                                <th>Machine</th>
                                <th>Operator</th>
                                <th>Good qty</th>
                                <th>Rejects</th>
                                <th>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {jobSheetRuns.map((run, index) => (
                                <tr key={`${run.scheduleId}-${run.recordedAt}-${index}`}>
                                  <td>{run.operation}</td>
                                  <td>{new Date(run.recordedAt).toLocaleString("en-KE")}</td>
                                  <td>{run.machineLabel || "—"}</td>
                                  <td>{run.recordedByName || "—"}</td>
                                  <td>{run.goodQty.toLocaleString("en-KE")}</td>
                                  <td>{run.rejectedQty.toLocaleString("en-KE")}</td>
                                  <td>{run.notes || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="production-chart-empty">No operator production records have been entered.</p>
                      )}
                    </section>
                    <div className="production-job-sheet-signatures">
                      {["Production supervisor", "QC approved", "Dispatch / driver"].map((label) => (
                        <div key={label}><span>{label}</span><i /></div>
                      ))}
                    </div>
                    <footer className="production-job-sheet-page-footer">Powered by PackStudio.app · Page 2 of 2</footer>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : view === "printing-detail" ? (
            <div className="production-page-content">
              <section className="production-panel production-list-panel">
                <div className="production-panel-heading">
                  <div>
                    <span className="production-panel-kicker">PRINTING JOB</span>
                    <h2>{selectedJob?.jobName || selectedJob?.jobNo || "Selected job"}</h2>
                  </div>
                  <button
                    className="production-table-action"
                    onClick={() => {
                      setPrintingData(null);
                      setPrintingAttachments([]);
                      setView("Printing");
                    }}
                    type="button"
                  >
                    Back to Printing
                  </button>
                </div>
                {printingLoading ? (
                  <p className="production-quote-message" role="status">Loading printing details…</p>
                ) : (
                  <div className="production-printing-details">
                    {[
                      ["Job no.", selectedJob?.jobNo],
                      ["Customer", selectedJob?.customer],
                      ["Carton spec", selectedJob?.cartonSpec],
                      ["Size", selectedJob?.size],
                      ["Order qty", selectedJob?.orderQty?.toLocaleString("en-KE")],
                      ["Printing", typeof printingData?.printing === "string" ? printingData.printing : "Yes"],
                      ["Method", typeof printingData?.printMethod === "string" ? printingData.printMethod : ""],
                      ["Colour", typeof printingData?.printColor === "string" ? printingData.printColor : ""],
                      ["Ink type", typeof printingData?.inkType === "string" ? printingData.inkType : ""],
                      ["Artwork ref", typeof printingData?.artworkRef === "string" ? printingData.artworkRef : ""],
                      ["Plate / cylinder", typeof printingData?.plateRef === "string" ? printingData.plateRef : ""],
                      ["Print area", typeof printingData?.printArea === "string" ? printingData.printArea : ""],
                      ["Registration", typeof printingData?.registration === "string" ? printingData.registration : ""],
                      ["Print position", typeof printingData?.printPosition === "string" ? printingData.printPosition : ""],
                      ["Instructions", typeof printingData?.printInstructions === "string" ? printingData.printInstructions : ""],
                    ].map(([label, value]) => (
                      <div className="production-printing-detail" key={label}>
                        <span>{label}</span>
                        <strong>{value || "—"}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {!printingLoading && (
                  <div className="production-printing-artwork">
                    <h3>Artwork</h3>
                    {printingAttachments.length ? (
                      <div className="production-printing-artwork-files">
                        {printingAttachments.map((attachment) => (
                          <PrintingArtworkViewer attachment={attachment} key={attachment.id} />
                        ))}
                      </div>
                    ) : (
                      <p>No artwork attached to this job.</p>
                    )}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="production-page-content">
              <div className="production-page-intro">
                <p>{pageDescription}</p>
                {view === "overview" && canBookOrders ? (
                  <div className="production-dashboard-creation-actions">
                    <button
                      className="production-primary-button"
                      onClick={() => {
                        setProductCreationStatus("");
                        setIsCreatingProduct(true);
                      }}
                      type="button"
                    >
                      <FiPlus aria-hidden="true" /> Create product
                    </button>
                    <button
                      className="production-primary-button"
                      onClick={() => {
                        setCustomerCreationStatus("");
                        setIsCreatingCustomer(true);
                      }}
                      type="button"
                    >
                      <FiPlus aria-hidden="true" /> Create customer
                    </button>
                  </div>
                ) : view === "Order Booking" && canBookOrders ? (
                  <button
                    className="production-primary-button"
                    onClick={() => setIsBookingOrder(true)}
                    type="button"
                  >
                    <FiPlus aria-hidden="true" /> Book order
                  </button>
                ) : null}
              </div>
              {view === "overview" && productCreationStatus && (
                <p className="production-order-booking-status" role="status">
                  {productCreationStatus}
                </p>
              )}
              {view === "overview" && customerCreationStatus && (
                <p className="production-order-booking-status" role="status">
                  {customerCreationStatus}
                </p>
              )}

              {view === "overview" ? (
                <>
                  <section className="production-kpi-grid" aria-label="Production key performance indicators">
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-blue" aria-hidden="true"><FiBriefcase /></span>
                      <p>Jobs in register</p>
                      <strong>{visibleJobs.length}</strong>
                      <small>Across selected workspaces</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-amber" aria-hidden="true"><FiCalendar /></span>
                      <p>Due this week</p>
                      <strong>{dueThisWeek.length}</strong>
                      <small>Next 7 calendar days</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-red" aria-hidden="true"><FiAlertTriangle /></span>
                      <p>Past delivery date</p>
                      <strong>{overdueJobs.length}</strong>
                      <small>Shared jobs past due</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-green" aria-hidden="true"><FiPackage /></span>
                      <p>Units on job register</p>
                      <strong>{orderUnits.toLocaleString("en-KE")}</strong>
                      <small>Total order quantities</small>
                    </article>
                  </section>

                  <section className="production-chart-grid" aria-label="Production visualizations">
                    <article className="production-panel">
                      <div className="production-panel-heading">
                        <div>
                          <span className="production-panel-kicker">WORK IN PROGRESS</span>
                          <h2>Jobs by workflow stage</h2>
                        </div>
                        <span className="production-panel-total">{visibleJobs.length} total</span>
                      </div>
                      <div className="production-stage-chart">
                        {stageCounts.map(({ stage, count }) => (
                          <button
                            className="production-stage-bar-row"
                            key={stage}
                            onClick={() => navigateTo(stage)}
                            type="button"
                          >
                            <span>{stage}</span>
                            <span className="production-bar-track">
                              <span
                                className={`production-bar-fill stage-fill-${stage.toLowerCase().replaceAll(" ", "-")}`}
                                style={{ width: `${count ? Math.max(6, count / barMax * 100) : 0}%` }}
                              />
                            </span>
                            <strong>{count}</strong>
                          </button>
                        ))}
                      </div>
                      {!visibleJobs.length && (
                        <p className="production-chart-empty">Shared jobs will appear here as workspaces create them.</p>
                      )}
                    </article>

                    <article className="production-panel">
                      <div className="production-panel-heading">
                        <div>
                          <span className="production-panel-kicker">DELIVERY SCHEDULE</span>
                          <h2>Due in the next 7 days</h2>
                        </div>
                        <span className="production-panel-total">{dueThisWeek.length} jobs</span>
                      </div>
                      <div
                        className="production-delivery-chart"
                        role="img"
                        aria-label={`Jobs due by day for the next seven days: ${deliveryDays.map((day) => `${day.label} ${day.count}`).join(", ")}`}
                      >
                        {deliveryDays.map((day) => (
                          <div className="production-delivery-day" key={day.key}>
                            <span className="production-delivery-value">{day.count || ""}</span>
                            <div className="production-delivery-track">
                              <span style={{ height: `${day.count ? Math.max(10, day.count / deliveryMax * 100) : 0}%` }} />
                            </div>
                            <span className="production-delivery-label">{day.label}</span>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="production-panel">
                      <div className="production-panel-heading">
                        <div>
                          <span className="production-panel-kicker">ORDER VOLUME</span>
                          <h2>Units by workflow stage</h2>
                        </div>
                        <span className="production-panel-total">{orderUnits.toLocaleString("en-KE")} units</span>
                      </div>
                      <div
                        aria-label={`Order units by workflow stage: ${stageOrderUnits.map(({ stage, units }) => `${stage} ${units}`).join(", ")}`}
                        className="production-volume-chart"
                        role="img"
                      >
                        {stageOrderUnits.map(({ stage, units }) => (
                          <div className="production-volume-row" key={stage}>
                            <span>{stage}</span>
                            <span className="production-bar-track">
                              <span
                                className={`production-bar-fill stage-fill-${stage.toLowerCase().replaceAll(" ", "-")}`}
                                style={{ width: `${units ? Math.max(3, units / maxStageOrderUnits * 100) : 0}%` }}
                              />
                            </span>
                            <strong>{units.toLocaleString("en-KE")}</strong>
                          </div>
                        ))}
                      </div>
                      {!orderUnits && (
                        <p className="production-chart-empty">Order quantities will appear here as jobs are added.</p>
                      )}
                    </article>
                  </section>

                  <section className="production-panel production-recent-panel">
                    <div className="production-panel-heading">
                      <div>
                        <span className="production-panel-kicker">LATEST UPDATES</span>
                        <h2>Recent production jobs</h2>
                      </div>
                      <button className="production-text-action" onClick={() => navigateTo("jobs")} type="button">
                        View all jobs
                      </button>
                    </div>
                    <JobTable
                      jobs={visibleJobs.slice(0, 5)}
                      onOpen={openJob}
                      canOpenJobSheet={canManageJobs}
                      canOpenJobSheetForJob={(job) => productionWorkspaceIds.has(job.workspaceId)}
                      canResolveJobFlag={(job) => productionWorkspaceIds.has(job.workspaceId)}
                      onFlagChanged={() => router.refresh()}
                    />
                  </section>
                </>
              ) : view === "origination" ? (
                <section className="production-panel production-list-panel">
                  <div className="production-panel-heading">
                    <div>
                      <span className="production-panel-kicker">ARTWORK QUEUE</span>
                      <h2>{hasDesignerRole ? "All jobs" : "Planned jobs"}</h2>
                    </div>
                    <span className="production-panel-total">{filteredOriginationJobs.length} jobs</span>
                  </div>
                  {editingOriginationJob ? (
                    <OriginationPrintDetailsForm
                      job={editingOriginationJob}
                      onCancel={() => setEditingOriginationJob(null)}
                      onSaved={() => {
                        setEditingOriginationJob(null);
                        router.refresh();
                        notifyToast("Printing details updated.");
                      }}
                    />
                  ) : (
                    <>
                      {hasDesignerRole && (
                        <ProductionJobFilters
                          search={jobsSearch}
                          onSearchChange={setJobsSearch}
                          workflowStage={jobsWorkflowStageFilter}
                          onWorkflowStageChange={setJobsWorkflowStageFilter}
                        />
                      )}
                      <JobTable
                        emptyDescription={hasActiveJobsFilter
                          ? "Try changing your search or filters."
                          : hasDesignerRole
                            ? "Jobs from all workflow stages and workspaces will appear here."
                            : "Jobs from booking through board production across workspaces will appear here."}
                        emptyHeading={hasActiveJobsFilter
                          ? "No matching jobs"
                          : "No planned jobs"}
                        jobs={filteredOriginationJobs}
                        actionLabel="View job sheet"
                        onOpen={openJob}
                        onArtworkUploaded={() => router.refresh()}
                        onFlagChanged={() => router.refresh()}
                        onEditPrintDetails={setEditingOriginationJob}
                        canFlagJobs
                        canResolveJobFlag={(job) => productionWorkspaceIds.has(job.workspaceId)}
                        onRegisterArtworkUploadTrigger={registerArtworkUploadTrigger}
                        showArtwork
                        showDelivery={false}
                        showWorkspace={!hasDesignerRole}
                        jobNameOpensArtworkHistory
                        onArtworkHistory={setArtworkHistoryJob}
                      />
                    </>
                  )}
                </section>
              ) : view === "customers" ? (
                <section className="production-panel production-list-panel">
                  <div className="production-panel-heading">
                    <div>
                      <span className="production-panel-kicker">CUSTOMER CATALOG</span>
                      <h2>Customers</h2>
                    </div>
                    {canBookOrders && (
                      <button
                        className="production-primary-button"
                        onClick={() => {
                          setCustomerCreationStatus("");
                          setEditingCustomer(null);
                          setIsCreatingCustomer(true);
                        }}
                        type="button"
                      >
                        <FiPlus aria-hidden="true" /> Add customer
                      </button>
                    )}
                  </div>
                  {customerCreationStatus && (
                    <p className="production-order-booking-status" role="status">
                      {customerCreationStatus}
                    </p>
                  )}
                  <label className="production-catalog-search">
                    <span>Search customers</span>
                    <input
                      onChange={(event) => setCustomerSearch(event.target.value)}
                      placeholder="Name, contact, phone, email or address"
                      type="search"
                      value={customerSearch}
                    />
                  </label>
                  {(() => {
                    const query = customerSearch.trim().toLowerCase();
                    const filteredCustomers = query
                      ? customers.filter((customer) =>
                        [
                          customer.name,
                          customer.kraPin,
                          customer.contactPerson,
                          customer.phone,
                          customer.email,
                          customer.address,
                        ].some((value) => value?.toLowerCase().includes(query)),
                      )
                      : customers;
                    return filteredCustomers.length ? (
                    <div className="production-table-scroll">
                      <table className="production-jobs-table">
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>KRA PIN</th>
                            <th>Contact person</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Address</th>
                            {canBookOrders && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCustomers.map((customer) => (
                            <tr key={customer.id}>
                              <td><strong>{customer.name}</strong></td>
                              <td>{customer.kraPin || "—"}</td>
                              <td>{customer.contactPerson || "—"}</td>
                              <td>{customer.phone || "—"}</td>
                              <td>{customer.email || "—"}</td>
                              <td>{customer.address || "—"}</td>
                              {canBookOrders && (
                                <td>
                                  <button
                                    className="production-text-action"
                                    onClick={() => {
                                      setCustomerCreationStatus("");
                                      setIsCreatingCustomer(false);
                                      setEditingCustomer(customer);
                                    }}
                                    type="button"
                                  >
                                    Edit
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    ) : (
                    <div className="production-empty-state">
                      <span className="production-empty-mark" aria-hidden="true"><FiUsers /></span>
                      <h3>{customerSearch.trim() ? "No matching customers" : "No customers yet"}</h3>
                      <p>
                        {customerSearch.trim()
                          ? "Try a different name, contact, phone, email or address."
                          : "Add a customer before creating products or booking orders."}
                      </p>
                    </div>
                    );
                  })()}
                </section>
              ) : view === "products" ? (
                <section className="production-panel production-list-panel">
                  <div className="production-panel-heading">
                    <div>
                      <span className="production-panel-kicker">PRODUCT CATALOG</span>
                      <h2>Products</h2>
                    </div>
                    {canBookOrders && (
                      <button
                        className="production-primary-button"
                        onClick={() => setIsCreatingProduct(true)}
                        type="button"
                      >
                        <FiPlus aria-hidden="true" /> Add product
                      </button>
                    )}
                  </div>
                  <ProductionProductCatalog
                    cartonTypes={cartonTypes}
                    canEdit={canBookOrders}
                    customers={customers}
                    workspaceId={
                      workspaceFilter === "all"
                        ? defaultOrderBookingWorkspaceId
                        : workspaceFilter
                    }
                    routerRefresh={() => router.refresh()}
                  />
                </section>
              ) : view === "planning" ? (
                productionWorkspaceIds.size ? (
                  <PlanningBoard
                    key={planningWorkspaceId}
                    jobs={jobs}
                    machines={machines}
                    maintenancePlans={maintenancePlans}
                    maintenanceTickets={maintenanceTickets}
                    onSaved={() => router.refresh()}
                    workspaces={workspaces}
                    preferredWorkspaceId={planningWorkspaceId}
                    schedules={schedules}
                  />
                ) : (
                  <section className="production-panel production-list-panel">
                    <div className="production-panel-heading">
                      <div>
                        <span className="production-panel-kicker">CAPACITY & SEQUENCING</span>
                        <h2>Production access required</h2>
                      </div>
                    </div>
                    <p className="production-chart-empty">
                      Planning is available to members with Production access. Ask your workspace administrator to update your access.
                    </p>
                  </section>
                )
              ) : view === "execution" ? (
                productionWorkspaceIds.size ? (
                  <ShopFloorExecutionBoard
                    key={planningWorkspaceId}
                    onSaved={() => router.refresh()}
                    operationRuns={operationRuns}
                    workspaces={workspaces.filter((workspace) =>
                      productionWorkspaceIds.has(workspace.id),
                    )}
                    preferredWorkspaceId={planningWorkspaceId}
                    schedules={schedules}
                  />
                ) : (
                  <section className="production-panel production-list-panel">
                    <div className="production-panel-heading">
                      <div>
                        <span className="production-panel-kicker">SHOP FLOOR</span>
                        <h2>Production access required</h2>
                      </div>
                    </div>
                    <p className="production-chart-empty">
                      Shop-floor reporting is available to members with Production access. Ask your workspace administrator to update your access.
                    </p>
                  </section>
                )
              ) : view === "quality" ? (
                productionWorkspaceIds.size ? (
                  <QualityManagementBoard
                    key={planningWorkspaceId}
                    inspections={qualityInspections}
                    jobs={jobs}
                    nonconformances={nonconformances}
                    qualityMetrics={qualityMetrics}
                    onSaved={() => router.refresh()}
                    workspaces={workspaces.filter((workspace) =>
                      productionWorkspaceIds.has(workspace.id),
                    )}
                    preferredWorkspaceId={planningWorkspaceId}
                    schedules={schedules}
                  />
                ) : (
                  <section className="production-panel production-list-panel">
                    <div className="production-panel-heading">
                      <div>
                        <span className="production-panel-kicker">QUALITY ASSURANCE</span>
                        <h2>Production access required</h2>
                      </div>
                    </div>
                    <p className="production-chart-empty">
                      Quality management is available to members with Production access. Ask your workspace administrator to update your access.
                    </p>
                  </section>
                )
              ) : view === "quotes" ? (
                <ProductionQuotesBoard
                  isAdmin={isAdmin}
                  onSaved={() => router.refresh()}
                  workspaces={quoteOrganizations}
                  preferredWorkspaceId={defaultQuoteWorkspaceId}
                  quotes={quotes}
                />
              ) : view === "procurement" ? (
                <ProcurementBoard
                  key={planningWorkspaceId}
                  materials={materials}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) => productionWorkspaceIds.has(workspace.id))}
                  preferredWorkspaceId={planningWorkspaceId}
                  purchaseOrders={purchaseOrders}
                  suppliers={suppliers}
                />
              ) : view === "inventory" ? (
                <InventoryBoard
                  key={planningWorkspaceId}
                  jobs={jobs}
                  materials={materials}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) => productionWorkspaceIds.has(workspace.id))}
                  preferredWorkspaceId={planningWorkspaceId}
                  stockMovements={stockMovements}
                />
              ) : view === "reels" ? (
                <PaperReelBoard
                  jobs={jobs}
                  materials={materials}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) =>
                    productionWorkspaceIds.has(workspace.id),
                  )}
                  paperReels={paperReels}
                  preferredWorkspaceId={planningWorkspaceId}
                  purchaseOrders={purchaseOrders}
                  reelMovements={reelMovements}
                  suppliers={suppliers}
                />
              ) : view === "warehouse" ? (
                <WarehouseDispatchBoard
                  key={planningWorkspaceId}
                  dispatches={dispatches}
                  jobs={jobs}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) =>
                    productionWorkspaceIds.has(workspace.id),
                  )}
                  preferredWorkspaceId={planningWorkspaceId}
                  schedules={schedules}
                  warehousePallets={warehousePallets}
                />
              ) : view === "tooling" ? (
                <ToolingManagementBoard
                  key={planningWorkspaceId}
                  customers={customers}
                  jobs={jobs}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) =>
                    productionWorkspaceIds.has(workspace.id),
                  )}
                  preferredWorkspaceId={planningWorkspaceId}
                  tooling={tooling}
                />
              ) : view === "maintenance" ? (
                <MaintenanceBoard
                  key={planningWorkspaceId}
                  machines={machines}
                  maintenancePlans={maintenancePlans}
                  maintenanceTickets={maintenanceTickets}
                  materials={materials}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) =>
                    productionWorkspaceIds.has(workspace.id),
                  )}
                  preferredWorkspaceId={planningWorkspaceId}
                />
              ) : view === "hr" ? (
                <ProductionHrBoard
                  canManagePayroll={canManagePayroll}
                  employees={employees}
                  leaveRequests={leaveRequests}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) =>
                    productionWorkspaceIds.has(workspace.id),
                  )}
                  preferredWorkspaceId={planningWorkspaceId}
                  rosterShifts={rosterShifts}
                  safetyTrainings={safetyTrainings}
                />
              ) : view === "invoicing" ? (
                <ProductionInvoiceBoard
                  key={planningWorkspaceId}
                  dispatches={dispatches}
                  invoices={invoices}
                  onSaved={() => router.refresh()}
                  workspaces={workspaces.filter((workspace) =>
                    productionWorkspaceIds.has(workspace.id),
                  )}
                  preferredWorkspaceId={planningWorkspaceId}
                />
              ) : (
                <section className="production-panel production-list-panel">
                  <div className="production-panel-heading">
                    <div>
                      <span className="production-panel-kicker">
                        {view === "jobs" ? "SHARED JOB REGISTER" : "WORKFLOW QUEUE"}
                      </span>
                      <h2>{view === "jobs" ? "All production jobs" : `${view} queue`}</h2>
                    </div>
                    <span className="production-panel-total">
                      {view === "jobs"
                        ? filteredAllJobs.length
                        : view === "Printing"
                          ? printingJobs.length
                          : view === "Board Production"
                            ? boardProductionJobs.length
                          : visibleJobs.filter((job) => job.workflowStage === view).length} jobs
                    </span>
                  </div>
                  {view === "jobs" && (
                    <ProductionJobFilters
                      search={jobsSearch}
                      onSearchChange={setJobsSearch}
                      workflowStage={jobsWorkflowStageFilter}
                      onWorkflowStageChange={setJobsWorkflowStageFilter}
                    />
                  )}
                  <JobTable
                    jobs={view === "jobs"
                      ? filteredAllJobs
                      : view === "Printing"
                        ? printingJobs
                        : view === "Board Production"
                          ? boardProductionJobs
                          : visibleJobs.filter((job) => job.workflowStage === view)}
                    onOpen={openJob}
                    actionLabel={view === "Order Booking"
                      ? "Open order"
                      : view === "Printing"
                        ? "Open printing job"
                        : "Open job"}
                    numberLabel={view === "Order Booking" ? "Order no." : "Job sheet no."}
                    emptyHeading={view === "Order Booking"
                      ? "No booked orders"
                      : view === "jobs"
                        ? hasActiveJobsFilter ? "No matching jobs" : "No production jobs yet"
                        : undefined}
                    emptyDescription={view === "Order Booking"
                      ? "Orders booked for your workspaces will appear here."
                      : view === "jobs"
                        ? hasActiveJobsFilter
                          ? "Try changing your search or filters."
                          : "Orders appear here after they move beyond Order Booking."
                      : undefined}
                    canOpenJobSheet={view === "Order Booking" || canManageJobs}
                    canOpenJobSheetForJob={(job) =>
                      view === "Order Booking" || productionWorkspaceIds.has(job.workspaceId)
                    }
                    showWorkspace={view !== "jobs"}
                    canResolveJobFlag={(job) => productionWorkspaceIds.has(job.workspaceId)}
                    onFlagChanged={() => router.refresh()}
                  />
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      <OrderBookingDialog
        cartonTypes={cartonTypes}
        defaultWorkspaceId={defaultOrderBookingWorkspaceId}
        onBooked={() => router.refresh()}
        onClose={() => setIsBookingOrder(false)}
        open={isBookingOrder}
        workspaces={orderBookingOrganizations}
      />
      <CreateProductionItemDialog
        cartonTypes={cartonTypes}
        defaultWorkspaceId={defaultOrderBookingWorkspaceId}
        onClose={() => setIsCreatingProduct(false)}
        onCreated={(item) => {
          setProductCreationStatus(`${item.name} created with code ${item.itemCode}.`);
          setIsCreatingProduct(false);
          router.refresh();
        }}
        open={isCreatingProduct}
        workspaces={productOrganizations}
      />
      <CreateProductionCustomerDialog
        customer={editingCustomer ?? undefined}
        defaultWorkspaceId={defaultOrderBookingWorkspaceId}
        onClose={() => {
          setIsCreatingCustomer(false);
          setEditingCustomer(null);
        }}
        onCreated={(customer) => {
          setCustomerCreationStatus(
            editingCustomer
              ? `${customer.name} updated in the shared catalog.`
              : `${customer.name} added to the shared catalog.`,
          );
          setIsCreatingCustomer(false);
          setEditingCustomer(null);
          router.refresh();
        }}
        open={isCreatingCustomer || Boolean(editingCustomer)}
        workspaces={productOrganizations}
      />
      <ArtworkHistoryDialog
        job={artworkHistoryJob}
        onClose={() => setArtworkHistoryJob(null)}
        onUploadRevision={uploadRevisionFromHistory}
      />
    </div>
  );
}

type ProductionPayrollEmployee = {
  id: string;
  employeeNo: string;
  name: string;
  department: string;
  status: string;
  payrollConfigured: boolean;
  monthlyBasicSalary: number;
  monthlyTaxableAllowances: number;
};

type ProductionPayrollLine = {
  id: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  basicSalary: number;
  taxableAllowances: number;
  grossPay: number;
  nssfEmployee: number;
  nssfEmployer: number;
  shif: number;
  housingLevyEmployee: number;
  housingLevyEmployer: number;
  taxablePay: number;
  paye: number;
  netPay: number;
};

type ProductionPayrollRun = {
  id: string;
  period: string;
  rulesVersion: string;
  createdAt: string;
  lines: ProductionPayrollLine[];
};

type ProductionPayrollData = {
  employees: ProductionPayrollEmployee[];
  runs: ProductionPayrollRun[];
};

function isProductionPayrollEmployee(value: unknown): value is ProductionPayrollEmployee {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.employeeNo === "string" &&
    typeof value.name === "string" &&
    typeof value.department === "string" &&
    typeof value.status === "string" &&
    typeof value.payrollConfigured === "boolean" &&
    typeof value.monthlyBasicSalary === "number" &&
    typeof value.monthlyTaxableAllowances === "number";
}

function isProductionPayrollLine(value: unknown): value is ProductionPayrollLine {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.employeeNo === "string" &&
    typeof value.employeeName === "string" &&
    typeof value.department === "string" &&
    typeof value.basicSalary === "number" &&
    typeof value.taxableAllowances === "number" &&
    typeof value.grossPay === "number" &&
    typeof value.nssfEmployee === "number" &&
    typeof value.nssfEmployer === "number" &&
    typeof value.shif === "number" &&
    typeof value.housingLevyEmployee === "number" &&
    typeof value.housingLevyEmployer === "number" &&
    typeof value.taxablePay === "number" &&
    typeof value.paye === "number" &&
    typeof value.netPay === "number";
}

function isProductionPayrollRun(value: unknown): value is ProductionPayrollRun {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.period === "string" &&
    typeof value.rulesVersion === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.lines) &&
    value.lines.every(isProductionPayrollLine);
}

function parseProductionPayrollData(value: Record<string, unknown>): ProductionPayrollData {
  if (
    !Array.isArray(value.employees) ||
    !value.employees.every(isProductionPayrollEmployee) ||
    !Array.isArray(value.runs) ||
    !value.runs.every(isProductionPayrollRun)
  ) {
    throw new Error("The server returned invalid payroll data.");
  }
  return { employees: value.employees, runs: value.runs };
}

function productionMoney(value: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function ProductionPayrollPanel({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [data, setData] = useState<ProductionPayrollData | null>(null);
  const [period, setPeriod] = useState(() => dateKey(new Date()).slice(0, 7));
  const [selectedRunId, setSelectedRunId] = useState("");
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPayrollData = useCallback(async () => {
    const response = await requestProductionJson(
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/payroll`,
      { method: "GET" },
    );
    return parseProductionPayrollData(response);
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    void fetchPayrollData()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : String(error));
          setHasError(true);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchPayrollData]);

  const saveCompensation = async (
    event: FormEvent<HTMLFormElement>,
    employeeId: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const monthlyBasicSalary = Number(values.get("monthlyBasicSalary"));
    const monthlyTaxableAllowances = Number(values.get("monthlyTaxableAllowances"));
    setIsSaving(true);
    setMessage("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/employees/${encodeURIComponent(employeeId)}/compensation`,
        {
          method: "PATCH",
          body: JSON.stringify({ monthlyBasicSalary, monthlyTaxableAllowances }),
        },
      );
      setData(await fetchPayrollData());
      setMessage("Compensation saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const createPayrollRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/payroll`,
        {
          method: "POST",
          body: JSON.stringify({ period }),
        },
      );
      if (!isRecord(response.payrollRun) || typeof response.payrollRun.id !== "string") {
        throw new Error("The server returned an invalid payroll run.");
      }
      const runId = response.payrollRun.id;
      setData(await fetchPayrollData());
      setSelectedRunId(runId);
      setMessage(`Payroll run saved for ${period}. Saved runs cannot be recalculated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRun = data?.runs.find((run) => run.id === selectedRunId) ??
    data?.runs[0] ??
    null;
  const totalGrossPay = selectedRun?.lines.reduce((total, line) => total + line.grossPay, 0) ?? 0;
  const totalNetPay = selectedRun?.lines.reduce((total, line) => total + line.netPay, 0) ?? 0;
  const totalEmployerContributions = selectedRun?.lines.reduce(
    (total, line) => total + line.nssfEmployer + line.housingLevyEmployer,
    0,
  ) ?? 0;

  return (
    <section className="production-panel">
      <div className="production-panel-heading">
        <div>
          <span className="production-panel-kicker">PAYROLL &amp; STATUTORY DEDUCTIONS</span>
          <h2>Kenya monthly payroll</h2>
        </div>
        <span className="production-panel-total">{data?.runs.length ?? 0} saved runs</span>
      </div>
      <p className="production-reel-explainer">
        Set basic salary and taxable cash allowances; every active employee must have compensation saved before a run can be generated. Runs snapshot the inputs and rules used; they are immutable and one run is allowed per month.
        Calculations assume resident employees and do not include non-cash benefits, individual insurance relief, additional pension or mortgage deductions, or attendance-based proration. Verify totals before filing or remitting.
      </p>
      <p className="production-reel-explainer">
        Defaults: progressive PAYE bands with KES 2,400 resident relief; NSSF at 6% up to KES 108,000 pensionable pay; SHIF at 2.75% (KES 300 minimum); and employee/employer housing levy at 1.5% of gross pay. See{" "}
        <a href="https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye" rel="noreferrer" target="_blank">
          KRA PAYE guidance
        </a>
        . Update the versioned defaults in the payroll rules module when legislation changes.
      </p>
      {message && (
        <p
          className={hasError ? "production-order-booking-error" : "production-order-booking-status"}
          role={hasError ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {isLoading ? (
        <p className="production-chart-empty">Loading payroll data…</p>
      ) : (
        <>
          <div className="production-panel-heading">
            <h3>Employee compensation</h3>
            <span className="production-panel-total">{data?.employees.length ?? 0} employees</span>
          </div>
          {data?.employees.length ? (
            <div className="production-hr-shifts">
              {data.employees.map((employee) => (
                <article className="production-hr-shift" key={`${employee.id}:${employee.monthlyBasicSalary}:${employee.monthlyTaxableAllowances}`}>
                  <div className="production-panel-heading">
                    <div>
                      <h3>{employee.name} <span>· {employee.employeeNo}</span></h3>
                      <p>
                        {employee.department} · {employee.status} · {employee.payrollConfigured ? "Compensation configured" : "Compensation required"}
                      </p>
                    </div>
                    <span className="production-panel-total">
                      Gross {productionMoney(employee.monthlyBasicSalary + employee.monthlyTaxableAllowances)}
                    </span>
                  </div>
                  <form
                    className="production-reel-form production-hr-form"
                    onSubmit={(event) => saveCompensation(event, employee.id)}
                  >
                    <label>
                      <span>Monthly basic salary (KES)</span>
                      <input
                        name="monthlyBasicSalary"
                        type="number"
                        min="0"
                        max="1000000000"
                        step="1"
                        defaultValue={employee.monthlyBasicSalary}
                        required
                      />
                    </label>
                    <label>
                      <span>Taxable allowances (KES)</span>
                      <input
                        name="monthlyTaxableAllowances"
                        type="number"
                        min="0"
                        max="1000000000"
                        step="1"
                        defaultValue={employee.monthlyTaxableAllowances}
                        required
                      />
                    </label>
                    <button className="production-primary-button" disabled={isSaving} type="submit">
                      Save compensation
                    </button>
                  </form>
                </article>
              ))}
            </div>
          ) : (
            <p className="production-chart-empty">Add employees before setting compensation.</p>
          )}

          <form className="production-reel-form production-hr-form production-payroll-run-form" onSubmit={createPayrollRun}>
            <label>
              <span>Payroll month</span>
              <input
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                required
              />
            </label>
            <button
              className="production-primary-button"
              disabled={
                isSaving ||
                !data?.employees.some((employee) => employee.status === "ACTIVE") ||
                Boolean(data?.employees.some((employee) =>
                  employee.status === "ACTIVE" && !employee.payrollConfigured,
                ))
              }
              type="submit"
            >
              Generate saved payroll run
            </button>
          </form>

          {selectedRun && (
            <>
              <div className="production-hr-metrics">
                <div><strong>{productionMoney(totalGrossPay)}</strong><span>Gross pay · {selectedRun.period}</span></div>
                <div><strong>{productionMoney(totalNetPay)}</strong><span>Employee net pay</span></div>
                <div><strong>{productionMoney(totalEmployerContributions)}</strong><span>Employer NSSF + housing levy</span></div>
              </div>
              <div className="production-panel-heading">
                <div>
                  <h3>Saved payroll details</h3>
                  <p>Generated {new Date(selectedRun.createdAt).toLocaleString()} · rules {selectedRun.rulesVersion}</p>
                </div>
                {data && data.runs.length > 1 && (
                  <label className="production-hr-workspace">
                    <span>Saved month</span>
                    <select
                      value={selectedRun.id}
                      onChange={(event) => setSelectedRunId(event.target.value)}
                    >
                      {data.runs.map((run) => (
                        <option key={run.id} value={run.id}>{run.period}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="production-table-scroll">
                <table className="production-data-table">
                  <thead>
                    <tr>
                      <th>Employee</th><th>Gross</th><th>NSSF</th><th>SHIF</th>
                      <th>Housing levy</th><th>PAYE</th><th>Net pay</th>
                      <th>Employer NSSF + levy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRun.lines.map((line) => (
                      <tr key={line.id}>
                        <td><strong>{line.employeeNo}</strong><small>{line.employeeName} · {line.department}</small></td>
                        <td>{productionMoney(line.grossPay)}</td>
                        <td>{productionMoney(line.nssfEmployee)}</td>
                        <td>{productionMoney(line.shif)}</td>
                        <td>{productionMoney(line.housingLevyEmployee)}</td>
                        <td>{productionMoney(line.paye)}</td>
                        <td><strong>{productionMoney(line.netPay)}</strong></td>
                        <td>{productionMoney(line.nssfEmployer + line.housingLevyEmployer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ProductionHrBoard({
  canManagePayroll,
  workspaces,
  preferredWorkspaceId,
  employees,
  rosterShifts,
  leaveRequests,
  safetyTrainings,
  onSaved,
}: {
  canManagePayroll: boolean;
  workspaces: ProductionDashboardWorkspace[];
  preferredWorkspaceId: string;
  employees: ProductionDashboardEmployee[];
  rosterShifts: ProductionDashboardShift[];
  leaveRequests: ProductionDashboardLeaveRequest[];
  safetyTrainings: ProductionDashboardSafetyTraining[];
  onSaved: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(
    workspaces.some((workspace) => workspace.id === preferredWorkspaceId)
      ? preferredWorkspaceId
      : workspaces[0]?.id ?? "",
  );
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const orgEmployees = employees.filter((employee) => employee.workspaceId === workspaceId);
  const activeEmployees = orgEmployees.filter((employee) => employee.status === "ACTIVE");
  const orgShifts = rosterShifts.filter((shift) => shift.workspaceId === workspaceId);
  const orgLeaveRequests = leaveRequests.filter((request) => request.workspaceId === workspaceId);
  const orgTrainings = safetyTrainings.filter((training) => training.workspaceId === workspaceId);
  const openLeaveCount = orgLeaveRequests.filter((request) => request.status === "PENDING").length;
  const todayKey = dateKey(new Date());
  const expiringTrainingCount = orgTrainings.filter((training) =>
    training.expiresAt && training.expiresAt.slice(0, 10) <= todayKey,
  ).length;

  const submitJson = async (
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    body: Record<string, string>,
    success: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    setIsSaving(true);
    setMessage("");
    setHasError(false);
    try {
      await requestProductionJson(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      form.reset();
      notifyToast(success);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const addEmployee = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    return submitJson(
      event,
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/employees`,
      {
        employeeNo: String(data.get("employeeNo") ?? ""),
        name: String(data.get("name") ?? ""),
        department: String(data.get("department") ?? ""),
        jobTitle: String(data.get("jobTitle") ?? ""),
        hiredAt: String(data.get("hiredAt") ?? ""),
      },
      "Employee added to the register.",
    );
  };

  const createShift = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    return submitJson(
      event,
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/shifts`,
      {
        employeeId: String(data.get("employeeId") ?? ""),
        shiftName: String(data.get("shiftName") ?? ""),
        workCenter: String(data.get("workCenter") ?? ""),
        startsAt: new Date(String(data.get("startsAt"))).toISOString(),
        endsAt: new Date(String(data.get("endsAt"))).toISOString(),
        breakMinutes: String(data.get("breakMinutes") ?? "0"),
        notes: String(data.get("notes") ?? ""),
      },
      "Roster shift scheduled.",
    );
  };

  const recordAttendance = async (
    event: FormEvent<HTMLFormElement>,
    shift: ProductionDashboardShift,
  ) => {
    const data = new FormData(event.currentTarget);
    const clockIn = String(data.get("clockedInAt") ?? "");
    const clockOut = String(data.get("clockedOutAt") ?? "");
    return submitJson(
      event,
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/shifts/${encodeURIComponent(shift.id)}/attendance`,
      {
        clockedInAt: new Date(clockIn).toISOString(),
        clockedOutAt: clockOut ? new Date(clockOut).toISOString() : "",
        overtimeMinutes: String(data.get("overtimeMinutes") ?? "0"),
        notes: String(data.get("notes") ?? ""),
      },
      "Attendance recorded.",
    );
  };

  const closeAttendance = async (
    event: FormEvent<HTMLFormElement>,
    shift: ProductionDashboardShift,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setIsSaving(true);
    setMessage("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/shifts/${encodeURIComponent(shift.id)}/attendance`,
        {
          method: "PATCH",
          body: JSON.stringify({
            clockedOutAt: new Date(String(data.get("clockedOutAt"))).toISOString(),
            overtimeMinutes: String(data.get("overtimeMinutes") ?? "0"),
            notes: String(data.get("notes") ?? ""),
          }),
        },
      );
      notifyToast("Attendance clock-out recorded.");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const requestLeave = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    return submitJson(
      event,
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/leave-requests`,
      {
        employeeId: String(data.get("employeeId") ?? ""),
        leaveType: String(data.get("leaveType") ?? "ANNUAL"),
        startsAt: String(data.get("startsAt") ?? ""),
        endsAt: String(data.get("endsAt") ?? ""),
        reason: String(data.get("reason") ?? ""),
      },
      "Leave request submitted for review.",
    );
  };

  const reviewLeave = async (event: FormEvent<HTMLFormElement>, request: ProductionDashboardLeaveRequest) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const status = submitter instanceof HTMLButtonElement ? submitter.value : "";
    setIsSaving(true);
    setMessage("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/leave-requests/${encodeURIComponent(request.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            reviewNotes: String(data.get("reviewNotes") ?? ""),
          }),
        },
      );
      notifyToast(`Leave request ${status.toLowerCase()}.`);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const addTraining = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    return submitJson(
      event,
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/hr/trainings`,
      {
        employeeId: String(data.get("employeeId") ?? ""),
        trainingName: String(data.get("trainingName") ?? ""),
        provider: String(data.get("provider") ?? ""),
        completedAt: String(data.get("completedAt") ?? ""),
        expiresAt: String(data.get("expiresAt") ?? ""),
        notes: String(data.get("notes") ?? ""),
      },
      "Safety training record saved.",
    );
  };

  return (
    <div className="production-board-stack production-hr-board">
      <section className="production-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PEOPLE OPERATIONS</span>
            <h2>Workforce, attendance &amp; safety</h2>
          </div>
          <label className="production-hr-workspace">
            <span>Production workspace</span>
            <select
              aria-label="Production workspace"
              onChange={(event) => setWorkspaceId(event.target.value)}
              value={workspaceId}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="production-reel-explainer">
          Record employees, rosters, actual attendance and manually confirmed overtime.
        </p>
        {message && (
          <p className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
            {message}
          </p>
        )}
        <div className="production-hr-metrics">
          <div><strong>{activeEmployees.length}</strong><span>Active employees</span></div>
          <div><strong>{orgShifts.length}</strong><span>Rostered shifts</span></div>
          <div><strong>{openLeaveCount}</strong><span>Leave awaiting review</span></div>
          <div><strong>{expiringTrainingCount}</strong><span>Training expired / due</span></div>
        </div>
      </section>

      <section className="production-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">EMPLOYEE REGISTER</span>
            <h2>Employees</h2>
          </div>
          <span className="production-panel-total">{orgEmployees.length} employees</span>
        </div>
        <form className="production-reel-form production-hr-form" onSubmit={addEmployee}>
          <label><span>Employee number</span><input name="employeeNo" required maxLength={60} /></label>
          <label><span>Full name</span><input name="name" required maxLength={120} /></label>
          <label><span>Department</span><input name="department" required maxLength={80} /></label>
          <label><span>Job title</span><input name="jobTitle" required maxLength={100} /></label>
          <label><span>Hire date</span><input name="hiredAt" type="date" required /></label>
          <button className="production-primary-button" disabled={!workspaceId || isSaving} type="submit">Add employee</button>
        </form>
        {orgEmployees.length ? (
          <div className="production-table-scroll">
            <table className="production-data-table">
              <thead><tr><th>Employee</th><th>Department</th><th>Position</th><th>Hire date</th><th>Status</th></tr></thead>
              <tbody>{orgEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td><strong>{employee.employeeNo}</strong><small>{employee.name}</small></td>
                  <td>{employee.department}</td>
                  <td>{employee.jobTitle}</td>
                  <td>{dateOnlyLabel(employee.hiredAt)}</td>
                  <td>{employee.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="production-chart-empty">No employees in this workspace yet.</p>}
      </section>

      {canManagePayroll && workspaceId && (
        <ProductionPayrollPanel key={workspaceId} workspaceId={workspaceId} />
      )}

      <section className="production-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">ROSTER &amp; TIME CAPTURE</span>
            <h2>Shift roster and attendance</h2>
          </div>
          <span className="production-panel-total">{orgShifts.length} shifts</span>
        </div>
        <form className="production-reel-form production-hr-form" onSubmit={createShift}>
          <label>
            <span>Employee</span>
            <select name="employeeId" required defaultValue="">
              <option value="" disabled>Select employee</option>
              {activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}
            </select>
          </label>
          <label><span>Shift name</span><input name="shiftName" required maxLength={80} placeholder="Day shift" /></label>
          <label><span>Work center</span><input name="workCenter" required maxLength={80} /></label>
          <label><span>Starts</span><input name="startsAt" type="datetime-local" required /></label>
          <label><span>Ends</span><input name="endsAt" type="datetime-local" required /></label>
          <label><span>Break (minutes)</span><input name="breakMinutes" type="number" min="0" max="600" defaultValue="0" required /></label>
          <label className="production-hr-wide"><span>Roster notes</span><input name="notes" maxLength={500} /></label>
          <button className="production-primary-button" disabled={!activeEmployees.length || isSaving} type="submit">Schedule shift</button>
        </form>
        {orgShifts.length ? (
          <div className="production-hr-shifts">
            {orgShifts.map((shift) => (
              <article className="production-hr-shift" key={shift.id}>
                <div className="production-panel-heading">
                  <div>
                    <h3>{shift.employee.name} <span>· {shift.employee.employeeNo}</span></h3>
                    <p>{shift.shiftName} · {shift.workCenter} · {shift.employee.department}</p>
                  </div>
                  <span className="production-panel-total">{shift.status}</span>
                </div>
                <p className="production-reel-explainer">
                  {new Date(shift.startsAt).toLocaleString()} – {new Date(shift.endsAt).toLocaleString()} · {shift.breakMinutes} min break
                </p>
                {!shift.attendance ? (
                  <form className="production-reel-form production-hr-form" onSubmit={(event) => recordAttendance(event, shift)}>
                    <label><span>Clock in</span><input name="clockedInAt" type="datetime-local" defaultValue={localDateTimeValue(shift.startsAt)} required /></label>
                    <label><span>Clock out (optional)</span><input name="clockedOutAt" type="datetime-local" /></label>
                    <label><span>Overtime minutes</span><input name="overtimeMinutes" type="number" min="0" max="1440" defaultValue="0" required /></label>
                    <label className="production-hr-wide"><span>Attendance notes</span><input name="notes" maxLength={500} /></label>
                    <button className="production-primary-button" disabled={isSaving} type="submit">Record attendance</button>
                  </form>
                ) : (
                  <div className="production-hr-attendance">
                    <p>
                      Clocked in {new Date(shift.attendance.clockedInAt).toLocaleString()}
                      {shift.attendance.clockedOutAt && <> · out {new Date(shift.attendance.clockedOutAt).toLocaleString()}</>}
                      {" · "}{shift.attendance.overtimeMinutes} overtime minutes
                    </p>
                    {shift.attendance.notes && <p>{shift.attendance.notes}</p>}
                    {!shift.attendance.clockedOutAt && (
                      <form className="production-reel-form production-hr-form" onSubmit={(event) => closeAttendance(event, shift)}>
                        <label><span>Clock out</span><input name="clockedOutAt" type="datetime-local" defaultValue={localDateTimeValue()} required /></label>
                        <label><span>Overtime minutes</span><input name="overtimeMinutes" type="number" min="0" max="1440" defaultValue={String(shift.attendance.overtimeMinutes)} required /></label>
                        <label className="production-hr-wide"><span>Attendance notes</span><input name="notes" maxLength={500} defaultValue={shift.attendance.notes} /></label>
                        <button className="production-primary-button" disabled={isSaving} type="submit">Close attendance</button>
                      </form>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : <p className="production-chart-empty">No roster shifts scheduled.</p>}
      </section>

      <section className="production-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">LEAVE MANAGEMENT</span>
            <h2>Leave requests</h2>
          </div>
          <span className="production-panel-total">{openLeaveCount} pending</span>
        </div>
        <form className="production-reel-form production-hr-form" onSubmit={requestLeave}>
          <label>
            <span>Employee</span>
            <select name="employeeId" required defaultValue="">
              <option value="" disabled>Select employee</option>
              {activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}
            </select>
          </label>
          <label><span>Leave type</span><select name="leaveType">{PRODUCTION_LEAVE_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
          <label><span>Start date</span><input name="startsAt" type="date" required /></label>
          <label><span>End date</span><input name="endsAt" type="date" required /></label>
          <label className="production-hr-wide"><span>Reason</span><input name="reason" required maxLength={1000} /></label>
          <button className="production-primary-button" disabled={!activeEmployees.length || isSaving} type="submit">Submit leave request</button>
        </form>
        {orgLeaveRequests.length ? (
          <div className="production-hr-shifts">
            {orgLeaveRequests.map((request) => (
              <article className="production-hr-shift" key={request.id}>
                <div className="production-panel-heading">
                  <div>
                    <h3>{request.employee.name} <span>· {request.employee.employeeNo}</span></h3>
                    <p>{request.leaveType} · {dateOnlyLabel(request.startsAt)} – {dateOnlyLabel(request.endsAt)}</p>
                  </div>
                  <span className="production-panel-total">{request.status}</span>
                </div>
                <p>{request.reason}</p>
                {request.status === "PENDING" ? (
                  <form className="production-hr-review" onSubmit={(event) => reviewLeave(event, request)}>
                    <label><span>Review notes (required for rejection)</span><input name="reviewNotes" maxLength={1000} /></label>
                    <button className="production-primary-button" disabled={isSaving} name="decision" value="APPROVED" type="submit">Approve</button>
                    <button className="production-table-action" disabled={isSaving} name="decision" value="REJECTED" type="submit">Reject</button>
                  </form>
                ) : request.reviewNotes && <p className="production-reel-explainer">Review: {request.reviewNotes}</p>}
              </article>
            ))}
          </div>
        ) : <p className="production-chart-empty">No leave requests recorded.</p>}
      </section>

      <section className="production-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">HSE &amp; COMPETENCY</span>
            <h2>Safety training</h2>
          </div>
          <span className="production-panel-total">{expiringTrainingCount} expired / due</span>
        </div>
        <form className="production-reel-form production-hr-form" onSubmit={addTraining}>
          <label>
            <span>Employee</span>
            <select name="employeeId" required defaultValue="">
              <option value="" disabled>Select employee</option>
              {orgEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}
            </select>
          </label>
          <label><span>Training</span><input name="trainingName" required maxLength={160} /></label>
          <label><span>Provider</span><input name="provider" maxLength={120} /></label>
          <label><span>Completed</span><input name="completedAt" type="date" required /></label>
          <label><span>Expires (optional)</span><input name="expiresAt" type="date" /></label>
          <label className="production-hr-wide"><span>Notes</span><input name="notes" maxLength={1000} /></label>
          <button className="production-primary-button" disabled={!orgEmployees.length || isSaving} type="submit">Save training record</button>
        </form>
        {orgTrainings.length ? (
          <div className="production-table-scroll">
            <table className="production-data-table">
              <thead><tr><th>Employee</th><th>Training</th><th>Provider</th><th>Completed</th><th>Expiry</th><th>State</th></tr></thead>
              <tbody>{orgTrainings.map((training) => {
                const isDue = Boolean(training.expiresAt && training.expiresAt.slice(0, 10) <= todayKey);
                return (
                  <tr key={training.id}>
                    <td><strong>{training.employee.employeeNo}</strong><small>{training.employee.name}</small></td>
                    <td>{training.trainingName}</td>
                    <td>{training.provider || "—"}</td>
                    <td>{dateOnlyLabel(training.completedAt)}</td>
                    <td>{training.expiresAt ? dateOnlyLabel(training.expiresAt) : "No expiry"}</td>
                    <td>{isDue ? "EXPIRED / DUE" : "CURRENT"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <p className="production-chart-empty">No safety training records yet.</p>}
      </section>
    </div>
  );
}
