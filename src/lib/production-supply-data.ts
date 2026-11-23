export const PRODUCTION_MATERIAL_CATEGORIES = [
  "PAPER",
  "INK",
  "ADHESIVE",
  "CONSUMABLE",
  "OTHER",
] as const;

export const PRODUCTION_MATERIAL_UNITS = [
  "kg",
  "g",
  "L",
  "mL",
  "sheet",
  "ream",
  "roll",
  "pcs",
] as const;

export type ProductionMaterialCategory =
  (typeof PRODUCTION_MATERIAL_CATEGORIES)[number];
export type ProductionMaterialUnit = (typeof PRODUCTION_MATERIAL_UNITS)[number];

export type ProductionMaterialInput = {
  name: string;
  category: ProductionMaterialCategory;
  unit: ProductionMaterialUnit;
  reorderPoint: string;
};

export type ProductionSupplierInput = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};

export type ProductionPurchaseOrderInput = {
  supplierId: string;
  expectedAt: string;
  notes: string;
  lines: Array<{ materialId: string; quantity: string }>;
};

export type ProductionReceiptInput = {
  lines: Array<{ purchaseOrderLineId: string; quantity: string }>;
};

export type ProductionStockMovementInput = {
  type: "ISSUE" | "ADJUSTMENT";
  materialId: string;
  jobId: string;
  quantity: string;
  notes: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maxLength;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isQuantity(value: unknown, allowZero = false, allowNegative = false): value is string {
  if (typeof value !== "string") return false;
  const pattern = allowNegative
    ? /^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/
    : /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
  if (!pattern.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) &&
    Math.abs(amount) <= 99_999_999_999.999 &&
    (allowNegative ? amount !== 0 : allowZero || amount > 0);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateProductionMaterial(value: unknown): value is ProductionMaterialInput {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.name, 120) &&
    PRODUCTION_MATERIAL_CATEGORIES.some((category) => category === value.category) &&
    PRODUCTION_MATERIAL_UNITS.some((unit) => unit === value.unit) &&
    isQuantity(value.reorderPoint, true)
  );
}

export function validateProductionSupplier(value: unknown): value is ProductionSupplierInput {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.name, 120) &&
    isBoundedString(value.contactPerson, 120) &&
    isBoundedString(value.phone, 40) &&
    isBoundedString(value.email, 254) &&
    (!value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) &&
    isBoundedString(value.address, 500)
  );
}

export function validateProductionPurchaseOrder(
  value: unknown,
): value is ProductionPurchaseOrderInput {
  if (!isRecord(value) ||
      !isNonEmptyString(value.supplierId, 100) ||
      !isBoundedString(value.expectedAt, 10) ||
      (value.expectedAt !== "" && !isIsoDate(value.expectedAt)) ||
      !isBoundedString(value.notes, 1000) ||
      !Array.isArray(value.lines) ||
      value.lines.length < 1 ||
      value.lines.length > 50) {
    return false;
  }
  const materialIds = new Set<string>();
  return value.lines.every((line) => {
    if (!isRecord(line) ||
        !isNonEmptyString(line.materialId, 100) ||
        !isQuantity(line.quantity)) {
      return false;
    }
    if (materialIds.has(line.materialId)) return false;
    materialIds.add(line.materialId);
    return true;
  });
}

export function validateProductionReceipt(value: unknown): value is ProductionReceiptInput {
  if (!isRecord(value) ||
      !Array.isArray(value.lines) ||
      value.lines.length < 1 ||
      value.lines.length > 50) {
    return false;
  }
  const purchaseOrderLineIds = new Set<string>();
  return value.lines.every((line) => {
    if (!isRecord(line) ||
        !isNonEmptyString(line.purchaseOrderLineId, 100) ||
        !isQuantity(line.quantity)) {
      return false;
    }
    if (purchaseOrderLineIds.has(line.purchaseOrderLineId)) return false;
    purchaseOrderLineIds.add(line.purchaseOrderLineId);
    return true;
  });
}

export function validateProductionStockMovement(
  value: unknown,
): value is ProductionStockMovementInput {
  if (!isRecord(value) ||
      (value.type !== "ISSUE" && value.type !== "ADJUSTMENT") ||
      !isNonEmptyString(value.materialId, 100) ||
      !isBoundedString(value.jobId, 100) ||
      !isBoundedString(value.notes, 500)) {
    return false;
  }
  if (value.type === "ISSUE") {
    return isNonEmptyString(value.jobId, 100) && isQuantity(value.quantity);
  }
  return isQuantity(value.quantity, false, true) &&
    isNonEmptyString(value.notes, 500);
}
