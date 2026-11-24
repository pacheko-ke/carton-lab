function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function isPositiveIntegerString(value: unknown): value is string {
  return typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) <= 100_000_000;
}

export type ProductionWarehousePalletInput = {
  jobId: string;
  quantity: string;
  location: string;
  notes: string;
};

export function receivableFinishedGoodsQuantity(
  orderQuantity: number,
  packedQuantity: number,
  receivedQuantity: number,
): number {
  if (
    !Number.isSafeInteger(orderQuantity) ||
    !Number.isSafeInteger(packedQuantity) ||
    !Number.isSafeInteger(receivedQuantity) ||
    orderQuantity < 0 ||
    packedQuantity < 0 ||
    receivedQuantity < 0
  ) {
    return 0;
  }
  return Math.max(0, Math.min(orderQuantity, packedQuantity) - receivedQuantity);
}

export function validateProductionWarehousePallet(
  value: unknown,
): value is ProductionWarehousePalletInput {
  return isRecord(value) &&
    isNonEmptyString(value.jobId, 100) &&
    isPositiveIntegerString(value.quantity) &&
    isNonEmptyString(value.location, 120) &&
    isBoundedString(value.notes, 500);
}

export type ProductionDispatchInput = {
  jobId: string;
  vehicleRegistration: string;
  driverName: string;
  route: string;
  notes: string;
  lines: Array<{ palletId: string; quantity: string }>;
};

export function validateProductionDispatch(
  value: unknown,
): value is ProductionDispatchInput {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.jobId, 100) ||
    !isNonEmptyString(value.vehicleRegistration, 40) ||
    !isNonEmptyString(value.driverName, 120) ||
    !isBoundedString(value.route, 200) ||
    !isBoundedString(value.notes, 500) ||
    !Array.isArray(value.lines) ||
    value.lines.length < 1 ||
    value.lines.length > 50
  ) {
    return false;
  }
  const palletIds = new Set<string>();
  return value.lines.every((line) => {
    if (
      !isRecord(line) ||
      !isNonEmptyString(line.palletId, 100) ||
      !isPositiveIntegerString(line.quantity) ||
      palletIds.has(line.palletId)
    ) {
      return false;
    }
    palletIds.add(line.palletId);
    return true;
  });
}

export type ProductionDeliveryInput = {
  receivedBy: string;
  deliveryNotes: string;
};

export function validateProductionDelivery(
  value: unknown,
): value is ProductionDeliveryInput {
  return isRecord(value) &&
    isNonEmptyString(value.receivedBy, 120) &&
    isBoundedString(value.deliveryNotes, 500);
}
