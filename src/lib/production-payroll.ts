export const KENYAN_PAYROLL_RULES = {
  version: "KE-2026-02",
  currency: "KES",
  nssf: {
    rate: 0.06,
    lowerEarningsLimit: 9_000,
    upperEarningsLimit: 108_000,
  },
  shif: {
    rate: 0.0275,
    minimum: 300,
  },
  housingLevy: {
    rate: 0.015,
  },
  paye: {
    monthlyBands: [
      { upperLimit: 24_000, rate: 0.1 },
      { upperLimit: 32_333, rate: 0.25 },
      { upperLimit: 500_000, rate: 0.3 },
      { upperLimit: 800_000, rate: 0.325 },
      { upperLimit: null, rate: 0.35 },
    ],
    personalRelief: 2_400,
  },
} as const;

export type KenyanPayrollInput = {
  basicSalary: number;
  taxableAllowances: number;
};

export const MAX_PAYROLL_AMOUNT = 1_000_000_000;

export type KenyanPayrollCalculation = {
  basicSalary: number;
  taxableAllowances: number;
  grossPay: number;
  nssfEmployee: number;
  nssfEmployer: number;
  shif: number;
  housingLevyEmployee: number;
  housingLevyEmployer: number;
  taxablePay: number;
  paye: number;
  netPay: number;
};

export function isValidPayrollPeriod(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 9999;
}

export function isValidPayrollAmount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PAYROLL_AMOUNT;
}

export function calculateKenyanPayroll({
  basicSalary,
  taxableAllowances,
}: KenyanPayrollInput): KenyanPayrollCalculation {
  if (!isValidPayrollAmount(basicSalary) || !isValidPayrollAmount(taxableAllowances)) {
    throw new RangeError("Payroll amounts must be non-negative whole KES values.");
  }

  const grossPay = basicSalary + taxableAllowances;
  if (!Number.isSafeInteger(grossPay) || grossPay > 2_000_000_000) {
    throw new RangeError("Gross pay exceeds the supported range.");
  }
  if (grossPay > 0 && grossPay < KENYAN_PAYROLL_RULES.shif.minimum) {
    throw new RangeError(
      `Gross pay must be zero or at least KES ${KENYAN_PAYROLL_RULES.shif.minimum} because of the SHIF minimum.`,
    );
  }

  const tierOnePensionablePay = Math.min(
    grossPay,
    KENYAN_PAYROLL_RULES.nssf.lowerEarningsLimit,
  );
  const tierTwoPensionablePay = Math.max(
    0,
    Math.min(grossPay, KENYAN_PAYROLL_RULES.nssf.upperEarningsLimit) -
      KENYAN_PAYROLL_RULES.nssf.lowerEarningsLimit,
  );
  const nssfEmployee = Math.round(
    (tierOnePensionablePay + tierTwoPensionablePay) *
      KENYAN_PAYROLL_RULES.nssf.rate,
  );
  const nssfEmployer = nssfEmployee;
  const shif = grossPay === 0
    ? 0
    : Math.max(
        KENYAN_PAYROLL_RULES.shif.minimum,
        Math.round(grossPay * KENYAN_PAYROLL_RULES.shif.rate),
      );
  const housingLevyEmployee = Math.round(
    grossPay * KENYAN_PAYROLL_RULES.housingLevy.rate,
  );
  const housingLevyEmployer = housingLevyEmployee;
  const taxablePay = Math.max(
    0,
    grossPay - nssfEmployee - shif - housingLevyEmployee,
  );
  const taxBeforeRelief = calculateProgressiveTax(taxablePay);
  const paye = Math.max(
    0,
    taxBeforeRelief - KENYAN_PAYROLL_RULES.paye.personalRelief,
  );
  const netPay = grossPay -
    nssfEmployee -
    shif -
    housingLevyEmployee -
    paye;

  return {
    basicSalary,
    taxableAllowances,
    grossPay,
    nssfEmployee,
    nssfEmployer,
    shif,
    housingLevyEmployee,
    housingLevyEmployer,
    taxablePay,
    paye,
    netPay,
  };
}

function calculateProgressiveTax(taxablePay: number): number {
  let lowerLimit = 0;
  let tax = 0;

  for (const band of KENYAN_PAYROLL_RULES.paye.monthlyBands) {
    const upperLimit = band.upperLimit ?? taxablePay;
    const taxableInBand = Math.max(
      0,
      Math.min(taxablePay, upperLimit) - lowerLimit,
    );
    tax += taxableInBand * band.rate;
    if (taxablePay <= upperLimit) break;
    lowerLimit = upperLimit;
  }

  return Math.round(tax);
}
