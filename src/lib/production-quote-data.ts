const SCALE = BigInt(10_000);
const MAX_UNIT_AMOUNT = BigInt("99999999999999");
const MAX_LINE_AMOUNT_CENTS = BigInt("99999999999999");

export const PRODUCTION_QUOTE_CURRENCIES = ["KES", "USD", "EUR"] as const;
export const PRODUCTION_QUOTE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CONVERTED",
  "SUPERSEDED",
] as const;

export type ProductionQuoteLineInput = {
  itemId: string;
  quantity: string;
  boardAreaM2: string;
  boardGsm: string;
  paperCostPerKg: string;
  trimWastePercent: string;
  conversionCost: string;
  consumablesCost: string;
  marginPercent: string;
};

export type ProductionQuoteInput = {
  customerId: string;
  currency: (typeof PRODUCTION_QUOTE_CURRENCIES)[number];
  validUntil: string;
  inquiryReference: string;
  notes: string;
  lines: ProductionQuoteLineInput[];
};

export type ProductionQuoteLineCosts = {
  materialCostPerUnit: string;
  unitCost: string;
  unitPrice: string;
  lineCostTotal: string;
  linePriceTotal: string;
};

export type ProductionQuoteActionInput = {
  action: "SUBMIT" | "APPROVE" | "REJECT";
  reason: string;
};

export type ProductionQuoteConversionInput = {
  customerPO: string;
  orderDate: string;
  deliveryDate: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function scaledDecimal(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, "0"));
}

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / BigInt(2)) / denominator;
}

function formatScaled(value: bigint, decimalPlaces: number): string {
  const scale = BigInt(10) ** BigInt(decimalPlaces);
  const whole = value / scale;
  const fraction = String(value % scale).padStart(decimalPlaces, "0");
  return `${whole}.${fraction}`;
}

function moneyCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

function isBoundedDecimal(
  value: unknown,
  maximum: number,
  maxFractionDigits = 4,
): value is string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(value)
  ) {
    return false;
  }
  if ((value.split(".")[1] ?? "").length > maxFractionDigits) return false;
  const number = Number(value);
  return Number.isFinite(number) && number <= maximum;
}

export function validateProductionQuoteLine(
  value: unknown,
): value is ProductionQuoteLineInput {
  if (!isRecord(value)) return false;
  const quantity = value.quantity;
  return (
    typeof value.itemId === "string" &&
    value.itemId.trim().length > 0 &&
    value.itemId.length <= 100 &&
    typeof quantity === "string" &&
    /^[1-9]\d*$/.test(quantity) &&
    Number.isSafeInteger(Number(quantity)) &&
    Number(quantity) <= 2_147_483_647 &&
    isBoundedDecimal(value.boardAreaM2, 1000) &&
    Number(value.boardAreaM2) > 0 &&
    isBoundedDecimal(value.boardGsm, 5000, 3) &&
    Number(value.boardGsm) > 0 &&
    isBoundedDecimal(value.paperCostPerKg, 1_000_000) &&
    Number(value.paperCostPerKg) > 0 &&
    isBoundedDecimal(value.trimWastePercent, 200, 3) &&
    isBoundedDecimal(value.conversionCost, 1_000_000) &&
    isBoundedDecimal(value.consumablesCost, 1_000_000) &&
    isBoundedDecimal(value.marginPercent, 80, 3)
  );
}

