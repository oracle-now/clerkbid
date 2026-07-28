import { describe, expect, it } from "vitest";
import { isPaymentMethod, PAYMENT_METHODS } from "@/lib/utils/constants";

describe("isPaymentMethod", () => {
  it("accepts all four existing payment method strings", () => {
    for (const { value } of PAYMENT_METHODS) {
      expect(isPaymentMethod(value)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isPaymentMethod("paypal")).toBe(false);
    expect(isPaymentMethod("venmo")).toBe(false);
    expect(isPaymentMethod("marketplace")).toBe(false);
    expect(isPaymentMethod("CASH")).toBe(false);
    expect(isPaymentMethod("Credit_Card")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isPaymentMethod("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isPaymentMethod(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isPaymentMethod(undefined)).toBe(false);
  });

  it("rejects numbers", () => {
    expect(isPaymentMethod(0)).toBe(false);
    expect(isPaymentMethod(1)).toBe(false);
    expect(isPaymentMethod(NaN)).toBe(false);
  });

  it("rejects objects", () => {
    expect(isPaymentMethod({})).toBe(false);
    expect(isPaymentMethod({ value: "cash" })).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isPaymentMethod([])).toBe(false);
    expect(isPaymentMethod(["cash"])).toBe(false);
  });
});
