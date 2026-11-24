function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDecimal(
  value: unknown,
  maximum: number,
  maxFractionDigits: number,
  allowNegative = false,
): value is string {
  const pattern = allowNegative
    ? /^-?(0|[1-9]\d*)(\.\d{1,3})?$/
    : /^(0|[1-9]\d*)(\.\d{1,3})?$/;
  if (typeof value !== "string" || !pattern.test(value)) return false;
  if ((value.split(".")[1] ?? "").length > maxFractionDigits) return false;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= maximum;
}

function optionalId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100;
}

export type ProductionPaperReelInput = {
  materialId: string;
  supplierId: string;
  purchaseOrderLineId: string;
  parentReelId: string;
  batchNo: string;
  widthMm: string;
  gsm: string;
  weightKg: string;
  storageLocation: string;
  notes: string;
};

export function validateProductionPaperReel(
  value: unknown,
): value is ProductionPaperReelInput {
  if (!isRecord(value)) return false;
  const isRemnant = typeof value.parentReelId === "string" && Boolean(value.parentReelId.trim());
  return (
    typeof value.materialId === "string" &&
    value.materialId.trim().length > 0 &&
    value.materialId.length <= 100 &&
    optionalId(value.supplierId) &&
    optionalId(value.purchaseOrderLineId) &&
    optionalId(value.parentReelId) &&
    typeof value.batchNo === "string" &&
    value.batchNo.length <= 80 &&
    (isRemnant || Boolean(value.batchNo.trim())) &&
    isDecimal(value.widthMm, 3000, 2) &&
    Number(value.widthMm) > 0 &&
    isDecimal(value.gsm, 5000, 3) &&
    Number(value.gsm) > 0 &&
    isDecimal(value.weightKg, 1_000_000, 3) &&
    Number(value.weightKg) > 0 &&
    typeof value.storageLocation === "string" &&
    value.storageLocation.length <= 120 &&
    typeof value.notes === "string" &&
    value.notes.length <= 500
  );
}

export type ProductionReelMovementInput = {
  action: "ISSUE" | "RETURN" | "REMNANT" | "ADJUSTMENT";
  quantityKg: string;
  jobId: string;
  widthMm: string;
  storageLocation: string;
  notes: string;
};

export function isProductionReelWeightUnit(unit: string): boolean {
  return unit === "kg";
}

export function validateProductionReelMovement(
  value: unknown,
): value is ProductionReelMovementInput {
  if (!isRecord(value) || !optionalId(value.jobId)) return false;
  const { action, quantityKg, widthMm, storageLocation, notes } = value;
  if (
    typeof notes !== "string" ||
    notes.length > 500 ||
    typeof storageLocation !== "string" ||
    storageLocation.length > 120
  ) {
    return false;
  }
  if (action === "ADJUSTMENT") {
    return (
      isDecimal(quantityKg, 1_000_000, 3, true) &&
      Number(quantityKg) !== 0 &&
      Boolean(notes.trim())
    );
  }
  if (
    action !== "ISSUE" &&
    action !== "RETURN" &&
    action !== "REMNANT"
  ) {
    return false;
  }
  if (!isDecimal(quantityKg, 1_000_000, 3) || Number(quantityKg) <= 0) return false;
  if ((action === "ISSUE" || action === "RETURN") && !value.jobId.trim()) return false;
  if (action === "REMNANT") {
    return isDecimal(widthMm, 3000, 2) && Number(widthMm) > 0;
  }
  return true;
}
