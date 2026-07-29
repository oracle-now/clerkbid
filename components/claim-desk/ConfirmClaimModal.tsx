"use client";

import { useState, useId } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { confirmClaim, ClaimDomainError } from "@/lib/services/claimService";
import type { Claim } from "@/types/claim";
import type { Lot, Bidder } from "@/lib/db";

interface Props {
  open: boolean;
  claim: Claim;
  lot: Lot;
  bidder: Bidder | null;
  currencySymbol: string;
  onClose: () => void;
  onConfirmed: (invoiceId: number | null | undefined) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ConfirmClaimModal({
  open,
  claim,
  lot,
  bidder,
  currencySymbol,
  onClose,
  onConfirmed,
}: Props) {
  const { db } = useUserDb();
  const uid = useId();
  const priceId = `${uid}-price`;
  const initialsId = `${uid}-initials`;

  const [priceStr, setPriceStr] = useState("");
  const [initials, setInitials] = useState("");
  const [priceErr, setPriceErr] = useState("");
  const [initialsErr, setInitialsErr] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const [busy, setBusy] = useState(false);

  const validate = (): boolean => {
    let ok = true;
    const priceVal = parseFloat(priceStr);
    if (!priceStr.trim() || !Number.isFinite(priceVal) || priceVal < 0) {
      setPriceErr("Enter a valid non-negative sale price.");
      ok = false;
    } else {
      setPriceErr("");
    }
    if (!initials.trim()) {
      setInitialsErr("Seller initials are required.");
      ok = false;
    } else {
      setInitialsErr("");
    }
    if (lot.quantity < 1 || !Number.isInteger(lot.quantity)) {
      setSubmitErr("Item quantity must be a positive integer.");
      ok = false;
    }
    return ok;
  };

  const handleSubmit = async () => {
    setSubmitErr("");
    if (!validate()) return;
    if (!db) {
      setSubmitErr("Database not ready.");
      return;
    }

    // Re-verify lot and bidder still belong to this event
    const freshLot = lot.id != null ? await db.lots.get(lot.id) : undefined;
    const freshBidder =
      bidder?.id != null ? await db.bidders.get(bidder.id) : undefined;

    if (!freshLot || freshLot.eventId !== claim.eventId) {
      setSubmitErr("Item no longer exists in this sale.");
      return;
    }
    if (!freshBidder || freshBidder.eventId !== claim.eventId) {
      setSubmitErr("Buyer no longer exists in this sale.");
      return;
    }

    const pricePerItem = parseFloat(priceStr);
    const amount = round2(pricePerItem * freshLot.quantity);

    setBusy(true);
    try {
      const { sale } = await confirmClaim(db, claim.id!, {
        displayLotNumber: freshLot.displayLotNumber,
        paddleNumber: freshBidder.paddleNumber,
        description: freshLot.description,
        consignor: freshLot.consignor,
        consignorId: freshLot.consignorId,
        quantity: freshLot.quantity,
        amount,
        clerkInitials: initials.trim(),
      });

      // Resolve the invoice that was upserted for this buyer
      let invoiceId: number | null = null;
      if (sale.invoiceId != null) {
        invoiceId = sale.invoiceId;
      } else {
        const inv = await db.invoices
          .where("eventId")
          .equals(claim.eventId)
          .filter((i) => i.bidderId === claim.bidderId)
          .first();
        invoiceId = inv?.id ?? null;
      }

      onConfirmed(invoiceId);
    } catch (err) {
      const msg =
        err instanceof ClaimDomainError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Confirmation failed.";
      setSubmitErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const buyerName = bidder
    ? `${bidder.firstName} ${bidder.lastName}`
    : `Buyer #${claim.bidderId}`;

  return (
    <Modal
      open={open}
      title="Confirm claim"
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={busy}>
            {busy ? "Confirming…" : "Confirm sale"}
          </Button>
        </>
      }
    >
      {/* Read-only context */}
      <dl className="mb-5 space-y-1.5 rounded-lg bg-surface px-4 py-3 text-sm dark:bg-slate-800">
        <div className="flex gap-2">
          <dt className="text-muted w-28 shrink-0">Buyer</dt>
          <dd className="font-medium text-ink dark:text-slate-200">{buyerName}</dd>
        </div>
        {bidder && (
          <div className="flex gap-2">
            <dt className="text-muted w-28 shrink-0">Buyer code</dt>
            <dd className="text-ink dark:text-slate-200">{bidder.paddleNumber}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-muted w-28 shrink-0">Item #</dt>
          <dd className="text-ink dark:text-slate-200">{lot.displayLotNumber}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted w-28 shrink-0">Description</dt>
          <dd className="text-ink dark:text-slate-200">{lot.description}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted w-28 shrink-0">Qty</dt>
          <dd className="text-ink dark:text-slate-200">{lot.quantity}</dd>
        </div>
      </dl>

      {/* Editable fields */}
      <div className="space-y-4">
        <Input
          id={priceId}
          label={`Sale price per item (${currencySymbol})`}
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          error={priceErr}
          autoFocus
        />
        {priceStr && Number.isFinite(parseFloat(priceStr)) && parseFloat(priceStr) >= 0 && (
          <p className="-mt-2 text-xs text-muted">
            Total: {currencySymbol}
            {round2(parseFloat(priceStr) * lot.quantity).toFixed(2)} ({lot.quantity}×)
          </p>
        )}
        <Input
          id={initialsId}
          label="Seller initials"
          placeholder="e.g. JD"
          value={initials}
          onChange={(e) => setInitials(e.target.value)}
          error={initialsErr}
        />
      </div>

      {submitErr && (
        <p className="mt-4 rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          {submitErr}
        </p>
      )}
    </Modal>
  );
}