export function calculateProductionQuoteLineCosts(
  value: unknown,
): ProductionQuoteLineCosts | null {
  if (!validateProductionQuoteLine(value)) return null;

  const area = scaledDecimal(value.boardAreaM2);
  const gsm = scaledDecimal(value.boardGsm);
  const paperCost = scaledDecimal(value.paperCostPerKg);
  const wasteFactor = BigInt(1_000_000) + scaledDecimal(value.trimWastePercent);
  const materialCost = roundDivide(
    area * gsm * paperCost * wasteFactor,
    BigInt("100000000000000000"),
  );
  const unitCost = materialCost +
    scaledDecimal(value.conversionCost) +
    scaledDecimal(value.consumablesCost);
  const margin = scaledDecimal(value.marginPercent);
  const unitPrice = roundDivide(
    unitCost * BigInt(1_000_000),
    BigInt(1_000_000) - margin,
  );
  const quantity = BigInt(value.quantity);
  const lineCostCents = roundDivide(unitCost * quantity, BigInt(100));
  const linePriceCents = roundDivide(unitPrice * quantity, BigInt(100));
  if (
    materialCost > MAX_UNIT_AMOUNT ||
    unitCost > MAX_UNIT_AMOUNT ||
    unitPrice > MAX_UNIT_AMOUNT ||
    lineCostCents > MAX_LINE_AMOUNT_CENTS ||
    linePriceCents > MAX_LINE_AMOUNT_CENTS
  ) {
    return null;
  }

  return {
    materialCostPerUnit: formatScaled(materialCost, 4),
    unitCost: formatScaled(unitCost, 4),
    unitPrice: formatScaled(unitPrice, 4),
    lineCostTotal: formatScaled(lineCostCents, 2),
    linePriceTotal: formatScaled(linePriceCents, 2),
  };
}

export function validateProductionQuote(value: unknown): value is ProductionQuoteInput {
  if (!isRecord(value)) return false;
  const { customerId, currency, validUntil, inquiryReference, notes, lines } = value;
  if (
    typeof customerId !== "string" ||
    !customerId.trim() ||
    customerId.length > 100 ||
    typeof currency !== "string" ||
    !PRODUCTION_QUOTE_CURRENCIES.some((supportedCurrency) => supportedCurrency === currency) ||
    typeof validUntil !== "string" ||
    !isValidDate(validUntil) ||
    typeof inquiryReference !== "string" ||
    inquiryReference.length > 80 ||
    typeof notes !== "string" ||
    notes.length > 2000 ||
    !Array.isArray(lines) ||
    lines.length < 1 ||
    lines.length > 50 ||
    !lines.every(validateProductionQuoteLine)
  ) {
    return false;
  }
  if (new Set(lines.map((line) => line.itemId)).size !== lines.length) return false;
  const costs = lines.map(calculateProductionQuoteLineCosts);
  if (costs.some((lineCosts) => lineCosts === null)) return false;
  const totalCost = costs.reduce(
    (total, lineCosts) => total + (lineCosts ? moneyCents(lineCosts.lineCostTotal) : BigInt(0)),
    BigInt(0),
  );
  const totalPrice = costs.reduce(
    (total, lineCosts) => total + (lineCosts ? moneyCents(lineCosts.linePriceTotal) : BigInt(0)),
    BigInt(0),
  );
  return totalCost <= MAX_LINE_AMOUNT_CENTS && totalPrice <= MAX_LINE_AMOUNT_CENTS;
}

export function validateProductionQuoteAction(
  value: unknown,
): value is ProductionQuoteActionInput {
  if (!isRecord(value)) return false;
  const { action, reason } = value;
  return (
    (action === "SUBMIT" || action === "APPROVE" || action === "REJECT") &&
    typeof reason === "string" &&
    reason.length <= 1000 &&
    (action !== "REJECT" || Boolean(reason.trim()))
  );
}

export function validateProductionQuoteConversion(
  value: unknown,
): value is ProductionQuoteConversionInput {
  if (!isRecord(value)) return false;
  const { customerPO, orderDate, deliveryDate } = value;
  return (
    typeof customerPO === "string" &&
    customerPO.trim().length > 0 &&
    customerPO.length <= 60 &&
    typeof orderDate === "string" &&
    isValidDate(orderDate) &&
    typeof deliveryDate === "string" &&
    isValidDate(deliveryDate) &&
    deliveryDate >= orderDate
  );
}
