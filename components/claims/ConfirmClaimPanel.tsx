"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  confirmClaim,
  ClaimDomainError,
} from "@/lib/services/claimService";
import type { AuctionDB, Lot } from "@/lib/db";
import type { Claim } from "@/types/claim";

interface Props {
  db: AuctionDB;
  claim: Claim;
  lot: Lot;
  onDone: () => void;
  onCancel: () => void;
}

export function ConfirmClaimPanel({ db, claim, lot, onDone, onCancel }: Props) {
  const [displayLotNumber, setDisplayLotNumber] = useState(
    lot.displayLotNumber ?? ""
  );
  const [description, setDescription] = useState(lot.description ?? "");
  const [quantity, setQuantity] = useState(String(lot.quantity ?? 1));
  const [amount, setAmount] = useState("");
  const [clerkInitials, setClerkInitials] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    saleId: number;
    invoiceId?: number;
    wasIdempotent: boolean;
  } | null>(null);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = parseInt(quantity, 10);
    const amt = parseFloat(amount);
    if (!displayLotNumber.trim()) { setError("Item number is required."); return; }
    if (!description.trim()) { setError("Description is required."); return; }
    if (!qty || qty < 1) { setError("Quantity must be a positive integer."); return; }
    if (isNaN(amt) || amt < 0) { setError("Sale price is required."); return; }
    if (!clerkInitials.trim()) { setError("Seller initials are required."); return; }

    if (!claim.id) return;

    // Look up paddle number from bidder
    const bidder = await db.bidders.get(claim.bidderId);
    if (!bidder) { setError("Buyer not found."); return; }

    // Look up consignor if present
    const consignor = lot.consignorId
      ? (await db.consignors?.get(lot.consignorId))?.name
      : lot.consignor;

    setSaving(true);
    try {
      const res = await confirmClaim(db, claim.id, {
        displayLotNumber: displayLotNumber.trim(),
        paddleNumber: bidder.paddleNumber,
        description: description.trim(),
        consignor,
        consignorId: lot.consignorId,
        quantity: qty,
        amount: amt,
        clerkInitials: clerkInitials.trim(),
      });

      // Find resulting invoice
      const invoice = await db.invoices
        .where("eventId")
        .equals(claim.eventId)
        .filter((inv) => inv.bidderId === claim.bidderId)
        .first();

      setResult({
        saleId: res.sale.id!,
        invoiceId: invoice?.id,
        wasIdempotent: res.wasIdempotent,
      });
    } catch (err) {
      if (err instanceof ClaimDomainError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Confirmation failed.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
        <p className="font-semibold text-green-800 dark:text-green-300">
          Claim confirmed{result.wasIdempotent ? " (idempotent retry)" : ""}.
        </p>
        <p className="mt-1 text-sm text-green-700 dark:text-green-400">
          Sale recorded.
        </p>
        <div className="mt-3 flex gap-2">
          {result.invoiceId != null && (
            <a
              href="/invoices/"
              className="inline-flex items-center rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
            >
              View Buyer Bundle
            </a>
          )}
          <Button type="button" variant="secondary" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleConfirm(e)}
      className="space-y-4 rounded-lg border border-navy/10 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <h3 className="font-semibold text-ink dark:text-slate-100">
        Confirm claim
      </h3>
      <p className="text-sm text-muted">
        Review the sale details before confirming ownership.
      </p>

      <Input
        id="confirm-lot-number"
        label="Item number"
        value={displayLotNumber}
        onChange={(e) => setDisplayLotNumber(e.target.value)}
      />
      <Input
        id="confirm-description"
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        id="confirm-quantity"
        label="Quantity"
        type="number"
        min={1}
        step={1}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <Input
        id="confirm-amount"
        label="Sale price"
        type="number"
        min={0}
        step={0.01}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
      />
      <Input
        id="confirm-initials"
        label="Seller initials"
        value={clerkInitials}
        onChange={(e) => setClerkInitials(e.target.value)}
        placeholder="e.g. JD"
      />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Confirming…" : "Confirm"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Back
        </Button>
      </div>
    </form>
  );
}
