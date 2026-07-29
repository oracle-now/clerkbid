"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Claim } from "@/types/claim";
import type { Bidder } from "@/lib/db";
import {
  CLAIM_STATUS_LABELS,
  ordinalWaitingLabel,
  cancelActionLabel,
} from "./claimDeskCopy";

/** Map each claim status to the Badge `tone` prop. */
const STATUS_TONE: Record<
  Claim["status"],
  "neutral" | "success" | "warning" | "danger"
> = {
  primary: "success",
  promoted: "warning",
  backup: "neutral",
  canceled: "neutral",
  expired: "neutral",
};

interface Props {
  claim: Claim;
  bidder: Bidder | undefined;
  currencySymbol: string;
  onPromote: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onExpire: () => void;
  busy: boolean;
}

export function ClaimQueueItem({
  claim,
  bidder,
  onPromote,
  onConfirm,
  onCancel,
  onExpire,
  busy,
}: Props) {
  const isTerminal = claim.status === "canceled" || claim.status === "expired";
  const canPromote = claim.status === "backup";
  const canConfirm = claim.status === "primary" || claim.status === "promoted";
  const canCancel = !isTerminal && claim.saleId == null;
  const canExpire = claim.status === "backup" && claim.saleId == null;

  // Inline two-step cancel confirmation state
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Reset confirmation when claim changes or goes busy
  useEffect(() => {
    setConfirmingCancel(false);
  }, [claim.id, claim.status, busy]);

  const handleCancelClick = () => {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    // Second click: call handler exactly once
    setConfirmingCancel(false);
    onCancel();
  };

  const handleKeepClaim = () => {
    setConfirmingCancel(false);
  };

  const buyerName = bidder
    ? `${bidder.firstName} ${bidder.lastName}`
    : `Buyer #${claim.bidderId}`;
  const buyerCode = bidder ? `Buyer code: ${bidder.paddleNumber}` : null;

  const cancelLabel =
    claim.status === "backup"
      ? cancelActionLabel("backup")
      : cancelActionLabel(claim.status as "primary" | "promoted");

  return (
    <li className="rounded-lg border border-navy/10 bg-surface px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[claim.status]}>
              {CLAIM_STATUS_LABELS[claim.status] ?? claim.status}
            </Badge>
            {claim.type === "backup" && claim.position > 0 && (
              <span className="text-xs text-muted">
                {ordinalWaitingLabel(claim.position)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-ink dark:text-slate-200">
            {buyerName}
          </p>
          {buyerCode && (
            <p className="text-xs text-muted">{buyerCode}</p>
          )}
          {claim.phrase && (
            <p className="mt-0.5 text-xs italic text-muted">
              &ldquo;{claim.phrase}&rdquo;
            </p>
          )}
          {claim.saleId != null && (
            <p className="mt-1 text-xs text-muted">
              Sale confirmed.{" "}
              <Link
                href="/invoices/"
                className="text-navy underline hover:no-underline dark:text-slate-300"
              >
                View Buyer Bundle
              </Link>
            </p>
          )}
        </div>

        {!isTerminal && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {/* Promote — remains a separate action from confirm */}
            {canPromote && (
              <Button
                variant="secondary"
                className="min-h-[44px] px-4 focus-visible:ring-2"
                disabled={busy}
                onClick={onPromote}
              >
                Move up
              </Button>
            )}

            {/* Confirm sale */}
            {canConfirm && (
              <Button
                variant="primary"
                className="min-h-[44px] px-4 focus-visible:ring-2"
                disabled={busy}
                onClick={onConfirm}
              >
                Confirm sale
              </Button>
            )}

            {/* Expire — separate action preserved for backup expiry domain meaning */}
            {canExpire && (
              <Button
                variant="ghost"
                className="min-h-[44px] px-4 focus-visible:ring-2"
                disabled={busy}
                onClick={onExpire}
              >
                Passed
              </Button>
            )}

            {/* Cancel — inline two-step confirmation */}
            {canCancel && !confirmingCancel && (
              <Button
                variant="danger"
                className="min-h-[44px] px-4 focus-visible:ring-2"
                disabled={busy}
                onClick={handleCancelClick}
              >
                {cancelLabel}
              </Button>
            )}

            {canCancel && confirmingCancel && (
              <div
                role="group"
                aria-label="Confirm removal"
                className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3 py-2 dark:bg-red-950/30"
              >
                <span className="text-sm text-danger">
                  {claim.status === "backup"
                    ? "Remove this buyer from the waiting list?"
                    : "Mark this claim as passed?"}
                </span>
                <Button
                  variant="danger"
                  className="min-h-[44px] px-4 focus-visible:ring-2"
                  disabled={busy}
                  onClick={handleCancelClick}
                >
                  Confirm
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-[44px] px-4 focus-visible:ring-2"
                  disabled={busy}
                  onClick={handleKeepClaim}
                >
                  Keep claim
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
