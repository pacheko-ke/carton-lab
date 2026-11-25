import assert from "node:assert/strict";
import test from "node:test";
import {
  canAttachProductionArtwork,
  canBookProductionOrders,
  canEditProductionJobs,
  canFlagProductionJobs,
  canResolveProductionJobFlags,
  isProductionOriginationQueueStage,
  getArtworkContentType,
  MAX_ARTWORK_FILE_BYTES,
  MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH,
  PRODUCTION_OPERATIONS,
  PRODUCTION_WORKFLOW_STAGES,
  sanitizeArtworkFileName,
  validateProductionItem,
  validateProductionCustomer,
  validateProductionCustomerCreation,
  validateProductionQualityInspection,
  validateProductionNonconformanceUpdate,
  validateProductionOrderBooking,
  validateProductionJobFlagReason,
  validateProductionJobData,
  validateProductionOriginationPrintDetails,
  validateProductionOperationRun,
  validateProductionOperationSchedule,
} from "../src/lib/production-data.ts";

test("validates shared production job data and tracking rows", () => {
  const data = {
    jobNo: "JS-2042",
    customer: "Carton customer",
    tracking: Array.from({ length: 8 }, () => ({
      date: "",
      operator: "",
      qtyIn: "0",
      qtyOut: "0",
      rejects: "0",
      sign: "",
    })),
  };

  assert.equal(validateProductionJobData(data), true);
  assert.equal(validateProductionJobData({ ...data, unknown: "value" }), false);
  assert.equal(validateProductionJobData({ customer: "x".repeat(121) }), false);
  assert.equal(
    validateProductionJobData({ tracking: [{ unexpected: "value" }] }),
    false,
  );
  assert.equal(
    validateProductionJobData({ tracking: Array.from({ length: 9 }, () => ({})) }),
    false,
  );
});

test("limits Origination job updates to valid printing details", () => {
  assert.equal(
    validateProductionOriginationPrintDetails({
      printMethod: "Flexo",
      registrationTolerance: "+/- 1 mm",
    }),
    true,
  );
  assert.equal(validateProductionOriginationPrintDetails({}), false);
  assert.equal(
    validateProductionOriginationPrintDetails({
      printColor: "Blue",
      workflowStage: "Printing",
    }),
    false,
  );
  assert.equal(
    validateProductionOriginationPrintDetails({
      printInstructions: "x".repeat(301),
    }),
    false,
  );
});

test("limits artwork files to 5 MiB and accepts supported artwork formats", () => {
  assert.equal(MAX_ARTWORK_FILE_BYTES, 5 * 1024 * 1024);
  assert.equal(getArtworkContentType("design.pdf"), "application/pdf");
  assert.equal(getArtworkContentType("layout.AI"), "application/postscript");
  assert.equal(getArtworkContentType("logo.svg"), "image/svg+xml");
  assert.equal(getArtworkContentType("program.exe"), null);
  assert.equal(
    sanitizeArtworkFileName("C:\\artwork\\box design.pdf"),
    "box design.pdf",
  );
  assert.equal(sanitizeArtworkFileName(".."), null);
});

test("grants job editing and artwork upload to their intended organization roles", () => {
  assert.equal(canEditProductionJobs("PRODUCTION"), true);
  assert.equal(canEditProductionJobs("DESIGNER"), false);
  assert.equal(canAttachProductionArtwork("DESIGNER"), true);
  assert.equal(canAttachProductionArtwork("PRODUCTION"), false);
});

test("limits flag creation and resolution to the intended organization roles", () => {
  assert.equal(canFlagProductionJobs("DESIGNER"), true);
  assert.equal(canFlagProductionJobs("PRODUCTION"), false);
  assert.equal(canResolveProductionJobFlags("PRODUCTION"), true);
  assert.equal(canResolveProductionJobFlags("DESIGNER"), false);
});

test("validates a non-empty job flag reason within the allowed length", () => {
  assert.equal(validateProductionJobFlagReason("Artwork mismatch"), true);
  assert.equal(validateProductionJobFlagReason("   "), false);
  assert.equal(validateProductionJobFlagReason("x".repeat(MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH)), true);
  assert.equal(validateProductionJobFlagReason("x".repeat(MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH + 1)), false);
  assert.equal(validateProductionJobFlagReason(" ".repeat(MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH + 1)), false);
  assert.equal(validateProductionJobFlagReason(null), false);
});

test("allows order booking only for Order Bookers", () => {
  assert.equal(canBookProductionOrders("ORDER_BOOKER"), true);
  assert.equal(canBookProductionOrders("PRODUCTION"), false);
  assert.equal(canBookProductionOrders("DESIGNER"), false);
});

