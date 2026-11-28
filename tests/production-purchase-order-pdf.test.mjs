import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { generateProductionPurchaseOrderPdf } from "../src/lib/production-purchase-order-pdf.ts";

test("generates a valid multi-page purchase order PDF", async () => {
  const bytes = await generateProductionPurchaseOrderPdf({
    orderNo: "PO-20261128-ABC123",
    status: "OPEN",
    createdAt: "2026-11-28T09:00:00.000Z",
    expectedAt: "2026-12-10T00:00:00.000Z",
    deliveryTerms: "Delivered to company warehouse",
    createdByName: "A. Buyer",
    notes: "Deliver during business hours.",
    company: {
      name: "PackStudio Manufacturing",
      country: "Kenya",
      contactEmail: "orders@packstudio.example",
      contactPhone: "+254700000000",
      address: "Nairobi",
    },
    supplier: {
      code: "SUP-001",
      name: "Paper Supply Co.",
      contactPerson: "A. Supplier",
      email: "orders@supplier.example",
      address: "Industrial Area",
    },
    lines: Array.from({ length: 30 }, (_, index) => ({
      orderedQty: "100.500",
      material: {
        code: `MAT-${index + 1}`,
        name: `Kraft liner ${index + 1}`,
        unit: "kg",
      },
    })),
  });

  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 2);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.match(Buffer.from(bytes).toString("latin1"), /\/Subtype\s*\/Image/);
});

test("moves lengthy notes to a separate page when the order table is long", async () => {
  const bytes = await generateProductionPurchaseOrderPdf({
    orderNo: "PO-20261128-LONG-NOTES",
    status: "OPEN",
    createdAt: "2026-11-28T09:00:00.000Z",
    expectedAt: null,
    deliveryTerms: "Collect from supplier warehouse",
    createdByName: "A. Buyer",
    notes: "Delivery instructions ".repeat(45),
    company: {
      name: "PackStudio Manufacturing",
      country: "Kenya",
      contactEmail: "orders@packstudio.example",
      contactPhone: "+254700000000",
      address: "Nairobi",
    },
    supplier: {
      code: "SUP-001",
      name: "Paper Supply Co.",
      contactPerson: null,
      email: "orders@supplier.example",
      address: null,
    },
    lines: Array.from({ length: 20 }, (_, index) => ({
      orderedQty: "100",
      material: {
        code: `MAT-${index + 1}`,
        name: `Kraft liner ${index + 1}`,
        unit: "kg",
      },
    })),
  });

  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 2);
});
