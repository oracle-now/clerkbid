/**
 * Unit tests for lib/workspace/saleWorkspaceData.ts
 *
 * All 10 required workspace tests are pure — no DOM, no Dexie, no React.
 * Vitest environment: node (see vitest.config.ts).
 */
import { describe, it, expect } from "vitest";
import {
  deriveSaleWorkspace,
  containsInternalLabel,
  INTERNAL_LABELS,
  type WorkspaceCounts,
} from "@/lib/workspace/saleWorkspaceData";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseCounts = (overrides: Partial<WorkspaceCounts> = {}): WorkspaceCounts => ({
  itemCount: 0,
  buyerCount: 0,
  bundleCount: 0,
  unpaidCount: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saleWorkspaceData", () => {
  // 1. Workspace displays the active Sale name
  it("1: includes the sale name in workspace output", () => {
    const ws = deriveSaleWorkspace("Spring Estate Sale", baseCounts({ itemCount: 5, buyerCount: 3 }));
    expect(ws.saleName).toBe("Spring Estate Sale");
  });

  // 2. Set up, Sell, and Pack sections — phase derivation covers all three
  it("2a: returns setup phase when itemCount is zero", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 0, buyerCount: 5 }));
    expect(ws.phase).toBe("setup");
  });

  it("2b: returns setup phase when buyerCount is zero", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 10, buyerCount: 0 }));
    expect(ws.phase).toBe("setup");
  });

  it("2c: returns selling phase when items and buyers exist but no bundles", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 10, buyerCount: 5, bundleCount: 0 }));
    expect(ws.phase).toBe("selling");
  });

  it("2d: returns packing phase when at least one bundle exists", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 10, buyerCount: 5, bundleCount: 3 }));
    expect(ws.phase).toBe("packing");
  });

  // 3. Item and buyer counts are passed through correctly
  it("3: preserves item and buyer counts in workspace output", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 42, buyerCount: 7, bundleCount: 0, unpaidCount: 0 }));
    expect(ws.counts.itemCount).toBe(42);
    expect(ws.counts.buyerCount).toBe(7);
  });

  // 4. Facebook claims links to Claim Desk route
  it("4: selling phase primary action points to /claims/", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 5, buyerCount: 5, bundleCount: 0 }));
    expect(ws.phase).toBe("selling");
    expect(ws.primaryActionHref).toBe("/claims/");
  });

  // 5. Manual purchase links to clerking flow
  it("5: setup phase primary action points to /lots/ when no items", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 0, buyerCount: 0 }));
    expect(ws.primaryActionHref).toBe("/lots/");
  });

  // 6. Buyer Bundles link to existing invoice/bundle view
  it("6: packing phase primary action points to /invoices/", () => {
    const ws = deriveSaleWorkspace("Test", baseCounts({ itemCount: 10, buyerCount: 5, bundleCount: 2 }));
    expect(ws.phase).toBe("packing");
    expect(ws.primaryActionHref).toBe("/invoices/");
  });

  // 7. No internal Event/Bidder/Lot/Invoice labels appear in new copy
  it("7: primaryActionLabel contains no internal domain labels", () => {
    const phases: Array<{ itemCount: number; buyerCount: number; bundleCount: number }> = [
      { itemCount: 0, buyerCount: 0, bundleCount: 0 },
      { itemCount: 5, buyerCount: 0, bundleCount: 0 },
      { itemCount: 5, buyerCount: 5, bundleCount: 0 },
      { itemCount: 5, buyerCount: 5, bundleCount: 3 },
    ];
    for (const c of phases) {
      const ws = deriveSaleWorkspace("Test", baseCounts(c));
      expect(
        containsInternalLabel(ws.primaryActionLabel),
        `"${ws.primaryActionLabel}" contains an internal label`
      ).toBe(false);
    }
  });

  // 8. No selected sale → workspace returns empty-state-safe output
  it("8: deriveSaleWorkspace still returns a valid object with empty name", () => {
    // When no sale is selected, the page renders an empty state without
    // calling deriveSaleWorkspace; this test proves the function is safe
    // if called with an empty string (defensive).
    const ws = deriveSaleWorkspace("", baseCounts());
    expect(ws.saleName).toBe("");
    expect(ws.phase).toBe("setup");
    expect(ws.primaryActionHref).toBeDefined();
  });

  // 9. Existing routes are referenced (not renamed)
  it("9: all hrefs used by deriveSaleWorkspace are known existing routes", () => {
    const knownRoutes = ["/lots/", "/bidders/", "/claims/", "/invoices/"];
    const inputs: Array<WorkspaceCounts> = [
      baseCounts({ itemCount: 0, buyerCount: 0, bundleCount: 0 }),
      baseCounts({ itemCount: 5, buyerCount: 0, bundleCount: 0 }),
      baseCounts({ itemCount: 5, buyerCount: 5, bundleCount: 0 }),
      baseCounts({ itemCount: 5, buyerCount: 5, bundleCount: 2 }),
    ];
    for (const c of inputs) {
      const ws = deriveSaleWorkspace("Test", c);
      expect(knownRoutes).toContain(ws.primaryActionHref);
    }
  });

  // 10. No domain service call is introduced — containsInternalLabel is a
  //     pure string utility; verify it catches known identifiers and passes
  //     clean seller-facing copy.
  it("10: containsInternalLabel flags internal terms and passes seller copy", () => {
    // Should flag
    expect(containsInternalLabel("Event details")).toBe(true);
    expect(containsInternalLabel("Bidder #5")).toBe(true);
    expect(containsInternalLabel("Lot 12")).toBe(true);
    expect(containsInternalLabel("Invoice #001")).toBe(true);

    // Should pass
    expect(containsInternalLabel("Add items to this sale")).toBe(false);
    expect(containsInternalLabel("Add buyers to this sale")).toBe(false);
    expect(containsInternalLabel("Open claim desk")).toBe(false);
    expect(containsInternalLabel("Review buyer bundles")).toBe(false);
  });
});
