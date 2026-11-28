import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductionLeaveTransitionAllowed,
  isProductionSafetyIncidentTransitionAllowed,
  formatProductionEmployeeNumber,
  parseProductionHrOptionList,
  validateProductionAttendance,
  validateProductionAttendanceClose,
  validateProductionEmployee,
  validateProductionEmployeeStatus,
  validateProductionLeaveRequest,
  validateProductionLeaveReview,
  validateProductionRosterShift,
  validateProductionSafetyIncident,
  validateProductionSafetyIncidentUpdate,
  validateProductionSafetyTraining,
} from "../src/lib/production-hr-data.ts";

test("validates employee records and scheduled shifts", () => {
  const employee = {
    name: "Alex Operator",
    nationalId: "12345678",
    dateOfBirth: "1990-04-03",
    address: "10 Industrial Road",
    nextOfKinName: "Sam Operator",
    nextOfKinRelationship: "Sibling",
    nextOfKinPhone: "+254700000000",
    department: "Converting",
    jobTitle: "Machine Operator",
    machineId: "machine-1",
    workArea: "Converting",
    hiredAt: "2025-03-04",
  };
  assert.equal(validateProductionEmployee(employee), true);
  assert.equal(validateProductionEmployee({ ...employee, nationalId: "" }), false);
  assert.equal(validateProductionEmployee({ ...employee, dateOfBirth: "2099-01-01" }), false);
  assert.equal(validateProductionEmployee({ ...employee, machineId: "" }), true);
  assert.equal(formatProductionEmployeeNumber("Carton Lab", 1), "CAR-001");
  assert.equal(formatProductionEmployeeNumber("Box Co.", 1000), "BOX-1000");
  assert.deepEqual(parseProductionHrOptionList("Packing\nConverting\n"), ["Packing", "Converting"]);
  assert.equal(parseProductionHrOptionList("Packing\n packing "), null);
  assert.throws(() => formatProductionEmployeeNumber("Carton Lab", 0), RangeError);
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

test("validates employee status changes and safety incident reports", () => {
  assert.equal(validateProductionEmployeeStatus({ status: "INACTIVE" }), true);
  assert.equal(validateProductionEmployeeStatus({ status: "TERMINATED" }), false);

  const report = {
    employeeId: "",
    incidentType: "NEAR_MISS",
    severity: "HIGH",
    title: "Forklift nearly struck a pedestrian",
    occurredAt: "2026-11-24T06:00:00.000Z",
    location: "Dispatch bay",
    description: "A forklift entered the marked pedestrian route.",
    immediateAction: "Stopped vehicle and cleared the route.",
  };
  assert.equal(validateProductionSafetyIncident(report), true);
  assert.equal(validateProductionSafetyIncident({ ...report, severity: "EXTREME" }), false);
  assert.equal(validateProductionSafetyIncident({ ...report, occurredAt: "not-a-date" }), false);
  assert.equal(validateProductionSafetyIncident({ ...report, title: "" }), false);
});

test("requires investigation and corrective actions before safety incident closure", () => {
  assert.equal(validateProductionSafetyIncidentUpdate({
    status: "INVESTIGATING",
    investigationNotes: "",
    correctiveAction: "",
  }), true);
  assert.equal(validateProductionSafetyIncidentUpdate({
    status: "CLOSED",
    investigationNotes: "Pedestrian route markings were obscured.",
    correctiveAction: "",
  }), false);
  assert.equal(validateProductionSafetyIncidentUpdate({
    status: "CLOSED",
    investigationNotes: "Pedestrian route markings were obscured.",
    correctiveAction: "Repaint route and brief forklift operators.",
  }), true);
  assert.equal(isProductionSafetyIncidentTransitionAllowed("OPEN", "INVESTIGATING"), true);
  assert.equal(isProductionSafetyIncidentTransitionAllowed("INVESTIGATING", "CLOSED"), true);
  assert.equal(isProductionSafetyIncidentTransitionAllowed("CLOSED", "OPEN"), false);
});
