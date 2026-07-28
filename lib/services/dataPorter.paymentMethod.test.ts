import { describe, expect, it } from "vitest";
import { parseEventExportPayload } from "./dataPorter";
import { PAYMENT_METHODS } from "@/lib/utils/constants";

const BASE_EVENT = {
  name: "Test Sale",
  organizationName: "Org",
  taxRate: 0,
  currencySymbol: "$",
  createdAt: "2026-01-01T00:00:00Z",
};

function makePayload(invoiceOverrides: Record<string, unknown> = {}) {
  return {
    exportVersion: 6,
    exportDate: "2026-01-01T00:00:00Z",
    appVersion: "0.1.0",
    event: BASE_EVENT,
    bidders: [],
    consignors: [],
    lots: [],
    sales: [],
    invoices: [
      {
        invoiceNumber: "1-001",
        status: "unpaid",
        subtotal: 10,
        buyersPremiumAmount: 0,
        taxAmount: 0,
        total: 10,
        generatedAt: "2026-01-01T00:00:00Z",
        syncKey: "abc",
        ...invoiceOverrides,
      },
    ],
  };
}

describe("parseEventExportPayload — invoice paymentMethod", () => {
  it("accepts import with no paymentMethod field", () => {
    const p = parseEventExportPayload(makePayload());
    expect(p.invoices).toHaveLength(1);
  });

  it("accepts import with null paymentMethod", () => {
    const p = parseEventExportPayload(makePayload({ paymentMethod: null }));
    expect(p.invoices).toHaveLength(1);
  });

  it("accepts each known payment method on import", () => {
    for (const { value } of PAYMENT_METHODS) {
      const p = parseEventExportPayload(makePayload({ paymentMethod: value }));
      expect(p.invoices[0]?.paymentMethod).toBe(value);
    }
  });

  it("rejects import with unknown paymentMethod", () => {
    expect(() =>
      parseEventExportPayload(makePayload({ paymentMethod: "paypal" }))
    ).toThrow(/unknown paymentMethod/);

    expect(() =>
      parseEventExportPayload(makePayload({ paymentMethod: "venmo" }))
    ).toThrow(/unknown paymentMethod/);

    expect(() =>
      parseEventExportPayload(makePayload({ paymentMethod: "marketplace" }))
    ).toThrow(/unknown paymentMethod/);
  });
});
