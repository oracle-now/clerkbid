/**
 * Integration tests for invoice.patch paymentMethod handling in applyRemoteOp.
 *
 * Uses fake-indexeddb so every test operates against a real AuctionDB instance
 * with actual stored state. Proves the behavior the task requires:
 *   - cash, check, credit_card, other are applied to the stored invoice
 *   - null clears paymentMethod from the stored invoice
 *   - an unknown non-null value leaves the previous paymentMethod unchanged
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { AuctionDB } from "@/lib/db";
import { applyRemoteOp } from "@/lib/sync/ops/applyRemoteOp";
import type { AuctionEvent, Invoice } from "@/lib/db";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let db: AuctionDB;
let dbSeq = 0;

const BASE_EVENT: Omit<AuctionEvent, "id"> = {
  name: "Test Auction",
  organizationName: "Test Org",
  taxRate: 0,
  buyersPremiumRate: 0,
  defaultConsignorCommissionRate: 0,
  currencySymbol: "$",
  syncId: "evt-sync-id-001",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const INVOICE_SYNC_KEY = "inv-sync-key-0001";

async function seedInvoice(
  paymentMethod?: Invoice["paymentMethod"]
): Promise<{ eventRow: AuctionEvent; invoiceId: number }> {
  const eventId = (await db.events.add({ ...BASE_EVENT })) as number;
  const eventRow = (await db.events.get(eventId))!;

  const bidderId = (await db.bidders.add({
    eventId,
    paddleNumber: 1,
    firstName: "Test",
    lastName: "Bidder",
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as number;

  const baseInvoice: Omit<Invoice, "id"> = {
    eventId,
    bidderId,
    invoiceNumber: "1-001",
    subtotal: 10,
    buyersPremiumAmount: 0,
    taxAmount: 0,
    total: 10,
    status: "unpaid",
    syncKey: INVOICE_SYNC_KEY,
    generatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  if (paymentMethod !== undefined) {
    baseInvoice.paymentMethod = paymentMethod;
  }

  const invoiceId = (await db.invoices.add(baseInvoice)) as number;
  return { eventRow, invoiceId };
}

function patchBody(paymentMethod: unknown) {
  return {
    invoiceSyncKey: INVOICE_SYNC_KEY,
    patch: { paymentMethod },
  };
}

// ---------------------------------------------------------------------------
// Setup: fresh DB per test
// ---------------------------------------------------------------------------

beforeEach(() => {
  dbSeq++;
  db = new AuctionDB(`test-user-pm-${dbSeq}`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyRemoteOp invoice.patch — paymentMethod", () => {
  it("applies cash to the stored invoice", async () => {
    const { eventRow, invoiceId } = await seedInvoice();
    const result = await applyRemoteOp(
      db,
      eventRow,
      BASE_EVENT.syncId,
      "invoice.patch",
      patchBody("cash")
    );
    expect(result.ok).toBe(true);
    const stored = await db.invoices.get(invoiceId);
    expect(stored?.paymentMethod).toBe("cash");
  });

  it("applies check to the stored invoice", async () => {
    const { eventRow, invoiceId } = await seedInvoice();
    const result = await applyRemoteOp(
      db,
      eventRow,
      BASE_EVENT.syncId,
      "invoice.patch",
      patchBody("check")
    );
    expect(result.ok).toBe(true);
    const stored = await db.invoices.get(invoiceId);
    expect(stored?.paymentMethod).toBe("check");
  });

  it("applies credit_card to the stored invoice", async () => {
    const { eventRow, invoiceId } = await seedInvoice();
    const result = await applyRemoteOp(
      db,
      eventRow,
      BASE_EVENT.syncId,
      "invoice.patch",
      patchBody("credit_card")
    );
    expect(result.ok).toBe(true);
    const stored = await db.invoices.get(invoiceId);
    expect(stored?.paymentMethod).toBe("credit_card");
  });

  it("applies other to the stored invoice", async () => {
    const { eventRow, invoiceId } = await seedInvoice();
    const result = await applyRemoteOp(
      db,
      eventRow,
      BASE_EVENT.syncId,
      "invoice.patch",
      patchBody("other")
    );
    expect(result.ok).toBe(true);
    const stored = await db.invoices.get(invoiceId);
    expect(stored?.paymentMethod).toBe("other");
  });

  it("null clears a previously set paymentMethod", async () => {
    const { eventRow, invoiceId } = await seedInvoice("cash");
    const before = await db.invoices.get(invoiceId);
    expect(before?.paymentMethod).toBe("cash");

    const result = await applyRemoteOp(
      db,
      eventRow,
      BASE_EVENT.syncId,
      "invoice.patch",
      patchBody(null)
    );
    expect(result.ok).toBe(true);
    const stored = await db.invoices.get(invoiceId);
    expect(stored?.paymentMethod).toBeUndefined();
  });

  it("unknown non-null value leaves previous paymentMethod unchanged", async () => {
    const { eventRow, invoiceId } = await seedInvoice("check");
    const result = await applyRemoteOp(
      db,
      eventRow,
      BASE_EVENT.syncId,
      "invoice.patch",
      patchBody("paypal")
    );
    expect(result.ok).toBe(true);
    const stored = await db.invoices.get(invoiceId);
    expect(stored?.paymentMethod).toBe("check");
  });
});
