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

function isValidDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value.includes("T");
}

function isBoundedIntegerString(value: unknown, maximum: number): value is string {
  return typeof value === "string" &&
    /^(0|[1-9]\d*)$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) <= maximum;
}

export const PRODUCTION_EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const PRODUCTION_LEAVE_TYPES = ["ANNUAL", "SICK", "UNPAID", "OTHER"] as const;
export const PRODUCTION_LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const PRODUCTION_SAFETY_INCIDENT_TYPES = [
  "INJURY",
  "NEAR_MISS",
  "HAZARD",
  "PROPERTY_DAMAGE",
  "ENVIRONMENTAL",
] as const;
export const PRODUCTION_SAFETY_SEVERITIES = [
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
] as const;
export const PRODUCTION_SAFETY_INCIDENT_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "CLOSED",
] as const;

export function formatProductionEmployeeNumber(companyName: string, sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError("Employee number sequence must be a positive safe integer.");
  }
  const prefix = companyName.match(/[A-Za-z]/g)?.slice(0, 3).join("").toUpperCase() || "EMP";
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

export function parseProductionHrOptionList(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const options = value.split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
  const normalizedOptions = options.map((option) => option.toLocaleLowerCase());
  if (
    options.length > 100 ||
    options.some((option) => option.length > 80) ||
    new Set(normalizedOptions).size !== normalizedOptions.length
  ) {
    return null;
  }
  return options;
}

export type ProductionEmployeeInput = {
  name: string;
  nationalId: string;
  dateOfBirth: string;
  address: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  department: string;
  jobTitle: string;
  machineId: string;
  workArea: string;
  hiredAt: string;
};

export type ProductionRosterShiftInput = {
  employeeId: string;
  shiftName: string;
  workCenter: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: string;
  notes: string;
};

export type ProductionAttendanceInput = {
  clockedInAt: string;
  clockedOutAt: string;
  overtimeMinutes: string;
  notes: string;
};

export type ProductionAttendanceCloseInput = {
  clockedOutAt: string;
  overtimeMinutes: string;
  notes: string;
};

export type ProductionLeaveRequestInput = {
  employeeId: string;
  leaveType: typeof PRODUCTION_LEAVE_TYPES[number];
  startsAt: string;
  endsAt: string;
  reason: string;
};

export type ProductionLeaveReviewInput = {
  status: "APPROVED" | "REJECTED";
  reviewNotes: string;
};

export type ProductionSafetyTrainingInput = {
  employeeId: string;
  trainingName: string;
  provider: string;
  completedAt: string;
  expiresAt: string;
  notes: string;
};

export type ProductionSafetyIncidentInput = {
  employeeId: string;
  incidentType: typeof PRODUCTION_SAFETY_INCIDENT_TYPES[number];
  severity: typeof PRODUCTION_SAFETY_SEVERITIES[number];
  title: string;
  occurredAt: string;
  location: string;
  description: string;
  immediateAction: string;
};

export type ProductionSafetyIncidentUpdateInput = {
  status: "INVESTIGATING" | "CLOSED";
  investigationNotes: string;
  correctiveAction: string;
};

export function validateProductionEmployee(value: unknown): value is ProductionEmployeeInput {
  return isRecord(value) &&
    isNonEmptyString(value.name, 120) &&
    isNonEmptyString(value.nationalId, 50) &&
    isValidDate(value.dateOfBirth) &&
    value.dateOfBirth <= new Date().toISOString().slice(0, 10) &&
    isNonEmptyString(value.address, 500) &&
    isNonEmptyString(value.nextOfKinName, 120) &&
    isNonEmptyString(value.nextOfKinRelationship, 80) &&
    isNonEmptyString(value.nextOfKinPhone, 40) &&
    isNonEmptyString(value.department, 80) &&
    isNonEmptyString(value.jobTitle, 100) &&
    (value.machineId === "" || isNonEmptyString(value.machineId, 100)) &&
    isNonEmptyString(value.workArea, 100) &&
    isValidDate(value.hiredAt);
}

export function validateProductionRosterShift(value: unknown): value is ProductionRosterShiftInput {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.employeeId, 100) ||
    !isNonEmptyString(value.shiftName, 80) ||
    !isNonEmptyString(value.workCenter, 80) ||
    !isValidDateTime(value.startsAt) ||
    !isValidDateTime(value.endsAt) ||
    !isBoundedIntegerString(value.breakMinutes, 600) ||
    !isBoundedString(value.notes, 500)
  ) {
    return false;
  }
  const start = new Date(value.startsAt).getTime();
  const end = new Date(value.endsAt).getTime();
  return end > start && end - start <= 36 * 60 * 60 * 1000;
}

