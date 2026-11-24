export const MAX_ARTWORK_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH = 1000;
export const PRODUCTION_WORKFLOW_STAGES = [
  "Order Booking",
  "Origination",
  "Paper Booking",
  "Board Production",
  "Printing",
  "Dispatch",
] as const;

export type ProductionWorkflowStage =
  (typeof PRODUCTION_WORKFLOW_STAGES)[number];

export function isProductionWorkflowStage(
  value: unknown,
): value is ProductionWorkflowStage {
  return PRODUCTION_WORKFLOW_STAGES.some((stage) => stage === value);
}

export const PRODUCTION_OPERATIONS = [
  "Corrugating",
  "Printing",
  "Die Cutting",
  "Folder Gluing",
  "Stitching",
  "Quality Control",
  "Packing",
] as const;

export type ProductionOperation = (typeof PRODUCTION_OPERATIONS)[number];

export const PRODUCTION_OPERATION_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
] as const;

export type ProductionOperationStatus =
  (typeof PRODUCTION_OPERATION_STATUSES)[number];

export function isProductionOperation(value: unknown): value is ProductionOperation {
  return PRODUCTION_OPERATIONS.some((operation) => operation === value);
}

export function isProductionOperationStatus(
  value: unknown,
): value is ProductionOperationStatus {
  return PRODUCTION_OPERATION_STATUSES.some((status) => status === value);
}

export type ProductionOrderBookingInput = {
  itemId: string;
  customerId: string;
  customerPO: string;
  orderQty: string;
  orderDate: string;
  deliveryDate: string;
};

function isValidProductionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateProductionOrderBooking(
  value: unknown,
): value is ProductionOrderBookingInput {
  if (!isRecord(value)) return false;
  const { customerPO, orderQty, orderDate, deliveryDate } = value;
  if (
    typeof value.itemId !== "string" ||
    !value.itemId.trim() ||
    value.itemId.length > 100 ||
    typeof value.customerId !== "string" ||
    !value.customerId.trim() ||
    value.customerId.length > 100 ||
    typeof customerPO !== "string" ||
    customerPO.length > 60 ||
    typeof orderQty !== "string" ||
    !/^[1-9]\d*$/.test(orderQty) ||
    !Number.isSafeInteger(Number(orderQty)) ||
    typeof orderDate !== "string" ||
    !isValidProductionDate(orderDate) ||
    typeof deliveryDate !== "string" ||
    !isValidProductionDate(deliveryDate) ||
    deliveryDate < orderDate
  ) {
    return false;
  }
  return true;
}

export type ProductionOperationScheduleInput = {
  jobId: string;
  operation: ProductionOperation;
  workCenter: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  plannedQty: string;
  status: ProductionOperationStatus;
  notes: string;
};

export type ProductionOperationRunInput = {
  goodQty: string;
  rejectedQty: string;
  notes: string;
  completeOperation: boolean;
};

function isNonNegativeIntegerString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)$/.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}

export function validateProductionOperationRun(
  value: unknown,
): value is ProductionOperationRunInput {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeIntegerString(value.goodQty) &&
    isNonNegativeIntegerString(value.rejectedQty) &&
    (Number(value.goodQty) > 0 || Number(value.rejectedQty) > 0) &&
    typeof value.notes === "string" &&
    value.notes.length <= 500 &&
    typeof value.completeOperation === "boolean"
  );
}

export const PRODUCTION_QUALITY_INSPECTION_TYPES = [
  "INCOMING",
  "IN_PROCESS",
  "FINAL",
  "CUSTOMER_RETURN",
] as const;

export const PRODUCTION_QUALITY_CHECK_RESULTS = [
  "PASS",
  "FAIL",
  "NOT_APPLICABLE",
] as const;

const MAX_PRODUCTION_QUALITY_SAMPLE_QTY = 2_147_483_647;

