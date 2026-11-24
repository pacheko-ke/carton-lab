export const PRODUCTION_INVOICE_CURRENCIES = ["KES", "USD", "EUR"] as const;
export const PRODUCTION_INVOICE_STATUSES = [
  "OPEN",
  "PARTIALLY_PAID",
  "PAID",
  "CREDITED",
] as const;
export const PRODUCTION_PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "MPESA",
  "CARD",
  "CHEQUE",
  "OTHER",
] as const;

export type ProductionInvoiceStatus =
  (typeof PRODUCTION_INVOICE_STATUSES)[number];

export type ProductionInvoiceInput = {
  dispatchId: string;
  dueDate: string;
  currency: (typeof PRODUCTION_INVOICE_CURRENCIES)[number];
  unitPrice: string;
};

export type ProductionInvoicePaymentInput = {
  amount: string;
  method: (typeof PRODUCTION_PAYMENT_METHODS)[number];
  reference: string;
  notes: string;
  paidAt: string;
};

export type ProductionCreditNoteInput = {
  amount: string;
  reason: string;
  notes: string;
};

export function isProductionInvoiceCurrency(
  value: string,
): value is (typeof PRODUCTION_INVOICE_CURRENCIES)[number] {
  return PRODUCTION_INVOICE_CURRENCIES.some((currency) => currency === value);
}

export function isProductionPaymentMethod(
  value: string,
): value is (typeof PRODUCTION_PAYMENT_METHODS)[number] {
  return PRODUCTION_PAYMENT_METHODS.some((method) => method === value);
}

function moneyInCents(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error("Invoice ledger contains an invalid monetary amount.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt("100") + BigInt(fraction.padEnd(2, "0"));
}

export function getProductionInvoiceStatus(
  totalAmount: string,
  amountPaid: string,
  amountCredited: string,
): ProductionInvoiceStatus {
  const total = moneyInCents(totalAmount);
  const paid = moneyInCents(amountPaid);
  const credited = moneyInCents(amountCredited);
  const zero = BigInt("0");
  if (total <= zero || paid < zero || credited < zero || paid + credited > total) {
    throw new Error("Invoice ledger amounts exceed the invoice total.");
  }
  if (paid + credited === total) return paid === zero ? "CREDITED" : "PAID";
  return paid === zero ? "OPEN" : "PARTIALLY_PAID";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isMoney(value: unknown, maximum: number, precision: number): value is string {
  if (typeof value !== "string") return false;
  const pattern = precision === 2
    ? /^(0|[1-9]\d*)(\.\d{1,2})?$/
    : /^(0|[1-9]\d*)(\.\d{1,4})?$/;
  if (!pattern.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= maximum;
}

function isNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

export function validateProductionInvoice(value: unknown): value is ProductionInvoiceInput {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.dispatchId, 100) &&
    isValidDate(value.dueDate) &&
    typeof value.currency === "string" &&
    isProductionInvoiceCurrency(value.currency) &&
    isMoney(value.unitPrice, 9_999_999_999.9999, 4)
  );
}

export function validateProductionInvoicePayment(
  value: unknown,
): value is ProductionInvoicePaymentInput {
  if (!isRecord(value)) return false;
  return (
    isMoney(value.amount, 999_999_999_999.99, 2) &&
    typeof value.method === "string" &&
    isProductionPaymentMethod(value.method) &&
    isBoundedString(value.reference, 120) &&
    isBoundedString(value.notes, 500) &&
    isValidDate(value.paidAt)
  );
}

export function validateProductionCreditNote(
  value: unknown,
): value is ProductionCreditNoteInput {
  if (!isRecord(value)) return false;
  return (
    isMoney(value.amount, 999_999_999_999.99, 2) &&
    isNonEmptyString(value.reason, 500) &&
    isBoundedString(value.notes, 500)
  );
}
