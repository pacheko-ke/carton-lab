import assert from "node:assert/strict";
import test from "node:test";
import {
  formatProductionMachineAssetNumber,
  getProductionMachineMaintenanceWarnings,
  isProductionMachineCompatibleWithOperation,
  isProductionMaintenanceTransitionAllowed,
  PRODUCTION_MACHINE_TYPES,
  PRODUCTION_MACHINE_WORK_CENTERS,
  validateProductionMachine,
  validateProductionMaintenancePart,
  validateProductionMaintenancePlan,
  validateProductionMaintenanceTicket,
  validateProductionMaintenanceTicketUpdate,
} from "../src/lib/production-maintenance-data.ts";
import { PRODUCTION_OPERATIONS } from "../src/lib/production-data.ts";

test("warns when a scheduled machine has due preventive work or an open ticket", () => {
  const plans = [
    {
      machineId: "machine-1",
      taskName: "Lubricate bearings",
      nextDueAt: "2026-12-24",
      active: true,
    },
    {
      machineId: "machine-2",
      taskName: "Inspect belts",
      nextDueAt: "2026-12-24",
      active: true,
    },
  ];
  const tickets = [
    {
      machineId: "machine-1",
      ticketNo: "MT-001",
      status: "IN_PROGRESS",
      openedAt: "2026-12-23T12:00:00.000Z",
    },
    {
      machineId: "machine-1",
      ticketNo: "MT-002",
      status: "COMPLETED",
      openedAt: "2026-12-23T12:00:00.000Z",
    },
  ];

  assert.deepEqual(
    getProductionMachineMaintenanceWarnings(
      "machine-1",
      "2026-12-24T08:00",
      "2026-12-24T10:00",
      plans,
      tickets,
    ),
    [
      "Preventive maintenance due 2026-12-24: Lubricate bearings",
      "Open maintenance ticket MT-001 (IN PROGRESS)",
    ],
  );
  assert.deepEqual(
    getProductionMachineMaintenanceWarnings(
      "machine-1",
      "2026-12-23T08:00",
      "2026-12-23T10:00",
      plans,
      tickets,
    ),
    [],
  );
});

test("validates machine records and preventive maintenance cadence", () => {
  assert.equal(validateProductionMachine({
    name: "Corrugator 1",
    machineType: "Corrugator",
    workCenter: "Corrugating",
    location: "Plant A",
  }), true);
  assert.equal(validateProductionMachine({
    name: "Corrugator 1",
    machineType: "Corrugator",
    workCenter: "Corrugating",
    location: "",
  }), false);
  assert.equal(validateProductionMachine({
    name: "Flexo printer",
    machineType: "Flexo",
    workCenter: "Printing",
    location: "Plant A",
  }), false);
  assert.equal(validateProductionMachine({
    name: "Printing press",
    machineType: "Printing",
    workCenter: "Finishing",
    location: "Plant A",
  }), false);
  assert.deepEqual(PRODUCTION_MACHINE_TYPES, ["Printing", "Corrugator", "Stitching Machine"]);
  assert.deepEqual(PRODUCTION_MACHINE_WORK_CENTERS, PRODUCTION_OPERATIONS);

  const plan = {
    machineId: "machine-1",
    taskName: "Lubricate drive bearings",
    intervalDays: "30",
    nextDueAt: "2026-12-24",
    instructions: "Follow lockout procedure",
  };
  assert.equal(validateProductionMaintenancePlan(plan), true);
  assert.equal(validateProductionMaintenancePlan({ ...plan, intervalDays: "0" }), false);
  assert.equal(validateProductionMaintenancePlan({ ...plan, nextDueAt: "2026-02-30" }), false);
});

test("generates machine asset numbers from name, type, and sequence", () => {
  assert.equal(
    formatProductionMachineAssetNumber("Large Rotary Press", "Printing", 12),
    "LARGE-ROTARY-PRESS-PRINTING-012",
  );
  assert.equal(
    formatProductionMachineAssetNumber("Cutter", "Stitching Machine", 1),
    "CUTTER-STITCHING-MACHINE-001",
  );
  assert.equal(
    formatProductionMachineAssetNumber("x".repeat(120), "Printing", 3).length <= 60,
    true,
  );
});

test("matches planned operations to their machine type and work center", () => {
  assert.equal(isProductionMachineCompatibleWithOperation("Printing", "Printing", "Printing"), true);
  assert.equal(isProductionMachineCompatibleWithOperation("CORRUGATOR", "Corrugating", "Corrugating"), true);
  assert.equal(isProductionMachineCompatibleWithOperation("Stitching Machine", "Stitching", "Stitching"), true);
  assert.equal(isProductionMachineCompatibleWithOperation("Corrugator", "Corrugating", "Printing"), false);
  assert.equal(isProductionMachineCompatibleWithOperation("Printing", "Die Cutting", "Printing"), false);
  assert.equal(isProductionMachineCompatibleWithOperation("Any", "Packing", "Packing"), true);
});

test("requires preventive plans and valid job-linked maintenance tickets", () => {
  const ticket = {
    machineId: "machine-1",
    planId: "",
    jobId: "job-1",
    operationScheduleId: "schedule-1",
    ticketType: "BREAKDOWN",
    priority: "HIGH",
    description: "Drive belt failed during production",
    downtimeMinutes: "45",
  };
  assert.equal(validateProductionMaintenanceTicket(ticket), true);
  assert.equal(validateProductionMaintenanceTicket({ ...ticket, ticketType: "PREVENTIVE" }), false);
  assert.equal(
    validateProductionMaintenanceTicket({
      ...ticket,
      ticketType: "PREVENTIVE",
      planId: "plan-1",
    }),
    true,
  );
  assert.equal(validateProductionMaintenanceTicket({ ...ticket, downtimeMinutes: "-2" }), false);
});

test("limits ticket transitions and validates spare-part issues", () => {
  assert.equal(isProductionMaintenanceTransitionAllowed("OPEN", "IN_PROGRESS"), true);
  assert.equal(isProductionMaintenanceTransitionAllowed("IN_PROGRESS", "COMPLETED"), true);
  assert.equal(isProductionMaintenanceTransitionAllowed("OPEN", "COMPLETED"), false);
  assert.equal(isProductionMaintenanceTransitionAllowed("COMPLETED", "IN_PROGRESS"), false);
  assert.equal(validateProductionMaintenanceTicketUpdate({
    status: "COMPLETED",
    resolution: "Replaced bearing and tested the drive.",
    downtimeMinutes: "72",
  }), true);
  assert.equal(validateProductionMaintenanceTicketUpdate({
    status: "COMPLETED",
    resolution: "",
    downtimeMinutes: "72",
  }), false);
  assert.equal(validateProductionMaintenancePart({ materialId: "mat-1", quantity: "1.25" }), true);
  assert.equal(validateProductionMaintenancePart({ materialId: "mat-1", quantity: "0" }), false);
  assert.equal(validateProductionMaintenancePart({ materialId: "mat-1", quantity: "1.2345" }), false);
});