export function isProductionQualityCheckResult(
  value: unknown,
): value is (typeof PRODUCTION_QUALITY_CHECK_RESULTS)[number] {
  return PRODUCTION_QUALITY_CHECK_RESULTS.some((result) => result === value);
}

export const PRODUCTION_NONCONFORMANCE_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export const PRODUCTION_NONCONFORMANCE_DISPOSITIONS = [
  "PENDING",
  "REWORK",
  "SCRAP",
  "USE_AS_IS",
  "RETURN_TO_SUPPLIER",
] as const;

export const PRODUCTION_NONCONFORMANCE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "CLOSED",
] as const;

export type ProductionQualityCheckInput = {
  checkpoint: string;
  target: string;
  observed: string;
  result: (typeof PRODUCTION_QUALITY_CHECK_RESULTS)[number];
};

export type ProductionQualityInspectionInput = {
  jobId: string;
  scheduleId: string;
  inspectionType: (typeof PRODUCTION_QUALITY_INSPECTION_TYPES)[number];
  sampleQty: string;
  rejectedQty: string;
  checks: ProductionQualityCheckInput[];
  notes: string;
  ncrDescription: string;
  ncrSeverity: (typeof PRODUCTION_NONCONFORMANCE_SEVERITIES)[number];
};

export type ProductionNonconformanceUpdateInput = {
  status: "IN_PROGRESS" | "CLOSED";
  rootCause: string;
  correctiveAction: string;
  disposition: (typeof PRODUCTION_NONCONFORMANCE_DISPOSITIONS)[number];
  resolutionNotes: string;
};

export function isProductionQualityCheck(value: unknown): value is ProductionQualityCheckInput {
  return (
    isRecord(value) &&
    isNonEmptyString(value.checkpoint, 100) &&
    isNonEmptyString(value.target, 120) &&
    isNonEmptyString(value.observed, 120) &&
    PRODUCTION_QUALITY_CHECK_RESULTS.some((result) => result === value.result)
  );
}

export function isProductionQualityInspectionType(
  value: unknown,
): value is (typeof PRODUCTION_QUALITY_INSPECTION_TYPES)[number] {
  return PRODUCTION_QUALITY_INSPECTION_TYPES.some((type) => type === value);
}

export function isProductionNonconformanceSeverity(
  value: unknown,
): value is (typeof PRODUCTION_NONCONFORMANCE_SEVERITIES)[number] {
  return PRODUCTION_NONCONFORMANCE_SEVERITIES.some((severity) => severity === value);
}

export function isProductionNonconformanceDisposition(
  value: unknown,
): value is (typeof PRODUCTION_NONCONFORMANCE_DISPOSITIONS)[number] {
  return PRODUCTION_NONCONFORMANCE_DISPOSITIONS.some((disposition) => disposition === value);
}

export function isProductionNonconformanceStatus(
  value: unknown,
): value is (typeof PRODUCTION_NONCONFORMANCE_STATUSES)[number] {
  return PRODUCTION_NONCONFORMANCE_STATUSES.some((status) => status === value);
}

export function isProductionQualityInspectionResult(
  value: unknown,
): value is "PASS" | "FAIL" {
  return value === "PASS" || value === "FAIL";
}

export function validateProductionQualityInspection(
  value: unknown,
): value is ProductionQualityInspectionInput {
  if (!isRecord(value) || !Array.isArray(value.checks)) return false;
  const { sampleQty, rejectedQty, checks } = value;
  if (
    !isNonEmptyString(value.jobId, 100) ||
    (value.scheduleId !== "" && !isNonEmptyString(value.scheduleId, 100)) ||
    !isProductionQualityInspectionType(value.inspectionType) ||
    !isNonNegativeIntegerString(sampleQty) ||
    Number(sampleQty) < 1 ||
    Number(sampleQty) > MAX_PRODUCTION_QUALITY_SAMPLE_QTY ||
    !isNonNegativeIntegerString(rejectedQty) ||
    Number(rejectedQty) > Number(sampleQty) ||
    checks.length < 1 ||
    checks.length > 30 ||
    !checks.every(isProductionQualityCheck) ||
    !checks.some((check) => check.result !== "NOT_APPLICABLE") ||
    typeof value.notes !== "string" ||
    value.notes.length > 1000 ||
    typeof value.ncrDescription !== "string" ||
    value.ncrDescription.length > 1000 ||
    !isProductionNonconformanceSeverity(value.ncrSeverity)
  ) {
    return false;
  }
  const hasFailure =
    Number(rejectedQty) > 0 || checks.some((check) => check.result === "FAIL");
  return !hasFailure || Boolean(value.ncrDescription.trim());
}

