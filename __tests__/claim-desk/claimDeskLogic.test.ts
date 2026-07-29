/**
 * Focused unit tests for Claim Desk logic that can run in the Vitest
 * node environment without a browser or Dexie.
 *
 * These tests exercise:
 *  1. nextBackupPosition derivation
 *  2. ConfirmClaimModal amount calculation
 *  3. Validation edge-cases
 */
import { describe, it, expect } from "vitest";
import type { Claim } from "@/types/claim";

// ── helpers copied from ClaimDesk.tsx (pure, no imports) ────────────────────

function nextBackupPosition(queue: Claim[]): number {
  const positions = queue
    .filter((c) => c.type === "backup")
    .map((c) => c.position);
  return positions.length === 0 ? 1 : Math.max(...positions) + 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function computeAmount(priceStr: string, quantity: number): number | null {
  const v = parseFloat(priceStr);
  if (!Number.isFinite(v) || v < 0) return null;
  return round2(v * quantity);
}

function validateConfirmForm(
  priceStr: string,
  initials: string,
  quantity: number
): string[] {
  const errs: string[] = [];
  const v = parseFloat(priceStr);
  if (!priceStr.trim() || !Number.isFinite(v) || v < 0)
    errs.push("price");
  if (!initials.trim()) errs.push("initials");
  if (quantity < 1 || !Number.isInteger(quantity)) errs.push("quantity");
  return errs;
}

// ── tests ───────────────────────────────────────────────────────────────────

const base = (overrides: Partial<Claim> = {}): Claim => ({
  syncKey: "test-sync-key",
  eventId: 1,
  lotId: 10,
  bidderId: 5,
  type: "backup",
  status: "backup",
  position: 1,
  saleId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("nextBackupPosition", () => {
  it("returns 1 for an empty queue", () => {
    expect(nextBackupPosition([])).toBe(1);
  });

  it("returns 1 for a queue with only a primary claim", () => {
    const q = [base({ type: "primary", status: "primary", position: 0 })];
    expect(nextBackupPosition(q)).toBe(1);
  });

  it("returns max position + 1", () => {
    const q = [
      base({ position: 1 }),
      base({ position: 2 }),
      base({ position: 3 }),
    ];
    expect(nextBackupPosition(q)).toBe(4);
  });

  it("handles non-contiguous positions", () => {
    const q = [base({ position: 1 }), base({ position: 5 })];
    expect(nextBackupPosition(q)).toBe(6);
  });
});

describe("computeAmount", () => {
  it("multiplies price by quantity and rounds to 2dp", () => {
    expect(computeAmount("10.00", 3)).toBe(30.0);
  });

  it("rounds floating-point imprecision", () => {
    expect(computeAmount("1.005", 2)).toBe(2.01);
  });

  it("returns null for negative price", () => {
    expect(computeAmount("-1", 2)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(computeAmount("abc", 2)).toBeNull();
  });

  it("returns 0 for price of 0", () => {
    expect(computeAmount("0", 5)).toBe(0);
  });
});

describe("validateConfirmForm", () => {
  it("returns no errors for valid input", () => {
    expect(validateConfirmForm("25.00", "JD", 2)).toEqual([]);
  });

  it("flags empty price", () => {
    expect(validateConfirmForm("", "JD", 1)).toContain("price");
  });

  it("flags negative price", () => {
    expect(validateConfirmForm("-5", "JD", 1)).toContain("price");
  });

  it("flags empty initials", () => {
    expect(validateConfirmForm("10", "", 1)).toContain("initials");
  });

  it("flags zero quantity", () => {
    expect(validateConfirmForm("10", "JD", 0)).toContain("quantity");
  });

  it("flags fractional quantity", () => {
    expect(validateConfirmForm("10", "JD", 1.5)).toContain("quantity");
  });

  it("flags all three at once", () => {
    const errs = validateConfirmForm("", "", 0);
    expect(errs).toContain("price");
    expect(errs).toContain("initials");
    expect(errs).toContain("quantity");
  });
});
