import { describe, expect, it } from "vitest";
import { isPaymentMethod, PAYMENT_METHODS } from "@/lib/utils/constants";

describe("isPaymentMethod", () => {
  it("accepts all four existing values", () => {
    for (const { value } of PAYMENT_METHODS) {
      expect(isPaymentMethod(value)).toBe(true);
    }
  });

  it("rejects unknown string values", () => {
    expect(isPaymentMethod("paypal")).toBe(false);
    expect(isPaymentMethod("venmo")).toBe(false);
    expect(isPaymentMethod("marketplace")).toBe(false);
    expect(isPaymentMethod("unknown")).toBe(false);
  });

  it("rejects null, undefined, and non-strings", () => {
    expect(isPaymentMethod(null)).toBe(false);
    expect(isPaymentMethod(undefined)).toBe(false);
    expect(isPaymentMethod(42)).toBe(false);
    expect(isPaymentMethod({})).toBe(false);
  });
});
