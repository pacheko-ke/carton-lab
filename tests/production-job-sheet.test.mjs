import assert from "node:assert/strict";
import test from "node:test";
import jobSheet from "../public/packstudio/job-sheet.js";

const { calculateJobSheetQuantities, createJobSheetPdf } = jobSheet;

test("calculates production, reel, trim, area, and pallet requirements", () => {
  const result = calculateJobSheetQuantities({
    unit: "mm",
    boardLength: "1908",
    boardWidth: "613",
    reelWidth: "1250",
    ups: "2",
    orderQty: "2000",
    spoilage: "3",
    pcsPerPallet: "1000",
  });

  assert.equal(result.productionQuantity, 2060);
  assert.equal(result.cuts, 1030);
  assert.equal(result.trim, 24);
  assert.ok(Math.abs(result.reelRun - 1965.24) < 0.000001);
  assert.ok(Math.abs(result.boardArea - 2456.55) < 0.000001);
  assert.equal(result.pallets, 2);
});

test("respects a manually entered production quantity and inch dimensions", () => {
  const result = calculateJobSheetQuantities({
    unit: "in",
    boardLength: "75",
    boardWidth: "24",
    reelWidth: "52",
    ups: "2",
    orderQty: "100",
    productionQty: "120",
    spoilage: "3",
  });

  assert.equal(result.productionQuantity, 120);
  assert.equal(result.cuts, 60);
  assert.equal(result.trim, 4);
  assert.equal(result.reelRun, 114.3);
  assert.ok(Math.abs(result.boardArea - 150.96744) < 0.000001);
});

test("leaves calculated quantities blank when no production quantity is available", () => {
  const result = calculateJobSheetQuantities({
    unit: "mm",
    boardLength: "",
    boardWidth: "",
    orderQty: "",
    productionQty: "",
  });

  assert.equal(result.productionQuantity, null);
  assert.equal(result.cuts, null);
  assert.equal(result.reelRun, null);
  assert.equal(result.boardArea, null);
});

test("creates a valid two-page PDF with escaped job data and keyline geometry", () => {
  const pdf = createJobSheetPdf({
    jobNo: "JS (42)",
    jobName: "Sample carton",
    customer: "Customer",
    length: "607",
    width: "327",
    height: "282",
    unit: "mm",
    boardLength: "1908",
    boardWidth: "613",
    orderQty: "2000",
    spoilage: "3",
    ups: "2",
    reelWidth: "1250",
  }, {
    items: [
      { t: "poly", layer: "CUT", closed: true, pts: [[0, 0], [100, 0], [100, 50], [0, 50]] },
      { t: "line", layer: "CREASE", x1: 50, y1: 0, x2: 50, y2: 50 },
    ],
  });

  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Count 2/);
  assert.ok(pdf.includes("No. JS \\(42\\)"));
  assert.match(pdf, /PRODUCTION TRACKING/);
  assert.match(pdf, /1965\.2 m/);
  assert.match(pdf, /startxref\n\d+\n%%EOF$/);
});
