import assert from "node:assert/strict";
import test from "node:test";
import {
  validateProductionTooling,
  validateProductionToolingEvent,
  validateProductionToolingUpdate,
} from "../src/lib/production-tooling-data.ts";

test("validates tooling records, ownership, and categories", () => {
  const tool = {
    toolNo: "DIE-001",
    name: "RSC 0201 die",
    category: "DIE",
    ownerType: "COMPANY",
    customerId: "",
    storageLocation: "Tool room A",
    wearNotes: "",
    notes: "",
  };
  assert.equal(validateProductionTooling(tool), true);
  assert.equal(validateProductionTooling({ ...tool, category: "PRESS" }), false);
  assert.equal(
    validateProductionTooling({ ...tool, ownerType: "CUSTOMER", customerId: "" }),
    false,
  );
  assert.equal(
    validateProductionTooling({ ...tool, ownerType: "COMPANY", customerId: "customer-1" }),
    false,
  );
});

test("validates status updates and auditable tooling history", () => {
  const update = {
    status: "MAINTENANCE",
    storageLocation: "Repair bay",
    wearNotes: "Replace one damaged rule",
    notes: "",
  };
  assert.equal(validateProductionToolingUpdate(update), true);
  assert.equal(validateProductionToolingUpdate({ ...update, status: "LOST" }), false);

  assert.equal(
    validateProductionToolingEvent({
      eventType: "USAGE",
      description: "Used for job run",
      jobId: "job-1",
    }),
    true,
  );
  assert.equal(
    validateProductionToolingEvent({
      eventType: "USAGE",
      description: "No job reference",
      jobId: "",
    }),
    false,
  );
  assert.equal(
    validateProductionToolingEvent({
      eventType: "REPAIR",
      description: "Replaced cutting rule",
      jobId: "",
    }),
    true,
  );
});
