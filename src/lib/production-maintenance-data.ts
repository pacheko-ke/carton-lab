function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isNonNegativeIntegerString(value: unknown, maximum: number): value is string {
  return typeof value === "string" &&
    /^(0|[1-9]\d*)$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) <= maximum;
}

function isPositiveDecimalString(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value) ||
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0 ||
    Number(value) > 100_000_000
  ) {
    return false;
  }
  return true;
}

export const PRODUCTION_MACHINE_STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED"] as const;
export const PRODUCTION_MAINTENANCE_TICKET_TYPES = ["BREAKDOWN", "PREVENTIVE"] as const;
export const PRODUCTION_MAINTENANCE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const PRODUCTION_MAINTENANCE_TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProductionMachineInput = {
  machineNo: string;
  name: string;
  machineType: string;
  workCenter: string;
  location: string;
};

export type ProductionMachineUpdateInput = {
  status: "ACTIVE" | "RETIRED";
  location: string;
};

export type ProductionMaintenancePlanInput = {
  machineId: string;
  taskName: string;
  intervalDays: string;
  nextDueAt: string;
  instructions: string;
};

export type ProductionMaintenanceTicketInput = {
  machineId: string;
  planId: string;
  jobId: string;
  operationScheduleId: string;
  ticketType: typeof PRODUCTION_MAINTENANCE_TICKET_TYPES[number];
  priority: typeof PRODUCTION_MAINTENANCE_PRIORITIES[number];
  description: string;
  downtimeMinutes: string;
};

export type ProductionMaintenanceTicketUpdateInput = {
  status: Exclude<typeof PRODUCTION_MAINTENANCE_TICKET_STATUSES[number], "OPEN">;
  resolution: string;
  downtimeMinutes: string;
};

export type ProductionMaintenancePartInput = {
  materialId: string;
  quantity: string;
};

export function getProductionMachineMaintenanceWarnings(
  machineId: string,
  scheduledStartAt: string,
  scheduledEndAt: string,
  plans: ReadonlyArray<{
    machineId: string;
    taskName: string;
    nextDueAt: string;
    active: boolean;
  }>,
  tickets: ReadonlyArray<{
    machineId: string;
    ticketNo: string;
    status: string;
    openedAt: string;
  }>,
): string[] {
  if (!machineId) return [];

  const scheduledStart = new Date(scheduledStartAt);
  const scheduledEnd = new Date(scheduledEndAt);
  if (
    Number.isNaN(scheduledStart.getTime()) ||
    Number.isNaN(scheduledEnd.getTime()) ||
    scheduledEnd < scheduledStart
  ) {
    return [];
  }

  const localDateKey = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const scheduleStartDate = localDateKey(scheduledStart);
  const scheduleEndDate = localDateKey(scheduledEnd);
  const warnings = plans
    .filter((plan) => {
      if (!plan.active || plan.machineId !== machineId) return false;
      const dueDate = plan.nextDueAt.slice(0, 10);
      return dueDate >= scheduleStartDate && dueDate <= scheduleEndDate;
    })
    .map((plan) => `Preventive maintenance due ${plan.nextDueAt.slice(0, 10)}: ${plan.taskName}`);

  for (const ticket of tickets) {
    if (
      ticket.machineId !== machineId ||
      (ticket.status !== "OPEN" && ticket.status !== "IN_PROGRESS")
    ) {
      continue;
    }
    const openedAt = new Date(ticket.openedAt);
    if (!Number.isNaN(openedAt.getTime()) && openedAt <= scheduledEnd) {
      warnings.push(`Open maintenance ticket ${ticket.ticketNo} (${ticket.status.replaceAll("_", " ")})`);
    }
  }

  return warnings;
}

export function validateProductionMachine(value: unknown): value is ProductionMachineInput {
  return isRecord(value) &&
    isNonEmptyString(value.machineNo, 60) &&
    isNonEmptyString(value.name, 120) &&
    isNonEmptyString(value.machineType, 80) &&
    isNonEmptyString(value.workCenter, 80) &&
    isBoundedString(value.location, 120);
}

export function validateProductionMachineUpdate(
  value: unknown,
): value is ProductionMachineUpdateInput {
  return isRecord(value) &&
    (value.status === "ACTIVE" || value.status === "RETIRED") &&
    isBoundedString(value.location, 120);
}

export function validateProductionMaintenancePlan(
  value: unknown,
): value is ProductionMaintenancePlanInput {
  return isRecord(value) &&
    isNonEmptyString(value.machineId, 100) &&
    isNonEmptyString(value.taskName, 160) &&
    isNonNegativeIntegerString(value.intervalDays, 3650) &&
    Number(value.intervalDays) > 0 &&
    isValidDate(value.nextDueAt) &&
    isBoundedString(value.instructions, 1000);
}

export function validateProductionMaintenancePlanActivity(value: unknown): value is { active: boolean } {
  return isRecord(value) && typeof value.active === "boolean";
}

export function validateProductionMaintenanceTicket(
  value: unknown,
): value is ProductionMaintenanceTicketInput {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.machineId, 100) ||
    !(value.jobId === "" || isNonEmptyString(value.jobId, 100)) ||
    !(value.operationScheduleId === "" || isNonEmptyString(value.operationScheduleId, 100)) ||
    (value.ticketType !== "BREAKDOWN" && value.ticketType !== "PREVENTIVE") ||
    !PRODUCTION_MAINTENANCE_PRIORITIES.some((priority) => priority === value.priority) ||
    !isNonEmptyString(value.description, 1000) ||
    !isNonNegativeIntegerString(value.downtimeMinutes, 1_000_000)
  ) {
    return false;
  }
  if (value.ticketType === "PREVENTIVE") {
    return isNonEmptyString(value.planId, 100);
  }
  return value.planId === "";
}

export function validateProductionMaintenanceTicketUpdate(
  value: unknown,
): value is ProductionMaintenanceTicketUpdateInput {
  return isRecord(value) &&
    (value.status === "IN_PROGRESS" || value.status === "COMPLETED" || value.status === "CANCELLED") &&
    isBoundedString(value.resolution, 1000) &&
    (value.status === "IN_PROGRESS" || isNonEmptyString(value.resolution, 1000)) &&
    isNonNegativeIntegerString(value.downtimeMinutes, 1_000_000);
}

export function isProductionMaintenanceTransitionAllowed(
  current: string,
  next: ProductionMaintenanceTicketUpdateInput["status"],
): boolean {
  return (current === "OPEN" && (next === "IN_PROGRESS" || next === "CANCELLED")) ||
    (current === "IN_PROGRESS" && (next === "COMPLETED" || next === "CANCELLED"));
}

export function validateProductionMaintenancePart(
  value: unknown,
): value is ProductionMaintenancePartInput {
  return isRecord(value) &&
    isNonEmptyString(value.materialId, 100) &&
    isPositiveDecimalString(value.quantity);
}
