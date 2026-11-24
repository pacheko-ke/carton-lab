import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductionLeaveTransitionAllowed,
  validateProductionAttendance,
  validateProductionAttendanceClose,
  validateProductionEmployee,
  validateProductionLeaveRequest,
  validateProductionLeaveReview,
  validateProductionRosterShift,
  validateProductionSafetyTraining,
} from "../src/lib/production-hr-data.ts";

test("validates employee records and scheduled shifts", () => {
  assert.equal(validateProductionEmployee({
    employeeNo: "EMP-012",
    name: "Alex Operator",
    department: "Converting",
    jobTitle: "Machine Operator",
    hiredAt: "2025-03-04",
  }), true);
  assert.equal(validateProductionEmployee({
    employeeNo: "EMP-012",
    name: "Alex Operator",
    department: "",
    jobTitle: "Machine Operator",
    hiredAt: "2025-03-04",
  }), false);
  const shift = {
    employeeId: "employee-1",
    shiftName: "Day shift",
    workCenter: "Corrugating",
    startsAt: "2026-11-24T06:00:00.000Z",
    endsAt: "2026-11-24T14:00:00.000Z",
    breakMinutes: "30",
    notes: "",
  };
  assert.equal(validateProductionRosterShift(shift), true);
  assert.equal(validateProductionRosterShift({ ...shift, endsAt: shift.startsAt }), false);
  assert.equal(validateProductionRosterShift({ ...shift, breakMinutes: "601" }), false);
});

test("validates attendance and bounded overtime values", () => {
  const attendance = {
    clockedInAt: "2026-11-24T06:05:00.000Z",
    clockedOutAt: "2026-11-24T15:15:00.000Z",
    overtimeMinutes: "45",
    notes: "Changeover delayed close",
  };
  assert.equal(validateProductionAttendance(attendance), true);
  assert.equal(validateProductionAttendance({
    ...attendance,
    clockedOutAt: "2026-11-24T05:00:00.000Z",
  }), false);
  assert.equal(validateProductionAttendance({ ...attendance, overtimeMinutes: "1441" }), false);
  assert.equal(validateProductionAttendanceClose({
    clockedOutAt: "2026-11-24T15:15:00.000Z",
    overtimeMinutes: "45",
    notes: "",
  }), true);
  assert.equal(validateProductionAttendanceClose({
    clockedOutAt: "not-a-date",
    overtimeMinutes: "45",
    notes: "",
  }), false);
});

test("validates leave review transitions and safety-training expiry", () => {
  const leave = {
    employeeId: "employee-1",
    leaveType: "ANNUAL",
    startsAt: "2026-12-01",
    endsAt: "2026-12-03",
    reason: "Personal leave",
  };
  assert.equal(validateProductionLeaveRequest(leave), true);
  assert.equal(validateProductionLeaveRequest({ ...leave, endsAt: "2026-11-30" }), false);
  assert.equal(validateProductionLeaveReview({ status: "APPROVED", reviewNotes: "" }), true);
  assert.equal(validateProductionLeaveReview({ status: "REJECTED", reviewNotes: "" }), false);
  assert.equal(isProductionLeaveTransitionAllowed("PENDING"), true);
  assert.equal(isProductionLeaveTransitionAllowed("APPROVED"), false);
  assert.equal(validateProductionSafetyTraining({
    employeeId: "employee-1",
    trainingName: "Machine guarding",
    provider: "Internal HSE",
    completedAt: "2026-10-01",
    expiresAt: "2027-10-01",
    notes: "",
  }), true);
  assert.equal(validateProductionSafetyTraining({
    employeeId: "employee-1",
    trainingName: "Machine guarding",
    provider: "",
    completedAt: "2026-10-01",
    expiresAt: "2026-09-30",
    notes: "",
  }), false);
});