export function validateProductionNonconformanceUpdate(
  value: unknown,
): value is ProductionNonconformanceUpdateInput {
  if (!isRecord(value)) return false;
  const isUpdateStatus = value.status === "IN_PROGRESS" || value.status === "CLOSED";
  if (
    !isUpdateStatus ||
    !isBoundedString(value.rootCause, 1000) ||
    !isBoundedString(value.correctiveAction, 1000) ||
    !isProductionNonconformanceDisposition(value.disposition) ||
    !isBoundedString(value.resolutionNotes, 1000)
  ) {
    return false;
  }
  if (value.status === "CLOSED") {
    return Boolean(
      value.rootCause.trim() &&
      value.correctiveAction.trim() &&
      value.resolutionNotes.trim() &&
      value.disposition !== "PENDING",
    );
  }
  return true;
}

function isValidIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function validateProductionOperationSchedule(
  value: unknown,
): value is ProductionOperationScheduleInput {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.jobId, 100) &&
    isProductionOperation(value.operation) &&
    isNonEmptyString(value.workCenter, 80) &&
    isValidIsoDateTime(value.scheduledStartAt) &&
    isValidIsoDateTime(value.scheduledEndAt) &&
    new Date(value.scheduledEndAt).getTime() > new Date(value.scheduledStartAt).getTime() &&
    typeof value.plannedQty === "string" &&
    /^[1-9]\d*$/.test(value.plannedQty) &&
    Number.isSafeInteger(Number(value.plannedQty)) &&
    isProductionOperationStatus(value.status) &&
    typeof value.notes === "string" &&
    value.notes.length <= 500
  );
}

export type ProductionCustomerInput = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

export function validateProductionCustomer(value: unknown): value is ProductionCustomerInput {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.name, 120) &&
    isBoundedString(value.contactPerson, 120) &&
    isBoundedString(value.phone, 40) &&
    isBoundedString(value.email, 254) &&
    (!value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) &&
    isBoundedString(value.address, 300)
  );
}

export type ProductionItemInput = {
  customerId: string;
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

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maxLength;
}

function isPositiveDimension(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0;
}

export function validateProductionItem(value: unknown): value is ProductionItemInput {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.customerId, 100) &&
    isNonEmptyString(value.name, 100) &&
    isNonEmptyString(value.boxType, 80) &&
    isNonEmptyString(value.topLiner, 60) &&
    isNonEmptyString(value.medium, 60) &&
    isNonEmptyString(value.bottomLiner, 60) &&
    isPositiveDimension(value.length) &&
    isPositiveDimension(value.width) &&
    isPositiveDimension(value.height) &&
    (value.unit === "mm" || value.unit === "in")
  );
}

