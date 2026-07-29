/**
 * Claim — ADR-001 (rev 2) §6.1
 *
 * Represents a buyer's interest in a lot during a Facebook live-sale event.
 * Only a confirmed primary or promoted Claim produces a Sale.
 */
export type ClaimType = "primary" | "backup";

export type ClaimStatus =
  | "primary"    // active, unconfirmed primary
  | "backup"     // active backup in queue
  | "promoted"   // backup elevated to primary; awaiting confirmation
  | "canceled"   // seller-rejected; terminal
  | "expired";   // backup window closed; terminal

export interface Claim {
  id?: number;
  /** Stable UUID for export/import and future sync. */
  syncKey: string;
  eventId: number;
  /** References lots.id */
  lotId: number;
  /** References bidders.id */
  bidderId: number;
  type: ClaimType;
  status: ClaimStatus;
  /**
   * Backup queue order (1-based). Primary claims carry position 0.
   * Seller-assigned; entry order is not authoritative (DR-8).
   */
  position: number;
  /** Raw buyer phrase (e.g. "NIL", "NEXT", bid text). Optional, display-only. */
  phrase?: string;
  /**
   * Set only after seller confirmation produces a Sale.
   * Invariant (DR-1/DR-2): must be null/undefined on any non-confirmed Claim.
   */
  saleId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
