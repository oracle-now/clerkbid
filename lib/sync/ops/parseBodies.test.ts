import { describe, expect, it } from "vitest";
import {
  parseInvoicePatchBody,
  parseInvoicePutBody,
  parseSaleDeleteBody,
  parseSalePutBody,
} from "@/lib/sync/ops/parseBodies";
import { PAYMENT_METHODS } from "@/lib/utils/constants";

const BASE_PUT = {
  invoiceSyncKey: "550e8400-e29b-41d4-a716-446655440001",
  invoiceNumber: "1-001",
  paddleNumber: 3,
  status: "paid",
  subtotal: 10,
  buyersPremiumAmount: 1,
  taxAmount: 0.5,
  total: 11.5,
  generatedAt: "2024-01-01T00:00:00.000Z",
};

describe("parseSalePutBody", () => {
  it("accepts minimal valid body", () => {
    const p = parseSalePutBody({
      saleSyncKey: "550e8400-e29b-41d4-a716-446655440000",
      displayLotNumber: "12",
      paddleNumber: 5,
      description: "Widget",
      quantity: 1,
      amount: 100,
      clerkInitials: "AB",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(p).not.toBeNull();
    expect(p?.saleSyncKey).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects invalid paddle", () => {
    expect(parseSalePutBody({})).toBeNull();
  });
});

describe("parseSaleDeleteBody", () => {
  it("parses", () => {
    expect(
      parseSaleDeleteBody({ saleSyncKey: "550e8400-e29b-41d4-a716-446655440000" })
    ).toEqual({
      saleSyncKey: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});

describe("parseInvoicePutBody — payment method", () => {
  it("accepts paid shape with cash", () => {
    const p = parseInvoicePutBody({ ...BASE_PUT, paymentMethod: "cash" });
    expect(p).not.toBeNull();
    expect(p?.status).toBe("paid");
    expect(p?.paymentMethod).toBe("cash");
  });

  it("accepts each existing payment method", () => {
    for (const { value } of PAYMENT_METHODS) {
      const p = parseInvoicePutBody({ ...BASE_PUT, paymentMethod: value });
      expect(p).not.toBeNull();
      expect(p?.paymentMethod).toBe(value);
    }
  });

  it("rejects an unknown payment method", () => {
    expect(parseInvoicePutBody({ ...BASE_PUT, paymentMethod: "paypal" })).toBeNull();
    expect(parseInvoicePutBody({ ...BASE_PUT, paymentMethod: "venmo" })).toBeNull();
    expect(parseInvoicePutBody({ ...BASE_PUT, paymentMethod: "marketplace" })).toBeNull();
  });

  it("accepts null paymentMethod (cleared)", () => {
    const p = parseInvoicePutBody({ ...BASE_PUT, paymentMethod: null });
    expect(p).not.toBeNull();
    expect(p?.paymentMethod).toBeUndefined();
  });

  it("accepts absent paymentMethod", () => {
    const p = parseInvoicePutBody({ ...BASE_PUT });
    expect(p).not.toBeNull();
    expect(p?.paymentMethod).toBeUndefined();
  });
});

describe("parseInvoicePatchBody", () => {
  it("accepts empty patch", () => {
    const p = parseInvoicePatchBody({
      invoiceSyncKey: "550e8400-e29b-41d4-a716-446655440002",
      patch: {},
      recalculate: true,
    });
    expect(p).not.toBeNull();
    expect(p?.recalculate).toBe(true);
  });

  it("accepts patch with known paymentMethod", () => {
    for (const { value } of PAYMENT_METHODS) {
      const p = parseInvoicePatchBody({
        invoiceSyncKey: "550e8400-e29b-41d4-a716-446655440002",
        patch: { paymentMethod: value },
      });
      expect(p).not.toBeNull();
      // parsePatch does not validate paymentMethod — the guard runs in applyRemoteOp
      expect(p?.patch.paymentMethod).toBe(value);
    }
  });

  it("parses patch with unknown paymentMethod (guard applied in applyRemoteOp)", () => {
    const p = parseInvoicePatchBody({
      invoiceSyncKey: "550e8400-e29b-41d4-a716-446655440002",
      patch: { paymentMethod: "paypal" },
    });
    // parsePatchBody accepts any patch object; applyRemoteOp enforces the guard
    expect(p).not.toBeNull();
    expect(p?.patch.paymentMethod).toBe("paypal");
  });
});