const JOB_SHEET_FIELD_LIMITS: Record<string, number> = {
  jobNo: 40,
  workflowStage: 30,
  issueDate: 10,
  documentType: 10,
  priority: 10,
  customer: 120,
  jobName: 100,
  customerPO: 60,
  orderDate: 10,
  deliveryDate: 10,
  boxType: 80,
  length: 40,
  width: 40,
  height: 40,
  unit: 2,
  plies: 12,
  flute: 30,
  glue: 40,
  slot: 40,
  joint: 60,
  artwork: 80,
  crease: 40,
  bwadd: 40,
  topLiner: 60,
  medium: 60,
  bottomLiner: 60,
  boardWeight: 40,
  moisture: 40,
  boardSupplier: 100,
  boardLength: 40,
  boardWidth: 40,
  creasing: 100,
  reelWidth: 40,
  ups: 20,
  grain: 80,
  orderQty: 20,
  productionQty: 20,
  spoilage: 20,
  slotting: 80,
  slotWidth: 40,
  jointType: 80,
  stitches: 40,
  stitchPosition: 60,
  squareness: 50,
  sizeTolerance: 40,
  creaseCheck: 80,
  sampling: 60,
  printCheck: 80,
  jointCheck: 80,
  bct: 40,
  printing: 10,
  printMethod: 80,
  printColor: 80,
  inkType: 60,
  artworkRef: 80,
  plateRef: 80,
  printArea: 60,
  registration: 30,
  printPosition: 80,
  printInstructions: 300,
  packAs: 60,
  pcsPerBundle: 20,
  strapping: 60,
  palletSize: 60,
  pcsPerPallet: 20,
  deliverTo: 120,
  deliveryAddress: 160,
  deliveryContact: 100,
  deliveryWindow: 80,
  vehicleDriver: 80,
  deliveryNote: 60,
  dispatchInstructions: 400,
  specialInstructions: 500,
  preparedBy: 80,
  approvedBy: 80,
  receivedBy: 80,
  supervisor: 80,
  qcApproved: 80,
  dispatchBy: 80,
};

const TRACKING_FIELD_LIMITS: Record<string, number> = {
  date: 10,
  operator: 100,
  qtyIn: 20,
  qtyOut: 20,
  rejects: 20,
  sign: 100,
};

const ARTWORK_CONTENT_TYPES: Record<string, string> = {
  ai: "application/postscript",
  cdr: "application/octet-stream",
  eps: "application/postscript",
  indd: "application/octet-stream",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  ps: "application/postscript",
  psd: "image/vnd.adobe.photoshop",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProductionJobData(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value) || JSON.stringify(value).length > 32_768) return false;

  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === "workflowStage" && !isProductionWorkflowStage(fieldValue)) {
      return false;
    }

    if (key === "tracking") {
      if (
        !Array.isArray(fieldValue) ||
        fieldValue.length > 8 ||
        fieldValue.some(
          (entry) =>
            !isRecord(entry) ||
            Object.entries(entry).some(
              ([field, item]) =>
                TRACKING_FIELD_LIMITS[field] === undefined ||
                typeof item !== "string" ||
                item.length > TRACKING_FIELD_LIMITS[field],
            ),
        )
      ) {
        return false;
      }
      continue;
    }

    const maxLength = JOB_SHEET_FIELD_LIMITS[key];
    if (
      maxLength === undefined ||
      typeof fieldValue !== "string" ||
      fieldValue.length > maxLength
    ) {
      return false;
    }
  }

  return true;
}

export function canEditProductionJobs(role: string): boolean {
  return role === "PRODUCTION";
}

export function canAttachProductionArtwork(role: string): boolean {
  return role === "DESIGNER";
}

export function canFlagProductionJobs(role: string): boolean {
  return role === "DESIGNER";
}

export function canResolveProductionJobFlags(role: string): boolean {
  return role === "PRODUCTION";
}

export function canBookProductionOrders(role: string): boolean {
  return role === "ORDER_BOOKER";
}

export function validateProductionJobFlagReason(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH &&
    value.trim().length > 0;
}

export function sanitizeArtworkFileName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 255) return null;
  const name = value
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return name && name.length <= 180 && name !== "." && name !== ".."
    ? name
    : null;
}

export function getArtworkContentType(fileName: string): string | null {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension ? ARTWORK_CONTENT_TYPES[extension] ?? null : null;
}
