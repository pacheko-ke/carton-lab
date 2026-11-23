import assert from "node:assert/strict";
import test from "node:test";
import {
  canAttachProductionArtwork,
  canBookProductionOrders,
  canEditProductionJobs,
  canFlagProductionJobs,
  canResolveProductionJobFlags,
  getArtworkContentType,
  MAX_ARTWORK_FILE_BYTES,
  MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH,
  PRODUCTION_WORKFLOW_STAGES,
  sanitizeArtworkFileName,
  validateProductionItem,
  validateProductionOrderBooking,
  validateProductionJobFlagReason,
  validateProductionJobData,
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
    customer: "Carton customer",
    customerPO: "PO-123",
    orderQty: "1200",
    orderDate: "2026-11-23",
    deliveryDate: "2026-12-01",
  };
  assert.equal(validateProductionOrderBooking(order), true);
  assert.equal(validateProductionOrderBooking({ ...order, orderQty: "0" }), false);
  assert.equal(validateProductionOrderBooking({ ...order, orderDate: "2026-02-30" }), false);
  assert.equal(validateProductionOrderBooking({ ...order, deliveryDate: "2026-11-22" }), false);
  assert.equal(validateProductionOrderBooking({ ...order, customer: " " }), false);
  assert.equal(validateProductionOrderBooking({ ...order, itemId: "" }), false);
});

test("validates organization catalog item fields and dimensions", () => {
  const item = {
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
