import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateKenyanPayroll,
  isValidPayrollAmount,
  isValidPayrollPeriod,
} from "../src/lib/production-payroll.ts";

test("validates monthly periods and whole KES payroll inputs", () => {
  assert.equal(isValidPayrollPeriod("2026-11"), true);
  assert.equal(isValidPayrollPeriod("2026-13"), false);
  assert.equal(isValidPayrollPeriod("2026-2"), false);
  assert.equal(isValidPayrollAmount(25000), true);
  assert.equal(isValidPayrollAmount(-1), false);
  assert.equal(isValidPayrollAmount(100.5), false);
  assert.equal(isValidPayrollAmount(1_000_000_001), false);
});

test("calculates statutory deductions for a low monthly gross salary", () => {
  assert.deepEqual(calculateKenyanPayroll({
    basicSalary: 10_000,
    taxableAllowances: 0,
  }), {
    basicSalary: 10_000,
    taxableAllowances: 0,
    grossPay: 10_000,
    nssfEmployee: 600,
    nssfEmployer: 600,
    shif: 300,
    housingLevyEmployee: 150,
    housingLevyEmployer: 150,
    taxablePay: 8_950,
    paye: 0,
    netPay: 8_950,
  });
});

test("applies progressive PAYE bands, relief, and NSSF ceiling", () => {
  const payroll = calculateKenyanPayroll({
    basicSalary: 200_000,
    taxableAllowances: 0,
  });
  assert.equal(payroll.nssfEmployee, 6_480);
  assert.equal(payroll.nssfEmployer, 6_480);
  assert.equal(payroll.shif, 5_500);
  assert.equal(payroll.housingLevyEmployee, 3_000);
  assert.equal(payroll.housingLevyEmployer, 3_000);
  assert.equal(payroll.taxablePay, 185_020);
  assert.equal(payroll.paye, 47_889);
  assert.equal(payroll.netPay, 137_131);
});

test("applies the highest PAYE band above KES 800,000 taxable pay", () => {
  const payroll = calculateKenyanPayroll({
    basicSalary: 1_000_000,
    taxableAllowances: 0,
  });
  assert.equal(payroll.taxablePay, 951_020);
  assert.equal(payroll.paye, 292_740);
  assert.equal(payroll.netPay, 658_280);
});

test("zero gross pay has no statutory minimum SHIF charge", () => {
  const payroll = calculateKenyanPayroll({
    basicSalary: 0,
    taxableAllowances: 0,
  });
  assert.equal(payroll.shif, 0);
  assert.equal(payroll.paye, 0);
  assert.equal(payroll.netPay, 0);
  assert.throws(
    () => calculateKenyanPayroll({ basicSalary: 250, taxableAllowances: 0 }),
    /SHIF minimum/,
  );
});

test("rejects fractional and unsafe payroll amounts", () => {
  assert.throws(
    () => calculateKenyanPayroll({ basicSalary: 10_000.5, taxableAllowances: 0 }),
    RangeError,
  );
  assert.throws(
    () => calculateKenyanPayroll({ basicSalary: 1_000_000_001, taxableAllowances: 0 }),
    RangeError,
  );
});
