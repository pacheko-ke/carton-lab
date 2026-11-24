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

export type ProductionEmployeeInput = {
  employeeNo: string;
  name: string;
  department: string;
  jobTitle: string;
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

export function validateProductionEmployee(value: unknown): value is ProductionEmployeeInput {
  return isRecord(value) &&
    isNonEmptyString(value.employeeNo, 60) &&
    isNonEmptyString(value.name, 120) &&
    isNonEmptyString(value.department, 80) &&
    isNonEmptyString(value.jobTitle, 100) &&
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
