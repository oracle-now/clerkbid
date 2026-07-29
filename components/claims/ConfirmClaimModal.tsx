"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { confirmClaim, ClaimDomainError } from "@/lib/services/claimService";
import type { Claim } from "@/types/claim";
import type { AuctionDB } from "@/lib/db";

type Lot = {
  id?: number;
  displayLotNumber: string;
  description?: string;
  consignor?: string;
  consignorId?: number;
};
type Bidder = {
  id?: number;
  firstName: string;
  lastName: string;
  paddleNumber: number;
};

interface Props {
  claim: Claim;
  lot: Lot | null;
  bidder: Bidder | null;
  db: AuctionDB;
  onClose: () => void;
  onConfirmed: () => void;
}

interface ConfirmResult {
  saleId: number;
  wasIdempotent: boolean;
}

export function ConfirmClaimModal({
  claim,
  lot,
  bidder,
  db,
  onClose,
  onConfirmed,
}: Props) {
  const [displayLotNumber, setDisplayLotNumber] = useState(
    lot?.displayLotNumber ?? ""
  );
  const [description, setDescription] = useState(lot?.description ?? "");
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("");
  const [clerkInitials, setClerkInitials] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const inputClass =
    "w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
  const labelClass = "block text-sm font-medium text-ink dark:text-slate-200 mb-1";

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = parseInt(quantity, 10);
    const price = parseFloat(amount);
    if (!displayLotNumber.trim()) { setError("Item number is required."); return; }
    if (isNaN(qty) || qty < 1) { setError("Quantity must be at least 1."); return; }
    if (isNaN(price) || price < 0) { setError("Sale price must be a valid amount."); return; }
    if (!clerkInitials.trim()) { setError("Seller initials are required."); return; }
    if (!bidder) { setError("Buyer not found."); return; }

    setSaving(true);
    try {
      const res = await confirmClaim(db, claim.id!, {
        displayLotNumber: displayLotNumber.trim(),
        paddleNumber: bidder.paddleNumber,
        description: description.trim(),
        consignor: lot?.consignor,
        consignorId: lot?.consignorId,
        quantity: qty,
        amount: price,
        clerkInitials: clerkInitials.trim(),
      });
      setResult({ saleId: res.sale.id!, wasIdempotent: res.wasIdempotent });
      onConfirmed();
    } catch (err) {
      const msg =
        err instanceof ClaimDomainError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Confirmation failed.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-claim-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-navy/10 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-navy/10 px-6 py-4 dark:border-slate-700">
          <h2
            id="confirm-claim-title"
            className="text-base font-semibold text-navy dark:text-slate-100"
          >
            Confirm claim
          </h2>
          {bidder && (
            <p className="mt-1 text-sm text-muted">
              Buyer:{" "}
              <span className="font-medium text-ink dark:text-slate-100">
                {bidder.firstName} {bidder.lastName}
              </span>
              {" "}·{" "}Buyer code:{" "}
              <span className="font-mono font-medium">{bidder.paddleNumber}</span>
            </p>
          )}
        </div>

        {result ? (
          <div className="px-6 py-6">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">
              ✓ Claim confirmed
              {result.wasIdempotent && (
                <span className="ml-2 text-xs font-normal text-muted">
                  (idempotent retry — no new sale created)
                </span>
              )}
            </p>
            <p className="mt-3 text-sm text-muted">
              The sale has been recorded and a Buyer Bundle has been created or
              updated.
            </p>
            <Link
              href="/invoices/"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-navy underline hover:text-navy/70 dark:text-blue-400"
            >
              Open Buyer Bundles →
            </Link>
            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleConfirm(e)} noValidate>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div>
                <label htmlFor="ccm-lot" className={labelClass}>
                  Item number
                </label>
                <input
                  id="ccm-lot"
                  type="text"
                  className={inputClass}
                  value={displayLotNumber}
                  onChange={(e) => setDisplayLotNumber(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ccm-qty" className={labelClass}>
                  Quantity
                </label>
                <input
                  id="ccm-qty"
                  type="number"
                  min={1}
                  step={1}
                  className={inputClass}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ccm-desc" className={labelClass}>
                  Description
                </label>
                <input
                  id="ccm-desc"
                  type="text"
                  className={inputClass}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ccm-price" className={labelClass}>
                  Sale price
                </label>
                <input
                  id="ccm-price"
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label htmlFor="ccm-initials" className={labelClass}>
                  Seller initials
                </label>
                <input
                  id="ccm-initials"
                  type="text"
                  className={inputClass}
                  value={clerkInitials}
                  onChange={(e) => setClerkInitials(e.target.value)}
                  placeholder="e.g. AB"
                />
              </div>
            </div>

            {error && (
              <p
                className="mx-6 mb-4 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 border-t border-navy/10 px-6 py-4 dark:border-slate-700">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Confirming…" : "Confirm sale"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
