import type { Claim } from "@/types/claim";

/** Returns the next backup position for a claim queue. */
export function nextBackupPosition(queue: Pick<Claim, "type" | "position">[]): number {
  const positions = queue
    .filter((c) => c.type === "backup")
    .map((c) => c.position);
  return positions.length === 0 ? 1 : Math.max(...positions) + 1;
}

/** Rounds to 2 decimal places using the repository money convention. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Computes the total amount for a claim confirmation.
 * Returns null if the price string is invalid or negative.
 */
export function computeClaimAmount(
  priceStr: string,
  quantity: number
): number | null {
  const v = parseFloat(priceStr);
  if (!Number.isFinite(v) || v < 0) return null;
  return round2(v * quantity);
}

/** Validation keys returned when confirm-form fields are invalid. */
export type ConfirmValidationKey = "price" | "initials" | "quantity";

/**
 * Validates the confirm-sale form fields.
 * Returns an array of the field keys that failed; empty means valid.
 */
export function validateConfirmForm(
  priceStr: string,
  initials: string,
  quantity: number
): ConfirmValidationKey[] {
  const errs: ConfirmValidationKey[] = [];
  const v = parseFloat(priceStr);
  if (!priceStr.trim() || !Number.isFinite(v) || v < 0) errs.push("price");
  if (!initials.trim()) errs.push("initials");
  if (quantity < 1 || !Number.isInteger(quantity)) errs.push("quantity");
  return errs;
}