test("validates basic order booking fields and date order", () => {
  const order = {
    itemId: "item-123",
    customerId: "customer-123",
    customerPO: "PO-123",
    orderQty: "1200",
    orderDate: "2026-11-23",
    deliveryDate: "2026-12-01",
  };
  assert.equal(validateProductionOrderBooking(order), true);
  assert.equal(validateProductionOrderBooking({ ...order, orderQty: "0" }), false);
  assert.equal(validateProductionOrderBooking({ ...order, orderDate: "2026-02-30" }), false);
  assert.equal(validateProductionOrderBooking({ ...order, deliveryDate: "2026-11-22" }), false);
  assert.equal(validateProductionOrderBooking({ ...order, customerId: " " }), false);
  assert.equal(validateProductionOrderBooking({ ...order, itemId: "" }), false);
});

test("validates multi-line order bookings and line quantities", () => {
  const order = {
    customerId: "customer-123",
    customerPO: "PO-123",
    orderDate: "2026-11-23",
    deliveryDate: "2026-12-01",
    lines: [
      { itemId: "item-123", orderQty: "1200" },
      { itemId: "item-456", orderQty: "800" },
    ],
  };
  assert.equal(validateProductionOrderBooking(order), true);
  assert.equal(validateProductionOrderBooking({ ...order, lines: [] }), false);
  assert.equal(
    validateProductionOrderBooking({
      ...order,
      lines: [{ itemId: "item-123", orderQty: "0" }],
    }),
    false,
  );
  assert.equal(
    validateProductionOrderBooking({
      ...order,
      lines: Array.from({ length: 101 }, (_, index) => ({
        itemId: `item-${index}`,
        orderQty: "1",
      })),
    }),
    false,
  );
});

test("validates shared customer details and optional contact information", () => {
  const customer = {
    name: "Carton customer",
    kraPin: "A000000000Z",
    contactPerson: "Jane Doe",
    phone: "+254700000000",
    email: "jane@example.com",
    address: "Nairobi",
  };
  assert.equal(validateProductionCustomer(customer), true);
  const legacyCustomer = { ...customer };
  delete legacyCustomer.kraPin;
  assert.equal(validateProductionCustomer(legacyCustomer), true);
  assert.equal(validateProductionCustomer({ ...customer, name: " " }), false);
  assert.equal(validateProductionCustomer({ ...customer, kraPin: "X".repeat(21) }), false);
  assert.equal(validateProductionCustomer({ ...customer, email: "not-an-email" }), false);
  assert.equal(validateProductionCustomer({ ...customer, phone: "x".repeat(41) }), false);
  assert.equal(
    validateProductionCustomer({
      ...customer,
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
    }),
    true,
  );
});

test("requires every customer detail when creating a customer", () => {
  const customer = {
    name: "Carton customer",
    kraPin: "A000000000Z",
    contactPerson: "Jane Doe",
    phone: "+254700000000",
    email: "jane@example.com",
    address: "Nairobi",
  };
  assert.equal(validateProductionCustomerCreation(customer), true);
  for (const field of ["name", "kraPin", "contactPerson", "phone", "email", "address"]) {
    assert.equal(validateProductionCustomerCreation({ ...customer, [field]: "" }), false, field);
    assert.equal(validateProductionCustomerCreation({ ...customer, [field]: " " }), false, field);
    const incompleteCustomer = { ...customer };
    delete incompleteCustomer[field];
    assert.equal(validateProductionCustomerCreation(incompleteCustomer), false, field);
  }
});

test("validates organization catalog item fields and dimensions", () => {
  const item = {
    customerId: "customer-123",
    name: "Mailer carton",
    boxType: "RSC 0201",
    topLiner: "150k",
    medium: "150b",
    bottomLiner: "150c",
    length: "300",
    width: "220",
    height: "160",
    unit: "mm",
  };
  assert.equal(validateProductionItem(item), true);
  assert.equal(validateProductionItem({ ...item, customerId: "" }), false);
  assert.equal(validateProductionItem({ ...item, name: " " }), false);
  assert.equal(validateProductionItem({ ...item, width: "0" }), false);
  assert.equal(validateProductionItem({ ...item, unit: "cm" }), false);
});

test("validates the explicit production workflow stage", () => {
  assert.equal(PRODUCTION_WORKFLOW_STAGES.length, 6);
  assert.equal(PRODUCTION_WORKFLOW_STAGES[0], "Order Booking");
  assert.equal(validateProductionJobData({ workflowStage: "Order Booking" }), true);
  assert.equal(validateProductionJobData({ workflowStage: "Board Production" }), true);
  assert.equal(validateProductionJobData({ workflowStage: "Complete" }), false);
});

