import assert from "node:assert/strict";
import test from "node:test";
import {
  receivableFinishedGoodsQuantity,
  validateProductionDelivery,
  validateProductionDispatch,
  validateProductionWarehousePallet,
} from "../src/lib/production-warehouse-data.ts";

test("validates pallet receipts and positive safe quantities", () => {
  assert.equal(receivableFinishedGoodsQuantity(1200, 900, 200), 700);
  assert.equal(receivableFinishedGoodsQuantity(800, 900, 200), 600);
  assert.equal(receivableFinishedGoodsQuantity(800, 900, 900), 0);
  assert.equal(receivableFinishedGoodsQuantity(-1, 900, 0), 0);
  const receipt = {
    jobId: "job-1",
    quantity: "250",
    location: "Bay 3 · Rack B",
    notes: "",
  };
  assert.equal(validateProductionWarehousePallet(receipt), true);
  assert.equal(validateProductionWarehousePallet({ ...receipt, quantity: "0" }), false);
  assert.equal(validateProductionWarehousePallet({ ...receipt, quantity: "1.5" }), false);
  assert.equal(validateProductionWarehousePallet({ ...receipt, location: "" }), false);
});

test("requires unique pallet lines and transport details for a dispatch", () => {
  const dispatch = {
    jobId: "job-1",
    vehicleRegistration: "KDA 123A",
    driverName: "Driver One",
    route: "Nairobi",
    notes: "",
    lines: [
      { palletId: "pallet-1", quantity: "100" },
      { palletId: "pallet-2", quantity: "50" },
    ],
  };
  assert.equal(validateProductionDispatch(dispatch), true);
  assert.equal(
    validateProductionDispatch({
      ...dispatch,
      lines: [dispatch.lines[0], dispatch.lines[0]],
    }),
    false,
  );
  assert.equal(validateProductionDispatch({ ...dispatch, lines: [] }), false);
  assert.equal(validateProductionDispatch({ ...dispatch, driverName: "" }), false);
});

test("requires recipient acknowledgement to complete delivery", () => {
  assert.equal(validateProductionDelivery({ receivedBy: "Receiving clerk", deliveryNotes: "" }), true);
  assert.equal(validateProductionDelivery({ receivedBy: "", deliveryNotes: "" }), false);
  assert.equal(validateProductionDelivery({ receivedBy: "A".repeat(121), deliveryNotes: "" }), false);
});
