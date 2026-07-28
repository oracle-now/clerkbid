/** Keep in sync with package.json version for display. */
export const APP_VERSION = "0.1.0";

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];

/** Type guard derived from PAYMENT_METHODS. No separate allowlist. */
const _PAYMENT_METHOD_VALUES: ReadonlySet<string> = new Set(
  PAYMENT_METHODS.map((m) => m.value)
);

export function isPaymentMethod(value: unknown): value is PaymentMethodValue {
  return typeof value === "string" && _PAYMENT_METHOD_VALUES.has(value);
}

export const LOT_STATUSES = [
  "unsold",
  "sold",
  "passed",
  "withdrawn",
] as const;

export const INVOICE_STATUSES = ["unpaid", "paid"] as const;
