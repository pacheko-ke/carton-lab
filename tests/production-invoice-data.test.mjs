import assert from "node:assert/strict";
import test from "node:test";
import {
  getProductionInvoiceStatus,
  validateProductionCreditNote,
  validateProductionInvoice,
  validateProductionInvoicePayment,
} from "../src/lib/production-invoice-data.ts";

test("validates invoice dispatch, due date, currency, and unit price", () => {
  const invoice = {
    dispatchId: "dispatch-1",
    dueDate: "2026-12-24",
    currency: "KES",
    unitPrice: "12.3456",
  };
  assert.equal(validateProductionInvoice(invoice), true);
  assert.equal(validateProductionInvoice({ ...invoice, dueDate: "2026-02-30" }), false);
  assert.equal(validateProductionInvoice({ ...invoice, currency: "GBP" }), false);
  assert.equal(validateProductionInvoice({ ...invoice, unitPrice: "0" }), false);
  assert.equal(validateProductionInvoice({ ...invoice, unitPrice: "12.34567" }), false);
});

test("validates partial-payment audit details and monetary precision", () => {
  const payment = {
    amount: "2500.50",
    method: "MPESA",
    reference: "AB12CD34",
    notes: "",
    paidAt: "2026-11-24",
  };
  assert.equal(validateProductionInvoicePayment(payment), true);
  assert.equal(validateProductionInvoicePayment({ ...payment, amount: "0" }), false);
  assert.equal(validateProductionInvoicePayment({ ...payment, amount: "10.999" }), false);
  assert.equal(validateProductionInvoicePayment({ ...payment, method: "CRYPTO" }), false);
  assert.equal(validateProductionInvoicePayment({ ...payment, paidAt: "2026-02-30" }), false);
});

test("requires a reason and valid amount for credit notes", () => {
  const creditNote = { amount: "150.00", reason: "Damaged cartons", notes: "Agreed with customer" };
  assert.equal(validateProductionCreditNote(creditNote), true);
  assert.equal(validateProductionCreditNote({ ...creditNote, amount: "0" }), false);
  assert.equal(validateProductionCreditNote({ ...creditNote, reason: " " }), false);
});

test("derives invoice settlement status from exact cents", () => {
  assert.equal(getProductionInvoiceStatus("100.00", "0.00", "0.00"), "OPEN");
  assert.equal(getProductionInvoiceStatus("100.00", "25.00", "10.00"), "PARTIALLY_PAID");
  assert.equal(getProductionInvoiceStatus("100.00", "90.00", "10.00"), "PAID");
  assert.equal(getProductionInvoiceStatus("100.00", "0.00", "100.00"), "CREDITED");
  assert.throws(() => getProductionInvoiceStatus("100.00", "50.01", "50.00"));
});
