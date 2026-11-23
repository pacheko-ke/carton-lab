import assert from "node:assert/strict";
import test from "node:test";
import {
  canAttachProductionArtwork,
  canEditProductionJobs,
  canFlagProductionJobs,
  canResolveProductionJobFlags,
  getArtworkContentType,
  MAX_ARTWORK_FILE_BYTES,
  MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH,
  PRODUCTION_WORKFLOW_STAGES,
  sanitizeArtworkFileName,
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

test("validates the explicit production workflow stage", () => {
  assert.equal(PRODUCTION_WORKFLOW_STAGES.length, 5);
  assert.equal(validateProductionJobData({ workflowStage: "Board Production" }), true);
  assert.equal(validateProductionJobData({ workflowStage: "Complete" }), false);
});
