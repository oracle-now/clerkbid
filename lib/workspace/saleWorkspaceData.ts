/**
 * Pure derivation module — no Dexie, no React, no side-effects.
 * The SaleWorkspace component owns the live queries; this module
 * only converts counts into display-ready workspace state.
 *
 * UX-1 / feat(ux): seller-centered sale workspace
 */

export type WorkspacePhase = "setup" | "selling" | "packing";

export interface WorkspaceCounts {
  /** db.lots.where("eventId").equals(id).count() */
  itemCount: number;
  /** db.bidders.where("eventId").equals(id).count() */
  buyerCount: number;
  /** db.invoices.where("eventId").equals(id).count() */
  bundleCount: number;
  /** db.invoices.where("eventId").equals(id).filter(i => i.status === "unpaid").count() */
  unpaidCount: number;
}

export interface WorkspaceData {
  saleName: string;
  phase: WorkspacePhase;
  /** One-line seller-facing description of the next useful action. */
  primaryActionLabel: string;
  /** Route for the primary action. */
  primaryActionHref: string;
  counts: WorkspaceCounts;
}

/**
 * Derive workspace display state from the currently selected sale and
 * its counts.  All inputs come from existing Dexie queries; nothing is
 * inferred, nothing is written.
 *
 * Phase heuristic (no new schema required):
 *   setup   — no items OR no buyers
 *   packing — at least one Buyer Bundle exists
 *   selling — otherwise
 */
export function deriveSaleWorkspace(
  saleName: string,
  counts: WorkspaceCounts
): WorkspaceData {
  const { itemCount, buyerCount, bundleCount } = counts;

  let phase: WorkspacePhase;
  let primaryActionLabel: string;
  let primaryActionHref: string;

  if (itemCount === 0 || buyerCount === 0) {
    phase = "setup";
    if (itemCount === 0) {
      primaryActionLabel = "Add items to this sale";
      primaryActionHref = "/lots/";
    } else {
      primaryActionLabel = "Add buyers to this sale";
      primaryActionHref = "/bidders/";
    }
  } else if (bundleCount > 0) {
    phase = "packing";
    primaryActionLabel = "Review buyer bundles";
    primaryActionHref = "/invoices/";
  } else {
    phase = "selling";
    primaryActionLabel = "Open claim desk";
    primaryActionHref = "/claims/";
  }

  return {
    saleName,
    phase,
    primaryActionLabel,
    primaryActionHref,
    counts,
  };
}

/**
 * Returns true when the string contains an internal domain identifier
 * that sellers should never see in the workspace UI.
 *
 * Used in tests to assert no internal labels leak into new copy.
 */
export const INTERNAL_LABELS = [
  "event",
  "bidder",
  "lot",
  "invoice",
] as const;

export type InternalLabel = (typeof INTERNAL_LABELS)[number];

export function containsInternalLabel(text: string): boolean {
  const lower = text.toLowerCase();
  return INTERNAL_LABELS.some((l) => lower.includes(l));
}
