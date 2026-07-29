/**
 * Pure derivation module — no Dexie, no React, no side-effects.
 *
 * Exports:
 *   WORKSPACE_AREAS        — immutable config consumed by SaleWorkspace.tsx
 *   EMPTY_STATE_DESTINATION — single empty-state route/label
 *   deriveWorkspaceCounts   — count pass-through for display
 *   containsInternalLabel   — test/guard utility
 *
 * UX-1 / feat(ux): corrected seller-centered workspace
 */

// ---------------------------------------------------------------------------
// Workspace area configuration
// ---------------------------------------------------------------------------

export interface WorkspaceAction {
  /** Stable machine id — not rendered. */
  readonly id: string;
  /** Seller-facing link label. */
  readonly label: string;
  /** Existing app route. */
  readonly href: string;
}

export interface WorkspaceArea {
  /** Stable machine id — not rendered. */
  readonly id: string;
  /** Seller-facing section heading. */
  readonly label: string;
  readonly actions: readonly WorkspaceAction[];
}

/**
 * Immutable workspace configuration.
 * SaleWorkspace.tsx renders sections and links directly from this export.
 * Tests import this same object so route/label assertions target production
 * values, not duplicated literals.
 */
export const WORKSPACE_AREAS: readonly WorkspaceArea[] = [
  {
    id: "setup",
    label: "Set up",
    actions: [
      { id: "items",  label: "Manage items",  href: "/lots/"    },
      { id: "buyers", label: "Manage buyers", href: "/bidders/" },
    ],
  },
  {
    id: "sell",
    label: "Sell",
    actions: [
      { id: "claims",             label: "Facebook claims",            href: "/claims/"   },
      { id: "completed-purchase", label: "Enter a completed purchase", href: "/clerking/" },
    ],
  },
  {
    id: "bundles",
    label: "Buyer Bundles",
    actions: [
      { id: "buyer-bundles", label: "Open buyer bundles", href: "/invoices/" },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Empty-state destination
// ---------------------------------------------------------------------------

export const EMPTY_STATE_DESTINATION = {
  label: "Choose or create a sale",
  href: "/events/",
} as const;

// ---------------------------------------------------------------------------
// Display counts
// ---------------------------------------------------------------------------

export interface WorkspaceCounts {
  /** db.lots.where("eventId").equals(id).count() */
  itemCount: number;
  /** db.bidders.where("eventId").equals(id).count() */
  buyerCount: number;
  /** db.invoices.where("eventId").equals(id).count() */
  buyerBundleCount: number;
}

export interface WorkspaceData {
  saleName: string;
  counts: WorkspaceCounts;
}

/**
 * Pass counts and saleName through unchanged.
 * No phase inference. No next-action derivation. No packing logic.
 */
export function deriveWorkspaceCounts(
  saleName: string,
  counts: WorkspaceCounts
): WorkspaceData {
  return { saleName, counts };
}

// ---------------------------------------------------------------------------
// Internal-label guard
// ---------------------------------------------------------------------------

/**
 * Returns true when the string contains an internal domain identifier
 * that sellers should never see in workspace copy.
 * Used in tests to assert no internal labels leak into configuration.
 */
export const INTERNAL_LABELS = [
  "event",
  "bidder",
  "lot",
  "invoice",
  "clerking",
] as const;

export type InternalLabel = (typeof INTERNAL_LABELS)[number];

export function containsInternalLabel(text: string): boolean {
  const lower = text.toLowerCase();
  return INTERNAL_LABELS.some((l) => lower.includes(l));
}