test("allows flagging jobs shown in Origination but not later workflow stages", () => {
  assert.equal(isProductionOriginationQueueStage("Order Booking"), true);
  assert.equal(isProductionOriginationQueueStage("Origination"), true);
  assert.equal(isProductionOriginationQueueStage("Paper Booking"), true);
  assert.equal(isProductionOriginationQueueStage("Board Production"), true);
  assert.equal(isProductionOriginationQueueStage("Printing"), false);
  assert.equal(isProductionOriginationQueueStage("Dispatch"), false);
  assert.equal(isProductionOriginationQueueStage("Not a stage"), false);
});

test("validates operation schedules and rejects invalid quantities and time ranges", () => {
  const schedule = {
    jobId: "job-123",
    operation: PRODUCTION_OPERATIONS[0],
    machineId: "machine-123",
    scheduledStartAt: "2026-11-23T08:00:00.000Z",
    scheduledEndAt: "2026-11-23T09:00:00.000Z",
    plannedQty: "1200",
    status: "PLANNED",
    notes: "",
  };
  assert.equal(validateProductionOperationSchedule(schedule), true);
  assert.equal(validateProductionOperationSchedule({ ...schedule, machineId: "" }), false);
  assert.equal(
    validateProductionOperationSchedule({ ...schedule, scheduledEndAt: schedule.scheduledStartAt }),
    false,
  );
  assert.equal(validateProductionOperationSchedule({ ...schedule, plannedQty: "1.5" }), false);
  assert.equal(validateProductionOperationSchedule({ ...schedule, operation: "Unknown" }), false);
  assert.equal(validateProductionOperationSchedule({ ...schedule, scheduledStartAt: "2026-11-23T08:00:00Z" }), false);
});

test("validates shop-floor production reports", () => {
  const report = {
    goodQty: "120",
    rejectedQty: "3",
    notes: "Minor print rejects",
    completeOperation: false,
  };
  assert.equal(validateProductionOperationRun(report), true);
  assert.equal(validateProductionOperationRun({ ...report, goodQty: "0" }), true);
  assert.equal(validateProductionOperationRun({ ...report, goodQty: "0", rejectedQty: "0" }), false);
  assert.equal(validateProductionOperationRun({ ...report, rejectedQty: "-1" }), false);
  assert.equal(validateProductionOperationRun({ ...report, goodQty: "9007199254740992" }), false);
  assert.equal(validateProductionOperationRun({ ...report, completeOperation: "true" }), false);
});

test("validates carton quality inspections and requires an NCR description for failures", () => {
  const inspection = {
    jobId: "job-123",
    scheduleId: "",
    inspectionType: "IN_PROCESS",
    sampleQty: "5",
    rejectedQty: "0",
    checks: [{
      checkpoint: "Sheet dimensions",
      target: "300 x 220 mm",
      observed: "300 x 220 mm",
      result: "PASS",
    }],
    notes: "",
    ncrDescription: "",
    ncrSeverity: "MEDIUM",
  };
  assert.equal(validateProductionQualityInspection(inspection), true);
  assert.equal(
    validateProductionQualityInspection({ ...inspection, rejectedQty: "1" }),
    false,
  );
  assert.equal(
    validateProductionQualityInspection({
      ...inspection,
      rejectedQty: "1",
      ncrDescription: "Cut size out of tolerance",
    }),
    true,
  );
  assert.equal(
    validateProductionQualityInspection({
      ...inspection,
      rejectedQty: "6",
    }),
    false,
  );
  assert.equal(
    validateProductionQualityInspection({
      ...inspection,
      sampleQty: "2147483648",
    }),
    false,
  );
  assert.equal(
    validateProductionQualityInspection({
      ...inspection,
      checks: [{ ...inspection.checks[0], result: "UNKNOWN" }],
    }),
    false,
  );
});

test("requires documented cause, corrective action, and verification to close an NCR", () => {
  const update = {
    status: "IN_PROGRESS",
    rootCause: "",
    correctiveAction: "",
    disposition: "PENDING",
    resolutionNotes: "",
  };
  assert.equal(validateProductionNonconformanceUpdate(update), true);
  assert.equal(
    validateProductionNonconformanceUpdate({
      ...update,
      status: "CLOSED",
      rootCause: "Glue temperature was below setting",
      correctiveAction: "Restore and verify machine temperature",
      disposition: "REWORK",
      resolutionNotes: "Reworked sample passed inspection",
    }),
    true,
  );
  assert.equal(
    validateProductionNonconformanceUpdate({
      ...update,
      status: "CLOSED",
      rootCause: "Unknown",
      correctiveAction: "",
      disposition: "PENDING",
      resolutionNotes: "",
    }),
    false,
  );
});
