function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

export const PRODUCTION_TOOLING_CATEGORIES = [
  "DIE",
  "PRINT_PLATE",
  "CYLINDER",
  "ANILOX",
] as const;

export const PRODUCTION_TOOLING_OWNERS = ["COMPANY", "CUSTOMER"] as const;
export const PRODUCTION_TOOLING_STATUSES = [
  "AVAILABLE",
  "MAINTENANCE",
  "RETIRED",
] as const;
export const PRODUCTION_TOOLING_EVENT_TYPES = [
  "USAGE",
  "REPAIR",
  "INSPECTION",
  "STATUS_CHANGE",
] as const;

export type ProductionToolingInput = {
  toolNo: string;
  name: string;
  category: typeof PRODUCTION_TOOLING_CATEGORIES[number];
  ownerType: typeof PRODUCTION_TOOLING_OWNERS[number];
  customerId: string;
  storageLocation: string;
  wearNotes: string;
  notes: string;
};

export type ProductionToolingUpdateInput = {
  status: typeof PRODUCTION_TOOLING_STATUSES[number];
  storageLocation: string;
  wearNotes: string;
  notes: string;
};

export type ProductionToolingEventInput = {
  eventType: Exclude<typeof PRODUCTION_TOOLING_EVENT_TYPES[number], "STATUS_CHANGE">;
  description: string;
  jobId: string;
};

export function isProductionToolingCategory(
  value: unknown,
): value is ProductionToolingInput["category"] {
  return typeof value === "string" &&
    PRODUCTION_TOOLING_CATEGORIES.includes(value as ProductionToolingInput["category"]);
}

export function isProductionToolingStatus(
  value: unknown,
): value is ProductionToolingUpdateInput["status"] {
  return typeof value === "string" &&
    PRODUCTION_TOOLING_STATUSES.includes(value as ProductionToolingUpdateInput["status"]);
}

export function validateProductionTooling(value: unknown): value is ProductionToolingInput {
  return isRecord(value) &&
    isNonEmptyString(value.toolNo, 60) &&
    isNonEmptyString(value.name, 120) &&
    isProductionToolingCategory(value.category) &&
    (value.ownerType === "COMPANY" || value.ownerType === "CUSTOMER") &&
    (value.ownerType === "COMPANY"
      ? value.customerId === ""
      : isNonEmptyString(value.customerId, 100)) &&
    isBoundedString(value.storageLocation, 120) &&
    isBoundedString(value.wearNotes, 500) &&
    isBoundedString(value.notes, 500);
}

export function validateProductionToolingUpdate(
  value: unknown,
): value is ProductionToolingUpdateInput {
  return isRecord(value) &&
    isProductionToolingStatus(value.status) &&
    isBoundedString(value.storageLocation, 120) &&
    isBoundedString(value.wearNotes, 500) &&
    isBoundedString(value.notes, 500);
}

export function validateProductionToolingEvent(
  value: unknown,
): value is ProductionToolingEventInput {
  return isRecord(value) &&
    (value.eventType === "USAGE" ||
      value.eventType === "REPAIR" ||
      value.eventType === "INSPECTION") &&
    isNonEmptyString(value.description, 500) &&
    (value.eventType === "USAGE"
      ? isNonEmptyString(value.jobId, 100)
      : value.jobId === "" || isNonEmptyString(value.jobId, 100));
}
