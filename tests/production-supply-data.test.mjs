import assert from "node:assert/strict";
import test from "node:test";
import {
  validateProductionMaterial,
  validateProductionPurchaseOrder,
  validateProductionReceipt,
  validateProductionStockMovement,
  validateProductionSupplier,
} from "../src/lib/production-supply-data.ts";

test("validates organization material definitions and decimal reorder points", () => {
  const material = {
    name: "Kraft liner 150gsm",
    category: "PAPER",
    unit: "kg",
    reorderPoint: "250.5",
  };
  assert.equal(validateProductionMaterial(material), true);
  assert.equal(validateProductionMaterial({ ...material, unit: "box" }), false);
  assert.equal(validateProductionMaterial({ ...material, reorderPoint: "-1" }), false);
  assert.equal(validateProductionMaterial({ ...material, reorderPoint: "1.2345" }), false);
});

test("validates supplier contacts", () => {
  const supplier = {
    name: "Paper Supply Co.",
    contactPerson: "A. Supplier",
    phone: "+254700000000",
    email: "orders@example.com",
    address: "Nairobi",
  };
  assert.equal(validateProductionSupplier(supplier), true);
  assert.equal(validateProductionSupplier({ ...supplier, name: " " }), false);
  assert.equal(validateProductionSupplier({ ...supplier, email: "not-an-email" }), false);
});

test("validates purchase orders and rejects duplicate material lines", () => {
  const order = {
    supplierId: "supplier-1",
    supplierEmail: "orders@example.com",
    expectedAt: "2026-12-10",
    deliveryTerms: "Delivered to company warehouse",
    notes: "",
    lines: [
      { materialId: "material-1", quantity: "100.25" },
      { materialId: "material-2", quantity: "50" },
    ],
  };
  assert.equal(validateProductionPurchaseOrder(order), true);
  const legacyOrder = { ...order };
  delete legacyOrder.deliveryTerms;
  assert.equal(validateProductionPurchaseOrder(legacyOrder), true);
  assert.equal(
    validateProductionPurchaseOrder({ ...order, deliveryTerms: "x".repeat(501) }),
    false,
  );
  assert.equal(
    validateProductionPurchaseOrder({ ...order, supplierEmail: "" }),
    false,
  );
  assert.equal(
    validateProductionPurchaseOrder({ ...order, supplierEmail: "not-an-email" }),
    false,
  );
  assert.equal(
    validateProductionPurchaseOrder({
      ...order,
      lines: [order.lines[0], { ...order.lines[0], quantity: "10" }],
    }),
    false,
  );
  assert.equal(validateProductionPurchaseOrder({ ...order, expectedAt: "2026-02-30" }), false);
});

test("validates partial receipts and job-linked stock issue movements", () => {
  assert.equal(
    validateProductionReceipt({
      lines: [{ purchaseOrderLineId: "line-1", quantity: "25.5" }],
    }),
    true,
  );
  const issue = {
    type: "ISSUE",
    materialId: "material-1",
    jobId: "job-1",
    quantity: "5",
    notes: "Corrugation run",
  };
  assert.equal(validateProductionStockMovement(issue), true);
  assert.equal(validateProductionStockMovement({ ...issue, jobId: "" }), false);
  assert.equal(
    validateProductionStockMovement({ ...issue, type: "ADJUSTMENT", jobId: "", quantity: "-2" }),
    true,
  );
  assert.equal(validateProductionStockMovement({ ...issue, type: "ADJUSTMENT", quantity: "0" }), false);
  assert.equal(validateProductionStockMovement({ ...issue, type: "ADJUSTMENT", notes: "" }), false);
});