export function validateProductionAttendance(value: unknown): value is ProductionAttendanceInput {
  if (
    !isRecord(value) ||
    !isValidDateTime(value.clockedInAt) ||
    !(value.clockedOutAt === "" || isValidDateTime(value.clockedOutAt)) ||
    !isBoundedIntegerString(value.overtimeMinutes, 1440) ||
    !isBoundedString(value.notes, 500)
  ) {
    return false;
  }
  return value.clockedOutAt === "" ||
    new Date(value.clockedOutAt).getTime() >= new Date(value.clockedInAt).getTime();
}

export function validateProductionAttendanceClose(
  value: unknown,
): value is ProductionAttendanceCloseInput {
  return isRecord(value) &&
    isValidDateTime(value.clockedOutAt) &&
    isBoundedIntegerString(value.overtimeMinutes, 1440) &&
    isBoundedString(value.notes, 500);
}

export function validateProductionLeaveRequest(value: unknown): value is ProductionLeaveRequestInput {
  return isRecord(value) &&
    isNonEmptyString(value.employeeId, 100) &&
    PRODUCTION_LEAVE_TYPES.some((leaveType) => leaveType === value.leaveType) &&
    isValidDate(value.startsAt) &&
    isValidDate(value.endsAt) &&
    value.endsAt >= value.startsAt &&
    isNonEmptyString(value.reason, 1000);
}

export function validateProductionLeaveReview(value: unknown): value is ProductionLeaveReviewInput {
  return isRecord(value) &&
    (value.status === "APPROVED" || value.status === "REJECTED") &&
    isBoundedString(value.reviewNotes, 1000) &&
    (value.status !== "REJECTED" || isNonEmptyString(value.reviewNotes, 1000));
}

export function isProductionLeaveTransitionAllowed(current: string): boolean {
  return current === "PENDING";
}

export function validateProductionSafetyTraining(
  value: unknown,
): value is ProductionSafetyTrainingInput {
  return isRecord(value) &&
    isNonEmptyString(value.employeeId, 100) &&
    isNonEmptyString(value.trainingName, 160) &&
    isBoundedString(value.provider, 120) &&
    isValidDate(value.completedAt) &&
    (value.expiresAt === "" || isValidDate(value.expiresAt)) &&
    (value.expiresAt === "" || value.expiresAt >= value.completedAt) &&
    isBoundedString(value.notes, 1000);
}

export function validateProductionEmployeeStatus(value: unknown): value is {
  status: typeof PRODUCTION_EMPLOYEE_STATUSES[number];
} {
  return isRecord(value) &&
    PRODUCTION_EMPLOYEE_STATUSES.some((status) => status === value.status);
}

export function validateProductionSafetyIncident(
  value: unknown,
): value is ProductionSafetyIncidentInput {
  return isRecord(value) &&
    (value.employeeId === "" || isNonEmptyString(value.employeeId, 100)) &&
    PRODUCTION_SAFETY_INCIDENT_TYPES.some((type) => type === value.incidentType) &&
    PRODUCTION_SAFETY_SEVERITIES.some((severity) => severity === value.severity) &&
    isNonEmptyString(value.title, 160) &&
    isValidDateTime(value.occurredAt) &&
    new Date(value.occurredAt).getTime() <= Date.now() &&
    isBoundedString(value.location, 160) &&
    isNonEmptyString(value.description, 2000) &&
    isBoundedString(value.immediateAction, 1000);
}

export function validateProductionSafetyIncidentUpdate(
  value: unknown,
): value is ProductionSafetyIncidentUpdateInput {
  return isRecord(value) &&
    (value.status === "INVESTIGATING" || value.status === "CLOSED") &&
    isBoundedString(value.investigationNotes, 2000) &&
    isBoundedString(value.correctiveAction, 2000) &&
    (value.status !== "CLOSED" ||
      (isNonEmptyString(value.investigationNotes, 2000) &&
        isNonEmptyString(value.correctiveAction, 2000)));
}

export function isProductionSafetyIncidentTransitionAllowed(
  current: string,
  next: string,
): boolean {
  return (current === "OPEN" &&
      (next === "INVESTIGATING" || next === "CLOSED")) ||
    (current === "INVESTIGATING" &&
      (next === "INVESTIGATING" || next === "CLOSED"));
}
