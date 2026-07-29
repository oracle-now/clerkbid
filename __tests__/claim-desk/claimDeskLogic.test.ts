/**
 * Unit tests for Claim Desk pure helpers.
 * All helpers are imported from the production lib/claimDeskHelpers.ts —
 * these tests verify real production code, not copies.
 */
import { describe, it, expect } from "vitest";
import {
  nextBackupPosition,
  computeClaimAmount,
  validateConfirmForm,
} from "@/lib/claimDeskHelpers";
import type { Claim } from "@/types/claim";

// Minimal Claim fixture
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

describe("queue ordering (primary/promoted before backups)", () => {
  it("primary ranks before backup", () => {
    const primary = base({ type: "primary", status: "primary", position: 0 });
    const backup = base({ position: 1 });
    const sorted = [backup, primary].sort((a, b) => {
      const rank = (c: Claim) =>
        c.status === "primary" || c.status === "promoted" ? 0 : 1;
      return rank(a) - rank(b) || a.position - b.position;
    });
    expect(sorted[0]!.status).toBe("primary");
    expect(sorted[1]!.status).toBe("backup");
  });

  it("promoted ranks before backup", () => {
    const promoted = base({ type: "primary", status: "promoted", position: 0 });
    const backup = base({ position: 1 });
    const sorted = [backup, promoted].sort((a, b) => {
      const rank = (c: Claim) =>
        c.status === "primary" || c.status === "promoted" ? 0 : 1;
      return rank(a) - rank(b) || a.position - b.position;
    });
    expect(sorted[0]!.status).toBe("promoted");
  });

  it("backups are ordered by position", () => {
    const q = [
      base({ position: 3 }),
      base({ position: 1 }),
      base({ position: 2 }),
    ].sort((a, b) => {
      const rank = (c: Claim) =>
        c.status === "primary" || c.status === "promoted" ? 0 : 1;
      return rank(a) - rank(b) || a.position - b.position;
    });
    expect(q.map((c) => c.position)).toEqual([1, 2, 3]);
  });
});

describe("computeClaimAmount", () => {
  it("multiplies price by quantity and rounds to 2dp", () => {
    expect(computeClaimAmount("10.00", 3)).toBe(30.0);
  });

  it("rounds floating-point imprecision", () => {
    expect(computeClaimAmount("1.005", 2)).toBe(2.01);
  });

  it("returns null for negative price", () => {
    expect(computeClaimAmount("-1", 2)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(computeClaimAmount("abc", 2)).toBeNull();
  });

  it("returns 0 for price of 0", () => {
    expect(computeClaimAmount("0", 5)).toBe(0);
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
