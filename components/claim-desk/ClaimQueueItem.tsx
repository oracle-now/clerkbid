"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Claim } from "@/types/claim";
import type { Bidder } from "@/lib/db";

const STATUS_LABELS: Record<Claim["status"], string> = {
  primary: "Primary",
  backup: "Backup",
  promoted: "Promoted",
  canceled: "Canceled",
  expired: "Expired",
};

const STATUS_VARIANT: Record<
  Claim["status"],
  "default" | "success" | "warning" | "danger" | "muted"
> = {
  primary: "success",
  promoted: "warning",
  backup: "default",
  canceled: "muted",
  expired: "muted",
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
  const canExpire = claim.status === "backup";

  const buyerName = bidder
    ? `${bidder.firstName} ${bidder.lastName}`
    : `Buyer #${claim.bidderId}`;
  const buyerCode = bidder ? `Buyer code: ${bidder.paddleNumber}` : null;

  return (
    <li className="rounded-lg border border-navy/10 bg-surface px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[claim.status]}>
              {STATUS_LABELS[claim.status]}
            </Badge>
            {claim.type === "backup" && claim.position > 0 && (
              <span className="text-xs text-muted">position {claim.position}</span>
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
            {canPromote && (
              <Button
                variant="secondary"
                className="!py-1 !text-xs"
                disabled={busy}
                onClick={onPromote}
              >
                Promote
              </Button>
            )}
            {canConfirm && (
              <Button
                variant="primary"
                className="!py-1 !text-xs"
                disabled={busy}
                onClick={onConfirm}
              >
                Confirm
              </Button>
            )}
            {canExpire && (
              <Button
                variant="ghost"
                className="!py-1 !text-xs"
                disabled={busy}
                onClick={onExpire}
              >
                Expire
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                className="!py-1 !text-xs"
                disabled={busy}
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
