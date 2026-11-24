import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductionReelWeightUnit,
  validateProductionPaperReel,
  validateProductionReelMovement,
} from "../src/lib/production-reel-data.ts";

const reel = {
  materialId: "paper-1",
  supplierId: "supplier-1",
  purchaseOrderLineId: "po-line-1",
  parentReelId: "",
  batchNo: "BATCH-24",
  widthMm: "1800.00",
  gsm: "150",
  weightKg: "1250.500",
  storageLocation: "Bay A / Rack 2",
  notes: "",
};

test("validates reel details and decimal precision", () => {
  assert.equal(isProductionReelWeightUnit("kg"), true);
  assert.equal(isProductionReelWeightUnit("roll"), false);
  assert.equal(validateProductionPaperReel(reel), true);
  assert.equal(validateProductionPaperReel({ ...reel, widthMm: "3001" }), false);
  assert.equal(validateProductionPaperReel({ ...reel, batchNo: "" }), false);
  assert.equal(validateProductionPaperReel({ ...reel, gsm: "150.0001" }), false);
  assert.equal(validateProductionPaperReel({ ...reel, weightKg: "0" }), false);
});

test("validates job issues, returns, remnant splits, and reasoned adjustments", () => {
  assert.equal(
    validateProductionReelMovement({
      action: "ISSUE",
      quantityKg: "25.125",
      jobId: "job-1",
      widthMm: "",
      storageLocation: "",
      notes: "Corrugator run",
    }),
    true,
  );
  assert.equal(
    validateProductionReelMovement({
      action: "RETURN",
      quantityKg: "5",
      jobId: "",
      widthMm: "",
      storageLocation: "",
      notes: "",
    }),
    false,
  );
  assert.equal(
    validateProductionReelMovement({
      action: "REMNANT",
      quantityKg: "10",
      jobId: "",
      widthMm: "900",
      storageLocation: "Remnant rack",
      notes: "",
    }),
    true,
  );
  assert.equal(
    validateProductionReelMovement({
      action: "ADJUSTMENT",
      quantityKg: "-2.5",
      jobId: "",
      widthMm: "",
      storageLocation: "",
      notes: "Damaged edge removed",
    }),
    true,
  );
  assert.equal(
    validateProductionReelMovement({
      action: "ADJUSTMENT",
      quantityKg: "-2.5",
      jobId: "",
      widthMm: "",
      storageLocation: "",
      notes: "",
    }),
    false,
  );
});
