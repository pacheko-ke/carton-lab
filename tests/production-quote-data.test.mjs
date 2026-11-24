import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProductionQuoteLineCosts,
  validateProductionQuote,
  validateProductionQuoteAction,
  validateProductionQuoteConversion,
  validateProductionQuoteLine,
} from "../src/lib/production-quote-data.ts";

const line = {
  itemId: "item-1",
  quantity: "100",
  boardAreaM2: "0.5",
  boardGsm: "1000",
  paperCostPerKg: "100",
  trimWastePercent: "10",
  conversionCost: "5",
  consumablesCost: "2",
  marginPercent: "20",
};

test("calculates material cost, gross-margin price, and extended quote totals", () => {
  assert.deepEqual(calculateProductionQuoteLineCosts(line), {
    materialCostPerUnit: "55.0000",
    unitCost: "62.0000",
    unitPrice: "77.5000",
    lineCostTotal: "6200.00",
    linePriceTotal: "7750.00",
  });
  assert.equal(calculateProductionQuoteLineCosts({ ...line, marginPercent: "100" }), null);
});

test("validates quote lines and rejects duplicated products or malformed dates", () => {
  assert.equal(validateProductionQuoteLine(line), true);
  assert.equal(validateProductionQuoteLine({ ...line, boardGsm: "1000.0001" }), false);
  assert.equal(
    calculateProductionQuoteLineCosts({
      ...line,
      boardAreaM2: "1000",
      boardGsm: "5000",
      paperCostPerKg: "1000000",
      trimWastePercent: "200",
    }),
    null,
  );
  const quote = {
    customerId: "customer-1",
    currency: "KES",
    validUntil: "2027-01-31",
    inquiryReference: "RFQ-14",
    notes: "",
    lines: [line],
  };
  assert.equal(validateProductionQuote(quote), true);
  assert.equal(validateProductionQuote({ ...quote, validUntil: "2027-02-30" }), false);
  assert.equal(validateProductionQuote({ ...quote, lines: [line, line] }), false);
  assert.equal(validateProductionQuote({ ...quote, currency: "GBP" }), false);
});

test("validates quote transitions and conversion dates", () => {
  assert.equal(validateProductionQuoteAction({ action: "SUBMIT", reason: "" }), true);
  assert.equal(validateProductionQuoteAction({ action: "REJECT", reason: "Revise price" }), true);
  assert.equal(validateProductionQuoteAction({ action: "REJECT", reason: " " }), false);
  const conversion = {
    customerPO: "PO-14",
    orderDate: "2027-01-01",
    deliveryDate: "2027-02-01",
  };
  assert.equal(validateProductionQuoteConversion(conversion), true);
  assert.equal(
    validateProductionQuoteConversion({ ...conversion, deliveryDate: "2026-12-31" }),
    false,
  );
});
