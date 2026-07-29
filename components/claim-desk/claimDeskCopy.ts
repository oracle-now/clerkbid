/**
 * claimDeskCopy.ts — UI-local label helpers for the Claim Desk.
 *
 * Seller-facing copy only. No domain logic, no service calls.
 * Do not import ClaimDomainError or claimService here.
 */
import type { ClaimErrorCode } from "@/lib/services/claimService";

// ---------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------

/** Seller-visible label for each stored Claim status. */
export const CLAIM_STATUS_LABELS: Record<string, string> = {
  primary: "Current",
  backup: "Waiting",
  promoted: "Moved up",
  canceled: "Removed",
  expired: "Passed",
};

// ---------------------------------------------------------------------------
// Ordinal waiting-position formatter
// ---------------------------------------------------------------------------

const ORDINAL_SUFFIXES = ["th", "st", "nd", "rd"] as const;

/**
 * Returns a seller-readable waiting position string.
 * ordinalWaitingLabel(1) → "1st waiting"
 * ordinalWaitingLabel(11) → "11th waiting"
 * ordinalWaitingLabel(0) returns null (primary claims carry position 0).
 */
export function ordinalWaitingLabel(position: number): string | null {
  if (position <= 0) return null;
  const mod100 = position % 100;
  // 11–13 are always "th"
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : (ORDINAL_SUFFIXES[position % 10] ?? "th");
  return `${position}${suffix} waiting`;
}

// ---------------------------------------------------------------------------
// Action labels
// ---------------------------------------------------------------------------

/**
 * Returns the visible cancel-action label for a claim status.
 * - current (primary / promoted) → "Mark as passed"
 * - waiting (backup) → "Remove"
 */
export function cancelActionLabel(
  status: "primary" | "promoted" | "backup"
): string {
  return status === "backup" ? "Remove" : "Mark as passed";
}

// ---------------------------------------------------------------------------
// Seller-readable error messages
// ---------------------------------------------------------------------------

/**
 * Maps known Claim domain error codes to seller-readable messages.
 * No ADR references, no PR references, no internal architecture terms.
 */
const CLAIM_ERROR_MESSAGES: Partial<Record<ClaimErrorCode, string>> = {
  BACKUP_NOT_PROMOTED:
    "This buyer is still in the waiting list. Move them up before confirming the sale.",
  ACTIVE_SALE_EXISTS:
    "This item already has a confirmed sale. Nothing was changed.",
  CLAIM_ALREADY_CONFIRMED:
    "This sale was already confirmed. Nothing was changed.",
  CLAIM_NOT_FOUND:
    "This claim could not be found. Refresh the page and try again.",
  INVALID_TRANSITION:
    "This action isn't available for the claim's current status. Refresh and try again.",
};

const GENERIC_ERROR =
  "We couldn't confirm this sale. Nothing was changed. Try again.";

/**
 * Returns a seller-readable error string for a caught error.
 * Raw domain messages are not surfaced; unknown errors use the generic recovery message.
 */
export function sellerReadableError(err: unknown): string {
  // Development logging only — do not surface raw messages in the UI
  if (process.env.NODE_ENV !== "production") {
    console.error("[ClaimDesk] raw error:", err);
  }

  // Use the typed code if it's a ClaimDomainError shape
  const code = (err as { code?: string })?.code as ClaimErrorCode | undefined;
  if (code && CLAIM_ERROR_MESSAGES[code]) {
    return CLAIM_ERROR_MESSAGES[code]!;
  }

  return GENERIC_ERROR;
}
