/**
 * Unit tests for lib/workspace/saleWorkspaceData.ts
 *
 * All tests are pure — no DOM, no Dexie, no React.
 * They import the same WORKSPACE_AREAS and EMPTY_STATE_DESTINATION
 * objects consumed by SaleWorkspace.tsx, so route/label assertions
 * target production values rather than duplicated literals.
 *
 * Vitest environment: node (see vitest.config.ts).
 */
import { describe, it, expect } from "vitest";
import {
  WORKSPACE_AREAS,
  EMPTY_STATE_DESTINATION,
  deriveWorkspaceCounts,
  containsInternalLabel,
  type WorkspaceCounts,
} from "@/lib/workspace/saleWorkspaceData";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseCounts = (overrides: Partial<WorkspaceCounts> = {}): WorkspaceCounts => ({
  itemCount: 0,
  buyerCount: 0,
  buyerBundleCount: 0,
  ...overrides,
});

/** Flat list of all actions across all areas. */
const allActions = WORKSPACE_AREAS.flatMap((area) => area.actions);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saleWorkspaceData", () => {

  // 1. Set up, Sell, and Buyer Bundles all exist
  it("1: exports Set up, Sell, and Buyer Bundles areas", () => {
    const ids = WORKSPACE_AREAS.map((a) => a.id);
    expect(ids).toContain("setup");
    expect(ids).toContain("sell");
    expect(ids).toContain("bundles");
  });

  // 2. /lots/ belongs to Manage items
  it("2: Manage items action links to /lots/", () => {
    const action = allActions.find((a) => a.id === "items");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Manage items");
    expect(action!.href).toBe("/lots/");
  });

  // 3. /bidders/ belongs to Manage buyers
  it("3: Manage buyers action links to /bidders/", () => {
    const action = allActions.find((a) => a.id === "buyers");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Manage buyers");
    expect(action!.href).toBe("/bidders/");
  });

  // 4. /claims/ belongs to Facebook claims
  it("4: Facebook claims action links to /claims/", () => {
    const action = allActions.find((a) => a.id === "claims");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Facebook claims");
    expect(action!.href).toBe("/claims/");
  });

  // 5. /clerking/ belongs to Enter a completed purchase
  it("5: Enter a completed purchase action links to /clerking/", () => {
    const action = allActions.find((a) => a.id === "completed-purchase");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Enter a completed purchase");
    expect(action!.href).toBe("/clerking/");
  });

  // 6. /invoices/ belongs to Open buyer bundles
  it("6: Open buyer bundles action links to /invoices/", () => {
    const action = allActions.find((a) => a.id === "buyer-bundles");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Open buyer bundles");
    expect(action!.href).toBe("/invoices/");
  });

  // 7. Empty state uses /events/
  it("7: EMPTY_STATE_DESTINATION points to /events/", () => {
    expect(EMPTY_STATE_DESTINATION.href).toBe("/events/");
    expect(EMPTY_STATE_DESTINATION.label).toBeTruthy();
  });

  // 8. No area label or action label contains internal domain terms
  it("8: no area label or action label contains internal domain identifiers", () => {
    for (const area of WORKSPACE_AREAS) {
      expect(
        containsInternalLabel(area.label),
        `area label "${area.label}" contains an internal identifier`
      ).toBe(false);
      for (const action of area.actions) {
        expect(
          containsInternalLabel(action.label),
          `action label "${action.label}" contains an internal identifier`
        ).toBe(false);
      }
    }
  });

  // 9. No packing state, Pack heading, unpaid, or phase terms in config
  it("9: configuration contains no packing-state, Pack, unpaid, or phase language", () => {
    const forbidden = ["pack", "unpaid", "phase", "setting up", "selling phase", "packing phase"];
    const allText = [
      ...WORKSPACE_AREAS.map((a) => a.label),
      ...allActions.map((a) => a.label),
      EMPTY_STATE_DESTINATION.label,
    ].map((s) => s.toLowerCase());
    for (const term of forbidden) {
      for (const text of allText) {
        expect(
          text.includes(term),
          `"${text}" contains forbidden term "${term}"`
        ).toBe(false);
      }
    }
  });

  // 10. deriveWorkspaceCounts preserves saleName and counts without deriving workflow state
  it("10: deriveWorkspaceCounts preserves saleName and counts; no phase field", () => {
    const counts = baseCounts({ itemCount: 12, buyerCount: 7, buyerBundleCount: 3 });
    const ws = deriveWorkspaceCounts("Summer Estate", counts);
    expect(ws.saleName).toBe("Summer Estate");
    expect(ws.counts.itemCount).toBe(12);
    expect(ws.counts.buyerCount).toBe(7);
    expect(ws.counts.buyerBundleCount).toBe(3);
    // No phase field should exist on the returned object
    expect((ws as Record<string, unknown>)["phase"]).toBeUndefined();
    expect((ws as Record<string, unknown>)["primaryActionLabel"]).toBeUndefined();
    expect((ws as Record<string, unknown>)["primaryActionHref"]).toBeUndefined();
  });

});
